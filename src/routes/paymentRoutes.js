require('dotenv').config();
const express = require("express");
const router = express.Router();
const {
  mockAuthMiddleware,
  mockEducatorAuthMiddleware,
  validateToken,
  requireRole,
} = require("../middleware/auth");
const { validate } = require("../middleware/validators");
const paymentController = require("../controllers/paymentController");

// Schema validation for payment requests
const paymentSchema = {
  courseId: { type: "string", required: true },
  amount: { type: "number", required: true, min: 0.01 },
  currency: { type: "string", required: true, enum: ["USD", "EUR", "GBP"] },
  source: { type: "string", required: true },
  educatorId: { type: "string", required: true },
  description: { type: "string", required: false },
};

// request json example

// Schema validation for refund requests
const refundSchema = {
  transactionId: { type: "string", required: true },
  reason: { type: "string", required: false },
};

// Process payment
router.post(
  "/",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware() : validateToken,
  validate(paymentSchema),
  paymentController.processPayment
);

// check student enrollment status
router.get(
  "/enrollment-status/:courseId",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware() : validateToken,
  paymentController.checkStudentEnrollment
);

// Process refund
router.post(
  "/refund",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware() : validateToken,
  validate(refundSchema),
  paymentController.processRefund
);
// refund json example

// Get user transactions
router.get(
  "/user",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware() : validateToken,
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
    ? mockAuthMiddleware() : validateToken,
  paymentController.getTransactionById
);

// Generate transaction report (admin only)
router.get(
  "/report/transactions",
  process.env.NODE_ENV === "development"
    ? mockAuthMiddleware() : validateToken,
  requireRole("ADMIN"),
  paymentController.generateTransactionReport
);

module.exports = router;
