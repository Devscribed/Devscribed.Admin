import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type { AccrualRunDto } from './accrual.service';
import { AccrualService } from './accrual.service';

/**
 * Spec 08 — manual monthly accrual trigger. Guarded by `SessionGuard` only: there is no
 * `:orgId` in the path, so the caller (and the target organization) is resolved from the
 * session, not the URL. Role authority is enforced in the service (`run-accrual`).
 */
@Controller('api/admin/accrual')
@UseGuards(SessionGuard)
export class AccrualController {
  constructor(private readonly accrual: AccrualService) {}

  @Post('run')
  @HttpCode(200)
  async run(@Req() req: AuthenticatedRequest, @Body() body: AccrualRunDto) {
    return this.accrual.runAccrual(req.session!, body);
  }
}
