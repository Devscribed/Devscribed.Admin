import { effectiveStatus } from '@devscribed/validation';
import type { EnvelopeStatus as EnvelopeStatusName } from '@devscribed/validation';
import { Injectable, Logger } from '@nestjs/common';
import { EnvelopeStatus, SignerStatus } from '@prisma/client';
import { EnvelopeEventsService } from '../documents/envelope-events.service';
import { currentSignerOf } from '../documents/envelopes.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { SignatureProvider } from '../signature/signature-provider';

/**
 * The hourly sweep (requirement 34).
 *
 * It is an **optimization and nothing more**. Expiry correctness is enforced lazily on
 * every read and every token validation, so a sweep that has not run for a day degrades
 * notification timeliness and never correctness — TC-02-INT-17 asserts exactly that by
 * checking the behaviour before running it. What the sweep buys is a materialized status
 * (so the list can be filtered and indexed) and the `expired` event that belongs in the
 * trail.
 */
@Injectable()
export class EnvelopeSweepService {
  private readonly log = new Logger(EnvelopeSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EnvelopeEventsService,
    private readonly mail: MailService,
    private readonly signature: SignatureProvider,
  ) {}

  async run(now = new Date()): Promise<{ expired: number; remindersSent: number }> {
    return {
      expired: await this.materializeExpired(now),
      remindersSent: await this.sendReminders(now),
    };
  }

  /**
   * Writes down what the clock already made true. The `status` predicate is what makes
   * re-running the sweep idempotent: a second pass finds nothing to expire, so no second
   * `expired` event can be written.
   */
  private async materializeExpired(now: Date): Promise<number> {
    const due = await this.prisma.envelope.findMany({
      where: {
        status: { in: [EnvelopeStatus.sent, EnvelopeStatus.partially_signed] },
        expiresAt: { lt: now },
      },
      select: { id: true, documentHash: true },
    });

    let expired = 0;
    for (const envelope of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Re-checked inside the transaction: a signature or a void may have landed
          // between the query and here, and a terminal envelope never expires.
          const updated = await tx.envelope.updateMany({
            where: {
              id: envelope.id,
              status: { in: [EnvelopeStatus.sent, EnvelopeStatus.partially_signed] },
              expiresAt: { lt: now },
            },
            data: { status: EnvelopeStatus.expired },
          });
          if (updated.count === 0) return;

          await tx.signingToken.updateMany({
            where: { signer: { envelopeId: envelope.id }, isInvalidated: false, usedAt: null },
            data: { isInvalidated: true },
          });
          await this.events.record(tx, {
            envelopeId: envelope.id,
            type: 'expired',
            documentHash: envelope.documentHash,
            metadata: { source: 'sweep' },
          });
          expired += 1;
        });
      } catch (error) {
        // One bad envelope must not stop the sweep for every other one.
        this.log.error(
          `Expiring envelope ${envelope.id} failed: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    return expired;
  }

  /**
   * One reminder per signer, at the halfway point between sending and expiry (the spec
   * fixes the cadence; configuring it is out of scope).
   *
   * The reminder carries a **new** token and invalidates the old one, because only the
   * hash of the original was ever stored — there is no way to re-send a link nobody
   * kept, and inventing one would mean storing raw tokens.
   */
  private async sendReminders(now: Date): Promise<number> {
    const inFlight = await this.prisma.envelope.findMany({
      where: {
        status: { in: [EnvelopeStatus.sent, EnvelopeStatus.partially_signed] },
        expiresAt: { gt: now },
        sentAt: { not: null },
      },
      include: {
        signers: { orderBy: { order: 'asc' } },
        organization: true,
        createdBy: true,
      },
    });

    let sent = 0;
    for (const envelope of inFlight) {
      if (effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt) === 'expired') {
        continue;
      }
      if (!envelope.sentAt || !envelope.expiresAt) continue;

      const halfway = new Date(
        envelope.sentAt.getTime() + (envelope.expiresAt.getTime() - envelope.sentAt.getTime()) / 2,
      );
      if (now < halfway) continue;

      const signer = currentSignerOf(envelope.signers);
      if (!signer || !signer.email || signer.status === SignerStatus.pending) continue;

      const alreadyReminded = await this.prisma.envelopeEvent.count({
        where: { envelopeSignerId: signer.id, type: 'reminded' },
      });
      if (alreadyReminded > 0) continue;

      try {
        const invitation = await this.signature.issueInvitation({
          envelopeId: envelope.id,
          signerId: signer.id,
          signerName: signer.name,
          signerEmail: signer.email,
        });
        const expiresAt =
          envelope.expiresAt < invitation.expiresAt ? envelope.expiresAt : invitation.expiresAt;

        await this.prisma.$transaction(async (tx) => {
          await tx.signingToken.updateMany({
            where: { envelopeSignerId: signer.id, isInvalidated: false, usedAt: null },
            data: { isInvalidated: true },
          });
          await tx.signingToken.create({
            data: {
              envelopeSignerId: signer.id,
              tokenHash: invitation.tokenHash,
              expiresAt,
            },
          });
          await this.events.record(tx, {
            envelopeId: envelope.id,
            type: 'reminded',
            signerId: signer.id,
            documentHash: envelope.documentHash,
            metadata: { reason: 'sweep', reminderNumber: 1 },
          });
        });

        await this.mail.sendSigningReminder({
          to: signer.email,
          recipientName: signer.name,
          envelopeTitle: envelope.title,
          organizationName: envelope.organization.name,
          senderName: `${envelope.createdBy.firstName} ${envelope.createdBy.lastName}`.trim(),
          signingUrl: invitation.signingUrl,
          expiresAt,
          reminderNumber: 1,
        });
        sent += 1;
      } catch (error) {
        this.log.error(
          `Reminder for envelope ${envelope.id} failed: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    return sent;
  }
}
