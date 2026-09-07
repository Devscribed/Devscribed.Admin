import { Body, Controller, Get, HttpCode, Put, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import {
  HolidaySourcingSettingsService,
  type HolidaySourcingSettingsInput,
} from './holiday-sourcing-settings.service';

/**
 * Time off spec 02 REQ-02-002 — the include-organization-country checkbox, at
 * `api/organizations/:orgId/settings/holiday-sourcing`, beside the organization country
 * the sourced set falls back to.
 *
 * `SessionGuard` and `OrgScopeGuard` only, like its country neighbour: both halves refuse
 * with **404** (REQ-02-019, REQ-02-020) and `CapabilityGuard` answers 403, so the two
 * capability checks run in the service.
 */
@Controller('api/organizations/:orgId/settings/holiday-sourcing')
@UseGuards(SessionGuard, OrgScopeGuard)
export class HolidaySourcingSettingsController {
  constructor(private readonly settings: HolidaySourcingSettingsService) {}

  @Get()
  get(@Req() req: AuthenticatedRequest) {
    return this.settings.get(req.session!);
  }

  @Put()
  @HttpCode(200)
  update(@Req() req: AuthenticatedRequest, @Body() body: HolidaySourcingSettingsInput) {
    return this.settings.update(req.session!, body);
  }
}
