import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { normalizeEmail } from '@devscribed/shared';
import { OutgoingEmail, SentEmail } from './email.types';

/**
 * Sends transactional emails. This implementation captures messages in memory
 * (the "test mail sink" the specs reference) and logs them — a real SMTP
 * transport can replace it later without changing callers. Captured messages are
 * readable via the dev endpoint ({@link DevMailController}) for E2E and directly
 * via `getLastTo` for integration tests.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly sent: SentEmail[] = [];

  send(message: OutgoingEmail): Promise<void> {
    const email: SentEmail = {
      ...message,
      to: normalizeEmail(message.to),
      id: randomUUID(),
      sentAt: new Date().toISOString(),
    };
    this.sent.push(email);
    this.logger.log(`Email captured -> to=${email.to} subject="${email.subject}"`);
    return Promise.resolve();
  }

  /** The most recent email sent to `to`, if any. */
  getLastTo(to: string): SentEmail | undefined {
    const target = normalizeEmail(to);
    return [...this.sent].reverse().find((email) => email.to === target);
  }

  /** All captured emails (most recent last). */
  getAll(): readonly SentEmail[] {
    return this.sent;
  }

  /** Discard all captured emails (used to isolate tests). */
  clear(): void {
    this.sent.length = 0;
  }
}
