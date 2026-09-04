import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { canBeInterviewer, canManageHiring } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import type { ScopedRequest } from './interviewer-scope.guard';

/**
 * The candidate database, and **who reaches it at all** (03 §07.33).
 *
 * Two callers, one screen. `admin` and `manager` see every candidate the organization
 * holds. An **assigned interviewer** — a `user` who is the interviewer on at least one
 * vacancy — reaches the same screen narrowed to their own candidates, which is what the
 * separate My interviews page used to be. The predicate for the second is the one
 * `MyInterviewsService` and `/api/me` already ask: does this member hold a vacancy?
 *
 * Everyone else is refused with **404 — `403` is never returned here** (TC-H03-INT-06).
 * A `viewer` and a `user` nobody has assigned anything have no route to this screen and
 * no rail row offering it; a permission error would tell them the database is there and
 * invite them to ask to be promoted. The screen simply does not exist for them, and that
 * is what the status says.
 *
 * What the two callers may *see* is not a second question asked later: the guard records
 * it on the request as `hiringScope`, the same shape `InterviewerScopeGuard` puts there,
 * and the service reads `ownVacanciesOnly` to force `scope=mine`. So the scope is settled
 * by the membership lookup that admitted the caller, and no service repeats it.
 *
 * Runs after `SessionGuard` and `OrgScopeGuard`, which is what puts `session` on the
 * request and establishes that the URL's organization is the caller's own.
 */
@Injectable()
export class CandidateDatabaseGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const session = request.session;
    if (!session) throw new NotFoundException();

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      select: { role: true, status: true, organizationId: true },
    });

    const member =
      membership?.status === 'active' && membership.organizationId === session.organizationId;
    if (!member) throw new NotFoundException();

    if (canManageHiring(membership!.role)) {
      request.hiringScope = { ownVacanciesOnly: false };
      return true;
    }

    // A `viewer` may not be assigned an interview at all, so there is no arrangement of
    // rows that would ever earn them this screen.
    if (!canBeInterviewer(membership!.role)) throw new NotFoundException();

    // The assignment, not the bookings. Somebody who holds a vacancy nobody has booked
    // yet has the screen and an empty list; somebody who holds none has no screen —
    // exactly the distinction My interviews drew, kept intact by moving with it.
    const assigned = await this.prisma.vacancy.count({
      where: { organizationId: session.organizationId, interviewerAccountId: session.accountId },
    });
    if (assigned === 0) throw new NotFoundException();

    request.hiringScope = { ownVacanciesOnly: true };
    return true;
  }
}
