import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  HIRING_MESSAGES,
  bookedDurationMinutes,
  cancelNoticeComment,
  isValidTimeZone,
  planReschedule,
  type BusyInterval,
  type RescheduleChange,
  type ScheduleActor,
} from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { AvailabilityService, CalendarUnavailableError } from './availability.service';
import { CalendarProvider } from './calendar/calendar-provider';

/**
 * The facts a move or a cancellation works from, whichever surface asked for it.
 *
 * Both hosts resolve their own row — the candidate's by slug and token, the team's by id
 * inside the caller's organization — and hand it here in this one shape, so nothing
 * below can accidentally depend on how the caller was identified.
 */
export interface SchedulableInterview {
  id: string;
  start: Date;
  end: Date;
  timeZone: string;
  graphEventId: string | null;
  /** The interviewer this booking was **made with**, never the vacancy's current one. */
  interviewer: { email: string };
}

/**
 * Who acted, exactly as `ApplicationScheduleEvent` records it. Attribution runs both
 * ways — "the team moved this twice" is as much a fact as "the candidate did"
 * (07 §11.55).
 */
export interface ActingParty {
  actor: ScheduleActor;
  /** Set for a member, null for the candidate — the column mirrors this exactly. */
  accountId: string | null;
}

/** Possession of the token is the whole identity; there is no account behind it. */
export const CANDIDATE: ActingParty = { actor: 'candidate', accountId: null };

export const actingMember = (accountId: string): ActingParty => ({
  actor: 'member',
  accountId,
});

export interface AvailabilityRequest {
  timeZone?: string;
  month?: string;
}

/**
 * Moving an interview and calling it off, over one set of rules, for both parties.
 *
 * The candidate reaches these through a token and the team through a session, and that
 * is the *only* difference between the two paths: same booking window, same duration
 * anchor, same mailbox, same self-exclusion, same idempotency, same errors. Keeping the
 * rules here rather than in each host is what stops the team's picker quietly offering a
 * time the candidate's would refuse — "one picker, one set of rules, two hosts"
 * (07 §09.43).
 *
 * Three rules are worth naming because each of them is a bug the obvious implementation
 * would have:
 *
 * **A reschedule is never cancel-and-recreate.** Composing it from the two existing
 * calendar methods would send the candidate a notice saying their interview is
 * *cancelled* as the first half of moving it — under 07 §01.1 the one message this
 * feature must never send.
 *
 * **Availability is anchored to the application, not the vacancy.** Its own duration,
 * its own booked interviewer's mailbox, and its own event excluded from the busy
 * calculation. Without the last of those, a candidate moving thirty minutes later
 * collides with themselves.
 *
 * **The calendar goes first and the row follows, with no compensating step.** A
 * notification cannot be recalled, so a failed database write fails the request and logs
 * the divergence; both calendar operations are idempotent, and a retry re-issues the
 * same one before completing the write.
 */
@Injectable()
export class InterviewSchedulingService {
  private readonly logger = new Logger(InterviewSchedulingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly calendar: CalendarProvider,
  ) {}

  /**
   * The reschedule picker's times — the same response shape the booking page reads, and
   * deliberately not the same question.
   *
   * A vacancy that has since been re-timed or reassigned changes none of the three
   * anchors (07 §13.61, §13.62).
   */
  async availabilityFor(application: SchedulableInterview, query: AvailabilityRequest) {
    const timeZone = this.requireTimeZone(query.timeZone);

    try {
      return await this.availability.forInterviewer({
        interviewerEmail: application.interviewer.email,
        durationMinutes: bookedDurationMinutes(application),
        timeZone,
        month: query.month,
        exclude: this.ownEvent(application),
      });
    } catch (error) {
      if (error instanceof CalendarUnavailableError) {
        throw new ServiceUnavailableException({ error: 'availability_unavailable' });
      }
      throw error;
    }
  }

