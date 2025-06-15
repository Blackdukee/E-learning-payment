const prisma = require("../config/db");
const { Prisma } = require("@prisma/client");
const { logger } = require("../utils/logger");
const { AppError } = require("../middleware/errorHandler");
const redisCache  = require("../config/cache");

// Cache TTLs in seconds
const CACHE_TTLS = {
  TRANSACTION_VOLUMES: 900,  // 15 minutes
  PERFORMANCE_METRICS: 1800, // 30 minutes
  FINANCIAL_ANALYSIS: 1800,  // 30 minutes
  PAYMENT_OPERATIONS: 3600,  // 1 hour
  DASHBOARD: 900,           // 15 minutes
  EDUCATOR_ANALYTICS: 900,   // 15 minutes
};

/** 
 * Helper function to build date filter SQL condition
 */
const buildDateFilter = (startDate, endDate) => {
  if (startDate && endDate) {
    const from = new Date(startDate);
    const to = new Date(endDate);
    
    // Validate dates
    if (isNaN(from.getTime())) {
      throw new AppError(
        "stats_invalid_date_err",
        `Invalid startDate: ${startDate}`, 400);
    }
    if (isNaN(to.getTime())) {
      throw new AppError(
        "stats_invalid_date_err",
        `Invalid endDate: ${endDate}`, 400);
    }
    
    return Prisma.sql`"createdAt" BETWEEN ${from.toISOString()} AND ${to.toISOString()}`;
  } else if (startDate) {
    const from = new Date(startDate);
    if (isNaN(from.getTime())) {
      throw new AppError(
        `stats_invalid_date_err`,
        `Invalid startDate: ${startDate}`, 400);
    }
    return Prisma.sql`"createdAt" >= ${from.toISOString()}`;
  } else if (endDate) {
    const to = new Date(endDate);
    if (isNaN(to.getTime())) {
      throw new AppError(
        `stats_invalid_date_err`,
        `Invalid endDate: ${endDate}`, 400);
    }
    return Prisma.sql`"createdAt" <= ${to.toISOString()}`;
  }
  return null;
};

/**
 * Generate cache key for a function based on its parameters
 */
const generateCacheKey = (prefix, filters = {}) => {
  const filterString = Object.entries(filters)
    .filter(([_, value]) => value !== undefined)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  return `stats:${prefix}:${filterString || 'default'}`;
};

/**
 * Get transaction volumes with optional date filtering
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Object>} Transaction volumes
 */
