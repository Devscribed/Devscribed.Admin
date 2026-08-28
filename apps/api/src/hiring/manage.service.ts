import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  HIRING_MESSAGES,
  bookedDurationMinutes,
  isLiveBooking,
  isValidTimeZone,
  planReschedule,
  type BusyInterval,
} from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { AvailabilityService, CalendarUnavailableError } from './availability.service';
import { CalendarProvider } from './calendar/calendar-provider';

/**
 * What the public page renders when the booking is live. Null in every other case.
 *
 * **It names nobody, and no file.** The token addresses one booking, and the link that
 * carries it rides in a calendar event both parties hold and can forward onward
 * (07 §03.15). A live link therefore has to withhold what a dead one does: §04.17 is at
 * pains to stop an expired link confirming that a particular person booked an interview,
 * and a live one that answered with their name, their address and a CV filename usually
 * built from their name would have given all of it away to whoever the invite reached.
 *
 * Withheld from the response rather than merely unrendered, which is the same posture
 * this route already takes for the interviewer (07 §04.21).
 */
export interface ManageBooking {
  startUtc: string;
  /** The application's own length, which the vacancy's may since have left behind. */
  durationMinutes: number;
  timeZone: string;
  /**
   * Whether a CV is on file — never which one. It is what the page needs to offer a
   * replacement without naming the document it would replace (07 §07).
   */
  hasCv: boolean;
}

export interface ManageView {
  organizationName: string;
  vacancy: { title: string; durationMinutes: number; status: string };
  booking: ManageBooking | null;
}

export interface ManageAvailabilityQuery {
  timeZone?: string;
  month?: string;
}

export interface RescheduleDto {
  startUtc?: string;
  timeZone?: string;
}

/** The row shape every path here works from — one `select`, one set of facts. */
type LiveApplication = {
  id: string;
  start: Date;
  end: Date;
  timeZone: string;
  isCancelled: boolean;
  graphEventId: string | null;
  cvFileName: string | null;
  interviewer: { email: string };
};

type ResolvedVacancy = {
  id: string;
  title: string;
  durationMinutes: number;
  status: string;
  organization: { name: string };
};

/**
 * The candidate's own handle on their own booking (spec 07).
 *
 * Two things govern everything here.
 *
 * **Possession of the token is the entire precondition**, the same posture
 * `/book/{slug}` already takes. There is no session, no organization segment, and no
 * rate limit — 07 §15 records that exposure rather than implying otherwise.
 *
 * **Every non-live state is one answer.** A revisited cancellation, a passed interview,
 * a token that never existed and a malformed token all return `booking: null`, and the
 * four are indistinguishable in the response as well as on screen (07 §04.18). The link
 * travels in a calendar event that both parties hold and that can be forwarded onward,
 * so a stale link must not confirm that a particular person booked a particular
 * interview and later cancelled it. Only an unknown **slug** is a bare 404, because the
 * slug is what lets every dead end still render the wordmark, the title and a working
 * "New booking".
 *
 * The two write paths differ in one way that matters. A **reschedule updates the
 * existing row** — `start`, `end`, `timeZone`, and nothing else — because `status` and
 * `position` are the hiring manager's own ordering, and a candidate nudging their
 * interview by thirty minutes must not re-insert their card at the top of `Scheduled`
 * (07 §02.7). A **cancellation sets a flag** and leaves the card exactly where it is.
 * Neither ever creates a second application; rebooking after a cancellation does, and
 * it comes through the public booking page instead.
 */
@Injectable()
export class ManageService {
  private readonly logger = new Logger(ManageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly calendar: CalendarProvider,
  ) {}

  async view(slug: string, token: string): Promise<ManageView> {
    const vacancy = await this.findBySlug(slug);
    const application = await this.findLive(vacancy.id, token);
    return this.present(vacancy, application);
  }

