import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { SignWellWebhookController } from './signwell-webhook.controller';
import { SignWellWebhookGuard, WebhookHashRejectedFilter } from './signwell-webhook.guard';
import {
  WebhookRateLimitGuard,
  WebhookRateLimitedFilter,
  WebhookRateLimiter,
} from './webhook-rate-limit.guard';

/**
 * Its own module, for the same reason `SigningModule` and `InternalModule` are: a
 * different authorization model.
 *
 * Nothing here reads a cookie, and the guard that protects it must **never** be applied to
 * an org-scoped route — a guard that says "the body carries a hash we recognize" is not a
 * guard that says "this caller may see this organization's documents". Keeping the two
 * apart structurally is what stops one from being reached for by accident.
 *
 * `DocumentsModule` is imported so the reconciler is instantiated and has registered its
 * queue handler by the time a delivery can arrive; nothing here calls it directly.
 */
@Module({
  imports: [DocumentsModule],
  controllers: [SignWellWebhookController],
  providers: [
    WebhookRateLimiter,
    WebhookRateLimitGuard,
    SignWellWebhookGuard,
    WebhookHashRejectedFilter,
    WebhookRateLimitedFilter,
  ],
  exports: [WebhookRateLimiter],
})
export class WebhooksModule {}
