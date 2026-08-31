import { effectiveStatus, isTerminal } from '@devscribed/validation';
import type { EnvelopeStatus as EnvelopeStatusName } from '@devscribed/validation';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EnvelopeStatus, Prisma, SignerStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { JobQueue } from '../queue/job-queue';
import type { Job } from '../queue/job-queue';
import { SigningProviderRegistry } from '../signature/provider-registry';
import { isRemotelyTrackedProvider } from '../signature/signing-provider';
import type {
  ProviderSignerState,
  ProviderState,
  RemotelyTracked,
  SigningProvider,
} from '../signature/signing-provider';
import {
  generateSigningToken,
  signingPageUrl,
  signingTokenTtlDays,
} from '../signature/signing-token';
import { EnvelopeEventsService } from './envelope-events.service';

/** Requirement 24a — how old a sync may be before a read pays for a fresh one. */
export const DEFAULT_PROVIDER_SYNC_STALE_SECONDS = 120;

/** The `outcome` column of `ProviderWebhookEvent`. */
export type ReconcileOutcome = 'converged' | 'ignored_terminal' | 'unknown_ref' | 'error';

type LoadedEnvelope = Prisma.EnvelopeGetPayload<{
  include: {
    signers: true;
    organization: true;
    createdBy: true;
  };
}>;

/**
 * **Converge to state, never apply a delta.**
 *
 * On every accepted notification the reconciler calls `fetchState(providerRef)` and moves
 * our rows to what the API returns. Nothing in a notification body is ever written to the
 * database except the fact that a notification arrived. That is what makes replay,
 * reordering and duplicate delivery harmless *by construction* rather than by careful
 * handling — and the observed evidence is stronger than the forgery argument it was
 * written for: the captured `document_sent` delivery carried `status: "Sending"`, a
 * transient the API had already left, and **every** `recipients[].status` in it was
 * `null`, while a `GET` moments later returned `created` / `sent` / `waiting` correctly. A
 * handler that wrote state from the payload would have recorded a status that was never
 * true for more than a second, with no signer statuses at all.
 *
 * It is the **second writer** of the event chain, after the controllers, and it writes
 * through `EnvelopeEventsService` like everything else — that service takes the
 * transaction client as a parameter, so this writer cannot put an event outside a
 * transaction any more than the first one can.
 *
 * Convergence is reached three ways, and a dropped notification therefore costs
 * timeliness and never correctness: after a doorbell, lazily on a stale read
 * (requirement 24a), and on the hourly sweep (requirement 24b). The scheduler
 * materializes what is already true; it is not the source of truth.
 */
@Injectable()
export class ProviderReconcilerService implements OnModuleInit {
  private readonly log = new Logger(ProviderReconcilerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EnvelopeEventsService,
    private readonly mail: MailService,
    private readonly providers: SigningProviderRegistry,
    private readonly queue: JobQueue,
  ) {}

  onModuleInit(): void {
    this.queue.registerHandler('provider-reconcile', (job) => this.runJob(job));
  }

  /* ---------------------------------------------------------------- *
   * The three triggers
   * ---------------------------------------------------------------- */

  /**
   * The doorbell. Everything about the notification except the fact of its arrival is
   * discarded here: the reference is resolved, the state is re-read, and the row is
   * closed with an outcome.
   */
  async runJob(job: Job): Promise<void> {
    const payload = (job.payload ?? {}) as {
      providerKey?: string;
      providerRef?: string;
      webhookEventId?: string;
    };
    const providerKey = payload.providerKey ?? '';
    const providerRef = payload.providerRef ?? '';

    // Requirement 25 — the reference lookup happens *after* the response was queued. It is
    // the only part of handling a delivery that could tell a caller which documents we
    // hold, so it is the part that runs off the request thread.
    const envelope = providerRef
      ? await this.prisma.envelope.findFirst({
          where: { providerKey, providerRef },
          select: { id: true },
        })
      : null;

    if (!envelope) {
      // Edge cases 5 and 6: a delivery that overtook our send transaction, or a document
      // of another SignWell account. Both are recorded and answered identically.
      this.log.warn(
        `A verified ${providerKey} notification named a document we do not hold; recording unknown_ref`,
      );
      await this.closeWebhookEvent(payload.webhookEventId, null, 'unknown_ref');
      return;
    }

    const outcome = await this.converge(envelope.id);
    await this.closeWebhookEvent(payload.webhookEventId, envelope.id, outcome);
  }

