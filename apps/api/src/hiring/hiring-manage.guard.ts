import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { HIRING_MESSAGES, canManageHiring } from '@devscribed/validation';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';

/**
 * Vacancies, boards, the candidate database and both libraries are `admin`/`manager`
 * only (hiring README, permission matrix). This guard ships with every hiring phase
 * rather than being retrofitted once — a permission added late is a permission that
 * was missing in production.
 *
 * 403, not 404: unlike `OrgScopeGuard` and the interviewer scope, there is nothing to
 * conceal here. The caller is a member of this organization and already knows it
 * exists; refusing loudly is the honest answer and is what the spec's contract states.
 *
 * Runs after `SessionGuard` and `OrgScopeGuard`, which is what puts `session` on the
 * request and establishes that the URL's organization is the caller's own.
 */
@Injectable()
export class HiringManageGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = request.session;
    if (!session) throw this.forbidden();

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      select: { role: true, status: true, organizationId: true },
    });

    const permitted =
      membership?.status === 'active' &&
      membership.organizationId === session.organizationId &&
      canManageHiring(membership.role);

    if (!permitted) throw this.forbidden();
    return true;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      error: 'forbidden',
      message: HIRING_MESSAGES.vacancy.forbidden,
    });
  }
}
