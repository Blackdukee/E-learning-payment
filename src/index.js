require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");
const { swagger_schemas } = require("./swagger/schemas/schemas");

// Fix the logger import to use the destructured format
const { logger } = require("./utils/logger");
const { errorHandler } = require("./middleware/errorHandler");
const router = require("./routes/index");

// Swagger setup
const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

// Swagger definition
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Payment Service API",
      version: "1.0.0",
      description: "API documentation for the Payment Service",
    },
    servers: [{ url: `http://localhost:${process.env.PORT || 5002}/api/v1` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: { ...swagger_schemas },
    },
  },
  apis: ["./src/routes/*.js", "./src/controllers/*.js"],
};
const swaggerSpecs = swaggerJsDoc(swaggerOptions);

const app = express();

app.use(async (req, res, next) => {
  // Log request to the console
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});
// Middleware
// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "http://3.66.224.12:5002",
          "https://js.stripe.com", // Stripe.js
          "https://checkout.stripe.com",
        ], // For embedded learning content if needed
        styleSrc: ["'self'", "'unsafe-inline'"], // For dynamic styling
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://*",
          "http://3.66.224.12:5002",
        ], // For course images
        mediaSrc: ["'self'", "https://*", "http://3.66.224.12:5002"], // For video/audio learning content
        connectSrc: ["'self'", "https://*", "http://3.66.224.12:5002"], // For API connections
        fontSrc: ["'self'", "https://*", "http://3.66.224.12:5002"], // For custom fonts
      },
    },
    xssFilter: true,
    frameguard: { action: "sameorigin" }, // Important for iframe embedded content
  })
);

// Configure CORS for e-learning platform
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "development" ? "*" : ["http://localhost:3000","http://3.66.224.12:5002"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
    maxAge: 86400, // 24 hours
  })
);

app.use(
  express.json({
    verify: (req, res, buf) => {
      // Store raw body for Stripe webhook verification
      if (req.originalUrl === "/api/v1/webhooks/stripe") {
        req.rawBody = buf.toString();
      }
    },
  })
);

app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, "../temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, "../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Routes
app.use("/api/v1/", router);

// Serve Swagger UI
app.use("/api/v1/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Health check endpoint
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({ status: "UP", timestamp: new Date() });
});

// Error handler
app.use(errorHandler);

// Export app for testing
module.exports = app;

// Only start server if this file is run directly (not imported)
if (require.main === module) {
  const PORT = process.env.PORT || 5002;
  app.listen(PORT, () => {
    logger.info(`Payment service running on port ${PORT}`);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection at:", promise, "reason:", reason);
    // Application specific handling logic here
  });
}

process.on("uncaughtException", (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});
