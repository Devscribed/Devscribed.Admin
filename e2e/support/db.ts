import { config as loadDotenv } from 'dotenv';
import * as path from 'node:path';
import { Client } from 'pg';

let loaded = false;

// Precomputed bcrypt hash of 'Passw0rd' (seeded accounts share this password).
const PASSWORD_HASH = '$2a$10$nXQ.9Za3xl0AmvmABsPAEuDAAh4JYthHhkHEJV1izWvVKlXJ66Sfm';

function ensureEnv(): void {
  if (!loaded) {
    loadDotenv({ path: path.resolve(__dirname, '../../.env') });
    loaded = true;
  }
}

/** Run a statement against the test database, returning any rows. */
export async function dbQuery(sql: string, params: unknown[] = []): Promise<unknown[]> {
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
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await client.end();
  }
}

/** Insert a bare account (no membership) for existing-account accept flows. */
export async function seedAccountOnly(email: string): Promise<void> {
  await dbQuery(
    `INSERT INTO accounts (email, password_hash, first_name, last_name, timezone, security_stamp)
     VALUES ($1, $2, 'Pat', 'Ex', 'UTC', gen_random_uuid())`,
    [email.toLowerCase(), PASSWORD_HASH],
  );
}

/** Insert an account + membership with a specific role (for role-scoped E2E setup). */
export async function seedMember(
  email: string,
  organizationId: string,
  role: string,
  opts: { status?: string; jobTitle?: string | null } = {},
): Promise<void> {
  await dbQuery(
    `WITH acc AS (
       INSERT INTO accounts (email, password_hash, first_name, last_name, timezone, security_stamp)
       VALUES ($1, $2, 'Mem', 'Ber', 'UTC', gen_random_uuid())
       RETURNING id
     )
     INSERT INTO memberships (account_id, organization_id, role, status, joined_at, job_title)
     SELECT id, $3, $4, $5, now(), $6 FROM acc`,
    [
      email.toLowerCase(),
      PASSWORD_HASH,
      organizationId,
      role,
      opts.status ?? 'active',
      opts.jobTitle ?? null,
    ],
  );
}

/** Soft-delete a member (spec 05 behavior, simulated for E2E setup). */
export async function deactivateMember(email: string): Promise<void> {
  await dbQuery(
    `UPDATE memberships SET status = 'removed'
       WHERE account_id = (SELECT id FROM accounts WHERE email = $1)`,
    [email.toLowerCase()],
  );
}

/** Force an invitation to be expired. */
export async function expireInvitation(email: string): Promise<void> {
  await dbQuery(
    `UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE email = $1`,
    [email.toLowerCase()],
  );
}
