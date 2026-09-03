import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { InMemoryMailService } from '../mail/in-memory-mail.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';

/**
 * Deliberately outside the `/organizations/:orgId` prefix: this is the endpoint that
 * *answers* which organization the caller belongs to, so it cannot be scoped by one.
 */
@Controller('api')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * The signed-in account plus its organization — what the app shell renders.
   *
   * Requests spec 03 REQ-03-005 gives both principals one shape: `principal` is always
   * present, `client` is null for a member of staff and `role` is null for a client
   * contact, so the shell branches on a value that is always there. The branch is taken
   * on the principal `SessionGuard` resolved, never on which rows happen to exist.
   */
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const features = { mailOutbox: this.mail instanceof InMemoryMailService };

    if (req.principal?.kind === 'client') {
      const contact = await this.prisma.clientMembership.findUnique({
        where: { id: req.principal.clientMembershipId },
        include: { account: true, organization: true, client: true },
      });
      if (!contact) return null;
      return {
        account: this.accountOf(contact.account),
        organization: { id: contact.organization.id, name: contact.organization.name },
        // A client contact holds no role, and no value of `Membership.role` produces
        // their rights: those come from the principal kind (REQ-03-016).
        role: null,
        principal: 'client' as const,
        client: { id: contact.client.id, name: contact.client.name },
        features,
      };
    }

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: req.session!.accountId },
      include: { account: true, organization: true },
    });
    if (!membership) return null;
    return {
      account: this.accountOf(membership.account),
      organization: { id: membership.organization.id, name: membership.organization.name },
      role: membership.role,
      principal: 'member' as const,
      client: null,
      /**
       * What this environment can do that the product does not otherwise promise. The
       * outbox screen only exists where mail is simulated, and the repository rule is that
       * a control the caller cannot use is never drawn — so the shell has to be told,
       * rather than render the entry and let the route 404 behind it.
       *
       * A capability check does not belong here: the sidebar already gates on the role it
       * holds. This answers the other half — whether there is anything to gate.
       */
      features,
    };
  }

  private accountOf(account: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    timezone: string | null;
    firstDayOfWeek: string;
  }) {
    return {
      id: account.id,
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      timezone: account.timezone,
      // Spec 06 preference — drives the week start for the spec-12 calendar/weekly views.
      firstDayOfWeek: account.firstDayOfWeek,
    };
  }
}
