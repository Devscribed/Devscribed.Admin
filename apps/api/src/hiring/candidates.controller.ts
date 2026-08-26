import { Body, Controller, Get, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { HiringManageGuard } from './hiring-manage.guard';
import type { ApplicationPatchDto } from './candidates.service';
import { CandidatesService } from './candidates.service';

/**
 * The candidate card's read (spec 04 §API).
 *
 * `admin` and `manager` reach every candidate in their organization. The assigned
 * interviewer's narrower view — the same page with only their own vacancies'
 * application sections — arrives with `InterviewerScopeGuard` in a later phase; until
 * then a `user` is refused here like any other non-manager.
 */
@Controller('api/organizations/:orgId/hiring/candidates')
@UseGuards(SessionGuard, OrgScopeGuard, HiringManageGuard)
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get(':candidateId')
  card(@Req() req: AuthenticatedRequest, @Param('candidateId') candidateId: string) {
    // Always the session's organization — the path parameter has only been compared.
    return this.candidates.card(
      req.session!.organizationId,
      candidateId,
      req.session!.accountId,
    );
  }
}

/**
 * The card's writes, addressed by application rather than by candidate because that is
 * what the fields belong to: notes and a conclusion were formed in one interview, for
 * one vacancy (04 §Summary).
 *
 * Shares its prefix with `CvController`, which owns `:applicationId/cv`.
 */
@Controller('api/organizations/:orgId/hiring/applications')
@UseGuards(SessionGuard, OrgScopeGuard, HiringManageGuard)
export class ApplicationsController {
  constructor(private readonly candidates: CandidatesService) {}

  @Patch(':applicationId')
  patch(
    @Req() req: AuthenticatedRequest,
    @Param('applicationId') applicationId: string,
    @Body() dto: ApplicationPatchDto,
  ) {
    // The candidate's own fields — name, email, their note, the CV — are absent from
    // the dto type and from the update, so no endpoint on this page can write one
    // (04 §Validation.9).
    return this.candidates.patchApplication(req.session!.organizationId, applicationId, dto);
  }
}
