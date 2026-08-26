import { Controller, Delete, Get, Param, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';
import { MembersService } from './members.service';

/**
 * Order matters: `SessionGuard` puts the session on the request, `OrgScopeGuard`
 * compares the URL's `:orgId` against it.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class MembersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly members: MembersService,
  ) {}

  @Get('members')
  async list(@Req() req: AuthenticatedRequest) {
    // Scoped by the session, never by the path parameter — the guard has only
    // established that the two agree.
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

  /**
   * Soft-delete, per user-management spec 04. Hiring's cross-spec guard lives inside
   * the service: a member who is the assigned interviewer on an open vacancy cannot be
   * removed until those vacancies are reassigned or closed (01 §06.17).
   */
  @Delete('members/:memberId')
  remove(@Req() req: AuthenticatedRequest, @Param('memberId') memberId: string) {
    return this.members.remove(
      req.session!.organizationId,
      req.session!.accountId,
      memberId,
    );
  }
}
