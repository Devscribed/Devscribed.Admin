import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionPayload } from '../auth/session.service';
import { MembersService } from './members.service';
import { MembersListResponse } from './member.dto';

@Controller('members')
@UseGuards(JwtAuthGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /** GET /api/members — active members of the caller's current organization. */
  @Get()
  async list(@CurrentUser() user: SessionPayload): Promise<MembersListResponse> {
    const members = await this.members.listActiveForOrg(user.orgId);
    return {
      members,
      canManage: this.members.canManage(user.role),
      currentUserRole: user.role,
    };
  }
}
