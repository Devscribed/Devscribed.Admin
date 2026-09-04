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
import type { MemberDetailUpdateInput } from './members.service';
import { MembersService } from './members.service';

/**
 * Order matters: `SessionGuard` puts the session on the request, `OrgScopeGuard`
 * compares the URL's `:orgId` against it.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get('members')
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('search') search?: string,
    @Query('showRemoved') showRemoved?: string,
  ) {
    return this.members.list(req.session!, { search, showRemoved: showRemoved === 'true' });
  }

  @Get('members/:memberId')
  async detail(@Req() req: AuthenticatedRequest, @Param('memberId') memberId: string) {
    return this.members.getDetail(req.session!, memberId);
  }

  @Put('members/:memberId')
  @HttpCode(200)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('memberId') memberId: string,
    @Body() body: MemberDetailUpdateInput,
  ) {
    return this.members.updateDetail(req.session!, memberId, body);
  }

  /**
   * Soft-delete, per user-management spec 04. Hiring's cross-spec guard lives inside
   * the service: a member who is the assigned interviewer on an open vacancy cannot be
   * removed until those vacancies are reassigned or closed (01 §06.17).
   */
  @Delete('members/:memberId')
  @HttpCode(200)
  async remove(@Req() req: AuthenticatedRequest, @Param('memberId') memberId: string) {
    return this.members.remove(req.session!, memberId);
  }

  @Post('members/:memberId/restore')
  @HttpCode(200)
  async restore(@Req() req: AuthenticatedRequest, @Param('memberId') memberId: string) {
    return this.members.restore(req.session!, memberId);
  }
}
