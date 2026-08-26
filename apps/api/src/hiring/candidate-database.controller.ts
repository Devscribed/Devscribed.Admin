import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { CandidateQueryParams } from '@devscribed/validation';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { CandidateDatabaseGuard } from './candidate-database.guard';
import { CandidateDatabaseService } from './candidate-database.service';

/**
 * The candidate database's one read (spec 03 §API).
 *
 * It shares its path with `CandidatesController`, which owns `:candidateId` — the card —
 * and deliberately not its guard: the card answers a non-manager `403` today and will
 * narrow to the assigned interviewer's own applications when `InterviewerScopeGuard`
 * lands, while the database answers `404` to every caller who may not see it, including
 * that interviewer. Two questions, two guards, one prefix.
 */
@Controller('api/organizations/:orgId/hiring/candidates')
@UseGuards(SessionGuard, OrgScopeGuard, CandidateDatabaseGuard)
export class CandidateDatabaseController {
  constructor(private readonly candidates: CandidateDatabaseService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: CandidateQueryParams) {
    // Always the session's organization — the path parameter has only been compared.
    return this.candidates.list(req.session!.organizationId, query, req.session!.accountId);
  }
}
