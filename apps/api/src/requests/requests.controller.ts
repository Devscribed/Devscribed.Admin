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
import { CapabilityGuard } from '../auth/capability.guard';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import { RequireCapability } from '../auth/require-capability.decorator';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { RequestsService } from './requests.service';

/**
 * Requests spec 01 — requests between members of an organization, plus spec 10's
 * organization-wide vacation feed, composed into one response by the list route.
 *
 * Guard chain, as every route in this spec states: `SessionGuard` attaches the session,
 * `OrgScopeGuard` checks the URL's `:orgId` against it and answers 404 when they
 * disagree. The path parameter is never passed to the service — every method scopes by
 * `session.organizationId`, which is a required argument with no default.
 *
 * Capability is checked in the service rather than by `CapabilityGuard` wherever the
 * spec names the message the refusal must carry (`createForbidden`, `scopeForbidden`),
 * since the guard's message is fixed and generic. Reassignment is the one route whose
 * refusal the spec leaves unnamed, so it uses the guard.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get('requests')
  async listRequests(
    @Req() req: AuthenticatedRequest,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
    @Query('projectId') projectId?: string,
    @Query('topicId') topicId?: string,
    @Query('q') q?: string,
  ) {
    return this.requests.listRequests(req.session!, req.session!.organizationId, {
      scope,
      status,
      type,
      projectId,
      topicId,
      q,
    });
  }

  @Post('requests')
  async createRequest(
    @Req() req: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.requests.createRequest(req.session!, req.session!.organizationId, body ?? {});
  }

  @Get('requests/:requestId')
  async getRequest(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
  ) {
    return this.requests.getRequest(req.session!, req.session!.organizationId, requestId);
  }

  @Patch('requests/:requestId')
  async patchRequest(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.requests.patchRequest(
      req.session!,
      req.session!.organizationId,
      requestId,
      body ?? {},
    );
  }

  @Post('requests/:requestId/messages')
  async postMessage(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.requests.postMessage(
      req.session!,
      req.session!.organizationId,
      requestId,
      body ?? {},
    );
  }

  @Post('requests/:requestId/answer')
  @HttpCode(200)
  async answer(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.requests.transition(
      req.session!,
      req.session!.organizationId,
      requestId,
      'answer',
      body ?? {},
    );
  }

  @Post('requests/:requestId/grant')
  @HttpCode(200)
  async grant(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.requests.transition(
      req.session!,
      req.session!.organizationId,
      requestId,
      'grant',
      body ?? {},
    );
  }

  @Post('requests/:requestId/decline')
  @HttpCode(200)
  async decline(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.requests.transition(
      req.session!,
      req.session!.organizationId,
      requestId,
      'decline',
      body ?? {},
    );
  }

  @Post('requests/:requestId/cancel')
  @HttpCode(200)
  async cancel(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.requests.transition(
      req.session!,
      req.session!.organizationId,
      requestId,
      'cancel',
      body ?? {},
    );
  }

  @Post('requests/:requestId/reassign')
  @HttpCode(200)
  @UseGuards(CapabilityGuard)
  @RequireCapability('ViewAllRequests')
  async reassign(
    @Req() req: AuthenticatedRequest,
    @Param('requestId') requestId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.requests.reassignRequest(
      req.session!,
      req.session!.organizationId,
      requestId,
      body ?? {},
    );
  }
}
