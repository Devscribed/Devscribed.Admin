import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CapabilityGuard } from '../auth/capability.guard';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import { RequireCapability } from '../auth/require-capability.decorator';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type { CreateTemplateDto, PreviewDto, SaveDraftDto } from './document-templates.dto';
import { DocumentTemplatesService } from './document-templates.service';

/**
 * Order matters, and there are three layers now: `SessionGuard` puts the session on the
 * request, `OrgScopeGuard` compares the URL's `:orgId` against it, and `CapabilityGuard`
 * reads the membership role behind that session and answers 403 when the capability
 * named by `@RequireCapability` is missing.
 */
@Controller('api/organizations/:orgId')
@UseGuards(SessionGuard, OrgScopeGuard, CapabilityGuard)
export class DocumentTemplatesController {
  constructor(private readonly templates: DocumentTemplatesService) {}

  @Get('document-templates')
  @RequireCapability('ViewDocumentTemplates')
  list(
    @Req() req: AuthenticatedRequest,
    @Query('q') q?: string,
    @Query('status') status?: string,
  ) {
    return this.templates.list(req.session!, q, status);
  }

  @Post('document-templates')
  @HttpCode(201)
  @RequireCapability('ManageDocumentTemplates')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateTemplateDto) {
    return this.templates.create(req.session!, dto);
  }

  @Get('document-templates/:id')
  @RequireCapability('ViewDocumentTemplates')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.templates.get(req.session!, id);
  }

  @Put('document-templates/:id/draft')
  @RequireCapability('ManageDocumentTemplates')
  saveDraft(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: SaveDraftDto) {
    return this.templates.saveDraft(req.session!, id, dto);
  }

  @Post('document-templates/:id/publish')
  @HttpCode(200)
  @RequireCapability('ManageDocumentTemplates')
  publish(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.templates.publish(req.session!, id);
  }

  @Post('document-templates/:id/archive')
  @HttpCode(200)
  @RequireCapability('ManageDocumentTemplates')
  archive(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.templates.archive(req.session!, id);
  }

  @Delete('document-templates/:id')
  @HttpCode(204)
  @RequireCapability('ManageDocumentTemplates')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.templates.remove(req.session!, id);
  }

  /**
   * Preview is a POST because the version to render travels in the body, and because a
   * rendered contract is not something to leave in a browser history or a proxy log.
   * It needs only the view capability — a manager reviews templates, they just cannot
   * change them.
   */
  @Post('document-templates/:id/preview')
  @HttpCode(200)
  @RequireCapability('ViewDocumentTemplates')
  preview(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: PreviewDto) {
    return this.templates.preview(req.session!, id, dto);
  }
}
