import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/data-source-options';

/**
 * One-time setup for the integration suite: ensure the test database schema is
 * up to date by running migrations before any test executes.
 */
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  process.env.USE_TEST_DB = 'true';

  const dataSource = new DataSource(buildDataSourceOptions());
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
