import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HIRING_MESSAGES, isLiveBooking } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { AvailabilityService } from './availability.service';
import { CalendarProvider } from './calendar/calendar-provider';

/** What the public page renders when the booking is live. Null in every other case. */
export interface ManageBooking {
  startUtc: string;
  /** The application's own length, which the vacancy's may since have left behind. */
  durationMinutes: number;
  timeZone: string;
  firstName: string;
  lastName: string;
  email: string;
  cvFileName: string | null;
}

export interface ManageView {
  organizationName: string;
  vacancy: { title: string; durationMinutes: number; status: string };
  booking: ManageBooking | null;
}

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
        durationMinutes: Math.round(
          (application.end.getTime() - application.start.getTime()) / 60_000,
        ),
        timeZone: application.timeZone,
        /*
         * The candidate row's names rather than the frozen `submittedName` split in two:
         * the split was never recorded, and a name with a space in either half would be
         * divided in the wrong place. `submittedName` stays frozen for the record the
         * team reads; this page is showing the candidate themselves.
         */
        firstName: application.candidate.firstName,
        lastName: application.candidate.lastName,
        email: application.candidate.email,
        cvFileName: application.cvFileName,
      },
    };
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
    const vacancy = await this.findBySlug(slug);
    const application = await this.findLive(vacancy.id, token);
    // Cancelling an already-cancelled booking is not an error the visitor can
    // distinguish from a bad token, and must not be (07 §04.17).
    if (!application) throw new NotFoundException();

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

    return {
      organizationName: vacancy.organization.name,
      vacancy: { title: vacancy.title, status: vacancy.status },
      cancelled: true as const,
    };
  }

  /**
   * The vacancy, which resolves even when the token does not — that is the whole reason
   * the manage URL carries the slug as well (07 §03.13).
   */
  private async findBySlug(slug: string) {
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
  private async findLive(vacancyId: string, token: string) {
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
        candidate: { select: { firstName: true, lastName: true, email: true } },
        interviewer: { select: { email: true } },
      },
    });
    if (!application) return null;
    return isLiveBooking(application, new Date()) ? application : null;
  }

  private cancelFailed(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      error: 'cancel_failed',
      message: HIRING_MESSAGES.manage.cancelFailed,
    });
  }
}
