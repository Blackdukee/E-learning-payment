// Load environment variables
require('dotenv').config();

const { logger } = require('../utils/logger');

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'STRIPE_SECRET_KEY', 
  'INTERNAL_API_KEY'
];

// Validate required environment variables
const missingVars = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

if (missingVars.length) {
  const errorMessage = `Missing required environment variables: ${missingVars.join(', ')}`;
  logger.error(errorMessage);
  throw new Error(errorMessage);
}

/**
 * Central configuration object following project structure best practices
 */
module.exports = {
  // Database configuration
  database: {
    url: process.env.DATABASE_URL
  },
  
  // Redis configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    host: process.env.REDIS_HOST || '127.0.0.1',  // Use IPv4 explicitly
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    enabled: process.env.REDIS_ENABLED !== 'false',
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000', 10),
    retryAttempts: parseInt(process.env.REDIS_RETRY_ATTEMPTS || '5', 10),
    retryDelay: parseInt(process.env.REDIS_RETRY_DELAY || '1000', 10),
    cacheTtl: parseInt(process.env.CACHE_TTL || '3600', 10)  // Default 1 hour
  },
  
  // Stripe configuration
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    platformCommissionPercentage: parseFloat(process.env.PLATFORM_COMMISSION_PERCENTAGE || '20')
  },
  
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '5002', 10),
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    frontEndUrl: process.env.FRONT_END_URL || 'http://localhost:3000',
    allowedOrigins: process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
      : ['http://localhost:3000']
  },
  
  // Security configuration
  security: {
    internalApiKey: process.env.INTERNAL_API_KEY,
    jwtSecret: process.env.JWT_SECRET || 'default-development-secret'
  },
  
  // Services
  services: {
    userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:3001/api',
    courseServiceUrl: process.env.COURSE_SERVICE_URL || 'http://localhost:3002/api'
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')
  }
};