const getTransactionVolumes = async (filters = {}) => {
  try {
    const cacheKey = generateCacheKey('transaction_volumes', filters);
    
    // Try to get from cache first
    const cachedData = await cacheUtils.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache hit for transaction volumes: ${cacheKey}`);
      return cachedData;
    }
    
    // Continue with database query if no cache hit
    logger.debug(`Cache miss for transaction volumes: ${cacheKey}`);
    
    // Extract filter parameters
    const dateFilter = buildDateFilter(filters.startDate, filters.endDate);

    // Default SQL condition (always true)
    let whereClause = Prisma.sql`1=1`;

    // Add date filter if provided
    if (dateFilter) {
      whereClause = Prisma.sql`${whereClause} AND ${dateFilter}`;
    }

    // Execute query with transaction for consistency
    const volumes = await prisma.$transaction(async (prisma) => {
      // Total payments
      const totalPayments = await prisma.$queryRaw`
        SELECT COUNT(*) as "count", SUM(amount) as "volume"
        FROM "Transaction"
        WHERE ${whereClause} AND type = 'PAYMENT'
      `;

      // Total refunds
      const totalRefunds = await prisma.$queryRaw`
        SELECT COUNT(*) as "count", SUM(amount) as "volume"
        FROM "Transaction"
        WHERE ${whereClause} AND type = 'REFUND'
      `;

      // Payments by status
      const paymentsByStatus = await prisma.$queryRaw`
        SELECT status, COUNT(*) as "count", SUM(amount) as "volume"
        FROM "Transaction"
        WHERE ${whereClause} AND type = 'PAYMENT'
        GROUP BY status
      `;

      return {
        total: {
          payments: {
            count: Number(totalPayments[0]?.count) || 0,
            volume: Number(totalPayments[0]?.volume) || 0,
          },
          refunds: {
            count: Number(totalRefunds[0]?.count) || 0,
            volume: Number(totalRefunds[0]?.volume) || 0,
          },
        },
        byStatus: paymentsByStatus.map((status) => ({
          status: status.status,
          count: Number(status.count) || 0,
          volume: Number(status.volume) || 0,
        })),
      };
    });

    // Cache the results before returning
    await cacheUtils.set(cacheKey, volumes, CACHE_TTLS.TRANSACTION_VOLUMES);
    
    return volumes;
  } catch (error) {
    logger.error(`Error fetching transaction volumes: ${error.message}`, {
      error,
    });
    throw new AppError(
      "stats_transaction_err",
      "Failed to fetch transaction volumes", 500);
  }
};

/**
 * Get performance metrics with optional date filtering
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Object>} Performance metrics
 */
const getPerformanceMetrics = async (filters = {}) => {
  try {
    const cacheKey = generateCacheKey('performance_metrics', filters);
    
    // Try to get from cache first
    const cachedData = await cacheUtils.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache hit for performance metrics: ${cacheKey}`);
      return cachedData;
    }
    
    logger.debug(`Cache miss for performance metrics: ${cacheKey}`);
    
    // Extract filter parameters
    const dateFilter = buildDateFilter(filters.startDate, filters.endDate);

    // Default SQL condition (always true)
    let whereClause = Prisma.sql`1=1`;

    // Add date filter if provided
    if (dateFilter) {
      whereClause = Prisma.sql`${whereClause} AND ${dateFilter}`;
    }

    // Execute query with transaction for consistency
    const metrics = await prisma.$transaction(async (prisma) => {
      // Success vs failure rates
      const statusMetrics = await prisma.$queryRaw`
        SELECT
          "status",
          COUNT(*) as "count",
          (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "Transaction" WHERE ${whereClause})) as "percentage"
        FROM "Transaction"
        WHERE ${whereClause}
        GROUP BY "status"
      `;

      // Average processing time (based on metadata if available)
      // This assumes that metadata includes processingTime in milliseconds
      const processingTimeMetrics = await prisma.$queryRaw`
        SELECT
          AVG((metadata->>'processingTime')::float) as "avgProcessingTime"
        FROM "Transaction"
        WHERE metadata->>'processingTime' IS NOT NULL
        AND ${whereClause}
      `;

      // Error rates by payment method
      const errorRates = await prisma.$queryRaw`
        SELECT
          COALESCE(metadata->>'paymentMethod', 'unknown') as "paymentMethod",
          COUNT(*) as "totalCount",
          COUNT(CASE WHEN "status" = 'FAILED' THEN 1 END) as "failedCount",
          (COUNT(CASE WHEN "status" = 'FAILED' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as "errorRate"
        FROM "Transaction"
        WHERE ${whereClause}
        GROUP BY metadata->>'paymentMethod'
      `;

      return {
        statusBreakdown: statusMetrics.map((metric) => ({
          status: metric.status,
          count: Number(metric.count),
          percentage: Number(metric.percentage),
        })),
        avgProcessingTime:
          Number(processingTimeMetrics[0]?.avgProcessingTime) || 0,
        errorRatesByPaymentMethod: errorRates.map((rate) => ({
          paymentMethod: rate.paymentMethod,
          totalCount: Number(rate.totalCount),
          failedCount: Number(rate.failedCount),
          errorRate: Number(rate.errorRate) || 0,
        })),
      };
    });

    // Cache the results before returning
    await cacheUtils.set(cacheKey, metrics, CACHE_TTLS.PERFORMANCE_METRICS);
    
    return metrics;
  } catch (error) {
    logger.error(`Error fetching performance metrics: ${error.message}`, {
      error,
    });
    throw new AppError(
      "stats_performance_err",
      "Failed to fetch performance metrics", 500);
  }
};

/**
 * Get financial analysis with optional date filtering
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Object>} Financial analysis
 */
