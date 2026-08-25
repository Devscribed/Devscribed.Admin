import { Controller, Get, NotFoundException, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { HiringManageGuard } from './hiring-manage.guard';
import { PrismaService } from '../prisma.service';
import { Storage } from './storage/storage';

/**
 * CVs are streamed through the API, never linked to (00 §03.16). The stored key never
 * appears in a response, so no client ever holds anything that could be turned into a
 * direct object reference.
 *
 * 404 rather than 403 for an application outside the caller's organization: the
 * interviewer scope of a later phase answers the same way, and the two should not be
 * distinguishable by their status code.
 */
@Controller('api/organizations/:orgId/hiring/applications')
@UseGuards(SessionGuard, OrgScopeGuard, HiringManageGuard)
export class CvController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: Storage,
  ) {}

  @Get(':applicationId/cv')
  async download(
    @Req() req: AuthenticatedRequest,
    @Param('applicationId') applicationId: string,
    @Res() res: Response,
  ): Promise<void> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId: req.session!.organizationId },
      select: { cvKey: true, cvFileName: true },
    });
    if (!application?.cvKey) throw new NotFoundException();

    const file = await this.storage.get(application.cvKey);
    if (!file) throw new NotFoundException();

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${(application.cvFileName ?? 'cv').replace(/"/g, '')}"`,
    );
    res.send(file.bytes);
  }
}
