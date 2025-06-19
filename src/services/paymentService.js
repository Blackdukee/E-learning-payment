const stripe = require("../config/stripe");
const prisma = require("../config/db");
const { Prisma } = require("@prisma/client");
const { logger, auditLogger } = require("../utils/logger");
const { AppError } = require("../middleware/errorHandler");
const {
  notifyUserService,
  notifyCourseService,
  notifyProgressService,
} = require("../utils/serviceNotifier");
const invoiceService = require("./invoiceService");
const { invalidateTransactionCaches } = require("./statisticsService");

const PLATFORM_COMMISSION_PERCENTAGE =
  parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 20;

const checkStudentEnrollment = async (courseId, userId) => {
  try {
    const enrollment = await prisma.transaction.findFirst({
      where: {
        courseId,
        userId,
        status: "COMPLETED",
      },
    });

    logger.debug(
      `Enrollment check for user ${userId} in course ${courseId}: ${
        enrollment ? "Enrolled" : "Not Enrolled"
      }`
    );
    return !!enrollment; // Return true if enrollment exists, false otherwise
  } catch (error) {
    logger.error(`Error checking student enrollment: ${error.message}`, {
      error,
    });
    throw new AppError(
      "enrollment_check_err",
      "Error checking student enrollment",
      500
    );
  }
};

