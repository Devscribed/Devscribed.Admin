import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { resolveCalendarConfig } from './hiring/calendar/calendar.config';
import { resolveStorageConfig } from './hiring/storage/storage.config';

/**
 * Vercel detects this file by name and turns the whole application into one function,
 * so `listen()` stays exactly as it is locally — the platform supplies the port.
 */
async function bootstrap(): Promise<void> {
  // Before anything else, and deliberately before the port is opened: an application
  // that would keep CVs somewhere they will not survive, or create no calendar event at
  // all, must not accept bookings. The module would refuse too, but this reports it as
  // its own sentence rather than as a dependency-injection failure.
  resolveStorageConfig();
  resolveCalendarConfig();

  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  // Production serves the API through the web app's rewrite proxy, so requests arrive
  // same-origin and never reach this. It stays for direct local calls to :4000.
  app.enableCors({
    origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });
  await app.listen(Number(process.env.PORT) || 4000);
}

void bootstrap();
