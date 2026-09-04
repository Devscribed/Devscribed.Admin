import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OrgScopeGuard } from '../auth/org-scope.guard';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type { TeamCancelDto, TeamRescheduleDto } from './application-scheduling.service';
import { ApplicationSchedulingService } from './application-scheduling.service';
import { InterviewerScopeGuard } from './interviewer-scope.guard';
import type { AvailabilityRequest } from './interview-scheduling.service';

/**
 * Moving and cancelling an interview from inside the app (spec 07 §08–§10).
 *
 * **No new guard and no new role.** The audience for these three routes is exactly the
 * candidate card's — `admin`, `manager`, and the assigned interviewer — which
 * `InterviewerScopeGuard` already expresses, addressed by `:applicationId` the same way
 * the card's writes are. It answers 404 rather than 403 for a record the caller may not
 * see, so "you may not" and "there is no such interview" stay one answer.
 *
 * Its prefix is shared with `ApplicationsController` and `CvController`, which own the
 * card's other writes under the same guard stack.
 *
 * Nothing here is offered on the board. The board expresses pipeline stage, and mixing
 * "move this candidate to Passed" with "move this interview to Thursday" on one card
 * conflates two unrelated kinds of movement (07 §08.41).
 */
@Controller('api/organizations/:orgId/hiring/applications')
@UseGuards(SessionGuard, OrgScopeGuard, InterviewerScopeGuard)
export class ApplicationSchedulingController {
  constructor(private readonly scheduling: ApplicationSchedulingService) {}

  /** The same times the candidate's picker would show — one engine, two hosts. */
  @Get(':applicationId/availability')
  availability(
    @Req() req: AuthenticatedRequest,
    @Param('applicationId') applicationId: string,
    @Query() query: AvailabilityRequest,
  ) {
    // Always the session's organization — the path parameter has only been compared.
    return this.scheduling.availability(req.session!.organizationId, applicationId, query);
  }

  @Post(':applicationId/reschedule')
  @HttpCode(200)
  reschedule(
    @Req() req: AuthenticatedRequest,
    @Param('applicationId') applicationId: string,
    @Body() dto: TeamRescheduleDto,
  ) {
    return this.scheduling.reschedule(
      req.session!.organizationId,
      applicationId,
      req.session!.accountId,
      dto,
    );
  }

  @Post(':applicationId/cancel')
  @HttpCode(200)
  cancel(
    @Req() req: AuthenticatedRequest,
    @Param('applicationId') applicationId: string,
    @Body() dto: TeamCancelDto,
  ) {
    return this.scheduling.cancel(
      req.session!.organizationId,
      applicationId,
      // Who cancelled, recorded on the event and rendered on the badge (07 §11.55).
      req.session!.accountId,
      dto,
    );
  }
}