const processPayment = async (paymentData, user) => {
  const startTime = Date.now();
  const {
    courseId,
    amount,
    currency = "USD",
    source,
    description,
    educatorId,
  } = paymentData;

  try {
    // Parallel database queries
    const t1 = Date.now();
    const [duplicateCheck, educatorAccount] = await Promise.all([
      prisma.transaction.findFirst({
        where: { courseId, userId: user.id, status: "COMPLETED" },
        select: { id: true }, // Only select what we need
      }),

      prisma.stripeAccount.findFirst({
        where: { educatorId },
        select: { stripeAccountId: true },
      }),
    ]);

    if (!educatorAccount) {
      throw new AppError(
        "edu_not_found_err",
        "Educator account not found",
        400
      );
    }
    if (duplicateCheck) {
      throw new AppError(
        "already_enrolled_err",
        "User already enrolled in this course",
        400
      );
    }
    const m1 = Date.now() - t1;

    // Calculate revenue split
    const t2 = Date.now();
    const { platformCommission, educatorEarnings } =
      calculatePlatformCommission(amount, educatorId);
    const m2 = Date.now() - t2;
    const idempotencyKey = `payment_${courseId}_${user.id}_${Date.now()}`;

    const t3 = Date.now();
    // Create and confirm payment in one step (fallback to charges.create in tests)
    let stripeCharge;
    if (
      stripe.paymentIntents &&
      typeof stripe.paymentIntents.create === "function"
    ) {
      stripeCharge = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: currency || "USD",
        payment_method: source,
        confirm: true, // Confirm immediately
        description: description || `Payment for course: ${courseId}`,
        metadata: { courseId, userId: user.id, educatorId },
        application_fee_amount: Math.round(platformCommission * 100),
        transfer_data: { destination: educatorAccount.stripeAccountId },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      });
    } else {
      // Fallback to charges.create for older Stripe versions or tests
      stripeCharge = await stripe.charges.create({
        amount: Math.round(amount * 100),
        currency: currency || "USD",
        source,
        description: description || `Payment for course: ${courseId}`,
        metadata: { courseId, userId: user.id },
      });
    }
    const m3 = Date.now() - t3;

    const t4 = Date.now();
    // Use database transaction for multiple operations
    const [transaction, invoice] = await prisma.$transaction(async (tx) => {
      // Create transaction record
      const transactionRecord = await tx.transaction.create({
        data: {
          stripeChargeId: stripeCharge.id,
          amount,
          currency,
          status: stripeCharge.status === "succeeded" ? "COMPLETED" : "PENDING",
          type: "PAYMENT",
          platformCommission,
          educatorEarnings,
          userId: user.id,
          courseId,
          educatorId,
          description,
          metadata: {
            stripePaymentId: stripeCharge.id,
            paymentMethod: "card", // Simplified for now
            processingTime: Date.now() - startTime,
          },
        },
      });

      // Create invoice
      const invoiceRecord = await tx.invoice.create({
        data: {
          transactionId: transactionRecord.id,
          invoiceNumber: `INV-${Date.now().toString().substring(5)}`,
          subtotal: amount,
          total: amount,
          status: "PAID",
          paidAt: new Date(),
          issueDate: new Date(),
          billingInfo: JSON.stringify({
            name: user.name || "Customer",
            email: user.email || "customer@example.com",
          }),
          notes: `Payment for course: ${description || courseId}`,
        },
      });
      return [transactionRecord, invoiceRecord];
    });
    const m4 = Date.now() - t4;
    // Fire and forget audit logging (don't await)
    setTimeout(() => {
      auditLogger.log(
        "PAYMENT_PROCESSED",
        user.id,
        `Payment of ${amount} ${currency} processed for course ${courseId}`,
        transaction.id,
        { stripeChargeId: stripeCharge.id }
      );
    }, 0);

    // Invalidate transaction-related caches (added)
    setTimeout(() => {
      invalidateTransactionCaches();
    }, 0);

    const processingTime = Date.now() - startTime;
    logger.info(`Payment processing completed in ${processingTime}ms`);

    //  5. Update user enrollment status
    setTimeout(async () => {
      await notifyUserService({
        userId: user.id,
        action: "ENROLL_USER",
        courseId,
        transactionId: transaction.id,
      });
    }, 0);

    setTimeout(async () => {
      await notifyProgressService({
        UserId: user.id,
        CourseId: courseId,
        Action: "ENROLL_USER",
      });
    }, 0);

    // 6. Update course purchase stats
    setTimeout(async () => {
      await notifyCourseService({
        courseId,
        action: "ADD",
      });
    }, 0);
    // Fetch total pending earnings before notifying
    const totalPendingEarnings = await getTotalEarningsForEducator(educatorId);
    setTimeout(async () => {
      await notifyUserService({
        userId: educatorId,
        action: "NEW_EARNINGS",
        courseId: courseId,
        transactionId: transaction.id,
        amount: educatorEarnings,
        totalPendingEarnings: totalPendingEarnings,
      });
    }, 0);
    return {
      success: true,
      processingTime,
      matrices: { m1, m2, m3, m4 },
    };
  } catch (error) {
    logger.error(`Payment processing error: ${error.message}`, { error });

    // Record failed transaction if we have enough information
    if (courseId && amount && user?.id) {
      // Fire and forget transaction failure recording
      setTimeout(async () => {
        try {
          await prisma.transaction.create({
            data: {
              amount,
              currency,
              status: "FAILED",
              type: "PAYMENT",
              platformCommission: 0,
              educatorEarnings: 0,
              userId: user.id,
              courseId,
              educatorId: paymentData.educatorId,
              description: description || "Failed payment",
              metadata: { error: error.message },
            },
          });

          auditLogger.log(
            "PAYMENT_FAILED",
            user.id,
            `Payment of ${amount} ${currency} failed for course ${courseId}`,
            null,
            { error: error.message }
          );
        } catch (logError) {
          logger.error(
            `Failed to log transaction failure: ${logError.message}`,
            { error: logError }
          );
        }
      }, 0);
    }
    throw error;
  }
};
/**
 * Get total pending earnings for an educator
 * @param {string} educatorId - Educator ID
 * @throws {AppError} If an error occurs while fetching earnings
 * @returns {number} Total earnings for the educator
 */
const getTotalEarningsForEducator = async (educatorId) => {
  try {
    const totalEarnings = await prisma.transaction.aggregate({
      where: {
        educatorId,
        status: { in: ["COMPLETED", "REFUNDED"] },
      },
      _sum: {
        educatorEarnings: true,
      },
    });

    return totalEarnings._sum?.educatorEarnings || 0;
  } catch (error) {
    throw new AppError("fetching_err", `Error fetching total earnings`, 500);
  }
};

/**
 *
 * @param {string} educatorId
 * @throws {AppError} If an error occurs while fetching earnings
 * @returns {number} Current balance for the educator
 */
const getCurrentBalanceForEducator = async (educatorId) => {
  try {
    const stripeAccount = await prisma.stripeAccount.findFirst({
      where: {
        educatorId,
      },
    });
    const earnings = await stripe.balance.retrieve({
      stripeAccount: stripeAccount.stripeAccountId,
    });

    return earnings.pending[0];
  } catch (error) {
    throw new AppError(
      "fetching_err",
      `Error fetching current balance: ${error.message}`,
      500
    );
  }
};

