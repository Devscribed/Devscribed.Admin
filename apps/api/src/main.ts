import 'reflect-metadata';
/**
 * First, and before `./app.module` is evaluated — that module reads `process.env` at
 * module scope to choose its mail transport, storage and calendar.
 *
 * The Nest CLI does not read `.env`; only the Prisma CLI in `predev` did, which left
 * the dev server itself without a `DATABASE_URL` and falling back to `pg`'s default
 * port. It worked only when the shell already carried the variables, which is why
 * `npm run test:e2e` could not start its own API from a cold shell. A deployment has
 * no `.env` file and dotenv never overwrites a variable that is already set, so this
 * changes nothing in production.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';
import { resolveCalendarConfig } from './hiring/calendar/calendar.config';
import { resolveStorageConfig } from './hiring/storage/storage.config';

/**
 * One long-running process, locally and in every deployed environment: the container image
 * runs `node dist/main.js` and `PORT` comes from the task definition. Nothing here is
 * platform-specific, which is why the same entry point serves `nest start --watch` in
 * development and Fargate in production.
 */
async function bootstrap(): Promise<void> {
  // Before anything else, and deliberately before the port is opened: a storage or
  // calendar variable naming something this build cannot provide must stop the process
  // here. The module would refuse too, but this reports it as its own sentence rather
  // than as a dependency-injection failure.
  resolveStorageConfig();
  resolveCalendarConfig();

  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  // Express defaults to a 100 KB JSON body, which is a quarter of what a template body
  // is allowed to be. Without this the framework answers 413 long before the spec's own
  // `body_too_large` rule can answer 400 — the limit sits just above 1 MB so oversized
  // bodies still reach the rule that is supposed to reject them.
  app.use(json({ limit: '2mb' }));
  // Production serves the API through the web app's rewrite proxy, so requests arrive
  // same-origin and never reach this. It stays for direct local calls to :4000.
  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });
  await app.listen(Number(process.env.PORT) || 4000);
}

void bootstrap();
