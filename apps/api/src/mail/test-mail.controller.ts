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
  latest(@Query('email') email?: string) {
    if (process.env.NODE_ENV === 'production' || !(this.mail instanceof InMemoryMailService)) {
      throw new NotFoundException();
    }

    const message = email ? this.mail.lastFor(email) : this.mail.sent[this.mail.sent.length - 1];
    if (!message) throw new NotFoundException('No message for that address');

    return message;
  }
}
