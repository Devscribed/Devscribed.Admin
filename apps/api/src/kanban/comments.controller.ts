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
import { CommentsService } from './comments.service';

@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get('projects/:projectId/tasks/:taskId/comments')
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.comments.listComments(req.session!, projectId, taskId);
  }

  @Post('projects/:projectId/tasks/:taskId/comments')
  @HttpCode(201)
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: { content?: unknown },
  ) {
    return this.comments.createComment(req.session!, projectId, taskId, body);
  }

  @Put('projects/:projectId/tasks/:taskId/comments/:commentId')
  @HttpCode(200)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() body: { content?: unknown },
  ) {
    return this.comments.updateComment(req.session!, projectId, taskId, commentId, body);
  }

  @Delete('projects/:projectId/tasks/:taskId/comments/:commentId')
  @HttpCode(200)
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.comments.deleteComment(req.session!, projectId, taskId, commentId);
  }
}
