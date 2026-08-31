import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where a local E2E run lives: which ports it holds, and which database it writes to.
 *
 * One module rather than three constants, because the Playwright config, the global setup
 * and the tests' own API client all have to agree, and they run in different processes.
 *
 * **Both halves exist so that a run can happen beside a working dev environment.** Before
 * them the suite could only run on 3000/4000 — the ports `npm run dev` holds — and against
 * whatever database `apps/api/.env` names, which is the one a developer is looking at. So
 * the honest options were to stop working or to skip the suite, and the suite is what got
 * skipped.
 *
 * Defaults are unchanged: 3000, 4000, and now `devscribed_e2e`. Nobody has to learn any of
 * this to run `npm run test:e2e`.
 */

/** The web app's port. `E2E_WEB_PORT=3100` moves it, and everything below follows. */
export const WEB_PORT = Number(process.env.E2E_WEB_PORT) || 3000;

/** The API's port. Read by the API through `PORT`, and by the tests through `API_ORIGIN`. */
export const API_PORT = Number(process.env.E2E_API_PORT) || 4000;

/**
 * The address the suite points at.
 *
 * `E2E_BASE_URL` wins and starts nothing: that is the mode that runs these same tests
 * against a deployment, where there is one address and `/api/*` goes through the web app's
 * rewrite.
 */
export const REMOTE = process.env.E2E_BASE_URL;
export const WEB_ORIGIN = REMOTE ?? `http://localhost:${WEB_PORT}`;

/**
 * Where the tests' own API calls go — the preconditions, not the thing under test.
 *
 * Locally that is the API directly. Against a deployment it is the web address, because
 * the API has no public one.
 */
export const API_ORIGIN =
  process.env.E2E_API_URL ?? REMOTE ?? `http://localhost:${API_PORT}`;

/**
 * The database a local run writes to.
 *
 * **Not `devscribed_dev`.** The suite creates organizations, envelopes and accounts in
 * every case and cleans up none of them, and for as long as this was unset it did all of
 * that in the database the developer was working in — silently, because nothing about a
 * green run says which server it talked to.
 *
 * The port is learned from `apps/api/.env` for the reason `apps/api/test/database-url.ts`
 * learns it there: a developer with a native Postgres on 5433 has to remap the container,
 * `.env` is untracked and machine-local, and CI has no `.env` and is unaffected.
 *
 * `prisma migrate deploy` creates the database when it is missing, so no compose change and
 * no `docker compose down -v` is needed on a machine that already has its data volume.
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? databaseFromDotEnv() ?? FALLBACK_DATABASE_URL();

function FALLBACK_DATABASE_URL(): string {
  return 'postgresql://devscribed:devscribed@localhost:5433/devscribed_e2e';
}

function databaseFromDotEnv(): string | null {
  try {
    const envPath = join(__dirname, '..', 'apps', 'api', '.env');
    if (!existsSync(envPath)) return null;
    const line = readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('DATABASE_URL='));
    if (!line) return null;
    const url = new URL(line.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, ''));
    url.pathname = '/devscribed_e2e';
    return url.toString();
  } catch {
    return null;
  }
}
