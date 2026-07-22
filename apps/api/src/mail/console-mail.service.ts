import { Injectable, Logger } from '@nestjs/common';
import { MailService, PasswordResetEmail } from './mail.service';

/**
 * Development transport. Spec 02 puts the real sender out of scope, so until one
 * lands the link goes to the log where a developer can click it.
 */
@Injectable()
export class ConsoleMailService extends MailService {
  private readonly logger = new Logger(ConsoleMailService.name);

  async sendPasswordReset(message: PasswordResetEmail): Promise<void> {
    this.logger.log(`Password reset for ${message.to}: ${message.resetUrl}`);
  }
}
