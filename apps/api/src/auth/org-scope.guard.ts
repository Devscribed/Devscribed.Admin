import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_CLIENT_PRINCIPAL } from './allow-client-principal.decorator';
import type { AuthenticatedRequest } from './session.guard';

/**
 * Guards routes that carry `:orgId` in the path. The parameter exists so URLs are
 * addressable and match the specs — it is never a selector. Data is still scoped by
 * `session.organizationId`; this only refuses requests whose URL disagrees with the
 * session, so a guessed id can never widen what the caller sees.
 *
 * Runs after `SessionGuard`, which is what puts `session` and `principal` on the request.
 *
 * 404 rather than 403: an organization the caller has no part in should be
 * indistinguishable from one that does not exist.
 *
 * Requests spec 03 REQ-03-019 adds the second refusal, at the one choke point every
 * `api/organizations/:orgId` controller already shares: a client principal is answered
 * the same bare 404 on every organization route except the handful that opt in with
 * `@AllowClientPrincipal()`. Opt-in, so a route added later is refused by default.
 */
@Injectable()
export class OrgScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const orgId = request.params?.orgId;

    if (!request.session || orgId !== request.session.organizationId) {
      throw new NotFoundException();
    }

    if (request.principal?.kind === 'client') {
      const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
        ALLOW_CLIENT_PRINCIPAL,
        [context.getHandler(), context.getClass()],
      );
      if (allowed !== true) throw new NotFoundException();
    }

    return true;
  }
}
