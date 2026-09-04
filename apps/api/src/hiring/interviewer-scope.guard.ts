import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { canBeInterviewer, canManageHiring } from '@devscribed/validation';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';

/**
 * How wide the caller's view of the record is, decided once by the guard so no service
 * repeats the membership lookup that decided it.
 */
export interface HiringScope {
  /**
   * True for a `user` who reaches this candidate only as an assigned interviewer. The
   * card then answers with **their** applications alone — the other vacancy's sections
   * are absent from the response, not hidden in the UI (04 §01.2).
   */
  ownVacanciesOnly: boolean;
}

export type ScopedRequest = AuthenticatedRequest & { hiringScope?: HiringScope };

/**
 * The candidate-scoped surface: the card, its writes, its criteria, and its CV.
 *
 * It enforces the one non-uniform permission in the whole product (hiring README,
 * permission matrix). `admin` and `manager` reach every candidate in their organization.
 * A `user` reaches a candidate **only** through an assignment — they are the interviewer
 * on at least one of that candidate's applications — and reaches nothing else. `viewer`
 * reaches nothing at all.
 *
 * **It answers 404, never 403** (04 §01.4). Not because the caller could not be told, but
 * because the alternative leaks: a 403 on `…/candidates/{id}` confirms that the id names
 * a real candidate in this organization, which is precisely what someone walking ids
 * would be trying to learn. Every refusal on this surface therefore looks identical —
 * a `viewer`, a `user` with no assignment, an interviewer reaching for somebody else's
 * vacancy, and an id from another organization all get the same answer.
 *
 * The routes name their record two ways: the card by `:candidateId`, its writes by the
 * `:applicationId` they belong to. Both resolve to the same question — is the caller the
 * assigned interviewer here — asked against the row itself, so an interviewer patching
 * another vacancy's application by id is refused by the guard rather than by the service
 * (TC-H04-INT-01).
 *
 * Runs after `SessionGuard` and `OrgScopeGuard`, which is what puts `session` on the
 * request and establishes that the URL's organization is the caller's own.
 */
@Injectable()
export class InterviewerScopeGuard implements CanActivate {
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

    // A `viewer` may not even be assigned an interview, so there is no record on this
    // surface they could ever be entitled to.
    if (!canBeInterviewer(membership!.role)) throw new NotFoundException();

    if (!(await this.interviewsThisRecord(request, session.organizationId))) {
      throw new NotFoundException();
    }

    request.hiringScope = { ownVacanciesOnly: true };
    return true;
  }

  /**
   * Whether the caller is the assigned interviewer on the record this request names.
   *
   * A path that names neither a candidate nor an application is not part of this surface
   * and is refused rather than admitted by default — a new route added under one of these
   * prefixes must decide for itself, not inherit an accidental yes.
   */
  private async interviewsThisRecord(
    request: ScopedRequest,
    organizationId: string,
  ): Promise<boolean> {
    const params = request.params as { candidateId?: string; applicationId?: string };
    const interviewer = { vacancy: { interviewerAccountId: request.session!.accountId } };

    if (params.candidateId) {
      // Any one of that candidate's applications is enough to open the card; which
      // sections it then holds is the scope the service applies.
      const count = await this.prisma.application.count({
        where: { candidateId: params.candidateId, organizationId, ...interviewer },
      });
      return count > 0;
    }

    if (params.applicationId) {
      const count = await this.prisma.application.count({
        where: { id: params.applicationId, organizationId, ...interviewer },
      });
      return count > 0;
    }

    return false;
  }
}
