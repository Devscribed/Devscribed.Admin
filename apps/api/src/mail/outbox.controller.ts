import { Controller, Get, NotFoundException, Query, Req, UseGuards } from '@nestjs/common';
import { CapabilityGuard } from '../auth/capability.guard';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import { RequireCapability } from '../auth/require-capability.decorator';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { InMemoryMailService } from './in-memory-mail.service';
import { MAIL_MESSAGE_TYPES, MailService } from './mail.service';
import { describeMail, organizationOf } from './outbox-view';

/**
 * The outbox an admin can open in the browser, on any environment where mail is
 * simulated rather than sent.
 *
 * It exists because "send it and see what went out" is the one thing a person testing this
 * product cannot otherwise do: there is no mail provider yet, so the message goes nowhere,
 * and the signing link exists nowhere but inside it. Reading that back through `curl` and
 * a bearer token works and is what the E2E suite does; it is not something to ask a person
 * to do every time they want to click through a signature.
 *
 * **This is not the token-fenced route.** `/api/test/mail` is a fixture: it hands the whole
 * sink to whoever holds a secret, including password-reset links, and it exists for the
 * suite. This one is a screen, and it is fenced the way every other screen in the product
 * is — the ordinary guard stack, nothing bespoke:
 *
 *  - `SessionGuard` — you are signed in, and your account has not been revoked.
 *  - `OrgScopeGuard` — the `orgId` in the path agrees with your session, 404 otherwise.
 *  - `CapabilityGuard` — `ManageEnvelopes`, which is admin and manager. A signing link is
 *    enough to sign *as its recipient*, so this must not be wider than the roles that
 *    already decide who signs: they choose the signers and can void the envelope.
 *
 * And then the rows are filtered to the caller's own organization, so one stand shared by
 * several people does not hand each of them everyone else's signing links. A password
 * reset carries no organization and is therefore never listed here at all — see
 * `organizationOf`.
 *
 * The whole thing disappears with the sink. Under a real transport `MailService` is not an
 * `InMemoryMailService`, every route below answers 404, and the screen in front of it is
 * not drawn — `GET /api/me` says so.
 */
@Controller('api/organizations/:orgId/outbox')
@UseGuards(SessionGuard, OrgScopeGuard, CapabilityGuard)
export class OutboxController {
  constructor(private readonly mail: MailService) {}

  @Get()
  @RequireCapability('ManageEnvelopes')
  list(@Req() req: AuthenticatedRequest, @Query('type') type?: string) {
    // Not "is this production" — whether there is a sink at all. That is the honest
    // condition: it is the same one that decides whether any of this exists to read.
    if (!(this.mail instanceof InMemoryMailService)) throw new NotFoundException();

    // An unrecognized `type` narrows to nothing rather than 404ing: on a list route the
    // honest answer to "show me messages of a type that does not exist" is no messages.
    const wanted = type === undefined ? undefined : MAIL_MESSAGE_TYPES.find((k) => k === type);
    if (type !== undefined && wanted === undefined) return { messages: [] };

    const organizationId = req.session!.organizationId;
    const messages = this.mail
      .allRecords(undefined, wanted)
      .filter((record) => organizationOf(record) === organizationId)
      .map(describeMail);

    return { messages };
  }
}