const getFinancialAnalysis = async (filters = {}) => {
  try {
    const cacheKey = generateCacheKey('financial_analysis', filters);
    
    // Try to get from cache first
    const cachedData = await cacheUtils.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache hit for financial analysis: ${cacheKey}`);
      return cachedData;
    }
    
    logger.debug(`Cache miss for financial analysis: ${cacheKey}`);
    
    // Extract filter parameters
    const dateFilter = buildDateFilter(filters.startDate, filters.endDate);

    // Default SQL condition (always true)
    let whereClause = Prisma.sql`1=1`;

    // Add date filter if provided
    if (dateFilter) {
      whereClause = Prisma.sql`${whereClause} AND ${dateFilter}`;
    }

    // Define grouping format based on groupBy parameter
    let timeFormat;
    let timeExtract;
    switch ((filters.groupBy || "daily").toLowerCase()) {
      case "weekly":
        timeFormat = Prisma.sql`TO_CHAR(DATE_TRUNC('week', "createdAt"), 'YYYY-MM-DD')`;
        timeExtract = Prisma.sql`DATE_TRUNC('week', "createdAt")`;
        break;
      case "monthly":
        timeFormat = Prisma.sql`TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM')`;
        timeExtract = Prisma.sql`DATE_TRUNC('month', "createdAt")`;
        break;
      case "daily":
      default:
        timeFormat = Prisma.sql`TO_CHAR("createdAt", 'YYYY-MM-DD')`;
        timeExtract = Prisma.sql`DATE_TRUNC('day', "createdAt")`;
        break;
    }

    // Get revenue by time period
    const revenueByTimePeriod = await prisma.$queryRaw`
      SELECT
        ${timeFormat} as "period",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "revenue",
        COALESCE(SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "refunds",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END) - 
                 SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "netRevenue"
      FROM "Transaction"
      WHERE ${whereClause}
      GROUP BY ${timeFormat}, ${timeExtract}
      ORDER BY ${timeExtract}
    `;

    // Get revenue by payment method
    const revenueByPaymentMethod = await prisma.$queryRaw`
      SELECT
        COALESCE(metadata->>'paymentMethod', 'unknown') as "paymentMethod",
        COALESCE(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "revenue",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "count",
        (SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END) * 100.0 / 
          (SELECT NULLIF(SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) FROM "Transaction" WHERE ${whereClause})) as "percentage"
      FROM "Transaction"
      WHERE ${whereClause}
      GROUP BY metadata->>'paymentMethod'
      ORDER BY "revenue" DESC
    `;

    const analysis = {
      revenueByTimePeriod: revenueByTimePeriod.map((item) => ({
        period: item.period,
        revenue: Number(item.revenue),
        refunds: Number(item.refunds),
        netRevenue: Number(item.netRevenue),
      })),
      revenueByPaymentMethod: revenueByPaymentMethod.map((item) => ({
        paymentMethod: item.paymentMethod,
        revenue: Number(item.revenue),
        count: Number(item.count),
        percentage: Number(item.percentage) || 0,
      })),
    };

    // Cache the results before returning
    await cacheUtils.set(cacheKey, analysis, CACHE_TTLS.FINANCIAL_ANALYSIS);
    
    return analysis;
  } catch (error) {
    logger.error(`Error fetching financial analysis: ${error.message}`, {
      error,
    });
    throw new AppError(
      "stats_financial_err",
      "Failed to fetch financial analysis", 500);
  }
};

/**
 * Get payment operations with optional date filtering
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Object>} Payment operations metrics
 */
