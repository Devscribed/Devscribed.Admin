import { config as loadDotenv } from 'dotenv';
import * as path from 'node:path';
import { Client } from 'pg';

let loaded = false;

function ensureEnv(): void {
  if (!loaded) {
    loadDotenv({ path: path.resolve(__dirname, '../../.env') });
    loaded = true;
  }
}

/** Run a statement against the test database (for E2E setup not covered by the UI/API). */
export async function dbQuery(sql: string, params: unknown[] = []): Promise<void> {
  ensureEnv();
  const client = new Client({
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5433),
    user: process.env.DATABASE_USER ?? 'devscribed',
    password: process.env.DATABASE_PASSWORD ?? 'devscribed',
    database: process.env.DATABASE_NAME_TEST ?? 'devscribed_admin_test',
  });
  await client.connect();
  try {
    await client.query(sql, params);
  } finally {
    await client.end();
  }
}

/** Soft-delete a member (spec 05 behavior, simulated for spec-02 E2E setup). */
export async function deactivateMember(email: string): Promise<void> {
  await dbQuery(
    `UPDATE memberships SET status = 'removed'
       WHERE account_id = (SELECT id FROM accounts WHERE email = $1)`,
    [email.toLowerCase()],
  );
}
