import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { PortalEntryService } from './portal-entry.service';
import { PortalFeedService } from './portal-feed.service';
import { PortalHomeService } from './portal-home.service';
import { PortalSettingsService } from './portal-settings.service';

/**
 * Portal spec 01 (Home) — `/portal` route group.
 *
 * Guard chain, as `apps/api/src/requests/requests.controller.ts:41-42` states it:
 * `SessionGuard` attaches the session, `OrgScopeGuard` checks the URL's `:orgId`
 * against it and answers 404 when they disagree — including for a client principal, who
 * carries no opt-in on any handler in this controller (REQ-01-004's first two rows).
 * The path parameter is never passed to a service; every method scopes by
 * `session.organizationId`.
 *
 * No handler here carries `CapabilityGuard` or `@RequireCapability`. `ViewPortalHome` is
 * asked inside `PortalHomeService`/`PortalFeedService`/`PortalEntryService` because every
 * staff role holds it and a guard would spend a query on a decision that is already
 * true; `ManagePortalSettings` is asked inside `PortalSettingsService` because its
 * refusal must carry `PORTAL_MESSAGES.settingsForbidden`, a message `CapabilityGuard`
 * cannot produce (REQ-01-050's own note).
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard)
export class PortalController {
  constructor(
    private readonly home: PortalHomeService,
    private readonly feed: PortalFeedService,
    private readonly entries: PortalEntryService,
    private readonly settings: PortalSettingsService,
  ) {}

  @Get('portal/home')
  async getHome(@Req() req: AuthenticatedRequest) {
    return this.home.getHome(req.session!, req.session!.organizationId);
  }

  @Get('portal/news')
  async listNews(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const limit = limitRaw === undefined ? undefined : Number(limitRaw);
    return this.feed.listNews(req.session!, req.session!.organizationId, { limit, cursor });
  }

  @Get('portal/news/:entryId')
  async getNewsEntry(@Req() req: AuthenticatedRequest, @Param('entryId') entryId: string) {
    return this.entries.getEntry(req.session!, req.session!.organizationId, entryId);
  }

  @Get('portal/settings')
  async getSettings(@Req() req: AuthenticatedRequest) {
    return {
      groups: await this.settings.readGroupsForManager(
        req.session!,
        req.session!.organizationId,
      ),
    };
  }

  @Put('portal/settings')
  async putSettings(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) {
    return {
      groups: await this.settings.writeGroups(
        req.session!,
        req.session!.organizationId,
        body?.groups,
      ),
    };
  }
}
