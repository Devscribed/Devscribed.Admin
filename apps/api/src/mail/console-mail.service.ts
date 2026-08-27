import { Injectable, Logger } from '@nestjs/common';
import {
  EmailChangeConfirmationEmail,
  EmailChangeNotificationEmail,
  InvitationEmail,
  MailService,
  PasswordResetEmail,
} from './mail.service';

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

  async sendInvitation(message: InvitationEmail): Promise<void> {
    this.logger.log(
      `Invitation to join ${message.organizationName} as ${message.role} for ${message.to}: ${message.acceptUrl}`,
    );
  }

  async sendEmailChangeConfirmation(message: EmailChangeConfirmationEmail): Promise<void> {
    this.logger.log(`Email change confirmation for ${message.to}: ${message.confirmUrl}`);
  }

  async sendEmailChangeNotification(message: EmailChangeNotificationEmail): Promise<void> {
    this.logger.log(`Email change notification for ${message.to}`);
  }
}
