require("dotenv").config();
const express = require("express");
const { body } = require("express-validator");
const { validateToken, mockAuthMiddleware } = require("../middleware/auth");
const paymentController = require("../controllers/paymentController");

const router = express.Router();

// Middleware to protect all refund routes
router.use(
  process.env.NODE_ENV === "development" ? mockAuthMiddleware() : validateToken
);

// Process a refund (alternative route)
router.post(
  "/",
  [
    body("transactionId").notEmpty().withMessage("Transaction ID is required"),
    body("amount")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Amount must be a positive number"),
    body("reason")
      .optional()
      .isString()
      .withMessage("Reason must be a valid string"),
  ],
  paymentController.processRefund
);

// The routes below are for educational purposes and would likely need admin/educator authorization

// Get refund by original transaction ID
router.get("/transaction/:transactionId", (req, res, next) => {
  paymentController.getTransaction(req, res, next);
});

module.exports = router;
