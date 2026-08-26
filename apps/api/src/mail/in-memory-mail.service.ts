import { Injectable, Logger } from '@nestjs/common';
import { InvitationEmail, MailService, PasswordResetEmail } from './mail.service';

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

  /** Arms a single failure, so callers can prove dispatch errors are swallowed. */
  failNextSend(): void {
    this.failNext = true;
  }

  clear(): void {
    this.sent.length = 0;
    this.sentInvitations.length = 0;
  }

  /** Most recent password-reset message for an address — what a test would open. */
  lastFor(email: string): PasswordResetEmail | undefined {
    return [...this.sent].reverse().find((m) => m.to === email.trim().toLowerCase());
  }

  /** Most recent invitation message for an address — what a test would open. */
  lastInvitationFor(email: string): InvitationEmail | undefined {
    return [...this.sentInvitations].reverse().find((m) => m.to === email.trim().toLowerCase());
  }
}
