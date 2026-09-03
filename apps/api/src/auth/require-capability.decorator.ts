import { SetMetadata } from '@nestjs/common';
import type { Capability } from '@devscribed/validation';

export const REQUIRE_CAPABILITY = 'requireCapability';

/**
 * Declares which capability a route needs. The capability, not the role, is what a
 * handler names — so the permission matrix can move (and the role enum can migrate)
 * without touching a single controller.
 *
 * Read by `CapabilityGuard`, which must be listed after `SessionGuard` and
 * `OrgScopeGuard`.
 */
export const RequireCapability = (capability: Capability) =>
  SetMetadata(REQUIRE_CAPABILITY, capability);
