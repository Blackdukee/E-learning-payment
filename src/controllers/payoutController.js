const payoutService = require("../services/payoutService");
const { AppError } = require("../middleware/errorHandler");
const { logger } = require("../utils/logger");

/**
 * @swagger
 * tags:
 *   - name: Payouts
 *     description: Educator payout management
 */

/**
 * @swagger
 * /payouts/{educatorId}/pending-earnings:
 *   get:
 *     summary: Get pending earnings for an educator
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: educatorId
 *         schema:
 *           type: string
 *         required: true
 *         description: Educator ID
 *     responses:
 *       '200':
 *         description: Pending earnings retrieved
 *       '403':
 *         description: Forbidden
 */
const getEducatorPendingEarnings = async (req, res, next) => {
  try {
    const { educatorId } = req.params;

    // Check if user is authorized (only the educator or admin can view)
    if (req.user.role !== "ADMIN" && req.user.id !== educatorId) {
      return next(
        new AppError("You are not authorized to view these earnings", 403)
      );
    }

    const pendingEarnings = await payoutService.getEducatorPendingEarnings(
      educatorId
    );

    res.status(200).json({
      success: true,
      data: pendingEarnings,
    });
  } catch (error) {
    logger.error(`Error fetching pending earnings: ${error.message}`, { error });

    next(error);
  }
};

/**
 * @swagger
 * /payouts/{educatorId}/request:
 *   post:
 *     summary: Submit a payout request for an educator
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: educatorId
 *         schema:
 *           type: string
 *         required: true
 *         description: Educator ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *               ipAddress:
 *                 type: string
 *     responses:
 *       '201':
 *         description: Payout request submitted
 *       '403':
 *         description: Forbidden
 */
const requestPayout = async (req, res, next) => {
  try {
    const { educatorId } = req.params;

    // Check if user is authorized (only the educator can request a payout)
    if (req.user.id !== educatorId) {
      return next(
        new AppError(
          "You are not authorized to request a payout for this educator",
          403
        )
      );
    }

    // Add IP address to the payout data for audit purposes
    const payoutData = {
      ...req.body,
      ipAddress: req.ip,
    };

    const payout = await payoutService.requestPayout(educatorId, payoutData);

    res.status(201).json({
      success: true,
      message: "Payout request submitted successfully",
      data: payout,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payouts/{payoutId}/process:
 *   post:
 *     summary: Process a pending payout (admin only)
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: payoutId
 *         schema:
 *           type: string
 *         required: true
 *         description: Payout ID
 *     responses:
 *       '200':
 *         description: Payout processed
 *       '403':
 *         description: Forbidden
 */
const processPayout = async (req, res, next) => {
  try {
    const { payoutId } = req.params;

    // Admin authorization check
    if (req.user.role !== "ADMIN") {
      return next(new AppError("Only administrators can process payouts", 403));
    }

    const result = await payoutService.processPayout(payoutId, req.user.id);

    res.status(200).json({
      success: true,
      message: "Payout processed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payouts/{payoutId}:
 *   get:
 *     summary: Get payout by ID
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: payoutId
 *         schema:
 *           type: string
 *         required: true
 *         description: Payout ID
 *     responses:
 *       '200':
 *         description: Payout details
 *       '403':
 *         description: Forbidden
 */
const getPayoutById = async (req, res, next) => {
  try {
    const { payoutId } = req.params;
    const payout = await payoutService.getPayoutById(payoutId);

    // Check authorization
    if (req.user.role !== "ADMIN" && payout.educatorId !== req.user.id) {
      return next(
        new AppError("You are not authorized to view this payout", 403)
      );
    }

    res.status(200).json({
      success: true,
      data: payout,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payouts/{educatorId}:
 *   get:
 *     summary: Get educator's payouts
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: educatorId
 *         schema:
 *           type: string
 *         required: true
 *         description: Educator ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: List of payouts
 *       '403':
 *         description: Forbidden
 */
const getEducatorPayouts = async (req, res, next) => {
  try {
    const { educatorId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    // Check authorization
    if (req.user.role !== "ADMIN" && req.user.id !== educatorId) {
      return next(
        new AppError("You are not authorized to view these payouts", 403)
      );
    }

    const result = await payoutService.getEducatorPayouts(
      educatorId,
      page,
      limit
    );

    res.status(200).json({
      success: true,
      data: result.payouts,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payouts:
 *   get:
 *     summary: Get all payouts (admin only)
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: educatorId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       '200':
 *         description: List of all payouts
 *       '403':
 *         description: Forbidden
 */
const getAllPayouts = async (req, res, next) => {
  try {
    // Admin authorization check
    if (req.user.role !== "ADMIN") {
      return next(
        new AppError("Only administrators can view all payouts", 403)
      );
    }

    const filters = {
      status: req.query.status,
      educatorId: req.query.educatorId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    };

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const result = await payoutService.getAllPayouts(filters, page, limit);

    res.status(200).json({
      success: true,
      data: result.payouts,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payouts/{payoutId}:
 *   delete:
 *     summary: Cancel a pending payout
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: payoutId
 *         schema:
 *           type: string
 *         required: true
 *         description: Payout ID
 *     responses:
 *       '200':
 *         description: Payout cancelled
 */
const cancelPayout = async (req, res, next) => {
  try {
    const { payoutId } = req.params;
    const isAdmin = req.user.role === "ADMIN";

    const result = await payoutService.cancelPayout(
      payoutId,
      req.user.id,
      isAdmin
    );

    res.status(200).json({
      success: true,
      message: "Payout cancelled successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEducatorPendingEarnings,
  requestPayout,
  processPayout,
  getPayoutById,
  getEducatorPayouts,
  getAllPayouts,
  cancelPayout,
};
