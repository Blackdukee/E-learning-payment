const express = require('express');
const router = express.Router();

// Import route files
const paymentRoutes = require('./paymentRoutes');
const invoiceRoutes = require('./invoiceRoutes');
const reportRoutes = require('./reportRoutes');
const statisticsRoutes = require('./statisticsRoutes');
const configRoutes = require('./configRoutes');

// Debugging: Check if each route is a function before using `router.use()`
console.log('paymentRoutes:', typeof paymentRoutes);
console.log('invoiceRoutes:', typeof invoiceRoutes);
console.log('reportRoutes:', typeof reportRoutes);
console.log('statisticsRoutes:', typeof statisticsRoutes);
console.log('configRoutes:', typeof configRoutes);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'payment-service' });
});

// Ensure each route is correctly imported before mounting
if (typeof paymentRoutes === 'function') {
  router.use('/payments', paymentRoutes);
} else {
  console.error('Error: paymentRoutes is not a function!');
}

if (typeof invoiceRoutes === 'function') {
  router.use('/invoices', invoiceRoutes);
} else {
  console.error('Error: invoiceRoutes is not a function!');
}

if (typeof reportRoutes === 'function') {
  router.use('/reports', reportRoutes);
} else {
  console.error('Error: reportRoutes is not a function!');
}

if (typeof statisticsRoutes === 'function') {
  router.use('/statistics', statisticsRoutes);
} else {
  console.error('Error: statisticsRoutes is not a function!');
}

if (typeof configRoutes === 'function') {
  router.use('/config', configRoutes);
} else {
  console.error('Error: configRoutes is not a function!');
}

// Export the router
module.exports = router;