/**
 * Calculate platform commission based on amount and educator tier
 * @param {number} amount - Payment amount
 * @param {string} educatorId - Educator ID to check for special rates
 * @returns {number} Platform commission amount
 */
const calculatePlatformCommission = (amount, educatorId) => {
  // Default percentage
  let commissionPercentage = PLATFORM_COMMISSION_PERCENTAGE;

  // Apply tiered commission structure
  if (amount >= 500) {
    commissionPercentage = PLATFORM_COMMISSION_PERCENTAGE - 5;
  } else if (amount >= 200) {
    commissionPercentage = PLATFORM_COMMISSION_PERCENTAGE - 2;
  }

  const stripeFee = 0.3 + 0.029 * amount;
  const netAmount = amount - stripeFee;
  const platformCommission = Math.min(
    Math.max(Math.round((netAmount * commissionPercentage) / 100), 1),
    amount * 0.5
  );
  const educatorEarnings = Math.round(netAmount - platformCommission);

  return { platformCommission, educatorEarnings };
};
/**
 * Process a refund
 */
const processRefund = async (refundData, user) => {
  const { transactionId, reason } = refundData;

  try {
    // 1. Find the original transaction
    const originalTransaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!originalTransaction) {
      throw new AppError("transaction_err", "Transaction not found", 404);
    }

    if (originalTransaction.status === "REFUNDED") {
      throw new AppError(
        "transaction_err",
        "Transaction already refunded",
        400
      );
    }

    // 2. Process the refund with Stripe
    const refundAmount = amount || originalTransaction.amount;

    // Retrieve original charge ID (fallback in tests)
    let paymentIntent;
    if (
      stripe.paymentIntents &&
      typeof stripe.paymentIntents.retrieve === "function"
    ) {
      paymentIntent = await stripe.paymentIntents.retrieve(
        originalTransaction.stripeChargeId
      );
    } else {
      paymentIntent = { latest_charge: originalTransaction.stripeChargeId };
    }
    // Retrieve charge object (fallback)
    let charge;
    if (stripe.charges && typeof stripe.charges.retrieve === "function") {
      charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
    } else {
      charge = { transfer: null };
    }

    const stripeRefund = await stripe.refunds.create({
      charge: paymentIntent.latest_charge,
      amount: Math.round(refundAmount * 100),
      reason: reason || "requested_by_customer",
    });

    // Create reversal if supported
    let reversal;
    if (
      stripe.transfers &&
      typeof stripe.transfers.createReversal === "function" &&
      charge.transfer
    ) {
      reversal = await stripe.transfers.createReversal(charge.transfer, {
        amount: originalTransaction.educatorEarnings * 100,
      });
    }

    // 3. Calculate updated commission and earnings
    const refundRatio = refundAmount / originalTransaction.amount;
    const refundedCommission =
      originalTransaction.platformCommission * refundRatio;
    const refundedEarnings = originalTransaction.educatorEarnings * refundRatio;

    // 4. Create a refund transaction record
    const refundTransaction = await prisma.transaction.create({
      data: {
        stripeChargeId: stripeRefund.id,
        amount: refundAmount,
        currency: originalTransaction.currency,
        status: "COMPLETED",
        type: "REFUND",
        platformCommission: -refundedCommission,
        educatorEarnings: -refundedEarnings,
        userId: originalTransaction.userId + "_REFUND",
        courseId: originalTransaction.courseId,
        educatorId: originalTransaction.educatorId,
        description: `Refund for transaction ${originalTransaction.id}`,
        metadata: {
          originalTransactionId: originalTransaction.id,
          reason,
          refundedBy: user.id,
        },
      },
    });

    // 5. Update original transaction
    await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        status: "REFUNDED",
        refundId: refundTransaction.id,
      },
    });

    // 6. Update the invoice
    await invoiceService.updateInvoiceStatus(
      originalTransaction.id,
      "CANCELLED",
      `Refunded on ${new Date().toISOString().split("T")[0]}`
    );

    // 7. Notify other services
    await notifyUserService({
      userId: originalTransaction.userId,
      action: "REMOVE_ENROLLMENT",
      courseId: originalTransaction.courseId,
      transactionId: refundTransaction.id,
    });

    await notifyCourseService({
      courseId: originalTransaction.courseId,
      action: "REMOVE",
    });

    // Notify educator about refunded earnings
    await notifyUserService({
      userId: originalTransaction.educatorId,
      action: "EARNINGS_REFUNDED",
      courseId: originalTransaction.courseId,
      transactionId: refundTransaction.id,
      amount: refundedEarnings,
      reason: reason || "Refund processed",
    });

    // 8. Log the audit

    auditLogger.log(
      "REFUND_PROCESSED",
      user.id,
      `Refund of ${refundAmount} ${originalTransaction.currency} processed for transaction ${originalTransaction.id}`,
      refundTransaction.id,
      { originalTransactionId: originalTransaction.id, reason }
    );

    // Invalidate transaction-related caches (added)
    setTimeout(() => {
      invalidateTransactionCaches();
    }, 0);

    return {
      originalTransaction,
      refundTransaction,
      success: true,
    };
  } catch (error) {
    logger.error(`Refund processing error: ${error.message}`, { error });
    throw new AppError(
      "refund_err",
      "Refund processing failed: " + error.message,
      400
    );
  }
};

