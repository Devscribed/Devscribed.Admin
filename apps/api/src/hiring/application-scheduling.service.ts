import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { isLiveBooking, validateCancelReason } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { CARD_APPLICATION, presentCardApplication } from './application-view';
import {
  actingMember,
  InterviewSchedulingService,
  type AvailabilityRequest,
  type SchedulableInterview,
} from './interview-scheduling.service';

export interface TeamRescheduleDto {
  startUtc?: string;
  timeZone?: string;
}

export interface TeamCancelDto {
  reason?: unknown;
}

/**
 * The team's half of manage booking (spec 07 §08–§10) — the same two actions from
 * inside the app, over rules already proven.
 *
 * Everything that decides *what happens* is in `InterviewSchedulingService`, which the
 * candidate's own routes call with the same arguments and a different acting party. What
 * is here is the difference between the two callers, and it is exactly three things:
 *
 * - **The record is addressed by id, inside the caller's organization.**
 *   `InterviewerScopeGuard` has already established that this member may reach it — with
 *   a 404, never a 403 — so this only has to scope the row and check that it is still
 *   live. A past or cancelled interview is a 404 from here as well, which is what makes
 *   "there is no retroactive cancellation from any surface" true of the API and not
 *   merely of the buttons (07 §01.4, TC-H07-INT-07).
 * - **The acting party is a member, with an account id.** Attribution runs both ways, and
 *   the log makes "the team moved this twice" as visible as "the candidate did"
 *   (07 §11.55).
 * - **Cancelling may carry a reason.** It rides into Microsoft's cancellation notice,
 *   onto the log entry, and into the board badge's tooltip — and onto no candidate-facing
 *   surface (07 §10.48).
 *
 * The response is the updated application **as the candidate card already shapes it**, so
 * the section that invoked the action is replaced in place rather than refetched. A
 * member doing this mid-interview must not have the notes they are typing reloaded from
 * under them.
 */
@Injectable()
export class ApplicationSchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: InterviewSchedulingService,
  ) {}

  /**
   * The same availability the candidate would see: same engine, same mailbox rule, same
   * self-exclusion, and **the same booking window** (07 §09.43).
   *
   * The window bound is a deliberate simplification rather than an oversight. An
   * interview that must move further out than a month is a conversation the team is
   * already having, and they can cancel and re-share the booking link (07 §09.44).
   */
  async availability(organizationId: string, applicationId: string, query: AvailabilityRequest) {
    // Before the lookup, so a malformed zone answers the same way whatever the record
    // turns out to be.
    this.scheduling.requireTimeZone(query.timeZone);
    const application = await this.live(organizationId, applicationId);
    return this.scheduling.availabilityFor(application, query);
  }

  /**
   * Moves the interview on the candidate's behalf, which is safe **precisely because the
   * candidate holds a manage link**: it sets a default, not a decree, and a candidate for
   * whom Thursday does not work opens their own link and moves it again (07 §09.45).
   */
  async reschedule(
    organizationId: string,
    applicationId: string,
    accountId: string,
    dto: TeamRescheduleDto,
  ) {
    this.scheduling.requireTimeZone(dto.timeZone);
    const application = await this.live(organizationId, applicationId);

    await this.scheduling.reschedule(application, dto, actingMember(accountId));
    return this.card(applicationId);
  }

  async cancel(
    organizationId: string,
    applicationId: string,
    accountId: string,
    dto: TeamCancelDto,
  ) {
    const reason = validateCancelReason(dto?.reason);
    if (!reason.valid) {
      throw new UnprocessableEntityException({
        error: 'validation',
        fields: { reason: reason.error },
      });
    }

    const application = await this.live(organizationId, applicationId);
    await this.scheduling.cancel(application, actingMember(accountId), reason.value);
    return this.card(applicationId);
  }

  /* ---------------------------------------------------------------- *
   * Resolution
   * ---------------------------------------------------------------- */

  /**
   * The application, scoped to the organization and still actionable, or a 404.
   *
   * `isLiveBooking` is the one rule both parties share: the interview has not started and
   * has not been called off (07 §14.65). There is no lead-time cutoff on either side —
   * booking has none, so a cutoff on cancelling would be incoherent, and a late
   * cancellation is strictly better than a no-show.
   */
  private async live(
    organizationId: string,
    applicationId: string,
  ): Promise<SchedulableInterview> {
    const application = await this.prisma.application.findFirst({
      where: { id: applicationId, organizationId },
      select: {
        id: true,
        start: true,
        end: true,
        timeZone: true,
        isCancelled: true,
        graphEventId: true,
        // The mailbox the event is actually in, which a reassigned vacancy no longer
        // names (07 §13.62).
        interviewer: { select: { email: true } },
      },
    });
    // Not-live and not-visible are one answer here as well, matching the guard that ran
    // before this and the public route that answers the candidate.
    if (!application || !isLiveBooking(application, new Date())) throw new NotFoundException();
    return application;
  }

  /** The updated application, in the shape the card renders. */
  private async card(applicationId: string) {
    const application = await this.prisma.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: CARD_APPLICATION,
    });
    return presentCardApplication(application);
  }
}
