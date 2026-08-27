import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { InMemoryMailService } from './in-memory-mail.service';
import { MailService } from './mail.service';

/**
 * Lets an E2E run read the reset link the way a recipient would, without a mailbox.
 *
 * This endpoint hands out live reset tokens, so it is fenced twice: it only answers
 * when the sink transport is actually in use, and never when NODE_ENV is production.
 * A real deployment uses a real transport, so both gates are shut.
 */
@Controller('api/test/mail')
export class TestMailController {
  constructor(private readonly mail: MailService) {}

  @Get('latest')
  latest(@Query('email') email?: string, @Query('type') type?: string) {
    if (process.env.NODE_ENV === 'production' || !(this.mail instanceof InMemoryMailService)) {
      throw new NotFoundException();
    }

    if (type === 'invitation') {
      const invitation = email
        ? this.mail.lastInvitationFor(email)
        : this.mail.sentInvitations[this.mail.sentInvitations.length - 1];
      if (!invitation) throw new NotFoundException('No message for that address');
      return invitation;
    }

    if (type === 'email-change-confirmation') {
      const list = this.mail.sentEmailChangeConfirmations;
      const confirmation = email ? this.mail.lastEmailChangeConfirmationFor(email) : list[list.length - 1];
      if (!confirmation) throw new NotFoundException('No message for that address');
      return confirmation;
    }

    if (type === 'email-change-notification') {
      const list = this.mail.sentEmailChangeNotifications;
      const notification = email ? this.mail.lastEmailChangeNotificationFor(email) : list[list.length - 1];
      if (!notification) throw new NotFoundException('No message for that address');
      return notification;
    }

    const message = email ? this.mail.lastFor(email) : this.mail.sent[this.mail.sent.length - 1];
    if (!message) throw new NotFoundException('No message for that address');

    return message;
  }
}
