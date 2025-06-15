const { logger } = require("../utils/logger");

/**
 * Custom application error class
 */
class AppError extends Error {
  constructor(name = "AppError", message, statusCode) {
    super(message);
    this.name = name;
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? "fail" : "error";
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Default status code and message
  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong";
  const requestId = req.headers["x-request-id"] || "unknown";
  const userId = req.user?.id || "anonymous";

  logger.error(
    `Error handling request ${requestId} from user ${userId}: ${err.message}`,
    {
      error: err,
      requestId,
      userId,
      path: req.path,
      method: req.method,
      params: req.params,
      query: req.query,
      body: process.env.NODE_ENV === "production" ? "[REDACTED]" : req.body,
    }
  );

  // Generic validation/auth errors
  if (err.name === "ValidationError") {
    statusCode = 400;
    message = err.message;
  } else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token. Please log in again.";
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Your token has expired. Please log in again.";
  } else if (err.code === "P2002") {
    statusCode = 400;
    message = "A record with that value already exists.";
  }

  // ─────────────── AccountService Errors ───────────────
  else if (err.name === "acc_not_found_err") {
    statusCode = 404;
    message = "Account not found.";
  } else if (err.name === "acc_create_err") {
    statusCode = 500;
    message = "Failed to create account.";
  } else if (err.name === "acc_found_err") {
    statusCode = 409;
    message = "Account already exists.";
  } else if (err.name === "acc_connect_err") {
    statusCode = 500;
    message = "Failed to connect to account service.";
  } else if (err.name === "acc_delete_err") {
    statusCode = 500;
    message = "Failed to delete account.";
  }

  // ─────────────── InvoiceService Errors ───────────────
  else if (err.name === "invoice_create_err") {
    statusCode = 400;
    message = "Failed to create invoice.";
  } else if (err.name === "invoice_generate_err") {
    statusCode = 500;
    message = "Failed to generate invoice.";
  } else if (err.name === "invoice_not_found_err") {
    statusCode = 404;
    message = "Invoice not found.";
  } else if (err.name === "invoice_fetching_err") {
    statusCode = 404;
    message = "Unable to fetch invoice data.";
  } else if (err.name === "invoice_update_err") {
    statusCode = 400;
    message = "Failed to update invoice.";
  }

  // ───────────── NotificationService Errors ─────────────
  // (none to re-throw; logging in-service is sufficient)

  // ────────────── PaymentService Errors ──────────────
  else if (err.name === "enrollment_check_err") {
    statusCode = 400;
    message = "Failed to verify enrollment status.";
  } else if (err.name === "edu_not_found_err") {
    statusCode = 404;
    message = "Education resource not found.";
  } else if (err.name === "already_enrolled_err") {
    statusCode = 409;
    message = "User is already enrolled in this course.";
  } else if (err.name === "fetching_err") {
    statusCode = 404;
    message = "Unable to fetch requested data.";
  } else if (err.name === "transaction_err") {
    statusCode = 400;
    message = "Transaction could not be completed.";
  } else if (err.name === "refund_err") {
    statusCode = 400;
    message = "Unable to process refund request.";
  } else if (err.name === "report_err") {
    statusCode = 500;
    message = "Failed to generate or process report.";
  }

  // ───────────── ReportingService Errors ─────────────
  else if (err.name === "report_invalid_date_err") {
    statusCode = 400;
    message = "Invalid date provided for report.";
  } else if (err.name === "report_generation_err") {
    statusCode = 500;
    message = "Failed to generate report.";
  } else if (err.name === "report_pdf_generation_err") {
    statusCode = 500;
    message = "Failed to generate PDF for report.";
  } else if (err.name === "report_earning_err") {
    statusCode = 500;
    message = "Failed to retrieve earnings data.";
  } else if (err.name === "report_generate_err") {
    statusCode = 500;
    message = "Failed to generate report.";
  }

  // ──────────── StatisticsService Errors ────────────
  else if (err.name === "stats_invalid_date_err") {
    statusCode = 400;
    message = "Invalid date provided for statistics.";
  } else if (err.name === "stats_transaction_err") {
    statusCode = 500;
    message = "Failed to retrieve transaction statistics.";
  } else if (err.name === "stats_financial_err") {
    statusCode = 500;
    message = "Failed to retrieve financial statistics.";
  } else if (err.name === "stats_payment_operations_err") {
    statusCode = 500;
    message = "Failed to retrieve payment operations statistics.";
  } else if (err.name === "stats_educator_analytics_err") {
    statusCode = 500;
    message = "Failed to retrieve educator analytics.";
  }

  // Return error response
  res.status(statusCode).json({
    success: false,
    status: statusCode >= 400 && statusCode < 500 ? "fail" : "error",
    message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = {
  AppError,
  errorHandler,
};
