import { RecordedMail } from './in-memory-mail.service';
import { MailMessageType } from './mail.service';

/**
 * How one recorded message is shown to a human.
 *
 * Shared by the two readers of the sink — `/api/test/mail`, which the E2E suite reads with
 * a token, and `/api/organizations/:orgId/outbox`, which a signed-in admin reads in the
 * browser. One shape rather than two, because the second exists so a person can see what
 * the first sees; if they drifted, the screen would stop being evidence about the run.
 */

/**
 * Subject-ish labels. The application has no subject lines — copy lives in the transport,
 * not in the payload — so an outbox needs a human name per type from somewhere, and the
 * discriminator is the only honest source.
 */
export const MAIL_SUBJECTS: Record<MailMessageType, string> = {
  password_reset: 'Reset your password',
  signing_invitation: 'A document is waiting for your signature',
  signing_reminder: 'Reminder: a document is waiting for your signature',
  envelope_completed: 'Your document is complete',
  envelope_declined: 'A signer declined the document',
  envelope_voided: 'A document was voided',
};

export interface OutboxRow {
  type: MailMessageType;
  to: string;
  subject: string;
  sentAt: string;
  /** The one URL the message carries, or `null` for the two that carry none. */
  link: string | null;
  /** Present on every envelope message; absent on a password reset. */
  envelopeTitle: string | null;
  recipientName: string | null;
}

/**
 * Flattens one record into the row an outbox shows: who, what, when, and the link a
 * recipient would click. The link is the whole point — without a real mailbox it is the
 * only way to reach a signing page.
 */
export function describeMail(record: RecordedMail): OutboxRow {
  // Read through an index signature rather than narrowing on `type` six ways: the three
  // URL fields are mutually exclusive across the union, so the first one present is the
  // link, and a message type added later needs no change here to keep working.
  const message = record.message as unknown as Record<string, unknown>;
  const link =
    (message.signingUrl as string | undefined) ??
    (message.resetUrl as string | undefined) ??
    (message.downloadUrl as string | undefined) ??
    null;

  return {
    type: record.type,
    to: message.to as string,
    subject: MAIL_SUBJECTS[record.type],
    sentAt: record.sentAt.toISOString(),
    link,
    envelopeTitle: (message.envelopeTitle as string | undefined) ?? null,
    recipientName: (message.recipientName as string | undefined) ?? null,
  };
}

/**
 * The organization a message belongs to, or `null` for one that belongs to none.
 *
 * Only the envelope messages carry an id — a password reset is about an account, not an
 * organization — and `null` is what keeps those **out** of an org-scoped outbox rather
 * than falling into everyone's. A reset link is an account takeover; it belongs in the
 * token-fenced route the E2E suite reads and nowhere a colleague can click it.
 */
export function organizationOf(record: RecordedMail): string | null {
  const message = record.message as unknown as Record<string, unknown>;
  const id = message.organizationId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
