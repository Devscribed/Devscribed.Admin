import { execSync } from 'child_process';
import { join } from 'path';
import { TEST_DATABASE_URL } from './database-url';

/**
 * Applies any pending migrations before the suite runs — every spec file already
 * truncates the tables it touches in its own `beforeEach`, so the database itself is
 * reusable across runs and only the schema needs to stay current.
 *
 * `migrate deploy` (the same production-safe command as `db:migrate`) applies
 * prisma/migrations without dropping data, so the tests exercise the very SQL
 * production will receive without requiring a destructive reset on every run. The
 * suites run with --runInBand, so nothing else is touching this database meanwhile.
 */
export default function globalSetup(): void {
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_URL: TEST_DATABASE_URL,
      // Nothing pools in front of a local Postgres, so migrations use the same URL.
      DIRECT_URL: TEST_DATABASE_URL,
    },
    stdio: 'inherit',
  });
}
