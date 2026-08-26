import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HIRING_MESSAGES, canManageHiring } from '@devscribed/validation';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';

/**
 * The board is `admin`/`manager` only (05 §Actors), with one wrinkle that is the whole
 * reason this guard exists rather than `HiringManageGuard`.
 *
 * An interviewer who is only a `user` reaches their own candidates through My interviews
 * and the card, never through a board — and their refusal is a **404, not a 403**
 * (TC-H05-INT-06). They are the one caller who could otherwise read a permission error
 * as "the board is there, you are not senior enough", and start asking to be. Everyone
 * else — a `viewer`, a `user` with no assignment — gets the honest 403 the rest of the
 * hiring surface gives: they already know the vacancy exists.
 *
 * The interviewer test is scoped to *this* board's vacancy. The general rule — an
 * interviewer's whole narrowed view of hiring — is `InterviewerScopeGuard` in phase 9,
 * where the full permission matrix is reconciled in one place.
 *
 * Runs after `SessionGuard` and `OrgScopeGuard`, which is what puts `session` on the
 * request and establishes that the URL's organization is the caller's own.
 */
@Injectable()
export class BoardScopeGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = request.session;
    if (!session) throw this.forbidden();

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      select: { role: true, status: true, organizationId: true },
    });

    const member =
      membership?.status === 'active' && membership.organizationId === session.organizationId;
    if (member && canManageHiring(membership!.role)) return true;

    if (member && (await this.interviewsThisBoard(request, session.organizationId))) {
      throw new NotFoundException();
    }
    throw this.forbidden();
  }

  /**
   * Whether the caller is the assigned interviewer on the vacancy this request is about.
   *
   * The two routes name it differently — the board by `vacancyId`, a placement by the
   * `applicationId` whose vacancy it belongs to — so both are resolved to the same
   * question. A path that names neither is not a board route and answers the plain 403.
   */
  private async interviewsThisBoard(
    request: AuthenticatedRequest,
    organizationId: string,
  ): Promise<boolean> {
    const params = request.params as { vacancyId?: string; applicationId?: string };
    const accountId = request.session!.accountId;

    if (params.vacancyId) {
      const count = await this.prisma.vacancy.count({
        where: { id: params.vacancyId, organizationId, interviewerAccountId: accountId },
      });
      return count > 0;
    }

    if (params.applicationId) {
      const count = await this.prisma.application.count({
        where: {
          id: params.applicationId,
          organizationId,
          vacancy: { interviewerAccountId: accountId },
        },
      });
      return count > 0;
    }

    return false;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      error: 'forbidden',
      message: HIRING_MESSAGES.board.forbidden,
    });
  }
}
