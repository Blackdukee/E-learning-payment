// Mock external dependencies before importing app
// Mock Prisma client
jest.mock('../src/config/db', () => ({
  $connect: jest.fn().mockResolvedValue(true),
  $disconnect: jest.fn().mockResolvedValue(true),
  transaction: {
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: { educatorEarnings: 0 } }),
  },
  stripeAccount: {
    findFirst: jest.fn().mockResolvedValue({ stripeAccountId: 'acct_mock' }),
    create: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
  invoice: {
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(0),
  },
  $queryRaw: jest.fn().mockResolvedValue([{}]),
  $transaction: jest.fn(callback => callback({})),
  sql: jest.fn(template => template),
}));

// Mock other database-accessing services
jest.mock('../src/services/paymentService');
jest.mock('../src/services/statisticsService');

// Mock axios for token validation
jest.mock('axios');

// Import app after all mocks are set up
const request = require('supertest');
const app = require('../src/index');
const axios = require('axios');

// Set up service mocks
const paymentService = require('../src/services/paymentService');
const statisticsService = require('../src/services/statisticsService');

// Configure mocks with default responses
paymentService.getTransactionsByUser = jest.fn().mockResolvedValue({ 
  transactions: [], 
  pagination: { total: 0, pages: 0, page: 1, limit: 10 } 
});

statisticsService.getTransactionVolumes = jest.fn().mockResolvedValue({});
statisticsService.getPerformanceMetrics = jest.fn().mockResolvedValue({});
statisticsService.getFinancialAnalysis = jest.fn().mockResolvedValue({});
statisticsService.getPaymentOperations = jest.fn().mockResolvedValue({});
statisticsService.getDashboardStatistics = jest.fn().mockResolvedValue({});
statisticsService.getEducatorPaymentAnalytics = jest.fn().mockResolvedValue({});

describe('Broken Access Control Tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    axios.post.mockReset();
    paymentService.getTransactionsByUser.mockClear();
    statisticsService.getEducatorPaymentAnalytics.mockClear();
  });

  // Helper to set up authentication
  const authHeader = (role, id = 'user1') => {
    axios.post.mockResolvedValue({ data: { valid: true, user: { id, role } } });
    return 'Bearer valid-token';
  };

  test('Unauthenticated access is denied', async () => {
    const res = await request(app).get('/api/payments/user');
    expect(res.status).toBe(401);
  });

  test('USER role can access own transactions', async () => {
    const token = authHeader('USER', 'user1');
    const res = await request(app)
      .get('/api/payments/user')
      .set('Authorization', token);
    
    expect(res.status).toBe(200);
    expect(paymentService.getTransactionsByUser).toHaveBeenCalledWith('user1', 1, 10);
  });

  test('USER role is denied access to admin statistics', async () => {
    const token = authHeader('USER', 'user1');
    const res = await request(app)
      .get('/api/statistics/transaction-volumes')
      .set('Authorization', token);
    
    expect(res.status).toBe(403);
    expect(statisticsService.getTransactionVolumes).not.toHaveBeenCalled();
  });

  test('ADMIN role can access statistics', async () => {
    const token = authHeader('ADMIN', 'admin1');
    const res = await request(app)
      .get('/api/statistics/transaction-volumes')
      .set('Authorization', token);
    
    expect(res.status).toBe(200);
    expect(statisticsService.getTransactionVolumes).toHaveBeenCalled();
  });

  test('EDUCATOR cannot access other educator analytics', async () => {
    const token = authHeader('EDUCATOR', 'edu1');
    const res = await request(app)
      .get('/api/statistics/educators/edu2/payment-analytics')
      .set('Authorization', token);
    
    expect(res.status).toBe(403);
    expect(statisticsService.getEducatorPaymentAnalytics).not.toHaveBeenCalled();
  });

  test('EDUCATOR can access own analytics', async () => {
    const token = authHeader('EDUCATOR', 'edu1');
    const res = await request(app)
      .get('/api/statistics/educators/edu1/payment-analytics')
      .set('Authorization', token);
    
    expect(res.status).toBe(200);
    expect(statisticsService.getEducatorPaymentAnalytics).toHaveBeenCalledWith('edu1', expect.anything());
  });
});