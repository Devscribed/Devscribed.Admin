import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { MemberProfileService } from './member-profile.service';

/**
 * Raw request body. As everywhere else in this codebase the DTO says what the wire may
 * carry, never what is legal: every rule and every message lives in
 * `@devscribed/validation`.
 *
 * Every property is `unknown` on purpose. `undefined` means "omitted, leave unchanged"
 * and `null` means "clear", and the two must survive as far as the service — a typed
 * `string | null` here would make an omitted key indistinguishable from a cleared one.
 */
export interface UpdateMemberProfileDto {
  addressLine?: unknown;
  city?: unknown;
  postalCode?: unknown;
  country?: unknown;
  taxId?: unknown;
  dateOfBirth?: unknown;
  idDocumentNumber?: unknown;
  bankDetails?: unknown;
}

/**
 * Contract details (spec 03, requirements 14-23).
 *
 * **`CapabilityGuard` is deliberately absent from this stack**, and that is the whole
 * authorization design in one line. The permission matrix has a "user (own)" column: a
 * member reads and edits their own contract details while holding a role whose capability
 * list is empty. A guard keyed on `ViewMemberProfile` would 403 that caller before the
 * handler ever learned whose profile was being asked for — the identity half of the rule
 * is only answerable once the URL's `:memberId` and the session are both in hand.
 *
 * So the check lives one layer in, in `MemberProfileService`, where
 * `canReadProfile(role, isSelf)` composes the role table with that comparison. Session and
 * org scope are still guards, because neither depends on the resource.
 */
@Controller('api/organizations/:orgId/members/:memberId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class MemberProfileController {
  constructor(private readonly profiles: MemberProfileService) {}

  @Get('profile')
  get(@Req() req: AuthenticatedRequest, @Param('memberId') memberId: string) {
    return this.profiles.get(req.session!, memberId);
  }

  @Put('profile')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberProfileDto,
  ) {
    return this.profiles.update(req.session!, memberId, dto);
  }
}
