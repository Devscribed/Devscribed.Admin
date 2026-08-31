import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { E2E_DATABASE_URL, REMOTE } from './environment';

/**
 * Brings the E2E database up to the current schema before anything starts.
 *
 * `prisma migrate deploy` — the production-safe command, applying `prisma/migrations`
 * without dropping data, so the suite exercises the SQL production will receive. It also
 * creates the database when it does not exist, which is what lets `devscribed_e2e` appear
 * on a machine whose Postgres volume was initialised before this file was written.
 *
 * Nothing is truncated here. Every case mints its own account, and signup creates a fresh
 * organization with it, so cases cannot see each other's rows; what accumulates is a run's
 * leftovers in a database nobody looks at. Wipe it with `docker exec … dropdb`, or set
 * `E2E_DATABASE_URL` at something else.
 */
export default function globalSetup(): void {
  // A run against a deployment owns neither the schema nor the database.
  //
  // The busy-port guard is **not** here: Playwright checks `webServer.port` before it calls
  // globalSetup, so a conflict aborts the run before this file is reached. It lives at
  // config load instead — see `environment.ts`.
  if (REMOTE) return;

  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..', 'apps', 'api'),
    env: {
      ...process.env,
      DATABASE_URL: E2E_DATABASE_URL,
      // Nothing pools in front of a local Postgres, so migrations use the same URL.
      DIRECT_URL: E2E_DATABASE_URL,
    },
    stdio: 'inherit',
  });
}
