import { DataSourceOptions } from 'typeorm';
import { loadEnv } from '../config/load-env';
import { Account } from '../entities/account.entity';
import { Organization } from '../entities/organization.entity';
import { Membership } from '../entities/membership.entity';
import { InitialSchema1720137600000 } from './migrations/1720137600000-InitialSchema';

/**
 * Build the TypeORM data-source options from environment variables. Used both by
 * the Nest `DatabaseModule` and the TypeORM CLI (`data-source.ts`) so runtime and
 * migrations always target the same schema and connection.
 *
 * The dedicated test database (`DATABASE_NAME_TEST`) is selected when
 * `NODE_ENV=test` or `USE_TEST_DB=true`.
 */
export function buildDataSourceOptions(): DataSourceOptions {
  loadEnv();

  const useTestDb = process.env.NODE_ENV === 'test' || process.env.USE_TEST_DB === 'true';
  const database = useTestDb
    ? (process.env.DATABASE_NAME_TEST ?? 'devscribed_admin_test')
    : (process.env.DATABASE_NAME ?? 'devscribed_admin');

  return {
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USER ?? 'devscribed',
    password: process.env.DATABASE_PASSWORD ?? 'devscribed',
    database,
    entities: [Account, Organization, Membership],
    migrations: [InitialSchema1720137600000],
    synchronize: false,
    logging: process.env.DB_LOGGING === 'true',
  };
}
