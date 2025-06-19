require('dotenv').config();
const express = require("express");
const router = express.Router();
const {
  mockAuthMiddleware,
  mockEducatorAuthMiddleware,
  validateToken,
  requireRole,
} = require("../middleware/auth");
const { validate,refundValidation,paymentValidation} = require("../middleware/validators");
const paymentController = require("../controllers/paymentController");


router.use(
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware(role="Student","std_123","ali") : validateToken,
  requireRole( ["Student","Admin"])
);

// Process payment
router.post(
  "/",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware(role="Student","std_123","ali") : validateToken,
  validate(paymentValidation),
  paymentController.processPayment
);


// Process refund
router.post(
  "/refund",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware(role="Student","std_123","ali") : validateToken,
  validate(refundValidation),
  paymentController.processRefund
);
// refund json example

// Get user transactions
router.get(
  "/user",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware(role="Student","std_123","ali") : validateToken,
  paymentController.getUserTransactions
);


// Get total earnings for educator
router.get(
  "/total-earnings",
  process.env.NODE_ENV === 'development' ? mockEducatorAuthMiddleware : validateToken,
  paymentController.getTotalEarningsForEducator
);

// Get educator current balance
router.get(
  "/current-balance",
  process.env.NODE_ENV === 'development' ? mockEducatorAuthMiddleware : validateToken,
  paymentController.getEducatorCurrentBalance
);

// Get transaction by ID
router.get(
  "/:transactionId",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware(role="Student","std_123","ali") : validateToken,
  paymentController.getTransactionById
);

// Generate transaction report (admin only)
router.get(
  "/report/transactions",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware() : validateToken,
  requireRole("Admin"),
  paymentController.generateTransactionReport
);

module.exports = router;
