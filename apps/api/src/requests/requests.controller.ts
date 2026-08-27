import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequestsService } from './requests.service';

/**
 * Spec 10 — Organization Requests Page. Same guard order as `VacationController`:
 * `SessionGuard` attaches the session, `OrgScopeGuard` checks the URL's `:orgId`.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('requests')
  async listRequests(
    @Req() req: AuthenticatedRequest,
    @Param('orgId') orgId: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.requests.listRequests(req.session!, orgId, { status, type });
  }
}
