import { SetMetadata } from '@nestjs/common';

export const ALLOW_CLIENT_PRINCIPAL = 'allowClientPrincipal';

/**
 * Requests spec 03 REQ-03-019 — the opt-in that lets a client principal reach one
 * organization route. Read by `OrgScopeGuard`, which answers a client principal 404 on
 * every handler that does not carry it.
 *
 * Opt-in rather than opt-out: a route added later is refused by default, which is the
 * only way the rule survives code that has not been written yet.
 */
export const AllowClientPrincipal = () => SetMetadata(ALLOW_CLIENT_PRINCIPAL, true);
