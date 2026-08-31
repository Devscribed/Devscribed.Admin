import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import {
  TasksService,
  type CreateTaskInput,
  type ListTasksQuery,
  type MoveTaskInput,
  type UpdateTaskInput,
} from './tasks.service';

@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post('projects/:projectId/tasks')
  @HttpCode(201)
  async create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: CreateTaskInput,
  ) {
    return this.tasks.createTask(req.session!, projectId, body);
  }

  @Get('projects/:projectId/tasks')
  async list(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query() query: ListTasksQuery,
  ) {
    return this.tasks.listTasks(req.session!, projectId, query);
  }

  /**
   * Spec 15 — `GET .../projects/:projectId/tasks/search?q=…`. Must be declared before
   * the `:taskId` route below so Nest doesn't shadow it with the taskId pattern.
   */
  @Get('projects/:projectId/tasks/search')
  async search(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Query('q') q?: string,
  ) {
    return this.tasks.searchTasks(req.session!, projectId, q);
  }

  @Get('projects/:projectId/tasks/:taskId')
  async detail(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasks.getTask(req.session!, projectId, taskId);
  }

  @Put('projects/:projectId/tasks/:taskId')
  @HttpCode(200)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: UpdateTaskInput,
  ) {
    return this.tasks.updateTask(req.session!, projectId, taskId, body);
  }

  @Patch('projects/:projectId/tasks/:taskId/move')
  @HttpCode(200)
  async move(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Body() body: MoveTaskInput,
  ) {
    return this.tasks.moveTask(req.session!, projectId, taskId, body);
  }

  @Delete('projects/:projectId/tasks/:taskId')
  @HttpCode(200)
  async delete(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasks.deleteTask(req.session!, projectId, taskId);
  }
}
