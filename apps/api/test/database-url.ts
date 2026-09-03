import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
/**
 * Where the test database lives, in order of authority.
 *
 * `TEST_DATABASE_URL` first — CI sets it, and it is the documented override.
 *
 * Then the port `apps/api/.env` is already using, with the database name swapped to
 * `devscribed_test`. The hard-coded 5433 below is the port docker-compose publishes, but a
 * developer with a native Postgres already on 5433 has to remap the container, and then two
 * servers answer that port: connections land on whichever wins, and every client fails with
 * "password authentication failed for user devscribed" — intermittently, which is worse than
 * failing outright. `.env` is untracked and machine-local, which is exactly what makes it the
 * right place to learn the port from; CI has no `.env` and is unaffected.
 */
function baseFromDotEnv(): string | null {
  try {
    const envPath = join(__dirname, '..', '.env');
    if (!existsSync(envPath)) return null;
    const line = readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('DATABASE_URL='));
    if (!line) return null;
    const url = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));
    url.pathname = '/devscribed_test';
    return url.toString();
  } catch {
    return null;
  }
}

export const BASE_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  baseFromDotEnv() ??
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
