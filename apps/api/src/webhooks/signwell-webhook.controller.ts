import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { JobQueue } from '../queue/job-queue';
import { SigningProviderRegistry } from '../signature/provider-registry';
import { PayloadNotRedactableError, redactProviderPayload } from './redact-payload';
import { SignWellWebhookGuard, WebhookHashRejectedFilter } from './signwell-webhook.guard';
import type { WebhookRequest } from './signwell-webhook.guard';
import { WebhookRateLimitGuard, WebhookRateLimitedFilter } from './webhook-rate-limit.guard';

/**
 * The provider key this route belongs to. Named here, in the file whose *path* already
 * names it, rather than compared against anywhere else: everything downstream branches on
 * `capabilities` and never on a key (TC-04-UNIT-05).
 */
const PROVIDER_KEY = 'signwell';

/** The one body this route ever returns for a verified request. */
const RECEIVED = { received: true } as const;

/**
 * The product's **second unauthenticated route**.
 *
 * No session, no cookies, no CSRF. What it does on the request path is deliberately
 * minimal, and the order is the contract:
 *
 *  1. the rate limiter and the hash guard refuse noise before anything is read;
 *  2. the body is **redacted before the first write**, and a payload that fails to redact
 *     is not stored at all (requirement 35);
 *  3. one `ProviderWebhookEvent` row is written, deduplicated on the composite key, **on
 *     the request path** — so "exactly one row" and "no row" are deterministic facts a
 *     test can assert immediately after the POST rather than a race with a queue;
 *  4. the reference lookup and the convergence are deferred to the job queue, because
 *     resolving which envelope a `providerRef` names is the only part of handling a
 *     delivery that could leak which documents we hold (requirement 25);
 *  5. `200 {"received":true}` — **byte-identical** whether the document is ours, another
 *     account's, or unknown, with no timing branch between them, because the branch that
 *     would distinguish them has not happened yet.
 */
@Controller('api/webhooks')
@UseFilters(WebhookHashRejectedFilter, WebhookRateLimitedFilter)
@UseGuards(WebhookRateLimitGuard)
export class SignWellWebhookController {
  private readonly log = new Logger(SignWellWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: SigningProviderRegistry,
    private readonly queue: JobQueue,
  ) {}

  @Post(PROVIDER_KEY)
  @HttpCode(200)
  @UseGuards(SignWellWebhookGuard)
  async receive(@Req() request: WebhookRequest, @Body() body: unknown) {
    const facts = request.notification!;

    let payload: unknown;
    try {
      payload = redactProviderPayload(body);
    } catch (error) {
      // Requirement 35 — a payload that fails to redact is not stored at all. The
      // notification is still acknowledged: the delivery is not the provider's fault, and
      // convergence will read the state from the API on the next read or sweep regardless.
      if (error instanceof PayloadNotRedactableError) {
        this.log.error(`Refusing to store a ${PROVIDER_KEY} delivery: ${error.message}`);
        return RECEIVED;
      }
      throw error;
    }

    // Edge case 16 — the key was removed while SignWell envelopes were in flight, so the
    // adapter is unregistered and no reconcile job can run for this delivery. Read once,
    // because the row below has to say so and the enqueue below has to skip.
    const configured = this.providers.isConfigured(PROVIDER_KEY);

    let created = false;
    let id: string | null = null;
    try {
      const row = await this.prisma.providerWebhookEvent.create({
        data: {
          providerKey: PROVIDER_KEY,
          providerRef: facts.providerRef,
          eventType: facts.eventType,
          eventTime: facts.eventTime,
          relatedSignerEmail: facts.relatedSignerEmail,
          hashVerified: true,
          payload: payload as Prisma.InputJsonValue,
          // A delivery nobody will process is closed here rather than left claiming
          // nothing: `processedAt` stays null, which is true — the reconciler never ran —
          // and `outcome` says why. Correctness is untouched either way, because
          // requirement 24 converges on the next read or sweep regardless.
          outcome: configured ? null : 'error',
          // Deliberately null: the lookup that would fill it in happens off the request
          // thread. A row whose `envelopeId` is still null has not been processed yet, not
          // "belongs to nobody" — `outcome` is what says which.
          envelopeId: null,
        },
        select: { id: true },
      });
      created = true;
      id = row.id;
    } catch (error) {
      // SignWell issues no event id, so the composite `(providerKey, providerRef,
      // eventType, eventTime, relatedSignerEmail)` is the best key available. A duplicate
      // is not an error: convergence is state-based, so the second delivery would have
      // re-read exactly the same state.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.log.debug(`Duplicate ${PROVIDER_KEY} delivery ignored`);
      } else {
        throw error;
      }
    }

    if (created && !configured) {
      this.log.warn(
        `A verified ${PROVIDER_KEY} delivery arrived while the adapter is unconfigured; ` +
          'it is recorded but not converged',
      );
    }

    if (created && configured) {
      // After the row and before the response is composed, but never awaited into it: the
      // job resolves the reference and converges, and neither can change what this route
      // answers.
      await this.queue.enqueue({
        name: 'provider-reconcile',
        // The FIFO group key. We do not know the envelope yet, so the document id groups
        // deliveries for one document — which is exactly the ordering that matters.
        envelopeId: facts.providerRef,
        payload: {
          providerKey: PROVIDER_KEY,
          providerRef: facts.providerRef,
          webhookEventId: id ?? undefined,
        },
      });
    }

    return RECEIVED;
  }
}
