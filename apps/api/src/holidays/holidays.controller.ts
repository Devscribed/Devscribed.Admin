import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { HolidaysService, type HolidayInput } from './holidays.service';

/**
 * Spec organization/03 — Holidays. Guard order copied from `ClientsController`:
 * `SessionGuard` attaches the session (and re-reads `securityStamp`, so a rotated
 * stamp 401s the next call), `OrgScopeGuard` 404s a URL whose `:orgId` disagrees
 * with the session. Capability checks live in the service because this resource
 * answers 404 for a missing view capability and 403 for a missing delete one —
 * `CapabilityGuard` can express neither combination.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  @Get('holidays')
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('year') year?: string,
    @Query('country') country?: string,
    @Query('scope') scope?: string,
  ) {
    return this.holidays.listHolidays(req.session!, { year, country, scope });
  }

  @Post('holidays')
  @HttpCode(201)
  async create(@Req() req: AuthenticatedRequest, @Body() body: HolidayInput) {
    return this.holidays.createHoliday(req.session!, body);
  }

  @Patch('holidays/:holidayId')
  @HttpCode(200)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('holidayId') holidayId: string,
    @Body() body: HolidayInput,
  ) {
    return this.holidays.updateHoliday(req.session!, holidayId, body);
  }

  @Delete('holidays/:holidayId')
  @HttpCode(204)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('holidayId') holidayId: string,
  ): Promise<void> {
    await this.holidays.deleteHoliday(req.session!, holidayId);
  }
}
