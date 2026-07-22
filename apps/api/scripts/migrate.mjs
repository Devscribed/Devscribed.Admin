/**
 * Applies the SQL files in prisma/migrations to whatever DATABASE_URL points at —
 * a local file: database or a remote Turso one.
 *
 * It runs on @libsql/client rather than the Turso CLI so the Render build machine
 * needs no extra tooling, and so the same command behaves identically locally.
 *
 * Idempotent: every applied file is recorded in _migrations and skipped next time,
 * which is what makes it safe to hang off a build command that reruns on every deploy.
 */
import { createClient } from '@libsql/client';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const prismaDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'prisma');
const migrationsDir = join(prismaDir, 'migrations');

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

// Mirrors resolveDatabaseUrl in src/prisma.service.ts: a relative sqlite path means
// "relative to prisma/", the way the Prisma CLI reads it — not relative to the cwd.
const filePath = raw.startsWith('file:') ? raw.slice('file:'.length) : null;
const url =
  filePath && !isAbsolute(filePath) ? `file:${join(prismaDir, filePath)}` : raw;

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

try {
  await client.execute(
    'CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, appliedAt TEXT NOT NULL)',
  );

  const applied = new Set(
    (await client.execute('SELECT name FROM _migrations')).rows.map((row) => row.name),
  );

  // Lexical order is the apply order, which is why the files carry numeric prefixes.
  const pending = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .filter((file) => !applied.has(file));

  if (pending.length === 0) {
    console.log('Migrations: nothing to apply');
  }

  for (const file of pending) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    // Statement-per-call: libSQL's batch is transactional, which SQLite DDL is happy with.
    const statements = sql
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    await client.batch(
      [...statements, {
        sql: 'INSERT INTO _migrations (name, appliedAt) VALUES (?, ?)',
        args: [file, new Date().toISOString()],
      }],
      'write',
    );
    console.log(`Migrations: applied ${file}`);
  }
} finally {
  client.close();
}
