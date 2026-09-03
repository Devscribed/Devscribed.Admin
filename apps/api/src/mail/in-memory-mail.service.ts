import { Injectable } from '@nestjs/common';
import { ConsoleMailService } from './console-mail.service';
import {
  AnyMailMessage,
  EmailChangeConfirmationEmail,
  EmailChangeNotificationEmail,
  EnvelopeCompletedEmail,
  EnvelopeDeclinedEmail,
  EnvelopeVoidedEmail,
  InvitationEmail,
  MailMessageType,
  MailMessages,
  PasswordResetEmail,
  SigningInvitationEmail,
  SigningReminderEmail,
} from './mail.service';

/** One recorded message, with the discriminator that says how to read it. */
export interface RecordedMail<T extends MailMessageType = MailMessageType> {
  type: T;
  message: MailMessages[T];
  /**
   * When the sink took the message. Nothing in a mail payload carries a send time — the
   * dates in them are envelope facts (`expiresAt`, `completedAt`) — so the dev outbox
   * would have nothing to sort or display without this. Recorded here rather than
   * derived at read time so the order survives any future filtering.
   */
  sentAt: Date;
}

/**
 * The compatibility view returned by `sent`.
 *
 * It is the password-reset shape intersected with every other message's fields made
 * optional, rather than a discriminated union, for one concrete reason: the
 * password-reset tests predate every other message and read `mail.sent[0].token`
 * directly. A union would stop those compiling, and no existing test should need editing
 * to add a message type. Read a field only when `type` says the message defines it;
 * `lastFor(email, type)` is the typed way to do that.
 */
export type SentMail = { type: MailMessageType } & PasswordResetEmail &
  Partial<
    InvitationEmail &
      EmailChangeConfirmationEmail &
      EmailChangeNotificationEmail &
      SigningInvitationEmail &
      SigningReminderEmail &
      EnvelopeCompletedEmail &
      EnvelopeDeclinedEmail &
      EnvelopeVoidedEmail
  >;

/**
 * The test mail sink. Keeps every message in memory so integration and E2E tests can read
 * a link the way a recipient would, without a real mailbox, and so the dev outbox has
 * something to show on an environment with no mail provider.
 *
 * It extends the console transport rather than reimplementing it, which makes "the sink
 * is a strict superset of the console transport" structural instead of a promise — every
 * message it records is also logged, so it can be the non-production default without
 * costing a developer the clickable URL.
 *
 * **One list, not one array per message type.** The user-management area kept a typed
 * array per kind (`sentInvitations`, `sentEmailChangeConfirmations`, …) and the documents
 * area kept a single list with a discriminator; this is the second, with the first
 * preserved as derived views so every test that reads them keeps reading them. The single
 * list is what `/api/test/mail`, the `/dev` console, and the outbox screen are built on:
 * they ask for "everything, newest first, optionally narrowed", and per-type arrays cannot
 * answer that without knowing every type in advance.
 */
@Injectable()
export class InMemoryMailService extends ConsoleMailService {
  private readonly records: RecordedMail[] = [];
  private failNext = false;

  /**
   * Every message sent, oldest first. See `SentMail` for why it is typed the way it is.
   * Rebuilt on each read; tests are the only caller and they only ever read.
   */
  get sent(): SentMail[] {
    return this.records.map((record) => ({ type: record.type, ...record.message }) as SentMail);
  }

  /* ---------------------------------------------------------------- *
   * Per-type views, kept because the user-management suites read them by name. Derived
   * rather than stored: a second list is a second thing to remember to clear.
   * ---------------------------------------------------------------- */

  get sentInvitations(): InvitationEmail[] {
    return this.messagesOf('invitation');
  }

  get sentEmailChangeConfirmations(): EmailChangeConfirmationEmail[] {
    return this.messagesOf('email_change_confirmation');
  }

  get sentEmailChangeNotifications(): EmailChangeNotificationEmail[] {
    return this.messagesOf('email_change_notification');
  }

