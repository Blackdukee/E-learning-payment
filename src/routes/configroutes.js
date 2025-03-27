const express = require('express');
const router = express.Router();

// Example route for fetching config settings
router.get('/', (req, res) => {
  res.json({ message: 'Config routes working' });
});

// Another example route (e.g., fetching app settings)
router.get('/settings', (req, res) => {
  res.json({ theme: 'dark', version: '1.0.0' });
});

module.exports = router; 
