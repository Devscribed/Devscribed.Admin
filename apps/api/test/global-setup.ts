import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

/** A throwaway SQLite file per test run — every suite starts from an empty schema. */
export default function globalSetup(): void {
  const dbPath = join(__dirname, '..', 'prisma', 'test.db');
  for (const file of [dbPath, `${dbPath}-journal`]) {
    if (existsSync(file)) unlinkSync(file);
  }

  // No --force-reset: the file above is already gone, so this only creates the schema.
  execSync('npx prisma db push --skip-generate', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'inherit',
  });
}
