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
 * /payments:
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
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to process payment",
    });
  }
};

/**
 * @swagger
 * /payments/refund:
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
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to process refund",
    });
  }
};

/**
 * @swagger
 * /payments/user:
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
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch transactions",
    });
  }
};

/**
 * @swagger
 * /payments/{transactionId}:
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
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch transaction",
    });
  }
};

/**
 * @swagger
 * /payments/report/transactions:
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
    if (req.user.role !== "ADMIN") {
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
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to generate report",
    });
  }
};

/**
 * @swagger
 * /payments/total-earnings:
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
 * /payments/current-balance:
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
      data: { amount: Math.round(earnings.amount / 100), currency: earnings.currency },
    });
  } catch (error) {
    logger.error(`Error fetching current balance: ${error.message}`);
    return next(error);
  }
};

/**
 * @swagger
 * /payments/create-account:
 *   post:
 *     summary: Create Stripe account for educator
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '201':
 *         description: Account created
 */
const createEducatorAccount = async (req, res) => {
  try {
    const { account } = await paymentService.createEducatorStripeAccount(req);
    res.status(201).json({
      success: true,
      message: "Stripe account created successfully",
      data: {
        accountId: account.id,
      },
    });
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};

/**
 * @swagger
 * /payments/delete-account:
 *   delete:
 *     summary: Delete Stripe account for educator
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Account deleted
 */
const deleteEducatorAccount = async (req, res) => {
  try {
    const { account } = await prisma.stripeAccount.findFirst({
      where: {
        educatorId: req.user.id,
      },
    });
    const result = await paymentService.deleteEducatorStripeAccount(
      req,
      account
    );
    res.status(200).json({
      success: true,
      message: "Stripe account deleted successfully",
      data: result,
    });
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};

module.exports = {
  deleteEducatorAccount,
  createEducatorAccount,
  getEducatorCurrentBalance,
  processPayment,
  processRefund,
  getUserTransactions,
  getTransactionById,
  getTotalEarningsForEducator,
  generateTransactionReport,
};
