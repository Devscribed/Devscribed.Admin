import { Body, Controller, Delete, Get, Param, Patch, Put, Req, UseGuards } from '@nestjs/common';
import type { AssessmentInput } from '@devscribed/validation';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import { SessionGuard } from '../auth/session.guard';
import { HiringManageGuard } from './hiring-manage.guard';
import type { ScopedRequest } from './interviewer-scope.guard';
import { InterviewerScopeGuard } from './interviewer-scope.guard';
import type { ApplicationPatchDto } from './candidates.service';
import { CandidatesService } from './candidates.service';

/**
 * The candidate card's read (spec 04 §API).
 *
 * `admin` and `manager` reach every candidate in their organization; a `user` reaches
 * one they interview for, and sees only their own vacancies' sections of it. Both are
 * `InterviewerScopeGuard`, which is also what refuses everybody else — with a 404, so
 * that "you may not" and "there is no such candidate" are one answer.
 */
@Controller('api/organizations/:orgId/hiring/candidates')
@UseGuards(SessionGuard, OrgScopeGuard, InterviewerScopeGuard)
export class CandidatesController {
  constructor(private readonly candidates: CandidatesService) {}

  @Get(':candidateId')
  card(@Req() req: ScopedRequest, @Param('candidateId') candidateId: string) {
    // Always the session's organization — the path parameter has only been compared.
    return this.candidates.card(
      req.session!.organizationId,
      candidateId,
      req.session!.accountId,
      // Decided by the guard, which already read the membership that decides it.
      req.hiringScope?.ownVacanciesOnly ?? false,
    );
  }
}

/**
 * Deleting a candidate (03 §11) — the third controller on this prefix, and a third guard.
 *
 * `CandidatesController` above asks *is this caller entitled to this record*, and
 * `CandidateDatabaseController` asks *does this screen exist for them*; both admit the
 * assigned interviewer, and both answer 404. This one asks neither question. Deleting a
 * person is a management act, so it is `HiringManageGuard` and it answers **403** — the
 * caller is a member of this organization and reaching a candidate they can already open,
 * so there is nothing to conceal and every reason to say plainly that they may not.
 *
 * It is a separate class because a method-level guard in Nest *adds* to the class's
 * rather than replacing them. Mounted on `CandidatesController`, an interviewer would be
 * refused by whichever guard reached them first — 403 for a candidate of theirs, 404 for
 * anybody else's — so the status code would answer a question about the *record* while
 * the rule being enforced is about the *caller*. One route, one guard, one refusal.
 */
@Controller('api/organizations/:orgId/hiring/candidates')
@UseGuards(SessionGuard, OrgScopeGuard, HiringManageGuard)
export class CandidateDeletionController {
  constructor(private readonly candidates: CandidatesService) {}

  @Delete(':candidateId')
  remove(@Req() req: ScopedRequest, @Param('candidateId') candidateId: string) {
    // Always the session's organization — the path parameter has only been compared.
    return this.candidates.remove(req.session!.organizationId, candidateId);
  }
}

/**
 * The card's writes, addressed by application rather than by candidate because that is
 * what the fields belong to: notes and a conclusion were formed in one interview, for
 * one vacancy (04 §Summary).
 *
 * Addressing them that way is also what lets the guard scope them exactly: an
 * interviewer patching another vacancy's application by id is refused on the row rather
 * than on their role, and refused with 404 (TC-H04-INT-01).
 *
 * Shares its prefix with `CvController`, which owns `:applicationId/cv`.
 */
@Controller('api/organizations/:orgId/hiring/applications')
@UseGuards(SessionGuard, OrgScopeGuard, InterviewerScopeGuard)
export class ApplicationsController {
  constructor(private readonly candidates: CandidatesService) {}

  @Patch(':applicationId')
  patch(
    @Req() req: ScopedRequest,
    @Param('applicationId') applicationId: string,
    @Body() dto: ApplicationPatchDto,
  ) {
    // The candidate's own fields — name, email, their note, the CV — are absent from
    // the dto type and from the update, so no endpoint on this page can write one
    // (04 §Validation.9).
    return this.candidates.patchApplication(req.session!.organizationId, applicationId, dto);
  }

  /**
   * One criterion's value on this application (04 §05).
   *
   * `PUT` because the pair is the row: assessing a criterion that is already there edits
   * it rather than adding a second, which is what "at most once per application" means.
   */
  @Put(':applicationId/criteria/:criterionId')
  putCriterion(
    @Req() req: ScopedRequest,
    @Param('applicationId') applicationId: string,
    @Param('criterionId') criterionId: string,
    @Body() dto: AssessmentInput,
  ) {
    return this.candidates.putCriterion(
      req.session!.organizationId,
      applicationId,
      criterionId,
      dto,
    );
  }

  /** Removes the assessment only; the criterion stays in the library (04 §05.25). */
  @Delete(':applicationId/criteria/:criterionId')
  removeCriterion(
    @Req() req: ScopedRequest,
    @Param('applicationId') applicationId: string,
    @Param('criterionId') criterionId: string,
  ) {
    return this.candidates.removeCriterion(
      req.session!.organizationId,
      applicationId,
      criterionId,
    );
  }
}
