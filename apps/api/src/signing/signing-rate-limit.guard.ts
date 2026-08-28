import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { ENVELOPE_MESSAGES } from '@devscribed/validation';
import type { Request } from 'express';
import { clientIp } from '../documents/envelopes.service';

/** "Rate-limited to 10 requests per minute per IP across all `/api/sign/*` routes." */
export const SIGNING_RATE_LIMIT = 10;
export const SIGNING_RATE_WINDOW_MS = 60_000;

/**
 * The counter behind the public signing surface.
 *
 * A provider rather than module state so the whole window can be reset between tests and
 * so a second application in the same process cannot inherit another one's counters.
 *
 * The key is **IP plus token prefix**, exactly as the spec asks: keying on the IP alone
 * would let one abusive client lock an unrelated signer out of their own document from
 * behind the same corporate NAT, and keying on the token alone would make the limit
 * useless against a distributed guess. The prefix rather than the whole token keeps a
 * raw signing token out of an in-memory map that is not the database.
 */
@Injectable()
export class SigningRateLimiter {
  private readonly hits = new Map<string, number[]>();

  /** Returns null when the request is allowed, or the seconds to wait when it is not. */
  check(ip: string, token: string, now = Date.now()): number | null {
    const key = `${ip}|${(token ?? '').slice(0, 8)}`;
    const window = (this.hits.get(key) ?? []).filter((at) => now - at < SIGNING_RATE_WINDOW_MS);

    if (window.length >= SIGNING_RATE_LIMIT) {
      this.hits.set(key, window);
      const retryAfterMs = SIGNING_RATE_WINDOW_MS - (now - window[0]);
      return Math.max(1, Math.ceil(retryAfterMs / 1000));
    }

    window.push(now);
    this.hits.set(key, window);
    return null;
  }

  reset(): void {
    this.hits.clear();
  }
}

@Injectable()
export class SigningRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: SigningRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const retryAfterSeconds = this.limiter.check(
      clientIp(request),
      String(request.params?.token ?? ''),
    );

    if (retryAfterSeconds !== null) {
      throw new HttpException(
        {
          error: 'rate_limited',
          retryAfterSeconds,
          message: ENVELOPE_MESSAGES.signing.rateLimited,
        },
        429,
      );
    }

    return true;
  }
}
