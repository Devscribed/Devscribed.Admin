import { Injectable, Logger } from '@nestjs/common';
import { MailService, PasswordResetEmail } from './mail.service';

/**
 * The test mail sink. Keeps every message in memory so integration and E2E tests can
 * read the reset link the way a recipient would, without a real mailbox. It also logs
 * the link, so it is a strict superset of the console transport and can be the
 * non-production default without costing a developer the clickable URL.
 */
@Injectable()
export class InMemoryMailService extends MailService {
  readonly sent: PasswordResetEmail[] = [];
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

  /** Arms a single failure, so callers can prove dispatch errors are swallowed. */
  failNextSend(): void {
    this.failNext = true;
  }

  clear(): void {
    this.sent.length = 0;
  }

  /** Most recent message for an address — what a test would open. */
  lastFor(email: string): PasswordResetEmail | undefined {
    return [...this.sent].reverse().find((m) => m.to === email.trim().toLowerCase());
  }
}
