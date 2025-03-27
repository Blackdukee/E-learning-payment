const axios = require('axios');
const { logger } = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/**
 * Send internal notification to other microservices
 */
const notifyService = async (serviceUrl, data) => {
  try {
    const response = await axios.post(serviceUrl, data, {
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': process.env.INTERNAL_API_KEY || 'payment-service-key',
      },
      timeout: 5000, // 5 second timeout
    });
    
    return response.data;
  } catch (error) {
    // Log the error but don't stop execution
    logger.error(`Service notification error: ${error.message}`, { 
      serviceUrl,
      error: error.response ? error.response.data : error.message,
      status: error.response ? error.response.status : 'No response'
    });
    // Return false to indicate failure but don't throw
    return {
      success: false,
      error: error.response ? error.response.data : error.message
    };
  }
};




module.exports = {
  notifyService,

};
