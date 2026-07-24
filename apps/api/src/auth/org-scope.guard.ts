import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthenticatedRequest } from './session.guard';

/**
 * Guards routes that carry `:orgId` in the path. The parameter exists so URLs are
 * addressable and match the specs — it is never a selector. Data is still scoped by
 * `session.organizationId`; this only refuses requests whose URL disagrees with the
 * session, so a guessed id can never widen what the caller sees.
 *
 * Runs after `SessionGuard`, which is what puts `session` on the request.
 *
 * 404 rather than 403: an organization the caller has no part in should be
 * indistinguishable from one that does not exist.
 */
@Injectable()
export class OrgScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const orgId = request.params?.orgId;

    if (!request.session || orgId !== request.session.organizationId) {
      throw new NotFoundException();
    }

    return true;
  }
}
