const express = require('express');
const configController = require('../controllers/configController');
const { mockAuthMiddleware,validateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all configurations (admin only)
router.get(
  '/',
  process.env.NODE_ENV === 'development' ? mockAuthMiddleware() : validateToken(),
  requireRole('ADMIN'),
  configController.getAllConfig
);

// Get a specific configuration
router.get(
  '/:key',
  process.env.NODE_ENV === 'development' ? mockAuthMiddleware() : validateToken(),
  requireRole('ADMIN'),
  configController.getConfig
);

// Update a configuration (admin only)
router.put(
  '/:key',
  process.env.NODE_ENV === 'development' ? mockAuthMiddleware() : validateToken(),
  requireRole('ADMIN'),
  configController.updateConfig
);

// Reload all configurations (admin only)
router.post(
  '/reload',
  process.env.NODE_ENV === 'development' ? mockAuthMiddleware() : validateToken(),
  requireRole('ADMIN'),
  configController.reloadConfig
);

module.exports = router;