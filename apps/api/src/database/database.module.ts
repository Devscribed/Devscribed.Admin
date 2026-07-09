import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDataSourceOptions } from './data-source-options';

/**
 * Wires TypeORM into the Nest application using the same options the CLI uses.
 * Migrations are the source of truth for the schema (`synchronize: false`).
 */
@Module({
  imports: [TypeOrmModule.forRoot(buildDataSourceOptions())],
})
export class DatabaseModule {}
