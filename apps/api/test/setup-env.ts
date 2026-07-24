import { TEST_DATABASE_URL } from './database-url';

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.DIRECT_URL = TEST_DATABASE_URL;
