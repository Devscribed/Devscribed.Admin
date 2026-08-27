import { Injectable, Logger } from '@nestjs/common';
import {
  EmailChangeConfirmationEmail,
  EmailChangeNotificationEmail,
  InvitationEmail,
  MailService,
  PasswordResetEmail,
} from './mail.service';

/**
 * The test mail sink. Keeps every message in memory so integration and E2E tests can
 * read the reset link the way a recipient would, without a real mailbox. It also logs
 * the link, so it is a strict superset of the console transport and can be the
 * non-production default without costing a developer the clickable URL.
 */
@Injectable()
export class InMemoryMailService extends MailService {
  readonly sent: PasswordResetEmail[] = [];
  readonly sentInvitations: InvitationEmail[] = [];
  readonly sentEmailChangeConfirmations: EmailChangeConfirmationEmail[] = [];
  readonly sentEmailChangeNotifications: EmailChangeNotificationEmail[] = [];
  private readonly logger = new Logger(InMemoryMailService.name);
  private failNext = false;

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Simulated mail transport failure');
    }
    this.sent.push(message);
    this.logger.log(`Password reset for ${message.to}: ${message.resetUrl}`);
  }

  async sendInvitation(message: InvitationEmail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Simulated mail transport failure');
    }
    this.sentInvitations.push(message);
    this.logger.log(
      `Invitation to join ${message.organizationName} as ${message.role} for ${message.to}: ${message.acceptUrl}`,
    );
  }

  async sendEmailChangeConfirmation(message: EmailChangeConfirmationEmail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Simulated mail transport failure');
    }
    this.sentEmailChangeConfirmations.push(message);
    this.logger.log(`Email change confirmation for ${message.to}: ${message.confirmUrl}`);
  }

  async sendEmailChangeNotification(message: EmailChangeNotificationEmail): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Simulated mail transport failure');
    }
    this.sentEmailChangeNotifications.push(message);
    this.logger.log(`Email change notification for ${message.to}`);
  }

  /** Arms a single failure, so callers can prove dispatch errors are swallowed. */
  failNextSend(): void {
    this.failNext = true;
  }

  clear(): void {
    this.sent.length = 0;
    this.sentInvitations.length = 0;
    this.sentEmailChangeConfirmations.length = 0;
    this.sentEmailChangeNotifications.length = 0;
  }

  /** Most recent password-reset message for an address — what a test would open. */
  lastFor(email: string): PasswordResetEmail | undefined {
    return [...this.sent].reverse().find((m) => m.to === email.trim().toLowerCase());
  }

  /** Most recent invitation message for an address — what a test would open. */
  lastInvitationFor(email: string): InvitationEmail | undefined {
    return [...this.sentInvitations].reverse().find((m) => m.to === email.trim().toLowerCase());
  }

  /** Most recent email-change confirmation for the NEW address — carries the token. */
  lastEmailChangeConfirmationFor(email: string): EmailChangeConfirmationEmail | undefined {
    return [...this.sentEmailChangeConfirmations]
      .reverse()
      .find((m) => m.to === email.trim().toLowerCase());
  }

  /** Most recent email-change notification sent to the OLD address. */
  lastEmailChangeNotificationFor(email: string): EmailChangeNotificationEmail | undefined {
    return [...this.sentEmailChangeNotifications]
      .reverse()
      .find((m) => m.to === email.trim().toLowerCase());
  }
}