  /* ---------------------------------------------------------------- *
   * Sending
   * ---------------------------------------------------------------- */

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    this.record('password_reset', message);
    await super.sendPasswordReset(message);
  }

  async sendInvitation(message: InvitationEmail): Promise<void> {
    this.record('invitation', message);
    await super.sendInvitation(message);
  }

  async sendEmailChangeConfirmation(message: EmailChangeConfirmationEmail): Promise<void> {
    this.record('email_change_confirmation', message);
    await super.sendEmailChangeConfirmation(message);
  }

  async sendEmailChangeNotification(message: EmailChangeNotificationEmail): Promise<void> {
    this.record('email_change_notification', message);
    await super.sendEmailChangeNotification(message);
  }

  async sendSigningInvitation(message: SigningInvitationEmail): Promise<void> {
    this.record('signing_invitation', message);
    await super.sendSigningInvitation(message);
  }

  async sendSigningReminder(message: SigningReminderEmail): Promise<void> {
    this.record('signing_reminder', message);
    await super.sendSigningReminder(message);
  }

  async sendEnvelopeCompleted(message: EnvelopeCompletedEmail): Promise<void> {
    this.record('envelope_completed', message);
    await super.sendEnvelopeCompleted(message);
  }

  async sendEnvelopeDeclined(message: EnvelopeDeclinedEmail): Promise<void> {
    this.record('envelope_declined', message);
    await super.sendEnvelopeDeclined(message);
  }

  async sendEnvelopeVoided(message: EnvelopeVoidedEmail): Promise<void> {
    this.record('envelope_voided', message);
    await super.sendEnvelopeVoided(message);
  }

  /**
   * Arms a single failure, so callers can prove dispatch errors are handled — the
   * password-reset flow swallows them, and requirement 11 rolls the send transaction back
   * on one.
   */
  failNextSend(): void {
    this.failNext = true;
  }

  clear(): void {
    this.records.length = 0;
  }

  /* ---------------------------------------------------------------- *
   * Reading
   * ---------------------------------------------------------------- */

  /**
   * Most recent message for an address — what a test would open.
   *
   * The single-argument form keeps its original meaning, a password reset, so the
   * password-reset tests read exactly as before and still get a `PasswordResetEmail`
   * rather than a union they would have to narrow. The two-argument form is the
   * discriminator every later message needs.
   */
  lastFor(email: string): PasswordResetEmail | undefined;
  lastFor<T extends MailMessageType>(email: string, type: T): MailMessages[T] | undefined;
  lastFor(email: string, type: MailMessageType = 'password_reset'): AnyMailMessage | undefined {
    return this.latestFor(email, type)?.message;
  }

  /** Most recent invitation for an address — what a test, or an admin, would open. */
  lastInvitationFor(email: string): InvitationEmail | undefined {
    return this.lastFor(email, 'invitation');
  }

  /** Most recent email-change confirmation for the NEW address — carries the token. */
  lastEmailChangeConfirmationFor(email: string): EmailChangeConfirmationEmail | undefined {
    return this.lastFor(email, 'email_change_confirmation');
  }

  /** Most recent email-change notification sent to the OLD address. */
  lastEmailChangeNotificationFor(email: string): EmailChangeNotificationEmail | undefined {
    return this.lastFor(email, 'email_change_notification');
  }

  /**
   * The untyped lookup behind `/api/test/mail/latest`. `type` is optional there, because
   * omitting it has always meant "the last thing this address received" and the E2E
   * helper relies on that.
   */
  latestFor(email?: string, type?: MailMessageType): RecordedMail | undefined {
    const wanted = email?.trim().toLowerCase();
    return [...this.records]
      .reverse()
      .find(
        (record) =>
          (type === undefined || record.type === type) &&
          (wanted === undefined || record.message.to.trim().toLowerCase() === wanted),
      );
  }

  /**
   * Every record, newest first, optionally narrowed by address and type.
   *
   * `latestFor` answers "the one message a test wants to open"; the dev outbox needs the
   * whole sink, which is why this exists alongside it rather than as a parameter to it.
   * A copy is returned so a caller cannot mutate the sink by holding the array.
   */
  allRecords(email?: string, type?: MailMessageType): RecordedMail[] {
    const wanted = email?.trim().toLowerCase();
    return [...this.records]
      .reverse()
      .filter(
        (record) =>
          (type === undefined || record.type === type) &&
          (wanted === undefined || record.message.to.trim().toLowerCase() === wanted),
      );
  }

  /** Oldest first, matching the per-type arrays these views replaced. */
  private messagesOf<T extends MailMessageType>(type: T): MailMessages[T][] {
    return this.records
      .filter((record) => record.type === type)
      .map((record) => record.message as MailMessages[T]);
  }

  private record<T extends MailMessageType>(type: T, message: MailMessages[T]): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Simulated mail transport failure');
    }

    this.records.push({ type, message, sentAt: new Date() } as RecordedMail);
  }
}
