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
import type {
  AddMembersInput,
  CreateProjectInput,
} from './projects.service';
import { ProjectsService } from './projects.service';

/**
 * Spec 11 — Projects. Same guard order as the other org-scoped controllers:
 * `SessionGuard` attaches the session, `OrgScopeGuard` checks the URL's `:orgId`.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects')
  async list(@Req() req: AuthenticatedRequest, @Query('status') status?: string) {
    return this.projects.listProjects(req.session!, { status });
  }

  @Post('projects')
  @HttpCode(201)
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateProjectInput) {
    return this.projects.createProject(req.session!, body);
  }

  @Put('projects/:projectId')
  @HttpCode(200)
  async rename(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: CreateProjectInput,
  ) {
    return this.projects.renameProject(req.session!, projectId, body);
  }

  @Patch('projects/:projectId/archive')
  @HttpCode(200)
  async archive(@Req() req: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.archiveProject(req.session!, projectId);
  }

  @Patch('projects/:projectId/restore')
  @HttpCode(200)
  async restore(@Req() req: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.restoreProject(req.session!, projectId);
  }

  @Get('projects/:projectId/members')
  async listMembers(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.projects.listMembers(req.session!, projectId);
  }

  @Post('projects/:projectId/members')
  @HttpCode(200)
  async addMembers(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: AddMembersInput,
  ) {
    return this.projects.addMembers(req.session!, projectId, body);
  }

  @Delete('projects/:projectId/members/:membershipId')
  @HttpCode(200)
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.projects.removeMember(req.session!, projectId, membershipId);
  }
}
