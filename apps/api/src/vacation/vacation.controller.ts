import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type {
  ReviewVacationRequestDto,
  SubmitVacationRequestDto,
} from './vacation-requests.service';
import { VacationRequestsService } from './vacation-requests.service';
import type { MemberFinancialsDto } from './vacation.service';
import { VacationService } from './vacation.service';

/**
 * Spec 07 — Vacation tab (financial settings). Same guard order as `MembersController`:
 * `SessionGuard` attaches the session, `OrgScopeGuard` checks the URL's `:orgId`.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class VacationController {
  constructor(
    private readonly vacation: VacationService,
    private readonly requests: VacationRequestsService,
  ) {}

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

  @Post('members/:memberId/vacation/requests')
  @HttpCode(201)
  async submitRequest(
    @Req() req: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Body() body: SubmitVacationRequestDto,
  ) {
    return this.requests.submit(req.session!, memberId, body);
  }

  @Put('members/:memberId/vacation/requests/:requestId/review')
  @HttpCode(200)
  async reviewRequest(
    @Req() req: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
    @Body() body: ReviewVacationRequestDto,
  ) {
    return this.requests.review(req.session!, memberId, requestId, body);
  }

  @Put('members/:memberId/vacation/requests/:requestId/cancel')
  @HttpCode(200)
  async cancelRequest(
    @Req() req: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Param('requestId') requestId: string,
  ) {
    return this.requests.cancel(req.session!, memberId, requestId);
  }
}
