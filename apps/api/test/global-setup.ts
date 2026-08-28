import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import {
  BASE_TEST_DATABASE_URL,
  adminUrl,
  databaseName,
  databaseUrlForWorker,
} from './database-url';

/**
 * Brings every database the run will use up to the current schema before the suite starts.
 *
 * Worker 1 uses `devscribed_test` and gets `prisma migrate deploy` — the same
 * production-safe command as `db:migrate`, applying prisma/migrations without dropping
 * data, so the tests exercise the very SQL production will receive.
 *
 * Workers 2..N get their own copy. Each spec file truncates the tables it touches in its
 * own `beforeEach`, so what a worker needs from its database is the schema and nothing
 * else — which `CREATE DATABASE ... TEMPLATE` hands over in about a second, against the
 * several that `migrate deploy` costs per database. They are dropped and recreated each
 * run rather than migrated, because a copy is cheaper than catching one up and leaves no
 * way for a stale worker database to drift out of step with the migrations.
 */
export default async function globalSetup(globalConfig: { maxWorkers?: number }): Promise<void> {
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_URL: BASE_TEST_DATABASE_URL,
      // Nothing pools in front of a local Postgres, so migrations use the same URL.
      DIRECT_URL: BASE_TEST_DATABASE_URL,
    },
    stdio: 'inherit',
  });

  const workers = Math.max(1, globalConfig.maxWorkers ?? 1);
  if (workers === 1) return;

  const template = databaseName(BASE_TEST_DATABASE_URL);
  const stamp = migrationsFingerprint();

  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  try {
    for (let id = 2; id <= workers; id++) {
      const name = databaseName(databaseUrlForWorker(id));

      /* A copy costs about twelve seconds, and the only thing that invalidates one is a
         change to the migrations. The fingerprint rides in the database comment, so a repeat
         run with an unchanged schema reuses what is already there and pays nothing. */
      const { rows } = await admin.query<{ comment: string | null }>(
        'SELECT shobj_description(oid, \'pg_database\') AS comment FROM pg_database WHERE datname = $1',
        [name],
      );
      if (rows[0]?.comment === stamp) continue;

      /* Identifiers cannot be parameterised, and these are built from a name this file
         derived itself rather than from anything a test supplied. */
      await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
      await admin.query(`COMMENT ON DATABASE "${name}" IS '${stamp}'`);
    }
  } finally {
    await admin.end();
  }
}

/** Hash of every migration file, so a schema change invalidates the worker copies. */
function migrationsFingerprint(): string {
  const dir = join(__dirname, '..', 'prisma', 'migrations');
  const hash = createHash('sha256');
  for (const entry of readdirSync(dir).sort()) {
    const sql = join(dir, entry, 'migration.sql');
    try {
      hash.update(entry).update(readFileSync(sql));
    } catch {
      hash.update(entry); // migration_lock.toml and anything else without a body
    }
  }
  return `schema:${hash.digest('hex').slice(0, 16)}`;
}
