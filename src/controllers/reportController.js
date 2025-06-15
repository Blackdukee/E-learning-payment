const reportingService = require('../services/reportingService');
const { AppError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

/**
 * @swagger
 * tags:
 *   - name: Reports
 *     description: Generate and retrieve various financial reports
 */

/**
 * @swagger
 * /payments/reports/financial:
 *   get:
 *     summary: Generate financial report with optional filters
 *     tags: [Reports]
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
 *         description: Start date for report
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           pattern: "YYYY-MM-DD"
 *           example: "2023-01-01"
 *         description: End date for report
 *       - in: query
 *         name: educatorId
 *         schema:
 *           type: string
 *         description: Educator ID to filter (admin only)
 *     responses:
 *       '200':
 *         description: Financial report data
 */
const generateFinancialReport = async (req, res, next) => {
  try {
    // Extract query parameters
    const { startDate, endDate, educatorId } = req.query;
    const filters = {};
    
    // Check permissions
    if (req.user.role === 'ADMIN') {
      // Admin can view all reports and specify any filters
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (educatorId) filters.educatorId = educatorId;
    } else if (req.user.role === 'EDUCATOR') {
      // Educators can only view their own reports
      filters.educatorId = req.user.id;
      
      // If educator tries to request another educator's data, block access
      if (educatorId && educatorId !== req.user.id) {
        return next(new AppError('You can only access your own financial reports', 403));
      }
      
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
    } else {
      // Other users cannot access reports
      return next(new AppError('You do not have permission to access financial reports', 403));
    }
    
    // Generate the report
    const report = await reportingService.generateFinancialReport(filters);
    
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payments/reports/financial/pdf:
 *   get:
 *     summary: Download financial report as PDF
 *     tags: [Reports]
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
 *         name: educatorId
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: PDF file downloaded
 */
const downloadFinancialReportPDF = async (req, res, next) => {
  try {
    // Extract query parameters
    const { startDate, endDate, educatorId } = req.query;
    const filters = {};
    
    // Check permissions (same logic as generateFinancialReport)
    if (req.user.role === 'ADMIN') {
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (educatorId) filters.educatorId = educatorId;
    } else if (req.user.role === 'EDUCATOR') {
      filters.educatorId = req.user.id;
      
      if (educatorId && educatorId !== req.user.id) {
        return next(new AppError('You can only access your own financial reports', 403));
      }
      
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
    } else {
      return next(new AppError('You do not have permission to access financial reports', 403));
    }
    
    // Generate the report data
    const reportData = await reportingService.generateFinancialReport(filters);
    
    // Generate PDF from report data
    const pdfResult = await reportingService.generateFinancialReportPDF(reportData);
    
    // Send PDF file as download
    res.setHeader('Content-Disposition', `attachment; filename=${pdfResult.filename}`);
    
    res.sendFile(pdfResult.filePath, (err) => {
      // Clean up the temp file after sending or in case of error
      reportingService.deleteTempPDF(pdfResult.filePath);
      if (err) {
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payments/reports/educators/{educatorId}/earnings:
 *   get:
 *     summary: Get earnings report for a specific educator
 *     tags: [Reports]
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
 *         description: Educator earnings report
 *       '403':
 *         description: Forbidden
 */
const getEducatorEarningsReport = async (req, res, next) => {
  try {
    const { educatorId } = req.params;
    
    // Check permissions
    if (req.user.role === 'ADMIN') {
      // Admin can view any educator's earnings
    } else if (req.user.role === 'EDUCATOR' && req.user.id === educatorId) {
      // Educator can view their own earnings
    } else {
      // Others cannot access educator earnings
      return next(new AppError('You do not have permission to access this earnings report', 403));
    }
    
    // Get the earnings report
    const earningsReport = await reportingService.getEducatorEarningsReport(educatorId);
    
    res.status(200).json({
      success: true,
      data: earningsReport
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payments/reports/commission-analysis:
 *   get:
 *     summary: Generate commission analysis report
 *     tags: [Reports]
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
 *         name: educatorId
 *         schema:
 *           type: string
 *         description: Educator ID to filter
 *     responses:
 *       '200':
 *         description: Commission analysis data
 */
const getCommissionAnalysisReport = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      educatorId: req.query.educatorId
    };
    
    // Check authorization - admins can see all, educators can only see their own data
    if (req.user.role !== 'ADMIN' && req.query.educatorId && req.query.educatorId !== req.user.id) {
      return next(new AppError('You are not authorized to view this report', 403));
    }
    
    const report = await reportingService.generateCommissionReport(filters);
    
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateFinancialReport,
  downloadFinancialReportPDF,
  getEducatorEarningsReport,
  getCommissionAnalysisReport
};
