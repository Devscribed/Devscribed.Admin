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

  /** The signed-in account plus its organization — what the app shell renders. */
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: req.session!.accountId },
      include: { account: true, organization: true },
    });
    if (!membership) return null;
    return {
      account: {
        id: membership.account.id,
        email: membership.account.email,
        firstName: membership.account.firstName,
        lastName: membership.account.lastName,
        timezone: membership.account.timezone,
      },
      organization: { id: membership.organization.id, name: membership.organization.name },
      role: membership.role,
      /**
       * What this environment can do that the product does not otherwise promise. The
       * outbox screen only exists where mail is simulated, and the repository rule is that
       * a control the caller cannot use is never drawn — so the shell has to be told,
       * rather than render the entry and let the route 404 behind it.
       *
       * A capability check does not belong here: the sidebar already gates on the role it
       * holds. This answers the other half — whether there is anything to gate.
       */
      features: { mailOutbox: this.mail instanceof InMemoryMailService },
    };
  }
}
