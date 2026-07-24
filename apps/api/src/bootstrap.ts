import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/**
 * The one place the application is configured, shared by the two ways it gets started:
 * `main.ts` binds it to a port for local dev and Playwright, while `api/index.js` hands
 * the same instance to Vercel's function runtime. Splitting it out is what keeps a
 * middleware added for local development from silently missing in production.
 *
 * Note that `init()` is deliberately not called here — `listen()` does it implicitly,
 * and the serverless entry point needs to call it explicitly.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  // Production serves the API through the web app's rewrite proxy, so requests arrive
  // same-origin and never reach this. It stays for direct local calls to :4000.
  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });
  return app;
}
