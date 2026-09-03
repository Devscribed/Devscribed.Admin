import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { SigningRateLimitGuard, SigningRateLimiter } from './signing-rate-limit.guard';
import { SigningController } from './signing.controller';
import { SigningService } from './signing.service';

/**
 * Its own module rather than a controller inside `DocumentsModule`, because the two have
 * opposite authorization models and putting them together is how a guard ends up applied
 * to the wrong half. Nothing here is session-aware, and nothing here may become so.
 *
 * `DocumentsModule` is imported for `EnvelopeEventsService` — the hash chain has exactly
 * one writer, and the signing surface uses that one rather than a copy.
 */
@Module({
  imports: [DocumentsModule],
  controllers: [SigningController],
  providers: [SigningService, SigningRateLimiter, SigningRateLimitGuard],
  exports: [SigningRateLimiter],
})
export class SigningModule {}
