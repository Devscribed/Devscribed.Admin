import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';

@Controller('api')
@UseGuards(SessionGuard)
export class MembersController {
  constructor(private readonly prisma: PrismaService) {}

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
    };
  }

  @Get('members')
  async list(@Req() req: AuthenticatedRequest) {
    const memberships = await this.prisma.membership.findMany({
      where: { organizationId: req.session!.organizationId },
      include: { account: true },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.id,
      accountId: m.accountId,
      firstName: m.account.firstName,
      lastName: m.account.lastName,
      name: `${m.account.firstName} ${m.account.lastName}`,
      email: m.account.email,
      role: m.role,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }
}
