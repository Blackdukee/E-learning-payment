const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const PDFDocument = require("pdfkit");
const prisma = require("../config/db");
const { Prisma } = require("@prisma/client");
const { AppError } = require("../middleware/errorHandler");
const { logger } = require("../utils/logger");
const { cacheUtils } = require("../config/cache");

// Cache TTLs in seconds
const CACHE_TTLS = {
  FINANCIAL_REPORT: 1800,    // 30 minutes
  EARNINGS_REPORT: 1800,     // 30 minutes
  COMMISSION_REPORT: 1800,   // 30 minutes
};

/**
 * Generate cache key for a report function based on its parameters
 */
const generateReportCacheKey = (prefix, filters = {}) => {
  const filterString = Object.entries(filters)
    .filter(([_, value]) => value !== undefined)
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  
  return `report:${prefix}:${filterString || 'default'}`;
};

/**
 * Generate financial report with optional filters
 */
const generateFinancialReport = async (filters = {}) => {
  try {
    const cacheKey = generateReportCacheKey('financial', filters);
    
    // Try to get from cache first
    const cachedData = await cacheUtils.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache hit for financial report: ${cacheKey}`);
      return cachedData;
    }
    
    logger.debug(`Cache miss for financial report: ${cacheKey}`);
    
    // Extract filters
    const { startDate, endDate, educatorId } = filters;

    // Build date filter condition for SQL queries
    let dateCondition = Prisma.empty;
    if (startDate && endDate) {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      
      // Validate dates to prevent "Invalid time value" errors
      if (isNaN(startDateObj.getTime())) {
        throw new AppError(`Invalid startDate: ${startDate}`, 400);
      }
      if (isNaN(endDateObj.getTime())) {
        throw new AppError(`Invalid endDate: ${endDate}`, 400);
      }
      
      dateCondition = Prisma.sql`AND t."createdAt" BETWEEN ${startDateObj} AND ${endDateObj}`;
    } else if (startDate) {
      const startDateObj = new Date(startDate);
      if (isNaN(startDateObj.getTime())) {
        throw new AppError(`Invalid startDate: ${startDate}`, 400);
      }
      dateCondition = Prisma.sql`AND t."createdAt" >= ${startDateObj}`;
    } else if (endDate) {
      const endDateObj = new Date(endDate);
      if (isNaN(endDateObj.getTime())) {
        throw new AppError(`Invalid endDate: ${endDate}`, 400);
      }
      dateCondition = Prisma.sql`AND t."createdAt" <= ${endDateObj}`;
    }

    // Add educator filter if provided
    let educatorFilter = Prisma.empty;
    if (educatorId) {
      educatorFilter = Prisma.sql`AND t."educatorId" = ${educatorId}`;
    }

    // Generate the report SQL queries
    const [summary, dailyStats, topCourses, paymentMethods] = await Promise.all([
      // Summary statistics
      prisma.$queryRaw`
        SELECT 
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END), 0) AS "totalRevenue",
          COALESCE(SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END), 0) AS "totalRefunds",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END) - 
                   SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END), 0) AS "netRevenue",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."platformCommission" ELSE 0 END), 0) AS "totalCommission",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END), 0) AS "totalEducatorEarnings",
          COUNT(CASE WHEN t."type" = 'PAYMENT' THEN 1 END) AS "totalTransactions",
          COUNT(CASE WHEN t."type" = 'REFUND' THEN 1 END) AS "totalRefundCount",
          COUNT(DISTINCT t."userId") AS "uniqueCustomers"
        FROM "Transaction" t
        WHERE 1=1 ${dateCondition} ${educatorFilter}
      `,

      // Daily statistics
      prisma.$queryRaw`
        SELECT 
          TO_CHAR(t."createdAt", 'YYYY-MM-DD') AS "date",
          COUNT(CASE WHEN t."type" = 'PAYMENT' THEN 1 END) AS "transactions",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END), 0) AS "revenue",
          COALESCE(SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END), 0) AS "refunds",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."platformCommission" ELSE 0 END), 0) AS "platformCommission",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END), 0) AS "educatorEarnings"
        FROM "Transaction" t
        WHERE 1=1 ${dateCondition} ${educatorFilter}
        GROUP BY TO_CHAR(t."createdAt", 'YYYY-MM-DD')
        ORDER BY TO_CHAR(t."createdAt", 'YYYY-MM-DD') DESC
        LIMIT 30
      `,

      // Top courses by revenue
      prisma.$queryRaw`
        SELECT 
          t."courseId",
          COUNT(CASE WHEN t."type" = 'PAYMENT' THEN 1 END) AS "sales",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END), 0) AS "revenue",
          COALESCE(SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END), 0) AS "refunds",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."platformCommission" ELSE 0 END), 0) AS "platformCommission",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END), 0) AS "educatorEarnings"
        FROM "Transaction" t
        WHERE 1=1 ${dateCondition} ${educatorFilter}
        GROUP BY t."courseId"
        ORDER BY "revenue" DESC
        LIMIT 10
      `,

      // Payment methods
      prisma.$queryRaw`
        SELECT 
          COALESCE(t.metadata->>'paymentMethod', 'unknown') AS "paymentMethod",
          COUNT(*) AS "count",
          COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END), 0) AS "volume"
        FROM "Transaction" t
        WHERE t."type" = 'PAYMENT' ${dateCondition} ${educatorFilter}
        GROUP BY t.metadata->>'paymentMethod'
        ORDER BY "count" DESC
      `,
    ]);

    // Format and sanitize the report data
    const report = {
      metadata: {
        generatedAt: new Date(),
        filters: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Current date',
          educatorId: educatorId || 'All educators',
        },
      },
      summary: {
        totalRevenue: Number(summary[0]?.totalRevenue) || 0,
        totalRefunds: Number(summary[0]?.totalRefunds) || 0,
        netRevenue: Number(summary[0]?.netRevenue) || 0,
        totalCommission: Number(summary[0]?.totalCommission) || 0,
        totalEducatorEarnings: Number(summary[0]?.totalEducatorEarnings) || 0,
        totalTransactions: Number(summary[0]?.totalTransactions) || 0,
        totalRefundCount: Number(summary[0]?.totalRefundCount) || 0,
        uniqueCustomers: Number(summary[0]?.uniqueCustomers) || 0,
      },
      dailyStats: dailyStats.map(day => ({
        date: day.date,
        transactions: Number(day.transactions) || 0,
        revenue: Number(day.revenue) || 0,
        refunds: Number(day.refunds) || 0,
        platformCommission: Number(day.platformCommission) || 0,
        educatorEarnings: Number(day.educatorEarnings) || 0,
      })),
      topCourses: topCourses.map(course => ({
        courseId: course.courseId,
        sales: Number(course.sales) || 0,
        revenue: Number(course.revenue) || 0,
        refunds: Number(course.refunds) || 0,
        platformCommission: Number(course.platformCommission) || 0,
        educatorEarnings: Number(course.educatorEarnings) || 0,
      })),
      paymentMethods: paymentMethods.map(pm => ({
        paymentMethod: pm.paymentMethod,
        count: Number(pm.count) || 0,
        volume: Number(pm.volume) || 0,
        percentage: summary[0]?.totalTransactions > 0 
          ? ((Number(pm.count) / Number(summary[0].totalTransactions)) * 100).toFixed(2)
          : 0,
      })),
    };

    // Cache the results
    await cacheUtils.set(cacheKey, report, CACHE_TTLS.FINANCIAL_REPORT);
    
    return report;
  } catch (error) {
    logger.error(`Error generating financial report: ${error.message}`, { error });
    throw new AppError(`Failed to generate financial report: ${error.message}`, error.statusCode || 500);
  }
};

/**
 * Generate PDF for a financial report
 */
const generateFinancialReportPDF = async (reportData) => {
  return new Promise((resolve, reject) => {
    try {
      // Create temp directory if it doesn't exist
      const tempDir = path.join(__dirname, "../../temp");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Generate unique filename
      const uniqueId = uuidv4();
      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `financial_report_${dateStr}_${uniqueId}.pdf`;
      const filePath = path.join(tempDir, fileName);

      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });

      // Pipe PDF to file
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Add content to PDF
      generateFinancialPDFContent(doc, reportData);

      // Finalize PDF
      doc.end();

      // When PDF is written to file system, resolve with file path
      stream.on("finish", () => {
        resolve({
          filePath,
          filename: fileName,
        });
      });

      stream.on("error", (err) => {
        reject(new AppError(`Error generating PDF: ${err.message}`, 500));
      });
    } catch (error) {
      logger.error(`Error generating financial report PDF: ${error.message}`);
      reject(new AppError("Failed to generate financial report PDF", 500));
    }
  });
};

/**
 * Generate content for financial report PDF
 */
const generateFinancialPDFContent = (doc, reportData) => {
  // Add header
  doc.fontSize(20).text("FINANCIAL REPORT", { align: "center" });
  doc.moveDown();

  // Add report period
  doc.fontSize(12);
  doc.text(`Report Generated: ${formatDate(reportData.reportGenerated)}`);

  if (reportData.period.from || reportData.period.to) {
    doc.text(
      "Period: " +
        (reportData.period.from
          ? formatDate(reportData.period.from)
          : "All time") +
        " to " +
        (reportData.period.to ? formatDate(reportData.period.to) : "present")
    );
  }

  doc.moveDown();

  // Add summary section
  doc.fontSize(16).text("SUMMARY", { underline: true });
  doc.fontSize(12);

  const summary = reportData.summary;
  if (summary) {
    doc.text(`Total Revenue: $${formatNumber(summary.totalPayments || 0)}`);
    doc.text(`Total Refunds: $${formatNumber(summary.totalRefunds || 0)}`);
    doc.text(
      `Net Revenue: $${formatNumber(
        (summary.totalPayments || 0) - (summary.totalRefunds || 0)
      )}`
    );
    doc.text(
      `Platform Commission: $${formatNumber(summary.totalCommission || 0)}`
    );
    doc.text(
      `Total Educator Earnings: $${formatNumber(
        summary.totalEducatorEarnings || 0
      )}`
    );
    doc.text(`Successful Payments: ${summary.successfulPayments || 0}`);
    doc.text(`Successful Refunds: ${summary.successfulRefunds || 0}`);
  }

  doc.moveDown();

  // Add educator specific stats if available
  if (reportData.educatorStats) {
    doc.fontSize(16).text("EDUCATOR EARNINGS", { underline: true });
    doc.fontSize(12);

    const educatorStats = reportData.educatorStats;
    doc.text(`Educator ID: ${educatorStats.educatorId}`);
    doc.text(
      `Total Earnings: $${formatNumber(educatorStats.totalEarnings || 0)}`
    );
    doc.text(
      `Total Refunded Earnings: $${formatNumber(
        educatorStats.totalRefundedEarnings || 0
      )}`
    );
    doc.text(
      `Net Earnings: $${formatNumber(
        (educatorStats.totalEarnings || 0) -
          (educatorStats.totalRefundedEarnings || 0)
      )}`

    );

    doc.moveDown();
  }

  // Add daily stats section if available
  if (reportData.dailyStats && reportData.dailyStats.length > 0) {
    doc.fontSize(16).text("DAILY REVENUE", { underline: true });
    doc.fontSize(12);

    // Create a simple table for daily stats
    let y = doc.y + 15;

    // Table header
    doc
      .fontSize(10)
      .text("Date", 50, y)
      .text("Revenue", 200, y)
      .text("Refunds", 300, y)
      .text("Transactions", 400, y);

    y += 15;
    doc.moveTo(50, y).lineTo(500, y).stroke();

    y += 10;

    // Table rows - limit to first 20 days to avoid excessive pages
    const limitedDailyStats = reportData.dailyStats.slice(0, 20);

    limitedDailyStats.forEach((stat) => {
      const date = formatDate(new Date(stat.date));
      doc
        .fontSize(9)
        .text(date, 50, y)
        .text(`$${formatNumber(stat.dailyRevenue)}`, 200, y)
        .text(`$${formatNumber(stat.dailyRefunds)}`, 300, y)
        .text(stat.dailyTransactions.toString(), 400, y);

      y += 20;

      // Add new page if needed
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 50;
      }
    });

    // Add note if data was truncated
    if (reportData.dailyStats.length > 20) {
      doc.fontSize(8).text("(Showing first 20 days only)", { align: "center" });
    }

    doc.moveDown();
  }

  // Add top courses section if available
  if (reportData.topCourses && reportData.topCourses.length > 0) {
    doc.fontSize(16).text("TOP PERFORMING COURSES", { underline: true });
    doc.fontSize(12);

    // Create a simple table for top courses
    let y = doc.y + 15;

    // Table header
    doc
      .fontSize(10)
      .text("Course ID", 50, y)
      .text("Revenue", 300, y)
      .text("Sales", 400, y);

    y += 15;
    doc.moveTo(50, y).lineTo(500, y).stroke();

    y += 10;

    // Table rows
    reportData.topCourses.forEach((course) => {
      doc
        .fontSize(9)
        .text(course.courseId.toString(), 50, y, { width: 240 })
        .text(`$${formatNumber(course.totalRevenue)}`, 300, y)
        .text(course.totalSales.toString(), 400, y);

      y += 20;

      // Add new page if needed
      if (y > doc.page.height - 100) {
        doc.addPage();
        y = 50;
      }
    });

    doc.moveDown();
  }

  // Add footer
  doc
    .fontSize(10)
    .text("CONFIDENTIAL FINANCIAL INFORMATION", { align: "center" });
  doc.text(`Generated on ${formatDate(new Date())}`, { align: "center" });
};

/**
 * Get educator earnings report
 */
const getEducatorEarningsReport = async (educatorId, filters = {}) => {
  try {
    const cacheKey = generateReportCacheKey(`earnings:${educatorId}`, filters);
    
    // Try to get from cache first
    const cachedData = await cacheUtils.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache hit for earnings report: ${cacheKey}`);
      return cachedData;
    }
    
    logger.debug(`Cache miss for earnings report: ${cacheKey}`);
    
    // Build date filter condition for SQL queries
    let dateCondition = Prisma.empty;
    if (filters.startDate && filters.endDate) {
      dateCondition = Prisma.sql`AND t."createdAt" BETWEEN ${new Date(
        filters.startDate
      )} AND ${new Date(filters.endDate)}`;
    } else if (filters.startDate) {
      dateCondition = Prisma.sql`AND t."createdAt" >= ${new Date(filters.startDate)}`;
    } else if (filters.endDate) {
      dateCondition = Prisma.sql`AND t."createdAt" <= ${new Date(filters.endDate)}`;
    }

    // Query for educator's transactions
    const transactionsQuery = Prisma.sql`
      SELECT
        t."educatorId",
        COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END)::numeric,0) as "totalEarnings",
        COALESCE(SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END)::numeric,0) as "totalRefundedEarnings",
        COUNT(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN 1 END)::integer as "totalSales",
        COUNT(DISTINCT t."courseId") as "totalActiveCourses"
      FROM "Transaction" t
      WHERE t."educatorId" = ${educatorId} ${dateCondition}
      GROUP BY t."educatorId"
    `;

    const transactionsResults = await prisma.$queryRaw(transactionsQuery);

    // If no results found, return default structure
    if (transactionsResults.length === 0) {
      return {
        educatorId,
        totalEarnings: 0,
        totalRefundedEarnings: 0,
        totalSales: 0,
        totalActiveCourses: 0,
      };
    }

    // Format the report data
    const report = {
      educatorId: transactionsResults[0].educatorId,
      totalEarnings: Number(transactionsResults[0].totalEarnings),
      totalRefundedEarnings: Number(transactionsResults[0].totalRefundedEarnings),
      totalSales: Number(transactionsResults[0].totalSales),
      totalActiveCourses: Number(transactionsResults[0].totalActiveCourses),
      reportGenerated: new Date(),
      period: {
        from: filters.startDate ? new Date(filters.startDate) : null,
        to: filters.endDate ? new Date(filters.endDate) : null,
      },
    };

    // Cache the results
    await cacheUtils.set(cacheKey, report, CACHE_TTLS.EARNINGS_REPORT);
    
    return report;
  } catch (error) {
    logger.error(`Error getting educator earnings report: ${error.message}`, { error });
    throw new AppError("Failed to get educator earnings report", 500);
  }
};

