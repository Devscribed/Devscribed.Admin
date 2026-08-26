import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { cvExtension } from '@devscribed/validation';
import type { Response } from 'express';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { InterviewerScopeGuard } from './interviewer-scope.guard';
import { PrismaService } from '../prisma.service';
import { Storage } from './storage/storage';

/**
 * The extensions a browser can be asked to render in place, and the content type it is
 * told to render them as.
 *
 * The stored content type is not used on this path. It came from the multipart upload,
 * which means the candidate chose it — a `.txt` file announced as `text/html` and
 * rendered inline would be script running on this origin. So the inline path serves a
 * type derived from the extension the upload validator already checked, and anything
 * not on this list falls back to a download, which is what a browser would do with a
 * `.docx` regardless.
 */
const INLINE_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * CVs are streamed through the API, never linked to (00 §03.16). The stored key never
 * appears in a response, so no client ever holds anything that could be turned into a
 * direct object reference.
 *
 * 404 rather than 403 for an application outside the caller's organization, and
 * `InterviewerScopeGuard` answers the same way for one they may not see — an interviewer
 * reaches the CV of the candidate they are about to interview and of nobody else, and
 * the two refusals are indistinguishable by their status code.
 */
@Controller('api/organizations/:orgId/hiring/applications')
@UseGuards(SessionGuard, OrgScopeGuard, InterviewerScopeGuard)
export class CvController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: Storage,
  ) {}

  /**
   * `?disposition=inline` is what the card's **View** action asks for (04 §07.32);
   * everything else, including no query at all, downloads.
   */
  @Get(':applicationId/cv')
  async download(
    @Req() req: AuthenticatedRequest,
    @Param('applicationId') applicationId: string,
    @Query('disposition') disposition: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId: req.session!.organizationId },
      select: { cvKey: true, cvFileName: true },
    });
    if (!application?.cvKey) throw new NotFoundException();

    const file = await this.storage.get(application.cvKey);
    if (!file) throw new NotFoundException();

    const fileName = application.cvFileName ?? 'cv';
    const inlineType =
      disposition === 'inline' ? INLINE_CONTENT_TYPES[cvExtension(fileName)] : undefined;

    res.setHeader('Content-Type', inlineType ?? file.contentType);
    // The type on the wire is the one to honour, whichever path this took.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${inlineType ? 'inline' : 'attachment'}; filename="${fileName.replace(/"/g, '')}"`,
    );
    res.send(file.bytes);
  }
}
