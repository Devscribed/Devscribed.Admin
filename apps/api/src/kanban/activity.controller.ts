import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { ActivityService } from './activity.service';

@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get('projects/:projectId/tasks/:taskId/activity')
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.activity.listActivity(req.session!, projectId, taskId);
  }
}
