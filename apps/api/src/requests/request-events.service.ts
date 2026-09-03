import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** The five actions a `RequestEvent` may carry (requests spec 01 Data Model). */
export type RequestEventAction =
  | 'created'
  | 'status_changed'
  | 'assignee_changed'
  | 'field_changed'
  | 'message_posted';

export interface RecordRequestEventInput {
  requestId: string;
  /** `member` or `client` for anything a person did; `system` exists for a future actor
   * that is not one. */
  actorKind: 'member' | 'client' | 'system';
  actorMembershipId: string | null;
  /** Requests spec 03 — set exactly when `actorKind` is `client`. */
  actorClientMembershipId?: string | null;
  action: RequestEventAction;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  /**
   * Display-name snapshots taken at write time, so the trail stays readable after the
   * member is removed or renamed (requirements 20 and 35).
   */
  oldLabel?: string | null;
  newLabel?: string | null;
}

/**
 * The append-only writer for `RequestEvent`. Every call takes the caller's transaction
 * client, never the root Prisma service: an event is written in the same transaction as
 * the row it describes, so a request without its `created` event, or a status change
 * without its `status_changed` event, is not a state the system can produce
 * (requirements 11, 19, 29 and state-machine invariant 4).
 *
 * There is no update path and no delete path here on purpose.
 */
@Injectable()
export class RequestEventsService {
  /**
   * Returns the id of the event just written. Requests spec 03's outbox rows carry it
   * and are written in this same transaction, so a notifiable event without its rows is
   * not a state the system can produce (REQ-03-035).
   */
  async record(tx: Prisma.TransactionClient, input: RecordRequestEventInput): Promise<string> {
    const event = await tx.requestEvent.create({
      data: {
        requestId: input.requestId,
        actorKind: input.actorKind,
        actorMembershipId: input.actorMembershipId,
        actorClientMembershipId: input.actorClientMembershipId ?? null,
        action: input.action,
        field: input.field ?? null,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
        oldLabel: input.oldLabel ?? null,
        newLabel: input.newLabel ?? null,
      },
      select: { id: true },
    });
    return event.id;
  }
}
