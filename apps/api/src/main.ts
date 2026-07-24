import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/**
 * Vercel detects this file by name and turns the whole application into one function,
 * so `listen()` stays exactly as it is locally — the platform supplies the port.
 */
async function bootstrap(): Promise<void> {
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
