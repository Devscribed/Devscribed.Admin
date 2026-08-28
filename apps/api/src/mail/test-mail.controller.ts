import { Controller, Get, Headers, NotFoundException, Query } from '@nestjs/common';
import { assertFixturesOpen } from '../test-support/fixture-gate';
import { InMemoryMailService } from './in-memory-mail.service';
import { describeMail } from './outbox-view';
import { MAIL_MESSAGE_TYPES, MailMessageType, MailService } from './mail.service';

/**
 * TEST-SUPPORT ROUTE — not part of the product.
 *
 * The `list` route below exists only because mail without a provider goes to an in-memory
 * sink, so a second signer's magic link has nowhere to be read. **A real mail transport
 * retires it**: once messages land in an actual mailbox, this route is dead weight and
 * should be deleted with the sink.
 *
 * A person reading simulated mail wants the Outbox screen, not this: it is org-scoped,
 * needs no token, and shows the same rows. This is what a *program* reads — the E2E suite,
 * which has no session and needs every organization's mail.
 *
 * Lets an E2E run read a link the way a recipient would, without a mailbox.
 *
 * This endpoint hands out live reset and signing tokens, so it is fenced hard:
 *
 *  1. It answers only when the sink transport is actually in use. Under a real transport
 *     there is nothing to read and the route does not exist.
 *  2. Then `assertFixturesOpen` — the same environment fence every test-support route
 *     uses. Read the comment at the top of `test-support/fixture-gate.ts`.
 *
 * It takes no third gate, unlike the fixtures that write. Those require a session that
 * already administers the organization being changed; this one cannot, because the whole
 * reason it exists is to be read on behalf of a **signer**, who has no session at all and
 * belongs to no organization. The token is therefore the only thing standing in front of
 * it, and anyone holding it can read every signing link the environment has issued.
 * `prod` creates no token, so the route is shut there and no other variable can open it.
 */
@Controller('api/test/mail')
export class TestMailController {
  constructor(private readonly mail: MailService) {}

  /**
   * The sink, if every gate above is satisfied; otherwise 404. One method rather than a
   * repeated condition, because the two routes must never drift apart — one of them
   * staying open by accident is the whole risk. It *returns* the sink rather than merely
   * asserting, so the narrowing survives into the caller.
   */
  private readableSink(authorization?: string): InMemoryMailService {
    if (!(this.mail instanceof InMemoryMailService)) throw new NotFoundException();
    // The environment fence, shared with every other test-support route so that opening
    // one of them can never quietly open a different one on a different rule.
    assertFixturesOpen(authorization);
    return this.mail;
  }

  /**
   * The whole sink, newest first — what the `/dev` outbox renders.
   *
   * Deliberately a sibling of `latest` rather than a mode of it: `latest` 404s when it
   * finds nothing, because a test asking for "the link" and getting none has failed. A
   * list that is empty is not a failure, it is an outbox nobody has written to yet, so
   * this route answers `[]`. Same two fences as `latest`, for the same reason — it hands
   * out live signing and reset tokens.
   */
  @Get()
  list(
    @Query('email') email?: string,
    @Query('type') type?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const sink = this.readableSink(authorization);

    // An unrecognized `type` narrows to nothing rather than 404ing: on a list route the
    // honest answer to "show me messages of a type that does not exist" is no messages.
    const wanted = type === undefined ? undefined : MAIL_MESSAGE_TYPES.find((k) => k === type);
    if (type !== undefined && wanted === undefined) return [];

    return sink.allRecords(email, wanted).map(describeMail);
  }

  @Get('latest')
  latest(
    @Query('email') email?: string,
    @Query('type') type?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const sink = this.readableSink(authorization);

    // Omitting `type` still means "the last thing this address received", which is what
    // the pre-existing password-reset helper relies on. Naming a type is what documents
    // spec 02 needs: an envelope run produces an invitation, a reminder, and a completion
    // notice to the same address, and a test has to be able to ask for one of them.
    const wanted = type === undefined ? undefined : parseMessageType(type);

    const record = sink.latestFor(email, wanted);
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
