import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { RequestEventAction } from './request-events.service';
import { RequestNotifier } from './request-notifier';

/** Who an event is delivered to: a membership or a client membership, by id. */
export interface NotificationRecipient {
  kind: 'member' | 'client';
  id: string;
}

/** The parties of a request, as the transaction that wrote the event leaves them. */
export interface RequestParties {
  requesterMembershipId: string;
  assigneeKind: string;
  assigneeMembershipId: string | null;
  assigneeClientMembershipId: string | null;
}

/**
 * The four actions that notify somebody (REQ-03-035). `field_changed` is not among them
 * and notifies nobody.
 */
const NOTIFIABLE_ACTIONS: readonly RequestEventAction[] = [
  'created',
  'status_changed',
  'assignee_changed',
  'message_posted',
];

/**
 * How many times one row may be attempted. `deliver` is NOT assumed idempotent, so
 * `attempts` is incremented before each attempt and a row past this bound is left where
 * it is rather than tried again.
 */
const MAX_DELIVERY_ATTEMPTS = 3;

/**
 * Requests spec 03 — the outbox and its dispatcher.
 *
 * Two halves, deliberately apart. `record` writes one row per recipient inside the
 * transaction that wrote the `RequestEvent`, so a notifiable event without its rows is
 * not a state the system can produce (REQ-03-035). `dispatch` runs only after that
 * transaction has committed and is never awaited by the route (REQ-03-037): a slow or
 * hanging provider must never hold a row lock on a request, and a notifier that throws
 * leaves the request, its status and its events exactly as committed (REQ-03-040).
 *
 * No read path — the list, the detail screen, the badge — consults this table
 * (REQ-03-041).
 */
@Injectable()
export class RequestNotificationsService {
  private readonly logger = new Logger(RequestNotificationsService.name);

  /** Drains in flight. Awaited by a graceful shutdown and by a case that must see the
   * rows the route did not wait for. */
  private readonly inflight = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: RequestNotifier,
  ) {}

  /**
   * REQ-03-036 — the recipients of an event are the request's requester and its
   * addressee as the transaction leaves them, other than the principal who caused it,
   * and nobody else. A holder of `view-all-requests` who is neither receives nothing,
   * and a reassignment therefore notifies the incoming addressee and not the outgoing
   * one, because the row read here is the one the transaction wrote.
   */
  recipientsFor(parties: RequestParties, actor: NotificationRecipient): NotificationRecipient[] {
    const candidates: NotificationRecipient[] = [
      { kind: 'member', id: parties.requesterMembershipId },
    ];
    if (parties.assigneeKind === 'client') {
      if (parties.assigneeClientMembershipId) {
        candidates.push({ kind: 'client', id: parties.assigneeClientMembershipId });
      }
    } else if (parties.assigneeMembershipId) {
      candidates.push({ kind: 'member', id: parties.assigneeMembershipId });
    }

    const seen = new Set<string>();
    return candidates.filter((recipient) => {
      if (recipient.kind === actor.kind && recipient.id === actor.id) return false;
      const key = `${recipient.kind}:${recipient.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Writes the outbox rows for one event, in the caller's transaction. Returns the ids
   * to be dispatched once that transaction has committed — the caller holds them until
   * then, which is what keeps every outbound call outside the transaction.
   *
   * A second call for the same event and recipient is rejected by
   * `@@unique([eventId, recipientKind, recipientId])` rather than by a check-then-write
   * (REQ-03-039), so a replayed event can never manufacture a second row.
   */
  async record(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      requestId: string;
      eventId: string;
      action: RequestEventAction;
      recipients: NotificationRecipient[];
    },
  ): Promise<string[]> {
    if (!NOTIFIABLE_ACTIONS.includes(input.action)) return [];

    const ids: string[] = [];
    for (const recipient of input.recipients) {
      const row = await tx.requestNotification.create({
        data: {
          organizationId: input.organizationId,
          requestId: input.requestId,
          eventId: input.eventId,
          recipientKind: recipient.kind,
          recipientId: recipient.id,
        },
        select: { id: true },
      });
      ids.push(row.id);
    }
    return ids;
  }

  /**
   * REQ-03-037 — scheduled after the commit and deliberately not awaited. The route has
   * already answered by the time the adapter is called, so a provider that never returns
   * holds nothing.
   */
  dispatch(ids: string[]): void {
    if (ids.length === 0) return;
    const run = this.drain(ids)
      .catch((error) => {
        // A dispatcher failure changes nothing about the request (REQ-03-040); the rows
        // it could not write are left where they are.
        this.logger.error('Notification dispatch failed', error as Error);
      })
      .finally(() => {
        this.inflight.delete(run);
      });
    this.inflight.add(run);
  }

  /** Resolves once every dispatch scheduled so far has finished. */
  async settled(): Promise<void> {
    while (this.inflight.size > 0) {
      await Promise.all([...this.inflight]);
    }
  }

  /**
   * Writes to one outbox row, tolerating exactly one thing: the row having been deleted
   * since it was read. Delivery runs after the commit and outside every transaction, so
   * a request cascade-deleted in that window takes its outbox rows with it — there is
   * then nothing to record and nothing wrong. Every other failure is the caller's to
   * handle.
   */
  private async mark(id: string, data: Prisma.RequestNotificationUpdateInput): Promise<boolean> {
    try {
      await this.prisma.requestNotification.update({ where: { id }, data });
      return true;
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2025') return false;
      throw error;
    }
  }

  /**
   * One pass over the named rows. A row is attempted from `pending`, and retried only
   * from `failed` and only while `attempts` is below its bound; `attempts` is
   * incremented BEFORE the attempt, because `deliver` is not assumed idempotent.
   */
  async drain(ids: string[]): Promise<void> {
    for (const id of ids) {
      const row = await this.prisma.requestNotification.findUnique({
        where: { id },
        include: { event: { select: { action: true } } },
      });
      if (!row) continue;
      if (row.status !== 'pending' && row.status !== 'failed') continue;
      if (row.attempts >= MAX_DELIVERY_ATTEMPTS) continue;

      const attempts = row.attempts + 1;
      // `attempts` is incremented BEFORE the attempt, because `deliver` is not assumed
      // idempotent: a crash between the two must leave evidence that one was made.
      if (!(await this.mark(id, { attempts }))) continue;

      try {
        const outcome = await this.notifier.deliver({
          id: row.id,
          organizationId: row.organizationId,
          requestId: row.requestId,
          eventId: row.eventId,
          action: row.event.action as RequestEventAction,
          recipientKind: row.recipientKind === 'client' ? 'client' : 'member',
          recipientId: row.recipientId,
          attempts,
        });
        await this.mark(id, {
          status: outcome.status,
          channel: outcome.channel,
          providerKey: outcome.providerKey ?? null,
          providerRef: outcome.providerRef ?? null,
          lastError: outcome.status === 'failed' ? (outcome.error ?? null) : null,
          handledAt: new Date(),
        });
      } catch (error) {
        // The failure text, and never an address: none is stored on the row and none is
        // resolved here (REQ-03-040, PII).
        await this.mark(id, {
          status: 'failed',
          lastError: (error as Error)?.message ?? 'delivery failed',
          handledAt: new Date(),
        });
      }
    }
  }
}
