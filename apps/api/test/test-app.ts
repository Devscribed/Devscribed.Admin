import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
}

/** Boot a fully-configured Nest app wired to the test database. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, dataSource: app.get(DataSource) };
}

/** Remove all rows between tests for isolation. */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE "memberships", "organizations", "accounts" RESTART IDENTITY CASCADE',
  );
}
