import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import {
  LabelsService,
  type CreateLabelInput,
  type UpdateLabelInput,
} from './labels.service';

@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  // Definition endpoints (Board Settings — manage-labels)

  @Post('projects/:projectId/labels')
  @HttpCode(201)
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: CreateLabelInput,
  ) {
    return this.labels.createLabel(req.session!, projectId, body);
  }

  @Get('projects/:projectId/labels')
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.labels.listLabels(req.session!, projectId);
  }

  @Put('projects/:projectId/labels/:labelId')
  @HttpCode(200)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('labelId') labelId: string,
    @Body() body: UpdateLabelInput,
  ) {
    return this.labels.updateLabel(req.session!, projectId, labelId, body);
  }

  @Delete('projects/:projectId/labels/:labelId')
  @HttpCode(200)
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.labels.deleteLabel(req.session!, projectId, labelId);
  }

  // Assignment endpoints (task detail — manage-tasks)

  @Post('projects/:projectId/tasks/:taskId/labels')
  @HttpCode(201)
  async assign(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: { labelId?: unknown },
  ) {
    return this.labels.assignLabel(req.session!, projectId, taskId, body);
  }

  @Delete('projects/:projectId/tasks/:taskId/labels/:labelId')
  @HttpCode(200)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('labelId') labelId: string,
  ) {
    return this.labels.removeLabel(req.session!, projectId, taskId, labelId);
  }
}