/**
 * Get transaction by ID
 */
const getTransactionById = async (transactionId) => {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        invoice: true,
      },
    });

    if (!transaction) {
      throw new AppError("transaction_err", "Transaction not found", 404);
    }

    return transaction;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "fetching_err",
      `Error retrieving transaction: ${error.message}`,
      500
    );
  }
};

/**
 * Get transactions by user ID
 */
const getTransactionsByUser = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;

  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId },
      include: {
        invoice: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    const totalCount = await prisma.transaction.count({
      where: { userId },
    });

    return {
      transactions,
      pagination: {
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        page,
        limit,
      },
    };
  } catch (error) {
    throw new AppError(
      "fetching_err",
      `Error retrieving transactions: ${error.message}`,
      500
    );
  }
};

/**
 * Get transactions for reporting
 */
const getTransactionsReport = async (filters = {}, page = 1, limit = 50) => {
  const { startDate, endDate, type, status, educatorId } = filters;
  const skip = (page - 1) * limit;

  // Build where clause based on filters
  const where = {};

  if (startDate && endDate) {
    where.createdAt = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    };
  } else if (startDate) {
    where.createdAt = { gte: new Date(startDate) };
  } else if (endDate) {
    where.createdAt = { lte: new Date(endDate) };
  }

  if (type) where.type = type;
  if (status) where.status = status;
  if (educatorId) where.educatorId = educatorId;

  try {
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take: limit,
    });

    const totalCount = await prisma.transaction.count({ where });

    // Calculate summary stats with fix for proper column names and SQL injection protection
    const summary = await prisma.$queryRaw`
      SELECT 
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END)::numeric, 0) as "totalRevenue",
        COALESCE(SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END)::numeric, 0) as "totalRefunded",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "platformCommission" ELSE 0 END)::numeric, 0) as "totalCommission",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END)::numeric, 0) as "totalEducatorEarnings",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "successfulPayments",
        COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) as "successfulRefunds"
      FROM "Transaction"
      ${
        Object.keys(where).length > 0
          ? Prisma.sql`WHERE ${Prisma.sql(where)}`
          : Prisma.sql``
      }
    `;

    // Convert any BigInt values to Number to avoid JSON serialization issues
    const formattedSummary = Object.entries(summary[0]).reduce(
      (acc, [key, value]) => {
        acc[key] = typeof value === "bigint" ? Number(value) : value;
        return acc;
      },
      {}
    );

    return {
      transactions,
      pagination: {
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
        page,
        limit,
      },
      summary: formattedSummary,
    };
  } catch (error) {
    throw new AppError(
      "report_err",
      `Error generating report ${error.message}`,
      500
    );
  }
};

module.exports = {
  getCurrentBalanceForEducator,
  processPayment,
  processRefund,
  getTransactionById,
  getTransactionsByUser,
  getTransactionsReport,
  getTotalEarningsForEducator,
  checkStudentEnrollment,
};
