import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';

/**
 * One long-running process, locally and in every deployed environment: the container image
 * runs `node dist/main.js` and `PORT` comes from the task definition. Nothing here is
 * platform-specific, which is why the same entry point serves `nest start --watch` in
 * development and Fargate in production.
 */
async function bootstrap(): Promise<void> {
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
