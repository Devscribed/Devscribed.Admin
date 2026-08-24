export interface PasswordResetEmail {
  to: string;
  firstName: string;
  /** The raw token — this is the only place outside the email that ever holds it. */
  token: string;
  /** Fully-formed link the recipient clicks. */
  resetUrl: string;
}

/** Fields every signing message shares. Kept separate so a new message cannot forget one. */
export interface EnvelopeEmailBase {
  to: string;
  /** The recipient's name as it appears on the envelope. */
  recipientName: string;
  envelopeTitle: string;
  organizationName: string;
}

export interface SigningInvitationEmail extends EnvelopeEmailBase {
  /** Who sent it — a signer needs to recognize the sender before following a link. */
  senderName: string;
  /** `/sign/{token}`. The raw token lives only here and in the recipient's inbox. */
  signingUrl: string;
  expiresAt: Date;
}

/**
 * The reminder is a distinct type rather than an invitation with a flag: the copy
 * differs, and the sink's discriminator is what lets a test assert that a reminder was
 * sent without matching an invitation by accident.
 */
export interface SigningReminderEmail extends SigningInvitationEmail {
  /** Sent by the hourly sweep at the halfway point; one reminder per signer, per spec. */
  reminderNumber: number;
}

export interface EnvelopeCompletedEmail extends EnvelopeEmailBase {
  /** Presigned, short-lived, and re-issued on demand — never a permanent URL. */
  downloadUrl: string;
  /** Requirement 25: the link stays usable for 30 days after completion. */
  downloadExpiresAt: Date;
  completedAt: Date;
}

export interface EnvelopeDeclinedEmail extends EnvelopeEmailBase {
  declinedByName: string;
  /** Optional on the wire (requirement 26); empty string when the signer gave none. */
  declineReason: string;
  declinedAt: Date;
}

export interface EnvelopeVoidedEmail extends EnvelopeEmailBase {
  voidedByName: string;
  /** Required by requirement 32 — a void without a reason is rejected upstream. */
  voidReason: string;
  voidedAt: Date;
}

/**
 * Every message this application sends, keyed by its type.
 *
 * The map is the single source of the discriminator: `MailMessageType` is derived from
 * it, so adding a message here is what makes the sink, the controller, and the tests
 * able to name it.
 */
export interface MailMessages {
  password_reset: PasswordResetEmail;
  signing_invitation: SigningInvitationEmail;
  signing_reminder: SigningReminderEmail;
  envelope_completed: EnvelopeCompletedEmail;
  envelope_declined: EnvelopeDeclinedEmail;
  envelope_voided: EnvelopeVoidedEmail;
}

export type MailMessageType = keyof MailMessages;

export type AnyMailMessage = MailMessages[MailMessageType];

export const MAIL_MESSAGE_TYPES: readonly MailMessageType[] = [
  'password_reset',
  'signing_invitation',
  'signing_reminder',
  'envelope_completed',
  'envelope_declined',
  'envelope_voided',
];

/**
 * Transport-agnostic outbound mail. The contract lives here, the transport does not: a
 * console logger in dev, an in-memory sink in tests, SES v2 in production.
 *
 * Used as the DI token directly, which is why it is an abstract class and not an
 * interface.
 *
 * The signing messages were added by documents spec 02, which is why `ConsoleMailService`,
 * `InMemoryMailService`, and `mail/test-mail.controller.ts` all changed in the same
 * commit — the area README flags this class as the one piece of shared code that breaks
 * on contact. Each method is separate rather than one `send(type, payload)` so that a new
 * message cannot be added without every transport being forced to acknowledge it.
 */
export abstract class MailService {
  abstract sendPasswordReset(message: PasswordResetEmail): Promise<void>;

  /** Requirement 10: the invitation to the signer whose turn it is. */
  abstract sendSigningInvitation(message: SigningInvitationEmail): Promise<void>;

  /** Sent by the sweep, not by a request. */
  abstract sendSigningReminder(message: SigningReminderEmail): Promise<void>;

  /** Requirement 30: both parties, with a download link. */
  abstract sendEnvelopeCompleted(message: EnvelopeCompletedEmail): Promise<void>;

  /** Requirement 26: the sender is told, with the reason. */
  abstract sendEnvelopeDeclined(message: EnvelopeDeclinedEmail): Promise<void>;

  /** Requirement 32: every signer who had already been notified is told. */
  abstract sendEnvelopeVoided(message: EnvelopeVoidedEmail): Promise<void>;
}
