import { Body, Controller, Get, HttpCode, Put, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import {
  OrganizationCountryService,
  type OrganizationCountryInput,
} from './organization-country.service';

/**
 * Time off spec 01 — the organization's holiday country, at
 * `api/organizations/:orgId/settings/country`, beside the signing settings.
 *
 * `SessionGuard` and `OrgScopeGuard` only. Unlike its signing neighbour there is no
 * `CapabilityGuard`: both halves refuse with **404** (REQ-01-035, REQ-01-047) and the
 * guard answers 403, so the two capability checks run in the service.
 */
@Controller('api/organizations/:orgId/settings/country')
@UseGuards(SessionGuard, OrgScopeGuard)
export class OrganizationCountryController {
  constructor(private readonly country: OrganizationCountryService) {}

  @Get()
  get(@Req() req: AuthenticatedRequest) {
    return this.country.get(req.session!);
  }

  @Put()
  @HttpCode(200)
  update(@Req() req: AuthenticatedRequest, @Body() body: OrganizationCountryInput) {
    return this.country.update(req.session!, body);
  }
}
