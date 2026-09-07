import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { HolidaySourcingService, type SyncInput } from './holiday-sourcing.service';
import { HolidaySummaryService } from './holiday-summary.service';

/**
 * Time off spec 02 — the sync and the summary, beside the shipped holiday routes and on
 * the same controller path.
 *
 * `SessionGuard` attaches the session (re-reading `securityStamp`, so a rotated stamp
 * 401s the next call) and `OrgScopeGuard` 404s a URL whose `:orgId` disagrees with it.
 * There is no `CapabilityGuard`: both routes answer **404** without their capability
 * (REQ-02-019, REQ-02-020) and the guard answers 403, so both checks run in the service.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class HolidaySourcingController {
  constructor(
    private readonly sourcing: HolidaySourcingService,
    private readonly summaries: HolidaySummaryService,
  ) {}

  /** REQ-02-003 / REQ-02-008 — and always a `200`, even when a country could not be sourced. */
  @Post('holidays/sync')
  @HttpCode(200)
  sync(@Req() req: AuthenticatedRequest, @Body() body: SyncInput) {
    return this.sourcing.sync(req.session!, body);
  }

  @Get('holidays/summary')
  summary(@Req() req: AuthenticatedRequest, @Query('year') year?: string) {
    return this.summaries.summary(req.session!, { year });
  }
}
