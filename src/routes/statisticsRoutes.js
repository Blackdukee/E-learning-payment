const express = require("express");
const router = express.Router();
const statisticsController = require("../controllers/statisticsController");
const {
  validateToken,
  mockEducatorAuthMiddleware,
  requireRole,
} = require("../middleware/auth");

/**
 * @route   GET /api/statistics/transaction-volumes
 * @desc    Get transaction volume metrics
 * @access  Admin only
 */
router.get(
  "/transaction-volumes",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  requireRole("ADMIN"),
  statisticsController.getTransactionVolumes
);

/**
 * @route   GET /api/statistics/performance-metrics
 * @desc    Get performance metrics
 * @access  Admin only
 */
router.get(
  "/performance-metrics",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  requireRole("ADMIN"),
  statisticsController.getPerformanceMetrics
);

/**
 * @route   GET /api/statistics/financial-analysis
 * @desc    Get financial analysis
 * @access  Admin only
 */
router.get(
  "/financial-analysis",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  requireRole("ADMIN"),
  statisticsController.getFinancialAnalysis
);

/**
 * @route   GET /api/statistics/payment-operations
 * @desc    Get payment operations metrics
 * @access  Admin only
 */
router.get(
  "/payment-operations",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  requireRole("ADMIN"),
  statisticsController.getPaymentOperations
);

/**
 * @route   GET /api/statistics/dashboard
 * @desc    Get comprehensive dashboard statistics
 * @access  Admin only
 */
router.get(
  "/dashboard",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  requireRole("ADMIN"),
  statisticsController.getDashboardStatistics
);

/**
 * @route   GET /api/statistics/educators/:educatorId/payment-analytics
 * @desc    Get detailed payment analytics for an educator
 * @access  Educator (own analytics) or Admin
 */
router.get(
  "/educators/:educatorId/payment-analytics",
  process.env.NODE_ENV === "development"
    ? mockEducatorAuthMiddleware
    : validateToken,
  statisticsController.getEducatorPaymentAnalytics
);

module.exports = router;
