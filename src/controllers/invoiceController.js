const invoiceService = require('../services/invoiceService');
const { AppError } = require('../middleware/errorHandler');

/**
 * @swagger
 * tags:
 *   - name: Invoices
 *     description: Invoice management and retrieval
 */

/**
 * @swagger
 * /payments/invoices/{invoiceId}:
 *   get:
 *     summary: Get a single invoice by ID
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         schema:
 *           type: string
 *         required: true
 *         description: Invoice ID
 *     responses:
 *       '200':
 *         description: Invoice retrieved successfully
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Not found
 *       '500':
 *         description: Server error
 */
/**
 * Get a single invoice by ID
 */
const getInvoice = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await invoiceService.getInvoiceById(invoiceId);
    
    // Check if user has permission to view this invoice
    if (req.user.role !== 'ADMIN' && invoice.transaction.userId !== req.user.id) {
      return next(new AppError('You do not have permission to view this invoice', 403));
    }
    
    res.status(200).json({
      success: true,
      data: invoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payments/invoices/user:
 *   get:
 *     summary: Get a paginated list of invoices for the authenticated user
 *     tags:
 *       - Invoices
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       '200':
 *         description: Invoices retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Invoice'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalItems:
 *                       type: integer
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Server error
 */
const getUserInvoices = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const result = await invoiceService.getInvoicesByUser(userId, page, limit);
    
    res.status(200).json({
      success: true,
      data: result.invoices,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payments/invoices/{invoiceId}/download:
 *   get:
 *     summary: Download invoice PDF by ID
 *     tags:
 *       - Invoices
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     responses:
 *       '200':
 *         description: PDF file downloaded successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Not found
 *       '500':
 *         description: Server error
 */
const downloadInvoicePdf = async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const invoice = await invoiceService.getInvoiceById(invoiceId);
    
    // Check if user has permission to download this invoice
    if (req.user.role !== 'ADMIN' && invoice.transaction.userId !== req.user.id) {
      return next(new AppError('You do not have permission to download this invoice', 403));
    }
    
    const pdfResult = await invoiceService.generateInvoicePDF(invoiceId);
    
    res.setHeader('Content-Disposition', `attachment; filename=${pdfResult.filename}`);
    
    res.sendFile(pdfResult.filePath, (err) => {
      // Clean up the temp file after sending or in case of error
      invoiceService.deleteTempPDF(pdfResult.filePath);
      if (err) {
        // Pass the exact error from res.sendFile to match the test
        next(err);
      }
    });
  } catch (error) {
    next(error);
  }
};


/**
 * @swagger
 * /payments/invoices/create:
 *   post:
 *     summary: Create a new invoice
 *     tags:
 *       - Invoices
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/InvoiceInput'
 *     responses:
 *       '201':
 *         description: Invoice created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Invoice'
 *       '400':
 *         description: Bad request
 *       '500':
 *         description: Server error
 */
const createInvoice = async (req, res, next) => {
  try {

    console.log("Creating invoice with data:", req.body);
    const invoiceData = req.body;
    const newInvoice = await invoiceService.createInvoice(invoiceData);
    
    res.status(201).json({
      success: true,
      data: newInvoice
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @swagger
 * /payments/invoices/{transactionId}/status:
 *   patch:
 *     summary: Update an invoice's status
 *     tags:
 *       - Invoices
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the transaction/invoice
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 description: New status for the invoice
 *                 enum:
 *                   - PENDING
 *                   - PAID
 *                   - CANCELLED
 *             required:
 *               - status
 *     responses:
 *       '200':
 *         description: Invoice status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/'
 *       '400':
 *         description: Bad request (e.g., missing status)
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: Not found
 *       '500':
 *         description: Server error
 */
const updateInvoiceStatus = async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { status } = req.body;
    
    if (!status) {
      return next(new AppError('Status is required', 400));
    }
    
    const updatedInvoice = await invoiceService.updateInvoiceStatus(transactionId, status);
    
    res.status(200).json({
      success: true,
      data: updatedInvoice
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getInvoice,
  getUserInvoices,
  downloadInvoicePdf,
  createInvoice,
  updateInvoiceStatus
};
