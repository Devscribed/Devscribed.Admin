import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { canManageHiring } from '@devscribed/validation';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';

/**
 * The candidate database is `admin`/`manager` only, and refuses everyone else with
 * **404 — `403` is never returned here** (03 §API, TC-H03-INT-06).
 *
 * It is the one hiring surface where the honest 403 the vacancy endpoints give would be
 * the wrong answer for all three refused callers rather than one. A `viewer` and an
 * unassigned `user` have no route to this screen and no sidebar row offering it, and an
 * assigned interviewer — who *does* reach candidates, their own, through My interviews —
 * would read "you do not have permission" as "the database is there, ask to be promoted".
 * The screen simply does not exist for any of them, and that is what the status says.
 *
 * The card's own guard is still `HiringManageGuard`: it answers a different question —
 * may this member manage candidates at all — and the interviewer's narrower view of one
 * card arrives with `InterviewerScopeGuard` in its own phase, where the whole permission
 * matrix is reconciled at once.
 *
 * Runs after `SessionGuard` and `OrgScopeGuard`, which is what puts `session` on the
 * request and establishes that the URL's organization is the caller's own.
 */
@Injectable()
export class CandidateDatabaseGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const session = context.switchToHttp().getRequest<AuthenticatedRequest>().session;
    if (!session) throw new NotFoundException();

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      select: { role: true, status: true, organizationId: true },
    });

    const permitted =
      membership?.status === 'active' &&
      membership.organizationId === session.organizationId &&
      canManageHiring(membership.role);

    if (!permitted) throw new NotFoundException();
    return true;
  }
}
