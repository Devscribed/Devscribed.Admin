import { Injectable, Logger } from '@nestjs/common';
import {
  EnvelopeCompletedEmail,
  EnvelopeDeclinedEmail,
  EnvelopeVoidedEmail,
  MailService,
  PasswordResetEmail,
  SigningInvitationEmail,
  SigningReminderEmail,
} from './mail.service';

/**
 * Development transport. Nothing leaves the process: every message goes to the log where
 * a developer can read it and click the link.
 *
 * It stays alongside the in-memory sink rather than being replaced by it because the two
 * answer different questions — the sink is what a test reads, the console is what a
 * developer reads when they have deliberately turned recording off.
 */
@Injectable()
export class ConsoleMailService extends MailService {
  // `this.constructor.name` so the in-memory sink, which extends this class to inherit
  // the logging, still logs under its own name.
  protected readonly logger = new Logger(this.constructor.name);

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    this.logger.log(`Password reset for ${message.to}: ${message.resetUrl}`);
  }

  async sendSigningInvitation(message: SigningInvitationEmail): Promise<void> {
    this.logger.log(
      `Signing invitation for ${message.to} — "${message.envelopeTitle}": ${message.signingUrl}`,
    );
  }

  async sendSigningReminder(message: SigningReminderEmail): Promise<void> {
    this.logger.log(
      `Signing reminder #${message.reminderNumber} for ${message.to} — ` +
        `"${message.envelopeTitle}": ${message.signingUrl}`,
    );
  }

  async sendEnvelopeCompleted(message: EnvelopeCompletedEmail): Promise<void> {
    this.logger.log(
      `Completion notice for ${message.to} — "${message.envelopeTitle}": ${message.downloadUrl}`,
    );
  }

  async sendEnvelopeDeclined(message: EnvelopeDeclinedEmail): Promise<void> {
    this.logger.log(
      `Decline notice for ${message.to} — "${message.envelopeTitle}" declined by ` +
        `${message.declinedByName}: ${message.declineReason || '(no reason given)'}`,
    );
  }

  async sendEnvelopeVoided(message: EnvelopeVoidedEmail): Promise<void> {
    this.logger.log(
      `Void notice for ${message.to} — "${message.envelopeTitle}" voided by ` +
        `${message.voidedByName}: ${message.voidReason}`,
    );
  }
}
