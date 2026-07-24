import { execSync } from 'child_process';
import { join } from 'path';
import { TEST_DATABASE_URL } from './database-url';

/**
 * A schema reset per test run — every suite starts from an empty database.
 *
 * `migrate reset` drops and re-applies prisma/migrations rather than pushing the
 * datamodel, so the tests exercise the very SQL production will receive. The suites run
 * with --runInBand, so nothing else is touching this database meanwhile.
 */
export default function globalSetup(): void {
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
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
