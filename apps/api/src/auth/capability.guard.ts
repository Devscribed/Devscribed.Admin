import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TEMPLATE_MESSAGES, hasCapability } from '@devscribed/validation';
import type { Capability } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { REQUIRE_CAPABILITY } from './require-capability.decorator';
import type { AuthenticatedRequest } from './session.guard';

/**
 * The third layer of the guard stack: `SessionGuard` proves who the caller is,
 * `OrgScopeGuard` proves the URL agrees with their session, and this one proves they
 * are allowed to do the thing.
 *
 * The role is read from the membership rather than from the session cookie so a
 * demotion takes effect on the next request instead of on the next sign-in — the same
 * reasoning that makes `SessionGuard` re-read the security stamp.
 *
 * `normalizeRole()` (inside `hasCapability`) is what keeps this correct against both
 * today's free-form `admin`/`member` column and the target enum; see "Role enum debt"
 * in specs/documents/README.md.
 *
 * 403 rather than 404 here, deliberately: the caller has already been proven a member
 * of this organization, so refusing them leaks nothing about what exists inside it.
 * The message is fixed and never names the resource.
 */
@Injectable()
export class CapabilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Capability | undefined>(REQUIRE_CAPABILITY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // An undecorated route is not implicitly public: the guard is only ever applied to
    // controllers that gate every handler, and a missing decorator there is a bug worth
    // failing closed on.
    if (!required) throw this.forbidden();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = request.session;
    if (!session) throw this.forbidden();

    const membership = await this.prisma.membership.findFirst({
      where: {
        accountId: session.accountId,
        organizationId: session.organizationId,
        status: 'active',
      },
      select: { role: true },
    });

    if (!membership || !hasCapability(membership.role, required)) throw this.forbidden();

    return true;
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      error: 'forbidden',
      message: TEMPLATE_MESSAGES.generic.forbidden,
    });
  }
}
