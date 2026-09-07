import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { TimeOffCalendarService, type TimeOffCalendarQuery } from './time-off-calendar.service';

/**
 * Time off spec 01 — the Vacation Calendar's one read. The guard stack is
 * `HolidaysController`'s: `SessionGuard` attaches the session (re-reading
 * `securityStamp`, so a rotated stamp 401s the next call) and `OrgScopeGuard` 404s a URL
 * whose `:orgId` disagrees with it.
 *
 * There is deliberately **no** `RequireCapability` and no `CapabilityGuard`: the refusal
 * this route owes a caller without the capability is a bare 404, byte-identical to the
 * wrong-organization one (REQ-01-002, REQ-01-039), and the guard answers 403. The check
 * runs in the service instead.
 *
 * The whole query object is handed over rather than parameter by parameter, because
 * `projectIds` and `memberIds` repeat and Express hands a repeated key back as an array.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class TimeOffCalendarController {
  constructor(private readonly calendar: TimeOffCalendarService) {}

  @Get('time-off/calendar')
  async get(@Req() req: AuthenticatedRequest, @Query() query: TimeOffCalendarQuery) {
    return this.calendar.getCalendar(req.session!, query);
  }
}
