import { execSync } from 'node:child_process';
import * as path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { Client } from 'pg';

const ROOT = path.resolve(__dirname, '..');

/**
 * Prepare the test database before the E2E run: apply migrations (idempotent)
 * and truncate all tables so each run starts from a clean slate. The API and web
 * servers are started separately by Playwright's `webServer` config, pointed at
 * this same test database via `USE_TEST_DB=true`.
 */
export default async function globalSetup(): Promise<void> {
  loadDotenv({ path: path.join(ROOT, '.env') });

  execSync('npm run migration:run --workspace apps/api', {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, USE_TEST_DB: 'true' },
  });

  const client = new Client({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5433),
    user: process.env.DATABASE_USER ?? 'devscribed',
    password: process.env.DATABASE_PASSWORD ?? 'devscribed',
    database: process.env.DATABASE_NAME_TEST ?? 'devscribed_admin_test',
  });
  await client.connect();
  await client.query(
    'TRUNCATE TABLE "memberships", "organizations", "accounts" RESTART IDENTITY CASCADE',
  );
  await client.end();
}
