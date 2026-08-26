import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';

/**
 * Deliberately outside the `/organizations/:orgId` prefix: this is the endpoint that
 * *answers* which organization the caller belongs to, so it cannot be scoped by one.
 */
@Controller('api')
@UseGuards(SessionGuard)
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  /** The signed-in account plus its organization — what the app shell renders. */
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: req.session!.accountId },
      include: { account: true, organization: true },
    });
    if (!membership) return null;

    /**
     * The one navigation predicate that is not a role (hiring 03 §06.31): My interviews
     * belongs to whoever has been **assigned** an interview, which is a fact about rows
     * and not about a membership column.
     *
     * It rides on `/api/me` rather than being fetched by the sidebar because the shell
     * already blocks on this response before it renders anything — which is exactly what
     * stops a gated row flashing into view and back out. Any vacancy counts, closed ones
     * included: a closed vacancy keeps its past interviews, and losing the screen would
     * lose the only route an interviewer has to those cards.
     */
    const assignedInterviews = await this.prisma.vacancy.count({
      where: {
        organizationId: membership.organizationId,
        interviewerAccountId: membership.accountId,
      },
    });

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
      isInterviewer: assignedInterviews > 0,
    };
  }
}