  /**
   * Moves the interview, and moves nothing else.
   *
   * Answers the change that was written, or **null when there was nothing to write**:
   * rescheduling to the time the interview already has is accepted, touches no calendar
   * and logs no event, because moving an interview to the time it already has is not a
   * reschedule (07 validation rule 3).
   *
   * A slot claimed between selection and submission answers `409` with the existing
   * booking **wholly intact** — nothing is cancelled in order to attempt a move, so a
   * failed reschedule always leaves the interview that was already there.
   */
  async reschedule(
    application: SchedulableInterview,
    to: { startUtc?: string; timeZone?: string },
    party: ActingParty,
  ): Promise<RescheduleChange | null> {
    const timeZone = this.requireTimeZone(to.timeZone);
    const start = this.parseStart(to.startUtc);

    const change = planReschedule(application, { startUtc: start, timeZone });
    if (!change) return null;

    const durationMinutes = bookedDurationMinutes(application);
    const mailbox = await this.guard(() =>
      this.availability.mailbox(application.interviewer.email),
    );

    // Two questions, deliberately separate — was this ever on offer, and is it still
    // free — so neither can mask the other (02 §06.25.3).
    const offered = await this.guard(() =>
      this.availability.isOffered({ mailbox, startUtc: change.start, durationMinutes, timeZone }),
    );
    if (!offered) throw this.slotTaken();

    /*
     * Whether the calendar has already been moved by an attempt whose database write
     * failed (07 Alt flow, *the database write fails after the calendar succeeded*).
     *
     * That state is invisible from the row, and it is what makes the naive retry fail:
     * the event is sitting on the target, so the target reads as taken — by the very
     * interview trying to move onto it. The two cases are told apart by asking where
     * this interview's event actually is. If the calendar still holds it where the row
     * says, the blocker is somebody else's meeting and this is ordinary contention. If
     * it does not, the blocker is our own displaced event.
     *
     * An event deleted outside the product would read the same way. Nothing in 07
     * reconciles a calendar somebody edited by hand, and this does not pretend to.
     */
    let alreadyMoved = false;

    const free = await this.guard(() =>
      this.availability.isFreeExcept(
        mailbox,
        change.start,
        change.end,
        this.ownEvent(application),
      ),
    );
    if (!free) {
      alreadyMoved = await this.guard(
        async () => !(await this.availability.holdsExactly(mailbox, this.ownEvent(application))),
      );
      if (!alreadyMoved) throw this.slotTaken();
    }

    // Nothing to re-issue when the event is already on the target: a second `PATCH`
    // would change nothing and would send both parties a second meeting-updated notice
    // for a move they were already told about.
    if (application.graphEventId && !alreadyMoved) {
      try {
        // In place. Never a cancellation followed by a fresh booking — that would tell
        // the candidate their interview is cancelled as the first half of moving it
        // (07 §12.57), re-upload the CV every time, and leave a tombstone behind.
        await this.calendar.updateEvent(mailbox, application.graphEventId, {
          startUtc: change.start,
          endUtc: change.end,
          timeZone: change.timeZone,
        });
      } catch (error) {
        this.logger.error(
          `Reschedule failed for application ${application.id}: ${String(error)}`,
        );
        throw this.rescheduleFailed();
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.application.update({
          where: { id: application.id },
          // Three columns. `status`, `position`, `submittedName`, the CV, the notes and
          // the criteria are all untouched, and the board card does not move (07 §02.6).
          data: { start: change.start, end: change.end, timeZone: change.timeZone },
        });
        await tx.applicationScheduleEvent.create({
          data: {
            applicationId: application.id,
            type: 'rescheduled',
            actor: party.actor,
            actorAccountId: party.accountId,
            fromStart: application.start,
            toStart: change.start,
            timeZone: change.timeZone,
          },
        });
      });
    } catch (error) {
      // The calendar has already moved and both parties have already been told. There
      // is no compensating move back, because a notification cannot be recalled: the
      // request fails, the divergence is logged, and a retry re-issues the same update
      // — which changes nothing a second time — before completing the write.
      this.logger.error(
        `Calendar moved but the database did not, for application ${application.id}: ${String(error)}`,
      );
      throw this.rescheduleFailed();
    }

