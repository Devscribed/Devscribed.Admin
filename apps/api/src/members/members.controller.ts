import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';

/**
 * Order matters: `SessionGuard` puts the session on the request, `OrgScopeGuard`
 * compares the URL's `:orgId` against it.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class MembersController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `forSubjectPicker=true` (spec 03) widens the list to removed members and flags them,
   * rather than adding a second endpoint that would drift from this one.
   *
   * Requirement 13 is the reason it is a flag and not the default: a contract may
   * legitimately be issued for someone who has just left, so the subject picker must be
   * able to *show* a removed member — but every other caller of this endpoint renders a
   * roster, where a departed colleague appearing among current staff would be a bug. The
   * flag says which of the two questions is being asked.
   *
   * The server does not decide the picker's default selection; it only supplies
   * `isRemoved` so the client can group those entries under "Former members" and leave
   * them unoffered. Filtering them out here would make the requirement unimplementable.
   */
  @Get('members')
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('forSubjectPicker') forSubjectPicker?: string,
  ) {
    const includeRemoved = forSubjectPicker === 'true';

    // Scoped by the session, never by the path parameter — the guard has only
    // established that the two agree.
    const memberships = await this.prisma.membership.findMany({
      // No status filter, in either mode. `status` was never constrained here, so
      // `removed` rows were already visible to every existing caller; the picker view
      // adds the flag, not the rows. Narrowing the default now would be a behaviour
      // change to user-management spec 04's endpoint, which is not this spec's to make.
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
      // Present only for the picker, so no existing response shape changes.
      ...(includeRemoved ? { isRemoved: m.status === 'removed' } : {}),
    }));
  }
}
