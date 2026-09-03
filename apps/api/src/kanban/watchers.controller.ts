import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { WatchersService } from './watchers.service';

@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class WatchersController {
  constructor(private readonly watchers: WatchersService) {}

  @Get('projects/:projectId/tasks/:taskId/watchers')
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.watchers.listWatchers(req.session!, projectId, taskId);
  }

  @Post('projects/:projectId/tasks/:taskId/watchers')
  @HttpCode(201)
  async watch(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.watchers.watch(req.session!, projectId, taskId);
  }

  @Delete('projects/:projectId/tasks/:taskId/watchers')
  @HttpCode(200)
  async unwatch(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.watchers.unwatch(req.session!, projectId, taskId);
  }
}