  /**
   * The reschedule picker's times — the same response shape the booking page reads, and
   * deliberately not the same question.
   *
   * It is anchored to **the application**, not to the vacancy: its own duration, its own
   * booked interviewer's mailbox, and its own event excluded from the busy calculation.
   * A vacancy that has since been re-timed or reassigned changes none of the three
   * (07 §13.61, §13.62), and without the exclusion a candidate moving thirty minutes
   * later would collide with themselves (07 §05.25).
   */
  async availabilityFor(slug: string, token: string, query: ManageAvailabilityQuery) {
    const timeZone = this.requireTimeZone(query.timeZone);
    const { application } = await this.live(slug, token);

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
   * The calendar goes first and the row follows, exactly as cancelling does. A slot
   * claimed between selection and submission answers `409` with the existing booking
   * **wholly intact** — nothing is cancelled in order to attempt a move, so a failed
   * reschedule always leaves the candidate with the interview they already had.
   */
  async reschedule(slug: string, token: string, dto: RescheduleDto): Promise<ManageView> {
    const timeZone = this.requireTimeZone(dto.timeZone);
    const { vacancy, application } = await this.live(slug, token);
    const start = this.parseStart(dto.startUtc);

    const change = planReschedule(application, { startUtc: start, timeZone });
    // Moving an interview to the time it already has is not a reschedule: accepted, no
    // calendar call, no log entry (07 validation rule 3).
    if (!change) return this.present(vacancy, application);

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
            actor: 'candidate',
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

    return this.present(vacancy, { ...application, ...change });
  }

  /**
   * Calendar first, then the row — and no compensating "un-cancel" if the second half
   * fails, because a notification cannot be recalled (07 Alt flow).
   *
   * A retry after a database failure re-issues the same cancellation, which both
   * providers treat as success on an event that is already gone, and then completes the
   * write. There is nothing to roll back and nothing to reconcile.
   */
  async cancel(slug: string, token: string) {
    const { vacancy, application } = await this.live(slug, token);

    if (application.graphEventId) {
      try {
        const mailbox = await this.availability.mailbox(application.interviewer.email);
        await this.calendar.cancelEvent(mailbox, application.graphEventId);
      } catch (error) {
        // A mailbox that no longer resolves and a cancellation the calendar refused are
        // the same fact to the candidate: nothing has changed and it is worth trying
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
            // No account, and no reason: asking a stranger to justify themselves at the
            // moment they are withdrawing buys the organization nothing it can act on
            // (07 §06.29).
            actor: 'candidate',
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

    return {
      organizationName: vacancy.organization.name,
      vacancy: { title: vacancy.title, status: vacancy.status },
      cancelled: true as const,
    };
  }

  /* ---------------------------------------------------------------- *
   * Resolution
   * ---------------------------------------------------------------- */

  /**
   * The vacancy and the live application, or a 404 — what every action starts from.
   *
   * The `GET` is the one caller that wants `null` instead: it renders a screen for the
   * blurred state, where an action has nothing to do but refuse.
   */
  private async live(
    slug: string,
    token: string,
  ): Promise<{ vacancy: ResolvedVacancy; application: LiveApplication }> {
    const vacancy = await this.findBySlug(slug);
    const application = await this.findLive(vacancy.id, token);
    // Acting on an already-cancelled or already-started booking is not an error the
    // visitor can distinguish from a bad token, and must not be (07 §04.17).
    if (!application) throw new NotFoundException();
    return { vacancy, application };
  }

  /**
   * The vacancy, which resolves even when the token does not — that is the whole reason
   * the manage URL carries the slug as well (07 §03.13).
   */
  private async findBySlug(slug: string): Promise<ResolvedVacancy> {
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { publicSlug: slug },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        status: true,
        organization: { select: { name: true } },
      },
    });
    if (!vacancy) throw new NotFoundException();
    return vacancy;
  }

  /**
   * The live application this token addresses, or null.
   *
   * One query for every cause, so the four are not separable by timing either. The
   * vacancy is part of the lookup rather than merely checked afterwards: a token is
   * scoped to the booking it was minted for, and a valid token on the wrong slug is not
   * a redirect to fix, it is a link that does not resolve.
   */
  private async findLive(vacancyId: string, token: string): Promise<LiveApplication | null> {
    const application = await this.prisma.application.findFirst({
      where: { manageToken: token, vacancyId },
      select: {
        id: true,
        start: true,
        end: true,
        timeZone: true,
        isCancelled: true,
        graphEventId: true,
        cvFileName: true,
        interviewer: { select: { email: true } },
      },
    });
    if (!application) return null;
    return isLiveBooking(application, new Date()) ? application : null;
  }

  /**
   * The interview's own event, as the free/busy reads report it — the one block a
   * reschedule must not treat as somebody else's.
   */
  private ownEvent(application: { start: Date; end: Date }): BusyInterval {
    return { startUtc: application.start, endUtc: application.end };
  }

  private present(vacancy: ResolvedVacancy, application: LiveApplication | null): ManageView {
    return {
      organizationName: vacancy.organization.name,
      vacancy: {
        title: vacancy.title,
        // The vacancy's current setting, which the header renders; the booking carries
        // its own length beside it, and the two legitimately differ (07 §13.61).
        durationMinutes: vacancy.durationMinutes,
        status: vacancy.status,
      },
      booking: application && {
        startUtc: application.start.toISOString(),
        durationMinutes: bookedDurationMinutes(application),
        timeZone: application.timeZone,
        // A boolean, not the filename: candidates name their CVs after themselves, so
        // `jane-doe-cv.pdf` would hand back most of what withholding the name removed.
        hasCv: application.cvFileName !== null,
      },
    };
  }

  /* ---------------------------------------------------------------- *
   * Failures
   * ---------------------------------------------------------------- */

  /**
   * The zone is machine-supplied — the page reads it from the browser — so a bad one is
   * a malformed request, not something to write a candidate-facing message about.
   */
  private requireTimeZone(timeZone: string | undefined): string {
    if (!isValidTimeZone(timeZone)) {
      throw new BadRequestException({ error: 'invalid_time_zone' });
    }
    return timeZone;
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
