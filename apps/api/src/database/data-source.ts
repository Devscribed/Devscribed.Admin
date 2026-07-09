import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './data-source-options';

/**
 * Standalone DataSource for the TypeORM CLI (migration:run / revert / show).
 * The Nest application configures TypeORM separately via `DatabaseModule`.
 */
export default new DataSource(buildDataSourceOptions());
