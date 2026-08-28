import {
  ArgumentsHost,
  BadRequestException,
  CanActivate,
  Catch,
  ExceptionFilter,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readSignWellNotification, verifySignWellHash } from './signwell-notification';
import type { SignWellNotificationFacts } from './signwell-notification';

export type WebhookRequest = Request & { notification?: SignWellNotificationFacts };

/**
 * The only authorization this route has, and it is used to **reject noise cheaply** —
 * never to authenticate a state change.
 *
 * Requirement 20 is explicit about why, and both halves are load-bearing: the hash covers
 * only `{type}@{time}`, so it says nothing about the payload; and the key is the webhook
 * id, an identifier `GET /api/v1/hooks` hands to any holder of the API key. What makes
 * that acceptable is requirement 21 — nothing in a body is ever written to the database
 * except the fact that a notification arrived — so a forged delivery costs at worst one
 * API call.
 *
 * The refusals are deliberately different from each other and deliberately uninformative:
 *
 *  - a body that is not a notification at all → `400 {"received":false}`;
 *  - a hash that does not verify → `401` with an **empty** body, and nothing recorded
 *    beyond a metric.
 *
 * Neither says anything about which documents we hold.
 */
@Injectable()
export class SignWellWebhookGuard implements CanActivate {
  private readonly log = new Logger(SignWellWebhookGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<WebhookRequest>();

    const facts = readSignWellNotification(request.body);
    if (!facts) throw new BadRequestException({ received: false });

    const verified = verifySignWellHash(
      facts.eventType,
      facts.time,
      facts.hash,
      // An unset secret denies everything. Failing open on a missing environment variable
      // is how a session-less endpoint becomes a public write during a botched deploy.
      process.env.SIGNWELL_WEBHOOK_SECRET,
    );

    if (!verified) {
      // A metric and nothing else — no row, no envelope touched, and no hint to the
      // caller about whether the reference it named was one of ours.
      this.log.warn('A SignWell webhook delivery failed hash verification and was rejected');
      throw new WebhookHashRejected();
    }

    request.notification = facts;
    return true;
  }
}

/**
 * The refusal above, as a type the filter below can catch.
 *
 * It exists because "empty" has to mean empty. Nest's default exception layer renders
 * every `HttpException` as `{"statusCode":…,"message":…}`, so throwing one here would put
 * a JSON envelope on the wire — small, but it is still a shape an attacker can compare
 * against the `200 {"received":true}` a verified delivery gets, and the whole point of
 * this route's refusals is that they say nothing.
 */
export class WebhookHashRejected extends HttpException {
  constructor() {
    super('', 401);
  }
}

/** Renders `WebhookHashRejected` as a bare `401`: no body, no headers of our own. */
@Catch(WebhookHashRejected)
export class WebhookHashRejectedFilter implements ExceptionFilter {
  catch(_exception: WebhookHashRejected, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(401).end();
  }
}
