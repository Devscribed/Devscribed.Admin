import type { RequestEventAction } from './request-events.service';

/**
 * Requests spec 03 — the notification port.
 *
 * Declared as an abstract class and used as its own DI token, the shape `MailService`
 * already uses in this codebase (`apps/api/src/mail/mail.service.ts`). The adapter is
 * chosen in the sibling `request-notifier.provider.ts`, next to the adapters it chooses
 * between, and registered globally in `core.module.ts`.
 */

/** One outbox row, as the adapter sees it. No recipient address is carried or stored. */
export interface RequestNotificationDelivery {
  id: string;
  organizationId: string;
  requestId: string;
  /** The event that caused the row. */
  eventId: string;
  action: RequestEventAction;
  recipientKind: 'member' | 'client';
  /** The membership or client-membership id. An adapter resolves an address from it. */
  recipientId: string;
  /** Already incremented for this attempt when the adapter is called. */
  attempts: number;
}

export interface DeliveryOutcome {
  status: 'delivered' | 'skipped' | 'failed';
  /** `none` from the shipped adapter; an email adapter writes its own value. */
  channel: string;
  /** Which adapter handled the row. */
  providerKey?: string | null;
  /** The provider's own id for the message it sent. */
  providerRef?: string | null;
  /** The failure text, never the recipient's address. */
  error?: string | null;
}

export abstract class RequestNotifier {
  abstract deliver(notification: RequestNotificationDelivery): Promise<DeliveryOutcome>;
}