/**
 * Generate commission report
 */
const generateCommissionReport = async (filters = {}) => {
  try {
    const cacheKey = generateReportCacheKey('commission', filters);
    
    // Try to get from cache first
    const cachedData = await cacheUtils.get(cacheKey);
    if (cachedData) {
      logger.debug(`Cache hit for commission report: ${cacheKey}`);
      return cachedData;
    }
    
    logger.debug(`Cache miss for commission report: ${cacheKey}`);
    
    // Build date filter condition for SQL queries
    let dateCondition = Prisma.empty;
    if (filters.startDate && filters.endDate) {
      dateCondition = Prisma.sql`AND t."createdAt" BETWEEN ${new Date(
        filters.startDate
      )} AND ${new Date(filters.endDate)}`;
    } else if (filters.startDate) {
      dateCondition = Prisma.sql`AND t."createdAt" >= ${new Date(filters.startDate)}`;
    } else if (filters.endDate) {
      dateCondition = Prisma.sql`AND t."createdAt" <= ${new Date(filters.endDate)}`;
    }

    // Query for commission statistics
    const commissionQuery = Prisma.sql`
      SELECT
        COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."platformCommission" ELSE 0 END)::numeric, 0) as "totalCommission",
        COALESCE(SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."platformCommission" ELSE 0 END)::numeric, 0) as "refundedCommission",
        COALESCE(SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END)::numeric, 0) as "totalEducatorEarnings",
        COALESCE(SUM(CASE WHEN t."type" = 'REFUND' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END)::numeric, 0) as "refundedEducatorEarnings",
        COALESCE(SUM(CASE WHEN t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END)::numeric, 0) as "totalTransactionAmount",
        AVG(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."platformCommission" / NULLIF(t."amount", 0) * 100 ELSE NULL END) as "averageCommissionRate"
      FROM "Transaction" t
      WHERE 1=1 ${dateCondition}
    `;

    const commissionResults = await prisma.$queryRaw(commissionQuery);

    // Format the report data
    const report = {
      summary: {
        totalCommission: Number(commissionResults[0]?.totalCommission) || 0,
        refundedCommission: Math.abs(
          Number(commissionResults[0]?.refundedCommission) || 0
        ),
        netCommission:
          Number(commissionResults[0]?.totalCommission) -
          Math.abs(Number(commissionResults[0]?.refundedCommission) || 0),
        totalEducatorEarnings:
          Number(commissionResults[0]?.totalEducatorEarnings) || 0,
        refundedEducatorEarnings: Math.abs(
          Number(commissionResults[0]?.refundedEducatorEarnings) || 0
        ),
        netEducatorEarnings:
          Number(commissionResults[0]?.totalEducatorEarnings) -
          Math.abs(Number(commissionResults[0]?.refundedEducatorEarnings) || 0),
        totalAmount: Number(commissionResults[0]?.totalTransactionAmount) || 0,
        averageCommissionRate:
          Number(commissionResults[0]?.averageCommissionRate) || 0,
      },
      monthlyTrend: [],
    };

    // Monthly trend query
    const trendQuery = Prisma.sql`
      SELECT
        DATE_TRUNC('month', t."createdAt") as "month",
        SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."platformCommission" ELSE 0 END) as "platformCommission",
        SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."educatorEarnings" ELSE 0 END) as "educatorEarnings",
        SUM(CASE WHEN t."type" = 'PAYMENT' AND t."status" = 'COMPLETED' THEN t."amount" ELSE 0 END) as "totalRevenue"
      FROM "Transaction" t
      WHERE 1=1 ${dateCondition}
      GROUP BY DATE_TRUNC('month', t."createdAt")
      ORDER BY DATE_TRUNC('month', t."createdAt")
    `;

    const trendResults = await prisma.$queryRaw(trendQuery);

    // Format monthly trend data
    report.monthlyTrend = trendResults.map(item => ({
      month: item.month,
      platformCommission: Number(item.platformCommission),
      educatorEarnings: Number(item.educatorEarnings),
      totalRevenue: Number(item.totalRevenue),
      platformShare:
        (Number(item.platformCommission) / Number(item.totalRevenue)) * 100,
      educatorShare:
        (Number(item.educatorEarnings) / Number(item.totalRevenue)) * 100,
    }));

    // Cache the results
    await cacheUtils.set(cacheKey, report, CACHE_TTLS.COMMISSION_REPORT);
    
    return report;
  } catch (error) {
    logger.error(`Error generating commission report: ${error.message}`, { error });
    throw new AppError("Failed to generate commission report", 500);
  }
};

/**
 * Format a number for display in reports
 */
const formatNumber = (num) => {
  return num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

/**
 * Format a date for display in reports
 */
const formatDate = (date) => {
  if (!date) return "N/A";

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

/**
 * Delete temporary PDF file
 */
const deleteTempPDF = (filePath) => {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    logger.error(`Failed to delete temporary PDF: ${error.message}`);
    // Don't throw, just log the error
  }
};

// Function to invalidate report caches
const invalidateReportCaches = async () => {
  try {
    // Delete all report caches
    await cacheUtils.deleteByPattern('report:*');
    logger.info('Successfully invalidated report caches');
  } catch (error) {
    logger.error(`Error invalidating report caches: ${error.message}`, { error });
  }
};

module.exports = {
  generateFinancialReport,
  generateFinancialReportPDF,
  getEducatorEarningsReport,
  deleteTempPDF,
  generateCommissionReport,
  invalidateReportCaches,
};
