import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { timingSafeEqual } from 'node:crypto';

/**
 * Authorizes the internal task surface with `INTERNAL_TASK_SECRET`, never with a session.
 *
 * These routes are called by an EventBridge-scheduled Lambda holding a Secrets
 * Manager value, and are never exposed to the browser — a session guard here would be
 * both wrong (there is no user) and dangerous (it would imply a user could reach them).
 *
 * An unset secret denies everything. Failing open on a missing environment variable is
 * how an internal endpoint becomes a public one during a botched deploy.
 */
@Injectable()
export class InternalTaskGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_TASK_SECRET;
    if (!expected) throw new UnauthorizedException({ error: 'unauthorized' });

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const presented = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

    if (!constantTimeEquals(presented, expected)) {
      throw new UnauthorizedException({ error: 'unauthorized' });
    }

    return true;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // Length is compared first because timingSafeEqual throws on a mismatch; the length of
  // a shared secret is not the part worth protecting.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
