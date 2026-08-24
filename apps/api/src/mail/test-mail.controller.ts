import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { InMemoryMailService } from './in-memory-mail.service';
import { MAIL_MESSAGE_TYPES, MailMessageType, MailService } from './mail.service';

/**
 * Lets an E2E run read a link the way a recipient would, without a mailbox.
 *
 * This endpoint hands out live reset and signing tokens, so it is fenced twice: it only
 * answers when the sink transport is actually in use, and never when NODE_ENV is
 * production. A real deployment uses a real transport, so both gates are shut.
 */
@Controller('api/test/mail')
export class TestMailController {
  constructor(private readonly mail: MailService) {}

  @Get('latest')
  latest(@Query('email') email?: string, @Query('type') type?: string) {
    if (process.env.NODE_ENV === 'production' || !(this.mail instanceof InMemoryMailService)) {
      throw new NotFoundException();
    }

    // Omitting `type` still means "the last thing this address received", which is what
    // the pre-existing password-reset helper relies on. Naming a type is what documents
    // spec 02 needs: an envelope run produces an invitation, a reminder, and a completion
    // notice to the same address, and a test has to be able to ask for one of them.
    const wanted = type === undefined ? undefined : parseMessageType(type);

    const record = this.mail.latestFor(email, wanted);
    if (!record) throw new NotFoundException('No message for that address');

    // The discriminator is part of the response so a test can assert on it rather than
    // inferring the type from which fields happen to be present.
    return { type: record.type, ...record.message };
  }
}

function parseMessageType(value: string): MailMessageType {
  const match = MAIL_MESSAGE_TYPES.find((known) => known === value);
  // 404 rather than 400: an unknown type and a type nothing was sent for are the same
  // answer to the caller, and this route never explains itself in more detail than that.
  if (!match) throw new NotFoundException('No message for that address');

  return match;
}
