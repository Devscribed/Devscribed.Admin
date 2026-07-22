process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_URL = `file:${require('path').join(__dirname, '..', 'prisma', 'test.db')}`;