    return change;
  }

  /**
   * Calendar first, then the row — and no compensating "un-cancel" if the second half
   * fails, because a notification cannot be recalled (07 Alt flow).
   *
   * A retry after a database failure re-issues the same cancellation, which both
   * providers treat as success on an event that is already gone, and then completes the
   * write. There is nothing to roll back and nothing to reconcile.
   *
   * `reason` is the team's, and only the team's: a candidate is never asked to justify
   * withdrawing (07 §06.29). It rides into the notice Microsoft sends and onto the log
   * entry, and appears on no candidate-facing surface.
   */
  async cancel(
    application: SchedulableInterview,
    party: ActingParty,
    reason: string | null = null,
  ): Promise<void> {
    if (application.graphEventId) {
      try {
        const mailbox = await this.availability.mailbox(application.interviewer.email);
        await this.calendar.cancelEvent(
          mailbox,
          application.graphEventId,
          cancelNoticeComment(reason),
        );
      } catch (error) {
        // A mailbox that no longer resolves and a cancellation the calendar refused are
        // the same fact to the caller: nothing has changed and it is worth trying
        // again. The flag is not set, so the booking stays live and reachable.
        this.logger.error(`Cancel failed for application ${application.id}: ${String(error)}`);
        throw this.cancelFailed();
      }
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.application.update({
          where: { id: application.id },
          // `status` and `position` are untouched. The board's ordering is the hiring
          // manager's, and a cancelled card keeps its column and every assessment on it
          // (07 §01.3).
          data: { isCancelled: true },
        });
        await tx.applicationScheduleEvent.create({
          data: {
            applicationId: application.id,
            type: 'cancelled',
            actor: party.actor,
            actorAccountId: party.accountId,
            reason,
            timeZone: application.timeZone,
          },
        });
      });
    } catch (error) {
      this.logger.error(
        `Calendar cancelled but the database did not, for application ${application.id}: ${String(error)}`,
      );
      throw this.cancelFailed();
    }
  }

  /* ---------------------------------------------------------------- *
   * Shared failures — identical on both surfaces, on purpose
   * ---------------------------------------------------------------- */

  /**
   * The zone is machine-supplied — the page reads it from the browser — so a bad one is
   * a malformed request, not something to write a visitor-facing message about.
   */
  requireTimeZone(timeZone: string | undefined): string {
    if (!isValidTimeZone(timeZone)) {
      throw new BadRequestException({ error: 'invalid_time_zone' });
    }
    return timeZone;
  }

  /**
   * The interview's own event, as the free/busy reads report it — the one block a
   * reschedule must not treat as somebody else's.
   */
  private ownEvent(application: { start: Date; end: Date }): BusyInterval {
    return { startUtc: application.start, endUtc: application.end };
  }

  private parseStart(startUtc: string | undefined): Date {
    const start = new Date(startUtc ?? '');
    if (Number.isNaN(start.getTime())) {
      throw new UnprocessableEntityException({
        error: 'validation',
        fields: { startUtc: HIRING_MESSAGES.booking.slotRequired },
      });
    }
    return start;
  }

  /** A calendar that cannot answer aborts the move; it never half-moves it. */
  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CalendarUnavailableError) throw this.rescheduleFailed();
      throw error;
    }
  }

  /**
   * A start that was never offered and a start that has just been taken are one
   * answer — the offer is stale either way, and accommodating a time the page never
   * showed is how a booking ends up outside working hours (02, validation rule 5).
   */
  private slotTaken(): ConflictException {
    return new ConflictException({
      error: 'slot_taken',
      message: HIRING_MESSAGES.booking.slotTaken,
    });
  }

  private rescheduleFailed(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      error: 'reschedule_failed',
      message: HIRING_MESSAGES.manage.rescheduleFailed,
    });
  }

  private cancelFailed(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      error: 'cancel_failed',
      message: HIRING_MESSAGES.manage.cancelFailed,
    });
  }
}
