import { EVENT_HASH_SCHEMA_VERSION, computeEventHash } from '@devscribed/validation';
import type { EnvelopeEventType } from '@devscribed/validation';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Who caused the event. Requirement 41 — the IP and the user agent are captured for
 * every signer-originated event, so they travel with the actor rather than being a
 * separate argument each caller could forget.
 */
export interface EventActor {
  /** Member-originated events. */
  accountId?: string | null;
  /** Signer-originated events; the signature is bound to an address, not an account. */
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface RecordEventInput {
  envelopeId: string;
  type: EnvelopeEventType;
  signerId?: string | null;
  actor?: EventActor;
  /** The hash in force at the time; null before the document is frozen. */
  documentHash?: string | null;
  /**
   * Requirement 40 — **never** field values. The trail records that a document was
   * signed, not what was written in it, so nothing derived from `Envelope.fieldValues`
   * may be put here. Field *keys* are also excluded: a key like `contractor_tax_id`
   * paired with a `signed` event is already more than the log needs to say.
   */
  metadata?: Record<string, unknown> | null;
  /** Defaults to now. Only `created` passes one, so it can carry the real creation time. */
  occurredAt?: Date;
}

/**
 * The only path that writes an `EnvelopeEvent`.
 *
 * It takes the transaction client as a parameter rather than reaching for
 * `PrismaService` itself, which is what makes invariant 4 structural: an event cannot be
 * written outside a transaction, because there is no overload that would let you. Every
 * transition therefore commits with its event or not at all, and requirement 37 ("no
 * events without transitions and no transitions without events") is enforced by the type
 * system rather than by review.
 */
@Injectable()
export class EnvelopeEventsService {
  async record(tx: Prisma.TransactionClient, input: RecordEventInput) {
    // Serialize the hash-linked chain per envelope. Without this, two concurrent
    // transactions writing to the same envelope both read the same "last event" under
    // READ COMMITTED, both compute the same `previousEventHash`, and one of the two
    // commits an event that does not link to the other's — the chain forks, and the
    // audit verifier reports it as tampered at whichever event lost the ordering tie
    // (TC-04-INT-13, previously flaky under Ubuntu CI). The row-level lock is held for
    // the duration of the caller's transaction, so a caller that records several events
    // in one transaction pays for the lock once and their events are naturally ordered.
    await tx.$queryRaw`SELECT id FROM "Envelope" WHERE id = ${input.envelopeId} FOR UPDATE`;

    const previous = await tx.envelopeEvent.findFirst({
      where: { envelopeId: input.envelopeId },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { eventHash: true, occurredAt: true },
    });

    // Strict monotonicity per envelope. Two events written in one transaction can
    // otherwise land on the same millisecond, and the chain's order would then depend
    // on how the verifier broke the tie — which would make a perfectly good trail
    // report as tampered. Nudging by a millisecond costs nothing and makes
    // `ORDER BY occurredAt` a total order.
    const requested = input.occurredAt ?? new Date();
    const occurredAt =
      previous && requested.getTime() <= previous.occurredAt.getTime()
        ? new Date(previous.occurredAt.getTime() + 1)
        : requested;

    const actorAccountId = input.actor?.accountId ?? null;
    const actorEmail = input.actor?.email ? input.actor.email.trim().toLowerCase() : null;
    const metadata = input.metadata ?? null;

    const eventHash = computeEventHash({
      previousEventHash: previous?.eventHash ?? null,
      envelopeId: input.envelopeId,
      type: input.type,
      // The exact string the row will carry. Re-formatting the Date at verification
      // time is how a chain quietly stops verifying.
      occurredAt: occurredAt.toISOString(),
      actor: actorAccountId ?? actorEmail ?? '',
      metadata,
    });

    return tx.envelopeEvent.create({
      data: {
        envelopeId: input.envelopeId,
        envelopeSignerId: input.signerId ?? null,
        type: input.type,
        actorAccountId,
        actorEmail,
        ipAddress: input.actor?.ipAddress ?? null,
        userAgent: truncate(input.actor?.userAgent, 400),
        documentHash: input.documentHash ?? null,
        metadata: (metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        schemaVersion: EVENT_HASH_SCHEMA_VERSION,
        occurredAt,
        previousEventHash: previous?.eventHash ?? null,
        eventHash,
      },
    });
  }
}

/**
 * `UserAgent` is a 400-character column and the header is attacker-controlled. Truncating
 * here rather than at the call site means a 4 KB user agent cannot 500 a signature that
 * is otherwise perfectly valid.
 */
function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  return value.length > max ? value.slice(0, max) : value;
}
