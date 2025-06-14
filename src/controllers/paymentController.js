const prisma = require("../config/db");
const { AppError } = require("../middleware/errorHandler");
const paymentService = require("../services/paymentService");
const { logger } = require("../utils/logger");

/**
 * @swagger
 * tags:
 *   - name: Payments
 *     description: Payment processing and management
 */

/**
 * @swagger
 * /payments/pay/enrollment/{courseId}:
 *   get:
 *     summary: Check if a student is enrolled in a course
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: courseId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the course to check enrollment for
 *     responses:
 *       '200':
 *         description: User is enrolled in this course
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "User is enrolled in this course"
 *       '403':
 *         description: User is not enrolled in this course
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User is not enrolled in this course"
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const checkStudentEnrollment = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.id;
    // Check if the user is enrolled in the course
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId,
        courseId,
      },
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "User is not enrolled in this course",
      });
    }

    return res.status(200).json({
      success: true,
      status: true,
      courseId: enrollment.courseId,
      message: "User is enrolled in this course",
    });
  } catch (error) {
    logger.error(`Error checking enrollment: ${error.message}`);
    return next(new AppError("Failed to check enrollment", 500));
  }
};

/**
 * @swagger
 * /payments/pay/enrollments:
 *   get:
 *     summary: Get current student's enrollments
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: List of student enrollments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       courseId:
 *                         type: string
 *           
 *       '500':
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const getStudentEnrollments = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
    });

    // Get course details for each enrollment
    const enrollmentsList = enrollments.map((enrollment) => ({
      courseId: enrollment.courseId,
    }));

    return res.status(200).json({
      success: true,
      data: {
      enrollments: enrollmentsList,
      count: enrollmentsList.length
      }
    });
  } catch (error) {
    logger.error(`Error fetching student enrollments: ${error.message}`);
    return next(new AppError("Failed to fetch enrollments", 500));
  }
};

/**
 * @swagger
 * /payments/pay:
 *   post:
 *     summary: Process a payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PaymentRequest'
 *     responses:
 *       '200':
 *         description: Payment processed successfully
 *       '400':
 *         description: Bad request
 *       '500':
 *         description: Internal server error
 */
const processPayment = async (req, res, next) => {
  try {
    logger.debug(`Request body: ${JSON.stringify(req.body)}`);
    const result = await paymentService.processPayment(req.body, req.user);
    return res.status(200).json({
      success: true,
      message: "Payment processed successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`Error processing payment: ${error.message}`);
    return next(error)
  }
};

/**
 * @swagger
 * /payments/pay/refund:
 *   post:
 *     summary: Process a refund
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefundRequest'
 *     responses:
 *       '200':
 *         description: Refund processed successfully
 *       '400':
 *         description: Bad request
 *       '500':
 *         description: Internal server error
 */
const processRefund = async (req, res) => {
  try {
    const result = await paymentService.processRefund(req.body, req.user);

    return res.status(200).json({
      success: true,
      message: "Refund processed successfully",
      data: result,
    });
  } catch (error) {
    logger.error(`Error processing refund: ${error.message}`);
    return next(error);
  }
};

/**
 * @swagger
 * /payments/pay/user:
 *   get:
 *     summary: Get user's transactions
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *     responses:
 *       '200':
 *         description: List of transactions
 */
const getUserTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await paymentService.getTransactionsByUser(
      userId,
      page,
      limit
    );

    return res.status(200).json({
      success: true,
      data: result.transactions,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error(`Error fetching user transactions: ${error.message}`);
    return next(error);
  }
};

/**
 * @swagger
 * /payments/pay/{transactionId}:
 *   get:
 *     summary: Get transaction by ID
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         schema:
 *           type: string
 *         required: true
 *         description: Transaction ID
 *     responses:
 *       '200':
 *         description: Transaction details
 *       '403':
 *         description: Unauthorized
 */
const getTransactionById = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const transaction = await paymentService.getTransactionById(transactionId);

    // Check if user is authorized to view this transaction
    if (req.user.role !== "ADMIN" && transaction.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to access this transaction",
      });
    }

    return res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    logger.error(`Error fetching transaction: ${error.message}`);
    return next(error);
  }
};

/**
 * @swagger
 * /payments/pay/report/transactions:
 *   get:
 *     summary: Generate transaction report (admin only)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *           pattern: "YYYY-MM-DD"
 *           example: "2023-01-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           pattern: "YYYY-MM-DD"
 *           example: "2023-01-01"
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: educatorId
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Report generated
 */
const generateTransactionReport = async (req, res) => {
  try {
    // Only admins can access this endpoint
    if (req.user.role !== "Admin") {
      return res.status(403).json({
        success: false,
        message: "Unauthorized to access reports",
      });
    }

    const { startDate, endDate, type, status, educatorId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const filters = {
      startDate,
      endDate,
      type,
      status,
      educatorId,
    };

    const result = await paymentService.getTransactionsReport(
      filters,
      page,
      limit
    );

    return res.status(200).json({
      success: true,
      data: result.transactions,
      summary: result.summary,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error(`Error generating transaction report: ${error.message}`);
    return next(error);
  }
};

/**
 * @swagger
 * /payments/pay/total-earnings:
 *   get:
 *     summary: Get total earnings for educator
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Total earnings retrieved
 */
const getTotalEarningsForEducator = async (req, res, next) => {
  try {
    const result = await paymentService.getTotalEarningsForEducator(
      req.user.id
    );
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Error fetching total earnings: ${error.message}`);
    return next(error);
  }
};

/**
 * @swagger
 * /payments/pay/current-balance:
 *   get:
 *     summary: Get current balance for educator
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Current balance retrieved
 */
const getEducatorCurrentBalance = async (req, res, next) => {
  try {
    const earnings = await paymentService.getCurrentBalanceForEducator(
      req.user.id
    );
    return res.status(200).json({
      success: true,
      data: {
        amount: Math.round(earnings.amount / 100),
        currency: earnings.currency,
      },
    });
  } catch (error) {
    logger.error(`Error fetching current balance: ${error.message}`);
    return next(error);
  }
};

module.exports = {
  getEducatorCurrentBalance,
  processPayment,
  processRefund,
  getUserTransactions,
  getTransactionById,
  getTotalEarningsForEducator,
  generateTransactionReport,
  checkStudentEnrollment,
  getStudentEnrollments,
};
