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
import { ClientsService } from './clients.service';

/**
 * Spec organization/01 — Clients. Guard order copied from `ProjectsController`:
 * `SessionGuard` attaches the session (and re-reads securityStamp for revocation),
 * `OrgScopeGuard` 404s a URL whose `:orgId` disagrees with the session. Role checks
 * live inside the service so a lack of capability collapses to the same 404 the
 * org-scope guard produces — never a distinguishable 403.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get('clients')
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.clients.listClients(req.session!, { status, q });
  }

  @Post('clients')
  @HttpCode(201)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name?: unknown },
  ) {
    return this.clients.createClient(req.session!, body);
  }

  @Get('clients/:clientId')
  async detail(
    @Req() req: AuthenticatedRequest,
    @Param('clientId') clientId: string,
  ) {
    return this.clients.getClient(req.session!, clientId);
  }

  @Patch('clients/:clientId')
  @HttpCode(200)
  async rename(
    @Req() req: AuthenticatedRequest,
    @Param('clientId') clientId: string,
    @Body() body: { name?: unknown },
  ) {
    return this.clients.renameClient(req.session!, clientId, body);
  }

  @Patch('clients/:clientId/archive')
  @HttpCode(200)
  async archive(
    @Req() req: AuthenticatedRequest,
    @Param('clientId') clientId: string,
  ) {
    return this.clients.archiveClient(req.session!, clientId);
  }

  @Patch('clients/:clientId/restore')
  @HttpCode(200)
  async restore(
    @Req() req: AuthenticatedRequest,
    @Param('clientId') clientId: string,
  ) {
    return this.clients.restoreClient(req.session!, clientId);
  }
}
