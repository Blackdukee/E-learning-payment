const axios = require("axios");
const { logger } = require("../utils/logger");
const { AppError } = require("./errorHandler");

/**
 * Validate the authentication token
 */
const validateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("ValidationError","Authentication token is missing", 401);
    }

    const token = authHeader.split(" ")[1];

    // Typically, we would validate the token against the user service
    try {
      const userServiceUrl =
        process.env.USER_SERVICE_URL || "http://localhost:5003/api/v1/ums";
      const response = await axios.post(
        `${userServiceUrl}/auth/validate`,
        { token },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Service-Key": process.env.INTERNAL_API_KEY,
          },
          timeout: 5000,
        }
      );

      if (!response.data.valid) {
        return next(new AppError("JsonWebTokenError","Invalid or expired token", 401));
      }
      response.data.user.id = response.data.user.id.toString();
      req.user = response.data.user;
      next();

    } catch (axiosError) {
      // Handle network errors or service unavailable scenarios

      if (axiosError.code === "ECONNREFUSED") {
        logger.error(`Auth service connection refused: ${axiosError.message}`);
        return next(new AppError("ECONNREFUSED","Authentication service unavailable", 503));
      } else if (!axiosError.message.includes("Invalid or expired token")) {
        // log the device ip for this request
        logger.error(`Auth service error: ${axiosError.message}`);
        logger.error(`Request IP: ${req.ip}`);
        return next(new AppError("JsonWebTokenError","Invalid Token", 401));
      }

      // Handle error response from auth service
      logger.error(
        `Auth validation error: ${
          axiosError.response.data?.message || axiosError.message
        }`
      );
      return next(
        new AppError("ValidationError","Authentication failed", axiosError.response.status || 401)
      );
    }
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      // Network error or internal error
      logger.error(`Auth middleware error: ${error.message}`);
      next(new AppError("ValidationError","Authentication failed due to server issue", 500));
    }
  }
};

/**
 * Check if user has required role
 */
const requireRole = (roles) => {
  return (req, res, next) => {
    // Ensure roles is an array
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    if (!req.user) {
      return next(new AppError("ValidationError","User not authenticated", 401));
    }

    if (!requiredRoles.includes(req.user.role)) {
      return next(new AppError("ValidationError","Access denied: insufficient permissions", 403));
    }

    next();
  };
};

/**
 * Create middleware for testing without actual authentication
 */
const mockAuthMiddleware = (
  role = "Admin",
  id = "edu_123",
  name = "E mock user"
) => {
  return (req, res, next) => {
    req.user = {
      id: id,
      email: "mock@example.com",
      name: name,
      role: role,
    };
    next();
  };
};

const mockEducatorAuthMiddleware = () => {
  return (req, res, next) => {
    req.user = {
      id: "edu_123",
      email: "mock@example.com",
      role: "Educator",
      name: "Mock Educator",
    };
    next();
  };
};

module.exports = {
  validateToken,
  requireRole,
  mockAuthMiddleware,
  mockEducatorAuthMiddleware,
};
