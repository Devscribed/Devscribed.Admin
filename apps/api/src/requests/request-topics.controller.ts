import {
  Body,
  Controller,
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
import type {
  CreateRequestTopicBody,
  UpdateRequestTopicBody,
} from './request-topics.dto';
import { RequestTopicsService } from './request-topics.service';

/**
 * Requests spec 02 — the organization's catalogue of request topics.
 *
 * Guard chain, as every route in this spec states: `SessionGuard` attaches the session
 * (and re-reads `securityStamp`, so a rotated stamp 401s the next call), `OrgScopeGuard`
 * checks the URL's `:orgId` against it and answers 404 when they disagree. The path
 * parameter is never passed to the service — every method scopes by
 * `session.organizationId`, which is a required argument with no default.
 *
 * `ManageRequestTopics` is checked inside the service rather than by `CapabilityGuard`,
 * because the refusal must carry `REQUEST_TOPIC_MESSAGES.manageForbidden` and the
 * guard's message is fixed and never names the resource — the same reason
 * `RequestsController` already gives for `createForbidden`.
 *
 * **There is no `DELETE` handler here, and there is no service method that removes a row**
 * (REQ-02-014). Archiving is the only removal; a `DELETE` to any topics path falls
 * through to the framework's not-found handler.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class RequestTopicsController {
  constructor(private readonly topics: RequestTopicsService) {}

  @Get('request-topics')
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('audience') audience?: string,
    @Query('status') status?: string,
  ) {
    return this.topics.listTopics(req.session!, req.session!.organizationId, {
      audience,
      status,
    });
  }

  @Post('request-topics')
  @HttpCode(201)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() body: CreateRequestTopicBody,
  ) {
    return this.topics.createTopic(req.session!, req.session!.organizationId, body ?? {});
  }

  @Patch('request-topics/:topicId')
  @HttpCode(200)
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('topicId') topicId: string,
    @Body() body: UpdateRequestTopicBody,
  ) {
    return this.topics.updateTopic(
      req.session!,
      req.session!.organizationId,
      topicId,
      body ?? {},
    );
  }

  @Patch('request-topics/:topicId/archive')
  @HttpCode(200)
  async archive(
    @Req() req: AuthenticatedRequest,
    @Param('topicId') topicId: string,
  ) {
    return this.topics.archiveTopic(req.session!, req.session!.organizationId, topicId);
  }

  @Patch('request-topics/:topicId/restore')
  @HttpCode(200)
  async restore(
    @Req() req: AuthenticatedRequest,
    @Param('topicId') topicId: string,
  ) {
    return this.topics.restoreTopic(req.session!, req.session!.organizationId, topicId);
  }
}
