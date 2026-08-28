/**
 * Jest runs globalSetup in its own process, separate from the one that loads
 * setupFiles, so both need the same answer to "which database do the tests use".
 * `TEST_DATABASE_URL` is the override CI reaches for; the default is the
 * devscribed_test database from the repo-root docker-compose.yml.
 *
 * The suite used to run `--runInBand` because every spec truncates the tables it touches
 * in its own `beforeEach`, and two workers sharing one database truncate each other's rows
 * mid-test. Measured, that is exactly what happens: four workers against one database
 * finish in 64s instead of 140s and fail 204 of 323 tests.
 *
 * So each worker gets its own database instead. Worker 1 keeps the plain name, so a
 * single-worker run — CI's sharded jobs, or `--runInBand` when debugging — behaves exactly
 * as before and needs no extra databases created.
 */
export const BASE_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://devscribed:devscribed@localhost:5433/devscribed_test';

/** `devscribed_test` for worker 1, `devscribed_test_w2` for worker 2, and so on. */
export function databaseUrlForWorker(workerId: number, base = BASE_TEST_DATABASE_URL): string {
  if (workerId <= 1) return base;
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_w${workerId}`;
  return url.toString();
}

/** The database name inside a connection string, without the leading slash. */
export function databaseName(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

/** The same server with the maintenance database, for CREATE/DROP DATABASE. */
export function adminUrl(base = BASE_TEST_DATABASE_URL): string {
  const url = new URL(base);
  url.pathname = '/postgres';
  return url.toString();
}

export const TEST_DATABASE_URL = databaseUrlForWorker(
  Number(process.env.JEST_WORKER_ID ?? 1),
);