  /**
   * Requirement 24a — lazily, on read. Returns whether anything changed, so the caller
   * knows whether to re-read the row it already has.
   */
  async convergeIfStale(envelopeId: string): Promise<boolean> {
    const envelope = await this.prisma.envelope.findUnique({
      where: { id: envelopeId },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        providerKey: true,
        providerRef: true,
        providerSyncedAt: true,
      },
    });
    if (!envelope || !envelope.providerRef) return false;
    if (isTerminal(effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt))) {
      return false;
    }

    const provider = this.providers.find(envelope.providerKey);
    if (!provider || !isRemotelyTrackedProvider(provider)) return false;

    // `providerSyncedAt` is written at send, so a freshly-sent envelope is fresh and its
    // first reads spend nothing (TC-04-INT-12).
    const age = envelope.providerSyncedAt
      ? Date.now() - envelope.providerSyncedAt.getTime()
      : Number.POSITIVE_INFINITY;
    if (age < staleAfterSeconds() * 1000) return false;

    const outcome = await this.converge(envelope.id);
    return outcome === 'converged';
  }

  /**
   * Requirement 24b — the sweep's third pass. Non-terminal remote envelopes not synced
   * within the last hour, plus anything left with a completed document we could not
   * download.
   */
  async sweepStale(now = new Date()): Promise<{ reconciled: number; failed: number }> {
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const due = await this.prisma.envelope.findMany({
      where: {
        status: {
          in: [EnvelopeStatus.sent, EnvelopeStatus.partially_signed],
        },
        providerRef: { not: '' },
        OR: [{ providerSyncedAt: null }, { providerSyncedAt: { lt: hourAgo } }],
      },
      select: { id: true, providerKey: true },
    });

    let reconciled = 0;
    let failed = 0;
    for (const envelope of due) {
      const provider = this.providers.find(envelope.providerKey);
      if (!provider || !isRemotelyTrackedProvider(provider)) continue;
      try {
        const outcome = await this.converge(envelope.id);
        if (outcome === 'converged') reconciled += 1;
        else if (outcome === 'error') failed += 1;
      } catch (error) {
        // One bad envelope must not stop the sweep for every other one.
        failed += 1;
        this.log.error(
          `Reconciling envelope ${envelope.id} failed: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }

    return { reconciled, failed };
  }

  /* ---------------------------------------------------------------- *
   * Convergence
   * ---------------------------------------------------------------- */

  async converge(envelopeId: string): Promise<ReconcileOutcome> {
    const envelope = await this.load(envelopeId);
    if (!envelope) return 'unknown_ref';

    const status = effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt);

    // Invariant 9 — convergence never moves an envelope out of a terminal state. This is
    // also requirement 41: our own `DELETE` comes back to us as `document_canceled` within
    // seconds, and the envelope is already `voided` locally, so it is **settled** rather
    // than converged. Calling `fetchState` here would read the 404 our own delete caused
    // as a provider fault, which is why the check comes before the call and not after it.
    if (isTerminal(status)) return 'ignored_terminal';

    const provider = this.providers.find(envelope.providerKey);
    if (!provider || !isRemotelyTrackedProvider(provider)) {
      // Edge case 16 — the adapter unregistered while envelopes were in flight. The
      // envelope surfaces the reason on read rather than silently stalling.
      await this.recordProviderError(envelope.id, 'provider_unconfigured');
      return 'error';
    }

    let state: ProviderState;
    try {
      state = await (provider as SigningProvider & RemotelyTracked).fetchState(
        envelope.providerRef,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.recordProviderError(envelope.id, reason);
      return 'error';
    }

    if (!state.exists) {
      // Requirement 42 / edge case 28 — a 404 on a **non**-voided envelope is a provider
      // fault, not a state. We never infer a deletion we did not ask for, so the envelope
      // is left exactly as it is. (A 404 on a voided one never reaches here: the terminal
      // check above stopped it, which is the settled post-delete state of edge case 27.)
      await this.recordProviderError(envelope.id, 'provider_document_not_found');
      return 'error';
    }

    return this.applyState(envelope, provider, state);
  }

  private async applyState(
    envelope: LoadedEnvelope,
    provider: SigningProvider,
    state: ProviderState,
  ): Promise<ReconcileOutcome> {
    const ourSigners = [...envelope.signers].sort((a, b) => a.order - b.order);
    const matched: { signer: (typeof ourSigners)[number]; remote: ProviderSignerState }[] = [];
    let mismatch = false;

    for (const remote of state.signers) {
      const signer =
        ourSigners.find((s) => s.providerRef !== '' && s.providerRef === remote.providerRef) ??
        ourSigners.find((s) => s.email.toLowerCase() === remote.email && remote.email !== '');
      if (!signer) {
        // Edge case 9 — the provider reports a signer we do not have. Nothing is written
        // for that recipient. We never create an `EnvelopeSigner` from provider data: the
        // signer list is ours.
        mismatch = true;
        continue;
      }
      if (matched.some((entry) => entry.signer.id === signer.id)) {
        mismatch = true;
        continue;
      }
      matched.push({ signer, remote });
    }

    // Edge case 10 — fewer signers than we have. Same treatment, and **no rows deleted**.
    if (matched.length !== ourSigners.length) mismatch = true;

    const now = new Date();
    let changed = false;
    let declinedBy: { name: string; email: string; reason: string | null } | null = null;
    let nextTurn: { id: string; name: string; email: string; token: string } | null = null;

    await this.prisma.$transaction(async (tx) => {
      for (const { signer, remote } of matched) {
        // Because convergence is state-based rather than event-based, `document_viewed`
        // firing on every view still writes `viewed` once per signer — spec 02
        // requirement 17 survives (edge case 8).
        if (
          ADVANCED_PAST_NOTIFIED.has(remote.status) &&
          signer.status !== SignerStatus.viewed &&
          signer.status !== SignerStatus.signed &&
          signer.status !== SignerStatus.declined
        ) {
          const seen = await tx.envelopeEvent.count({
            where: { envelopeSignerId: signer.id, type: 'viewed' },
          });
          if (seen === 0) {
            await tx.envelopeSigner.update({
              where: { id: signer.id },
              data: { status: SignerStatus.viewed },
            });
            await this.events.record(tx, {
              envelopeId: envelope.id,
              type: 'viewed',
              signerId: signer.id,
              documentHash: envelope.documentHash,
              actor: { email: signer.email },
            });
            changed = true;
          }
        }

        if (remote.status === 'signed' && signer.status !== SignerStatus.signed) {
          await tx.envelopeSigner.update({
            where: { id: signer.id },
            data: { status: SignerStatus.signed, signedAt: remote.signedAt ?? now },
          });
          await this.events.record(tx, {
            envelopeId: envelope.id,
            type: 'signed',
            signerId: signer.id,
            documentHash: envelope.documentHash,
            actor: { email: signer.email },
            // Requirement 40 (spec 02) — never field values. The provider is named, and
            // that is all a converged signature adds.
            metadata: { order: signer.order, source: provider.key },
          });
          changed = true;
        }

        if (remote.status === 'declined' && signer.status !== SignerStatus.declined) {
          await tx.envelopeSigner.update({
            where: { id: signer.id },
            data: {
              status: SignerStatus.declined,
              declinedAt: remote.declinedAt ?? now,
              declineReason: remote.declineReason ?? state.declineReason,
            },
          });
          await this.events.record(tx, {
            envelopeId: envelope.id,
            type: 'declined',
            signerId: signer.id,
            documentHash: envelope.documentHash,
            actor: { email: signer.email },
            metadata: { reason: remote.declineReason ?? state.declineReason ?? '' },
          });
          declinedBy = {
            name: signer.name,
            email: signer.email,
            reason: remote.declineReason ?? state.declineReason,
          };
          changed = true;
        }
      }

      if (!mismatch) {
        if (state.status === 'declined' && envelope.status !== EnvelopeStatus.declined) {
          await tx.signingToken.updateMany({
            where: { signer: { envelopeId: envelope.id }, isInvalidated: false },
            data: { isInvalidated: true },
          });
          await tx.envelope.update({
            where: { id: envelope.id },
            data: { status: EnvelopeStatus.declined },
          });
          changed = true;
        } else if (
          state.status === 'partially_signed' &&
          envelope.status === EnvelopeStatus.sent
        ) {
          await tx.envelope.update({
            where: { id: envelope.id },
            data: { status: EnvelopeStatus.partially_signed },
          });
          changed = true;
        }

        // Because `signingOrder` is the provider's, the next signer's turn is already
        // open on their side — but the *invitation* is ours (requirement 12), so we mint
        // our own token and send our own mail with our own `/sign` link. The counterparty
        // must never receive mail from a vendor they have no relationship with.
        if (state.status === 'partially_signed' || state.status === 'sent') {
          nextTurn = await this.openNextTurn(tx, envelope, matched, now);
          if (nextTurn) changed = true;
        }
      }

      if (changed) {
        // Requirement 37 — a `provider_synced` event records the provider key and the
        // provider's status string and NOTHING else. No field values, no field keys,
        // ever. It is written only when the convergence actually moved something, so the
        // chain stays a record of what happened rather than of how often we looked.
        await this.events.record(tx, {
          envelopeId: envelope.id,
          type: 'provider_synced',
          documentHash: envelope.documentHash,
          metadata: { provider: provider.key, providerStatus: state.providerStatus },
        });
      }

      await tx.envelope.update({
        where: { id: envelope.id },
        data: {
          providerStatus: state.providerStatus,
          providerSyncedAt: now,
          providerError: mismatch ? 'signer_mismatch' : null,
        },
      });
    });

    // Requirement 27 — the provider's PDF is downloaded and written to S3 **before** the
    // envelope is marked complete, so this is a job rather than part of the transaction
    // above: invariant 10 puts the bytes in storage first, and invariant 11 keeps the
    // download outside every transaction.
    if (!mismatch && state.status === 'completed') {
      await this.queue.enqueue({ name: 'provider-complete', envelopeId: envelope.id });
    }

    if (declinedBy) await this.notifyDecline(envelope, declinedBy);
    if (nextTurn) await this.notifyNextTurn(envelope, nextTurn);

    if (mismatch) {
      this.log.error(
        `Envelope ${envelope.id} does not agree with ${provider.key} about its signers; ` +
          'nothing was written for the unmatched recipients and no row was deleted',
      );
      return 'error';
    }

    return 'converged';
  }

  /**
   * Mints the next signer's token when the provider has opened their turn and we have not
   * issued a link yet. Returns what the mail needs, or `null` when there is nothing to do.
   */
  private async openNextTurn(
    tx: Prisma.TransactionClient,
    envelope: LoadedEnvelope,
    matched: { signer: LoadedEnvelope['signers'][number]; remote: ProviderSignerState }[],
    now: Date,
  ): Promise<{ id: string; name: string; email: string; token: string } | null> {
    // Who is finished is read from **both** sides, and the provider's side is what makes
    // it work at all: the signer rows in `matched` were loaded before this transaction
    // opened, so the signer who just signed still reads `notified` in memory even though
    // the loop above has already written `signed` for them. Filtering on our stale copy
    // alone would make that signer the first candidate every time — and they always have
    // a live token, so the guard below would return `null` and the next signer's turn
    // would never open (requirement 12: the invitation is ours under SignWell too).
    const pending = matched
      .filter(
        ({ signer, remote }) =>
          !FINISHED_REMOTELY.has(remote.status) &&
          signer.status !== SignerStatus.signed &&
          signer.status !== SignerStatus.declined,
      )
      .map((entry) => entry.signer)
      .sort((a, b) => a.order - b.order);

    const remoteOf = new Map(matched.map((entry) => [entry.signer.id, entry.remote]));
    const next = pending.find((signer) => {
      const remote = remoteOf.get(signer.id);
      return remote !== undefined && ADVANCED_PAST_PENDING.has(remote.status);
    });
    if (!next) return null;

    const alreadyInvited = await tx.signingToken.count({
      where: { envelopeSignerId: next.id, isInvalidated: false },
    });
    if (alreadyInvited > 0) return null;

    const { token, tokenHash } = generateSigningToken();
    const ttl = new Date(now.getTime() + signingTokenTtlDays() * 24 * 60 * 60 * 1000);
    const expiresAt = envelope.expiresAt && envelope.expiresAt < ttl ? envelope.expiresAt : ttl;

    await tx.signingToken.create({
      data: { envelopeSignerId: next.id, tokenHash, expiresAt },
    });
    if (next.status === SignerStatus.pending) {
      await tx.envelopeSigner.update({
        where: { id: next.id },
        data: { status: SignerStatus.notified },
      });
    }

    // **No `email_accepted` here.** The token exists and the turn is open whatever the
    // mail transport does, so both writes above are true at commit; "the transport
    // accepted the message" is not, because nothing has been handed to it yet. The
    // invitation goes out after this transaction commits (invariant 11 keeps it out of
    // the transaction), and the event is written only if SES took it — see
    // `notifyNextTurn`. Recording it here would let a rejected address leave the envelope
    // screen claiming `Accepted` for a signer who never received a link.
    return { id: next.id, name: next.name, email: next.email, token };
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  private load(envelopeId: string) {
    return this.prisma.envelope.findUnique({
      where: { id: envelopeId },
      include: { signers: true, organization: true, createdBy: true },
    });
  }

  /**
   * The error is recorded on the envelope and nowhere else: it is operational information
   * for the sender's screen, and it is cleared by the next successful sync.
   */
  private async recordProviderError(envelopeId: string, reason: string): Promise<void> {
    await this.prisma.envelope.updateMany({
      where: { id: envelopeId },
      data: { providerError: reason.slice(0, 500) },
    });
  }

  private async closeWebhookEvent(
    id: string | undefined,
    envelopeId: string | null,
    outcome: ReconcileOutcome,
  ): Promise<void> {
    if (!id) return;
    await this.prisma.providerWebhookEvent.updateMany({
      where: { id },
      data: { envelopeId, outcome, processedAt: new Date() },
    });
  }

  private async notifyDecline(
    envelope: LoadedEnvelope,
    declined: { name: string; reason: string | null },
  ): Promise<void> {
    await this.safeMail(() =>
      this.mail.sendEnvelopeDeclined({
        to: envelope.createdBy.email,
        recipientName: envelope.createdBy.firstName,
        envelopeTitle: envelope.title,
        organizationName: envelope.organization.name,
        organizationId: envelope.organizationId,
        declinedByName: declined.name,
        declineReason: declined.reason ?? '',
        declinedAt: new Date(),
      }),
    );
  }

  /**
   * The next signer's invitation, sent after the convergence transaction has committed —
   * and the `email_accepted` event that follows it, written **only when the transport
   * accepted the message**, in its own transaction.
   *
   * The order is the point. The send path does the same thing inside its transaction
   * (`EnvelopesService.send` awaits the transport and records `email_accepted` after it,
   * rolling the whole send back on a rejection); here the transition being reported is a
   * signature the provider has already captured, so a rejected mailbox must not roll
   * anything back — but it must not be reported as an acceptance either. A failure
   * therefore leaves the signer with no email status at all, exactly like the internal
   * next-turn path, which sends outside the failure boundary and records nothing.
   */
  private async notifyNextTurn(
    envelope: LoadedEnvelope,
    next: { id: string; name: string; email: string; token: string },
  ): Promise<void> {
    const accepted = await this.safeMail(() =>
      this.mail.sendSigningInvitation({
        to: next.email,
        recipientName: next.name,
        envelopeTitle: envelope.title,
        organizationName: envelope.organization.name,
        organizationId: envelope.organizationId,
        senderName: `${envelope.createdBy.firstName} ${envelope.createdBy.lastName}`.trim(),
        // Ours, always. Never a provider link.
        signingUrl: signingPageUrl(next.token),
        expiresAt: envelope.expiresAt ?? new Date(),
      }),
    );
    if (!accepted) return;

    // Invariant 4 still holds: the event is written through `EnvelopeEventsService` and
    // therefore inside a transaction — its own, opened after the acceptance it records.
    await this.prisma.$transaction((tx) =>
      this.events.record(tx, {
        envelopeId: envelope.id,
        type: 'email_accepted',
        signerId: next.id,
        documentHash: envelope.documentHash,
        actor: { email: next.email },
      }),
    );
  }

  /**
   * A notification that follows a committed transition. Never allowed to throw: the
   * transition it follows is already a fact and the caller can do nothing useful with the
   * error. It reports whether the transport took the message, so a caller can record that
   * it did — and record nothing when it did not.
   */
  private async safeMail(send: () => Promise<void>): Promise<boolean> {
    try {
      await send();
      return true;
    } catch (error) {
      this.log.error(`Notification failed: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }
}

/** Statuses that mean the recipient has at least opened the document. */
const ADVANCED_PAST_NOTIFIED = new Set(['viewed', 'signed', 'declined']);

/** Statuses that mean the provider has opened this recipient's turn. */
const ADVANCED_PAST_PENDING = new Set(['notified', 'viewed', 'signed', 'declined']);

/** Statuses that mean this recipient has nothing left to do, whatever our row still says. */
const FINISHED_REMOTELY = new Set(['signed', 'declined']);

function staleAfterSeconds(): number {
  const configured = Number(process.env.PROVIDER_SYNC_STALE_SECONDS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_PROVIDER_SYNC_STALE_SECONDS;
}
