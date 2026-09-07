import { Injectable } from '@nestjs/common';
import type { DeliveryOutcome, RequestNotificationDelivery } from './request-notifier';
import { RequestNotifier } from './request-notifier';

/**
 * Requests spec 03 REQ-03-038 — the adapter that ships, and it delivers nothing.
 *
 * Every row is marked `skipped` with a channel of `none` and no provider key, and no
 * outbound call of any kind is made: no mail, no HTTP, no queue. The outbox, the
 * recipient decisions and the post-commit dispatch are all exercised by it; only the
 * channel is absent, and adding one writes no migration and changes no rule.
 */
@Injectable()
export class NullRequestNotifier extends RequestNotifier {
  async deliver(_notification: RequestNotificationDelivery): Promise<DeliveryOutcome> {
    return { status: 'skipped', channel: 'none', providerKey: null, providerRef: null };
  }
}
