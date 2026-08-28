import { Body, Controller, Get, HttpCode, Put, Req, UseGuards } from '@nestjs/common';
import { CapabilityGuard } from '../auth/capability.guard';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import { RequireCapability } from '../auth/require-capability.decorator';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type { UpdateSigningSettingsDto } from './signing-settings.dto';
import { SigningSettingsService } from './signing-settings.service';

/**
 * The product's first organization-settings surface.
 *
 * The ordinary three-layer guard stack, unchanged and not re-implemented: `SessionGuard`
 * establishes who, `OrgScopeGuard` refuses a URL that disagrees with the session **with a
 * 404 rather than a 403** — an organization the caller has no part in is indistinguishable
 * from one that does not exist — and `CapabilityGuard` answers 403 for a role that may
 * not act. Queries scope by `session.organizationId`; the `:orgId` in the path is
 * addressability, never a selector.
 *
 * The two capabilities differ on purpose. Reading is admin and manager; **writing is
 * admin only**, while `ManageEnvelopes` is admin and manager, because choosing the
 * provider changes where every future contract of the organization is executed and who
 * holds the evidence, which is a different order of decision from sending one document.
 */
@Controller('api/organizations/:orgId/settings/signing')
@UseGuards(SessionGuard, OrgScopeGuard, CapabilityGuard)
export class SigningSettingsController {
  constructor(private readonly settings: SigningSettingsService) {}

  @Get()
  @RequireCapability('ViewSigningSettings')
  get(@Req() req: AuthenticatedRequest) {
    return this.settings.get(req.session!);
  }

  @Put()
  @HttpCode(200)
  @RequireCapability('ManageSigningSettings')
  update(@Req() req: AuthenticatedRequest, @Body() dto: UpdateSigningSettingsDto) {
    return this.settings.update(req.session!, dto);
  }
}
