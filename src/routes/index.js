const express = require('express');
const paymentRoutes = require('./paymentRoutes');
const refundRoutes = require('./refundRoutes');
const webhookRoutes = require('./webhookRoutes');
const invoiceRoutes = require('./invoiceRoutes');
const statisticsRoutes = require('./statisticsRoutes');
const reportRoutes = require('./reportRoutes');
const accountRoute = require('./accountRoute');
const redisCache = require('../config/cache');
const config = require('../config');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint for the service and its dependencies
 */
router.get('/health', async (req, res) => {
  const health = {
    status: 'UP',
    timestamp: new Date(),
    service: 'payment-service',
    version: process.env.npm_package_version || '1.0.0',
    nodeEnv: config.server.env,
    dependencies: {
      redis: {
        status: redisCache.isReady() ? 'UP' : 'DOWN',
        enabled: config.redis.enabled
      },
      database: {
        status: 'UP' // This would need to be checked with a DB ping
      }
    }
  };
  
  // Log health check for monitoring
  logger.debug('Health check performed', { health });
  
  // Return 503 Service Unavailable if critical dependencies are down
  const httpStatus = (health.dependencies.database.status === 'UP') ? 200 : 503;
  
  res.status(httpStatus).json(health);
});

// Mount routes
router.use('/pay', paymentRoutes);
router.use('/refunds', refundRoutes);
router.use('/webhook', webhookRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/statistics', statisticsRoutes);
router.use('/reports', reportRoutes);
router.use('/account', accountRoute);

module.exports = router;