const getPaymentOperations = async (filters = {}) => {
  try {
    const cacheKey = generateCacheKey('payment_operations', filters);
    
    // Try to get from cache first
    const cachedData = await cacheUtils.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache hit for payment operations: ${cacheKey}`);
      return cachedData;
    }
    
    logger.debug(`Cache miss for payment operations: ${cacheKey}`);
    
    // Extract filter parameters
    const dateFilter = buildDateFilter(filters.startDate, filters.endDate);

    // Default SQL condition (always true)
    let whereClause = Prisma.sql`1=1`;

    // Add date filter if provided
    if (dateFilter) {
      whereClause = Prisma.sql`${whereClause} AND ${dateFilter}`;
    }

    // Execute query with transaction for consistency
    const operations = await prisma.$transaction(async (prisma) => {
      // Refund metrics
      const refundMetrics = await prisma.$queryRaw`
        SELECT
          COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) as "refundCount",
          COALESCE(SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN "amount" ELSE 0 END), 0) as "refundVolume",
          (COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) * 100.0 / 
            NULLIF(COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END), 0)) as "refundRate"
        FROM "Transaction"
        WHERE ${whereClause}
      `;

      // Payment method distribution
      const paymentMethodDist = await prisma.$queryRaw`
        SELECT
          COALESCE(metadata->>'paymentMethod', 'unknown') as "paymentMethod",
          COUNT(*) as "count",
          (COUNT(*) * 100.0 / (SELECT COUNT(*) FROM "Transaction" WHERE "type" = 'PAYMENT' AND ${whereClause})) as "percentage"
        FROM "Transaction"
        WHERE "type" = 'PAYMENT'
        AND ${whereClause}
        GROUP BY metadata->>'paymentMethod'
        ORDER BY "count" DESC
      `;

      return {
        refundMetrics: {
          count: Number(refundMetrics[0]?.refundCount) || 0,
          volume: Number(refundMetrics[0]?.refundVolume) || 0,
          rate: Number(refundMetrics[0]?.refundRate) || 0,
        },
        paymentMethodDistribution: paymentMethodDist.map((method) => ({
          method: method.paymentMethod,
          count: Number(method.count),
          percentage: Number(method.percentage) || 0,
        })),
      };
    });

    // Cache the results before returning
    await cacheUtils.set(cacheKey, operations, CACHE_TTLS.PAYMENT_OPERATIONS);
    
    return operations;
  } catch (error) {
    logger.error(`Error fetching payment operations: ${error.message}`, {
      error,
    });
    throw new AppError(
      "stats_payment_operations_err",
      "Failed to fetch payment operations", 500);
  }
};

/**
 * Get comprehensive dashboard statistics
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Object>} Dashboard statistics
 */
const getDashboardStatistics = async (filters = {}) => {
  try {
    const cacheKey = generateCacheKey('dashboard', filters);
    
    // Try to get from cache first
    const cachedData = await cacheUtils.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache hit for dashboard statistics: ${cacheKey}`);
      return cachedData;
    }
    
    logger.debug(`Cache miss for dashboard statistics: ${cacheKey}`);
    
    const [volumes, performance, financial, operations] = await Promise.all([
      getTransactionVolumes(filters),
      getPerformanceMetrics(filters),
      getFinancialAnalysis(filters),
      getPaymentOperations(filters),
    ]);

    const result = {
      transactionVolumes: volumes,
      performanceMetrics: performance,
      financialAnalysis: financial,
      paymentOperations: operations,
      generatedAt: new Date(),
    };
    
    // Cache the results before returning
    await cacheUtils.set(cacheKey, result, CACHE_TTLS.DASHBOARD);
    
    return result;
  } catch (error) {
    logger.error(`Error generating dashboard statistics: ${error.message}`, {
      error,
    });
    throw new AppError(
      "stats_dashboard_err",
      "Failed to generate dashboard statistics", 500);
  }
};

/**
 * Get payment analytics for an educator with optional date filtering
 * @param {string} educatorId - Educator ID
 * @param {Object} filters - Filter parameters
 * @returns {Promise<Object>} Educator payment analytics
 */
