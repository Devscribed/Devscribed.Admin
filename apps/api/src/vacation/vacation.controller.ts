import { Body, Controller, Get, HttpCode, Param, Put, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type { MemberFinancialsDto } from './vacation.service';
import { VacationService } from './vacation.service';

/**
 * Spec 07 — Vacation tab (financial settings). Same guard order as `MembersController`:
 * `SessionGuard` attaches the session, `OrgScopeGuard` checks the URL's `:orgId`.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class VacationController {
  constructor(private readonly vacation: VacationService) {}

  @Get('members/:memberId/vacation')
  async getVacation(@Req() req: AuthenticatedRequest, @Param('memberId') memberId: string) {
    return this.vacation.getVacation(req.session!, memberId);
  }

  @Put('members/:memberId/vacation/financials')
  @HttpCode(200)
  async updateFinancials(
    @Req() req: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Body() body: MemberFinancialsDto,
  ) {
    return this.vacation.updateFinancials(req.session!, memberId, body);
  }
}
