/**
 * Jest runs globalSetup in its own process, separate from the one that loads
 * setupFiles, so both need the same answer to "which database do the tests use".
 * `TEST_DATABASE_URL` is the override CI reaches for; the default is the
 * devscribed_test database from the repo-root docker-compose.yml.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://devscribed:devscribed@localhost:5433/devscribed_test';