const getEducatorPaymentAnalytics = async (educatorId, filters = {}) => {
  try {
    const cacheKey = generateCacheKey(`educator_analytics:${educatorId}`, filters);
    
    // Try to get from cache first
    const cachedData = await cacheUtils.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache hit for educator analytics: ${cacheKey}`);
      return cachedData;
    }
    
    logger.debug(`Cache miss for educator analytics: ${cacheKey}`);
    
    // Extract filter parameters
    const dateFilter = buildDateFilter(filters.startDate, filters.endDate);

    // Default SQL condition (always true)
    let whereClause = Prisma.sql`1=1`;

    // Add date filter if provided
    if (dateFilter) {
      whereClause = Prisma.sql`${whereClause} AND ${dateFilter}`;
    }

    // Get overall earnings statistics
    const earningsStats = await prisma.$queryRaw`
      SELECT 
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) as "totalEarnings",
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN ABS("educatorEarnings") ELSE 0 END) as "totalRefunds",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "totalSales",
        COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) as "totalRefundCount",
        AVG(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE NULL END) as "avgEarningsPerSale"
      FROM "Transaction"
      WHERE "educatorId" = ${educatorId}
      ${dateFilter ? Prisma.sql`AND ${dateFilter}` : Prisma.sql``}
    `;

    // Get payout statistics
    const payoutStats = await prisma.$queryRaw`
      SELECT
        COUNT(*) as "totalPayouts",
        SUM(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE 0 END) as "totalPaidOut",
        AVG(CASE WHEN "status" = 'COMPLETED' THEN "amount" ELSE NULL END) as "avgPayoutAmount",
        AVG(CASE WHEN "status" = 'COMPLETED' THEN "processingFee" ELSE NULL END) as "avgProcessingFee"
      FROM "Payout"
      WHERE "educatorId" = ${educatorId}
      ${dateFilter ? Prisma.sql`AND ("requestedAt" ${dateFilter})` : Prisma.sql``}
    `;

    // Get earnings by month
    const monthlyEarnings = await prisma.$queryRaw`
      SELECT
        DATE_TRUNC('month', "createdAt") as "month",
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) -
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN ABS("educatorEarnings") ELSE 0 END) as "netEarnings",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "salesCount"
      FROM "Transaction"
      WHERE "educatorId" = ${educatorId}
      ${dateFilter ? Prisma.sql`AND ${dateFilter}` : Prisma.sql``}
      GROUP BY DATE_TRUNC('month', "createdAt")
      ORDER BY DATE_TRUNC('month', "createdAt")
    `;

    // Get earnings by course
    const courseEarnings = await prisma.$queryRaw`
      SELECT
        "courseId",
        SUM(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN "educatorEarnings" ELSE 0 END) -
        SUM(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN ABS("educatorEarnings") ELSE 0 END) as "netEarnings",
        COUNT(CASE WHEN "type" = 'PAYMENT' AND "status" = 'COMPLETED' THEN 1 END) as "salesCount",
        COUNT(CASE WHEN "type" = 'REFUND' AND "status" = 'COMPLETED' THEN 1 END) as "refundCount"
      FROM "Transaction"
      WHERE "educatorId" = ${educatorId}
      ${dateFilter ? Prisma.sql`AND ${dateFilter}` : Prisma.sql``}
      GROUP BY "courseId"
      ORDER BY "netEarnings" DESC
    `;

    const analytics = {
      earnings: {
        totalEarnings: Number(earningsStats[0]?.totalEarnings) || 0,
        totalRefunds: Number(earningsStats[0]?.totalRefunds) || 0,
        netEarnings:
          (Number(earningsStats[0]?.totalEarnings) || 0) -
          (Number(earningsStats[0]?.totalRefunds) || 0),
        totalSales: Number(earningsStats[0]?.totalSales) || 0,
        totalRefundCount: Number(earningsStats[0]?.totalRefundCount) || 0,
        avgEarningsPerSale: Number(earningsStats[0]?.avgEarningsPerSale) || 0,
        refundRate:
          Number(earningsStats[0]?.totalSales) > 0
            ? (Number(earningsStats[0]?.totalRefundCount) /
                Number(earningsStats[0]?.totalSales)) *
              100
            : 0,
      },
      payouts: {
        totalPayouts: Number(payoutStats[0]?.totalPayouts) || 0,
        totalPaidOut: Number(payoutStats[0]?.totalPaidOut) || 0,
        avgPayoutAmount: Number(payoutStats[0]?.avgPayoutAmount) || 0,
        avgProcessingFee: Number(payoutStats[0]?.avgProcessingFee) || 0,
        pendingEarnings:
          (Number(earningsStats[0]?.totalEarnings) || 0) -
          (Number(earningsStats[0]?.totalRefunds) || 0) -
          (Number(payoutStats[0]?.totalPaidOut) || 0),
      },
      monthlyEarnings: monthlyEarnings.map((month) => ({
        month: month.month,
        netEarnings: Number(month.netEarnings) || 0,
        salesCount: Number(month.salesCount) || 0,
      })),
      courseEarnings: courseEarnings.map((course) => ({
        courseId: course.courseId,
        netEarnings: Number(course.netEarnings) || 0,
        salesCount: Number(course.salesCount) || 0,
        refundCount: Number(course.refundCount) || 0,
        refundRate:
          Number(course.salesCount) > 0
            ? (Number(course.refundCount) / Number(course.salesCount)) * 100
            : 0,
      })),
    };

    // Cache the results before returning
    await cacheUtils.set(cacheKey, analytics, CACHE_TTLS.EDUCATOR_ANALYTICS);
    
    return analytics;
  } catch (error) {
    logger.error(
      `Error fetching educator payment analytics: ${error.message}`,
      { error }
    );
    throw new AppError(
      "stats_educator_analytics_err",
      "Failed to fetch educator payment analytics", 500);
  }
};

// Function to invalidate specific caches when transactions are created or modified
const invalidateTransactionCaches = async () => {
  try {
    // Delete all statistics caches - we could be more granular but this is simpler
    await redisCache.deleteByPattern('stats:*');
    logger.info('Successfully invalidated transaction-related caches');
  } catch (error) {
    logger.error(`Error invalidating transaction caches: ${error.message}`, { error });
  }
};

module.exports = {
  getTransactionVolumes,
  getPerformanceMetrics,
  getFinancialAnalysis,
  getPaymentOperations,
  getDashboardStatistics,
  getEducatorPaymentAnalytics,
  invalidateTransactionCaches,
};
