// src/middleware/validation.js
const { body, query, validationResult } = require("express-validator");
const { AppError } = require("./errorHandler");

// -- Rule sets -------------------------------------------------

const paymentValidation = [
  body("courseId")
    .notEmpty().withMessage("Course ID is required")
    .isString().withMessage("Course ID must be a string"),

  body("amount")
    .notEmpty().withMessage("Amount is required")
    .isFloat({ min: 0.01 }).withMessage("Amount must be greater than 0"),

  body("currency")
    .optional()
    .isString().withMessage("Currency must be a string")
    .isLength({ min: 3, max: 3 }).withMessage("Currency must be 3 characters"),

  body("source")
    .notEmpty().withMessage("Payment source is required")
    .isString().withMessage("Payment source must be a string"),

  body("educatorId")
    .notEmpty().withMessage("Educator ID is required")
    .isString().withMessage("Educator ID must be a string"),
];

const refundValidation = [
  body("transactionId")
    .notEmpty().withMessage("Transaction ID is required")
    .isString().withMessage("Transaction ID must be a string"),

  body("amount")
    .optional()
    .isFloat({ min: 0.01 }).withMessage("Amount must be greater than 0"),

  body("reason")
    .optional()
    .isString().withMessage("Reason must be a string"),
];

const paginationValidation = [
  query("page")
    .optional()
    .isInt({ min: 1 }).withMessage("Page must be a positive integer"),

  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),
];

const reportFilterValidation = [
  query("startDate")
    .optional()
    .isISO8601().withMessage("Start date must be a valid ISO8601 date"),

  query("endDate")
    .optional()
    .isISO8601().withMessage("End date must be a valid ISO8601 date"),

  query("type")
    .optional()
    .isIn(["PAYMENT", "REFUND"]).withMessage("Type must be PAYMENT or REFUND"),

  query("status")
    .optional()
    .isIn(["PENDING", "COMPLETED", "FAILED", "REFUNDED", "DISPUTED"])
    .withMessage("Status must be one of PENDING, COMPLETED, FAILED, REFUNDED, DISPUTED"),
];

const createInvoiceValidator = [
  body("transactionId")
    .notEmpty().withMessage("Transaction ID is required"),

  body("subtotal")
    .isFloat({ min: 0 }).withMessage("Subtotal must be a non-negative number"),

  body("discount")
    .isFloat({ min: 0 }).withMessage("Discount must be a non-negative number"),

  body("tax")
    .isFloat({ min: 0 }).withMessage("Tax must be a non-negative number"),

  body("status")
    .notEmpty().withMessage("Status is required")
    .isString().withMessage("Status must be a string"),

  body("billingInfo")
    .custom(val => typeof val === "object" && val !== null)
    .withMessage("Billing info must be a valid object"),

  body("notes")
    .optional()
    .isString().withMessage("Notes must be a string"),
];

// -- Validation runner -----------------------------------------

/**
 * Run an array of express-validator rules, then check for errors.
 * If any, throw an AppError(400).
 */
const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map((rule) => rule.run(req)));

    // Gather results
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Map to array of messages
      const msgs = errors.array().map((err) => `${err.param}: ${err.msg}`);
      // Throw an operational error we catch in errorHandler
      return next(new AppError("ValidationError", msgs.join("; "), 400));
    }

    next();
  };
};

module.exports = {
  paymentValidation,
  refundValidation,
  paginationValidation,
  reportFilterValidation,
  createInvoiceValidator,
  validate,
};
