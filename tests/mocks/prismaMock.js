// Mock implementation for Prisma client
const prismaMock = {
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
  $transaction: jest.fn(callback => callback(prismaMock)),
  sql: jest.fn(template => template),
};

module.exports = prismaMock;