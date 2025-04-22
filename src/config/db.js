const { PrismaClient } = require('@prisma/client');
const baseLogger = require('../utils/baseLogger');

// Create a singleton instance of the Prisma client
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'info', 'warn', 'error'] 
    : ['error'],
    // connectionLimit: 20,
    // waitForConnections: true,
    // queueLimit: 50
});

// Handle connection errors
prisma.$connect()
  .then(() => {
    baseLogger.info('Database connection established');
  })
  .catch((error) => {
    baseLogger.error('Database connection error:', error);
    baseLogger.error(error.stack);
    // Only exit on DB error in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      process.exit(1);
    }
  });

// Handle graceful shutdown
process.on('SIGINT', async () => {
  try {
    await prisma.$disconnect();
    baseLogger.info('Database connection closed');
    if (process.env.NODE_ENV !== 'test') process.exit(0);
  } catch (error) {
    baseLogger.error('Error during database disconnection:', error);
    if (process.env.NODE_ENV !== 'test') process.exit(1);
  }
});

module.exports = prisma;
