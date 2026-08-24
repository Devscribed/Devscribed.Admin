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
import type { CreateEnvelopeDto, UpdateEnvelopeDto, VoidEnvelopeDto } from './envelopes.dto';
import { EnvelopesService } from './envelopes.service';

/**
 * The org-scoped envelope surface. Same three-layer guard stack as spec 01's controller:
 * `SessionGuard` establishes who, `OrgScopeGuard` checks the URL agrees with the session,
 * `CapabilityGuard` answers 403 for a `user` or a `viewer`.
 *
 * Nothing here is reachable by a signer. The signing surface has no session at all and
 * lives in `src/signing/`, authorized solely by its token.
 */
@Controller('api/organizations/:orgId/envelopes')
@UseGuards(SessionGuard, OrgScopeGuard, CapabilityGuard)
export class EnvelopesController {
  constructor(private readonly envelopes: EnvelopesService) {}

  @Get()
  @RequireCapability('ViewEnvelopes')
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.envelopes.list(req.session!, query);
  }

  @Post()
  @HttpCode(201)
  @RequireCapability('ManageEnvelopes')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateEnvelopeDto) {
    return this.envelopes.create(req.session!, dto);
  }

  @Get(':id')
  @RequireCapability('ViewEnvelopes')
  get(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.envelopes.get(req.session!, id);
  }

  @Put(':id')
  @RequireCapability('ManageEnvelopes')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateEnvelopeDto,
  ) {
    return this.envelopes.update(req.session!, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequireCapability('ManageEnvelopes')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.envelopes.remove(req.session!, id);
  }

  @Post(':id/send')
  @HttpCode(200)
  @RequireCapability('ManageEnvelopes')
  send(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.envelopes.send(req.session!, id, req);
  }

  @Post(':id/void')
  @HttpCode(200)
  @RequireCapability('VoidEnvelope')
  void(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: VoidEnvelopeDto,
  ) {
    return this.envelopes.voidEnvelope(req.session!, id, dto, req);
  }

  @Post(':id/signers/:signerId/resend')
  @HttpCode(200)
  @RequireCapability('ManageEnvelopes')
  resend(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('signerId') signerId: string,
  ) {
    return this.envelopes.resend(req.session!, id, signerId, req);
  }

  /**
   * Needs only the view capability — a manager reviews a document before it is sent;
   * looking at it is not changing it.
   */
  @Post(':id/preview')
  @HttpCode(200)
  @RequireCapability('ViewEnvelopes')
  preview(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.envelopes.preview(req.session!, id);
  }

  @Get(':id/document')
  @RequireCapability('DownloadSignedDocument')
  document(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.envelopes.document(req.session!, id, req);
  }

  @Post(':id/pdf/retry')
  @HttpCode(200)
  @RequireCapability('ManageEnvelopes')
  retryPdf(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.envelopes.retryPdf(req.session!, id);
  }

  /**
   * `audit/verify` is declared before `audit` would swallow it — Nest matches in
   * declaration order and `:id/audit` is a different path, but keeping the more specific
   * route first is the habit that stops the next addition from breaking it.
   */
  @Get(':id/audit/verify')
  @RequireCapability('ViewEnvelopeAudit')
  auditVerify(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.envelopes.auditVerify(req.session!, id);
  }

  @Get(':id/audit')
  @RequireCapability('ViewEnvelopeAudit')
  audit(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.envelopes.audit(req.session!, id);
  }
}
