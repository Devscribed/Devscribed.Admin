import {
  ArgumentsHost,
  CanActivate,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { clientIp } from '../documents/envelopes.service';

/**
 * 600 requests per minute per source, above which the endpoint answers `429` with an
 * empty body.
 *
 * SignWell's own send rate is far below this, so the limit only ever bites on abuse —
 * which is the point: this is the product's **second unauthenticated route**, and the
 * only thing standing between it and the internet is a hash whose secret is an
 * identifier `GET /api/v1/hooks` will hand to any holder of the API key.
 *
 * The counting shape is `SigningRateLimiter`'s, deliberately: a provider rather than
 * module state, so the window can be reset between tests and so a second application in
 * the same process cannot inherit another one's counters. The key is the source address
 * alone, unlike the signing surface's — there is no per-document token here to mix in,
 * and a delivery names a document we may not even hold.
 */
export const WEBHOOK_RATE_LIMIT = 600;
export const WEBHOOK_RATE_WINDOW_MS = 60_000;

@Injectable()
export class WebhookRateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Returns true when the request is allowed. */
  allow(source: string, now = Date.now()): boolean {
    const window = (this.hits.get(source) ?? []).filter(
      (at) => now - at < WEBHOOK_RATE_WINDOW_MS,
    );

    if (window.length >= WEBHOOK_RATE_LIMIT) {
      this.hits.set(source, window);
      return false;
    }

    window.push(now);
    this.hits.set(source, window);
    return true;
  }

  reset(): void {
    this.hits.clear();
  }
}

@Injectable()
export class WebhookRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: WebhookRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (this.limiter.allow(clientIp(request))) return true;

    // An empty body, like every other refusal on this route: a caller learns nothing at
    // all about what is behind it. A plain `HttpException` would not be empty — Nest's
    // default layer renders it as `{"statusCode":429,"message":""}` — so this takes the
    // same marker-plus-filter route the `401` takes.
    throw new WebhookRateLimited();
  }
}

/**
 * The refusal above, as a type the filter below can catch — the `429` twin of
 * `WebhookHashRejected`, and for the same reason: a JSON envelope is a shape an attacker
 * can compare against the `200 {"received":true}` a verified delivery gets, and every
 * refusal on this route is supposed to say nothing at all.
 */
export class WebhookRateLimited extends HttpException {
  constructor() {
    super('', 429);
  }
}

/** Renders `WebhookRateLimited` as a bare `429`: no body, no headers of our own. */
@Catch(WebhookRateLimited)
export class WebhookRateLimitedFilter implements ExceptionFilter {
  catch(_exception: WebhookRateLimited, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(429).end();
  }
}
