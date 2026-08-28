import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type { TimeEntryBody, TimerMetaBody } from './time-tracking.service';
import { TimeTrackingService } from './time-tracking.service';

/**
 * Spec 12 — Time Tracking. Same guard order as the other org-scoped controllers:
 * `SessionGuard` attaches the session, `OrgScopeGuard` checks the URL's `:orgId`.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class TimeTrackingController {
  constructor(private readonly timeTracking: TimeTrackingService) {}

  /* --- Timer --- */

  @Get('timer')
  async getTimer(@Req() req: AuthenticatedRequest) {
    return this.timeTracking.getTimer(req.session!);
  }

  @Post('timer/start')
  @HttpCode(201)
  async startTimer(@Req() req: AuthenticatedRequest, @Body() body: TimerMetaBody) {
    return this.timeTracking.startTimer(req.session!, body);
  }

  @Put('timer')
  @HttpCode(200)
  async updateTimer(@Req() req: AuthenticatedRequest, @Body() body: TimerMetaBody) {
    return this.timeTracking.updateTimer(req.session!, body);
  }

  @Post('timer/stop')
  @HttpCode(200)
  async stopTimer(@Req() req: AuthenticatedRequest) {
    return this.timeTracking.stopTimer(req.session!);
  }

  @Delete('timer')
  @HttpCode(200)
  async discardTimer(@Req() req: AuthenticatedRequest) {
    return this.timeTracking.discardTimer(req.session!);
  }

  /* --- Time entries --- */

  @Get('time-entries')
  async listEntries(
    @Req() req: AuthenticatedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('membershipId') membershipId?: string,
  ) {
    return this.timeTracking.listEntries(req.session!, { from, to, membershipId });
  }

  @Post('time-entries')
  @HttpCode(201)
  async createEntry(@Req() req: AuthenticatedRequest, @Body() body: TimeEntryBody) {
    return this.timeTracking.createEntry(req.session!, body);
  }

  @Put('time-entries/:entryId')
  @HttpCode(200)
  async updateEntry(
    @Req() req: AuthenticatedRequest,
    @Param('entryId') entryId: string,
    @Body() body: TimeEntryBody,
  ) {
    return this.timeTracking.updateEntry(req.session!, entryId, body);
  }

  @Delete('time-entries/:entryId')
  @HttpCode(200)
  async deleteEntry(@Req() req: AuthenticatedRequest, @Param('entryId') entryId: string) {
    return this.timeTracking.deleteEntry(req.session!, entryId);
  }
}
