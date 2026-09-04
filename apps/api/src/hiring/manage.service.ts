import { Injectable, NotFoundException } from '@nestjs/common';
import { bookedDurationMinutes, isLiveBooking } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import type { UploadedCv } from './booking.service';
import { CvReplacementService } from './cv-replacement.service';
import {
  CANDIDATE,
  InterviewSchedulingService,
  type AvailabilityRequest,
  type SchedulableInterview,
} from './interview-scheduling.service';

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

export type ManageAvailabilityQuery = AvailabilityRequest;

export interface RescheduleDto {
  startUtc?: string;
  timeZone?: string;
}

/** The row shape every path here works from — one `select`, one set of facts. */
type LiveApplication = SchedulableInterview & {
  isCancelled: boolean;
  cvFileName: string | null;
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
 * What a move and a cancellation actually *do* is not here: it is in
 * `InterviewSchedulingService`, which the team's routes call with the same arguments and
 * a different acting party. This class is the candidate's half — resolving a token, and
 * shaping a response that names nobody.
 */
@Injectable()
export class ManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: InterviewSchedulingService,
    private readonly cv: CvReplacementService,
  ) {}

  async view(slug: string, token: string): Promise<ManageView> {
    const vacancy = await this.findBySlug(slug);
    const application = await this.findLive(vacancy.id, token);
    return this.present(vacancy, application);
  }

  /**
   * The reschedule picker's times. `404` whenever `GET` would answer `booking: null` —
   * the availability of an interview that cannot be moved is not a fact this route has
   * any business answering with.
   */
  async availabilityFor(slug: string, token: string, query: ManageAvailabilityQuery) {
    // Before the lookup, so a malformed zone cannot be used to distinguish a live
    // booking from a dead one by which error comes back first.
    this.scheduling.requireTimeZone(query.timeZone);
    const { application } = await this.live(slug, token);
    return this.scheduling.availabilityFor(application, query);
  }

  /**
   * Moves the interview, and moves nothing else — attributed to the candidate, who has
   * no account and is therefore recorded with none.
   */
  async reschedule(slug: string, token: string, dto: RescheduleDto): Promise<ManageView> {
    this.scheduling.requireTimeZone(dto.timeZone);
    const { vacancy, application } = await this.live(slug, token);

    const change = await this.scheduling.reschedule(application, dto, CANDIDATE);
    // Null means the requested start is the one it already has: accepted, and the
    // record is answered back unchanged (07 validation rule 3).
    return this.present(vacancy, change ? { ...application, ...change } : application);
  }

  /**
   * No account, and no reason: asking a stranger to justify themselves at the moment
   * they are withdrawing buys the organization nothing it can act on (07 §06.29).
   */
  async cancel(slug: string, token: string) {
    const { vacancy, application } = await this.live(slug, token);
    await this.scheduling.cancel(application, CANDIDATE);

    return {
      organizationName: vacancy.organization.name,
      vacancy: { title: vacancy.title, status: vacancy.status },
      cancelled: true as const,
    };
  }

  /**
   * A new CV, and nothing else about the booking touched.
   *
   * **Not gated behind rescheduling** and not a precondition of it: a candidate who
   * spotted a typo in their CV must not have to move their interview to fix it, and a
   * candidate who only wants a different Tuesday must not be interrogated about their CV
   * (07 §07.32).
   *
   * The answer is the same body `GET` gives, which names no file — `hasCv` is all it
   * carries about the CV, for the same reason the live record withholds the filename in
   * the first place (07 §04.21). The page that just uploaded it already knows what it
   * sent.
   */
  async replaceCv(slug: string, token: string, cv: UploadedCv | undefined): Promise<ManageView> {
    const { vacancy, application } = await this.live(slug, token);
    const stored = await this.cv.replace(application, cv);
    return this.present(vacancy, { ...application, cvFileName: stored.fileName });
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
}
