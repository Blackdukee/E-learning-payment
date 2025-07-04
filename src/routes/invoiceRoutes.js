const express = require("express");
const { param, query } = require("express-validator");
const {
  validateToken,
  mockAuthMiddleware,
  requireRole,
} = require("../middleware/auth");
const {
  validate,
  createInvoiceValidator,
} = require("../middleware/validators");
const invoiceController = require("../controllers/invoiceController");

const router = express.Router();

// Get user's invoices
router.get(
  "/user",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 50 })
      .withMessage("Limit must be between 1 and 50"),
  ],
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware((role = "Student"), "std_123", "ali")
    : validateToken,
  invoiceController.getUserInvoices
);

// Get specific invoice
router.get(
  "/:invoiceId",
  [param("invoiceId").notEmpty().withMessage("Invoice ID is required")],
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware((role = "Student"), "std_123", "ali")
    : validateToken,
  invoiceController.getInvoice
);

router.post(
  "/create",
  process.env.NODE_ENV === "development"
  ? mockAuthMiddleware((role = "Student"), "std_123", "ali")
  : validateToken,
  validate(createInvoiceValidator),
  invoiceController.createInvoice
);

// Download invoice PDF
router.get(
  "/:invoiceId/download",
  [param("invoiceId").notEmpty().withMessage("Invoice ID is required")],
  process.env.NODE_ENV === "development" ? mockAuthMiddleware() : validateToken,
  invoiceController.downloadInvoicePdf
);

module.exports = router;
