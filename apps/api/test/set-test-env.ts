// Runs before any test module is imported, so DatabaseModule resolves its
// connection options against the dedicated test database.
process.env.NODE_ENV = 'test';
process.env.USE_TEST_DB = 'true';
