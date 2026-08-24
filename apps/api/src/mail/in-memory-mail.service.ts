import { Injectable } from '@nestjs/common';
import { ConsoleMailService } from './console-mail.service';
import {
  AnyMailMessage,
  EnvelopeCompletedEmail,
  EnvelopeDeclinedEmail,
  EnvelopeVoidedEmail,
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
}

/**
 * The compatibility view returned by `sent`.
 *
 * It is the password-reset shape intersected with every other message's fields made
 * optional, rather than a discriminated union, for one concrete reason: the
 * password-reset tests predate the signing messages and read `mail.sent[0].token`
 * directly. A union would stop those compiling, and the area README is explicit that no
 * existing test should need editing for this change. Read a field only when `type` says
 * the message defines it; `lastFor(email, type)` is the typed way to do that.
 */
export type SentMail = { type: MailMessageType } & PasswordResetEmail &
  Partial<
    SigningInvitationEmail &
      SigningReminderEmail &
      EnvelopeCompletedEmail &
      EnvelopeDeclinedEmail &
      EnvelopeVoidedEmail
  >;

/**
 * The test mail sink. Keeps every message in memory so integration and E2E tests can read
 * a link the way a recipient would, without a real mailbox.
 *
 * It extends the console transport rather than reimplementing it, which makes "the sink
 * is a strict superset of the console transport" structural instead of a promise — every
 * message it records is also logged, so it can be the non-production default without
 * costing a developer the clickable URL.
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

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    this.record('password_reset', message);
    await super.sendPasswordReset(message);
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

  /**
   * Most recent message for an address — what a test would open.
   *
   * The single-argument form keeps its original meaning, a password reset, so the
   * password-reset tests read exactly as before and still get a `PasswordResetEmail`
   * rather than a union they would have to narrow. The two-argument form is the
   * discriminator the signing tests need.
   */
  lastFor(email: string): PasswordResetEmail | undefined;
  lastFor<T extends MailMessageType>(email: string, type: T): MailMessages[T] | undefined;
  lastFor(email: string, type: MailMessageType = 'password_reset'): AnyMailMessage | undefined {
    return this.latestFor(email, type)?.message;
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

  private record<T extends MailMessageType>(type: T, message: MailMessages[T]): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Simulated mail transport failure');
    }

    this.records.push({ type, message } as RecordedMail);
  }
}
