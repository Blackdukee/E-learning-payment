const statisticsService = require('../services/statisticsService');
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * @swagger
 * tags:
 *   - name: Statistics
 *     description: System statistics and metrics
 */

/**
 * @swagger
 * /statistics/transaction-volumes:
 *   get:
 *     summary: Get transaction volume metrics
 *     tags: [Statistics]
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
 *     responses:
 *       '200':
 *         description: Transaction volumes retrieved
 */
const getTransactionVolumes = async (req, res, next) => {
  try {

    // Check for date filters in the request
    if (!req.query.startDate || !req.query.endDate) {
      return next(new AppError('Please provide both startDate and endDate query parameters', 400));
    }

    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const data = await statisticsService.getTransactionVolumes(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /statistics/performance-metrics:
 *   get:
 *     summary: Get performance metrics
 *     tags: [Statistics]
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
 *     responses:
 *       '200':
 *         description: Performance metrics retrieved
 */
const getPerformanceMetrics = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const data = await statisticsService.getPerformanceMetrics(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /statistics/financial-analysis:
 *   get:
 *     summary: Get financial analysis metrics
 *     tags: [Statistics]
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
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [daily,weekly,monthly]
 *     responses:
 *       '200':
 *         description: Financial analysis retrieved
 */
const getFinancialAnalysis = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy // daily, weekly, monthly
    };
    
    const data = await statisticsService.getFinancialAnalysis(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /statistics/payment-operations:
 *   get:
 *     summary: Get payment operations metrics
 *     tags: [Statistics]
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
 *     responses:
 *       '200':
 *         description: Payment operations metrics retrieved
 */
const getPaymentOperations = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const data = await statisticsService.getPaymentOperations(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /statistics/dashboard:
 *   get:
 *     summary: Get comprehensive dashboard statistics
 *     tags: [Statistics]
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
 *         name: groupBy
 *         schema:
 *           type: string
 *           enum: [daily,weekly,monthly]
 *     responses:
 *       '200':
 *         description: Dashboard statistics retrieved
 */
const getDashboardStatistics = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      groupBy: req.query.groupBy // For financial analysis
    };
    
    const data = await statisticsService.getDashboardStatistics(filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /statistics/educators/{educatorId}/payment-analytics:
 *   get:
 *     summary: Get detailed payment analytics for an educator
 *     tags: [Statistics]
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
 *     responses:
 *       '200':
 *         description: Educator payment analytics retrieved
 */
const getEducatorPaymentAnalytics = async (req, res, next) => {
  try {
    const { educatorId } = req.params;
    
    // Check authorization
    if (req.user.role !== 'ADMIN' && req.user.id !== educatorId) {
      return next(new AppError('You are not authorized to view these analytics', 403));
    }
    
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    
    const data = await statisticsService.getEducatorPaymentAnalytics(educatorId, filters);
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTransactionVolumes,
  getPerformanceMetrics,
  getFinancialAnalysis,
  getPaymentOperations,
  getDashboardStatistics,
  getEducatorPaymentAnalytics
};
