import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { CandidateQueryParams } from '@devscribed/validation';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import { SessionGuard } from '../auth/session.guard';
import { CandidateDatabaseGuard } from './candidate-database.guard';
import { CandidateDatabaseService } from './candidate-database.service';
import type { ScopedRequest } from './interviewer-scope.guard';

/**
 * The candidate database's one read (spec 03 §API).
 *
 * It shares its path with `CandidatesController`, which owns `:candidateId` — the card —
 * and deliberately not its guard. The card answers a question about one record: is the
 * caller entitled to *this* candidate. The database answers a question about the screen:
 * does it exist for this caller at all. Both refuse with 404, and both admit the assigned
 * interviewer, but they decide it against different rows. Two questions, two guards, one
 * prefix.
 *
 * `canSeeAll` comes off the request rather than out of the query string. The scope the
 * caller asked for is a preference; the scope they are allowed is the guard's finding,
 * and the service is handed the second (03 §07.33).
 */
@Controller('api/organizations/:orgId/hiring/candidates')
@UseGuards(SessionGuard, OrgScopeGuard, CandidateDatabaseGuard)
export class CandidateDatabaseController {
  constructor(private readonly candidates: CandidateDatabaseService) {}

  @Get()
  list(@Req() req: ScopedRequest, @Query() query: CandidateQueryParams) {
    // Always the session's organization — the path parameter has only been compared.
    return this.candidates.list(req.session!.organizationId, query, {
      accountId: req.session!.accountId,
      canSeeAll: !req.hiringScope?.ownVacanciesOnly,
    });
  }
}
