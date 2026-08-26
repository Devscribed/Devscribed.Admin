import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  HIRING_MESSAGES,
  POSITION_STEP,
  alreadyBookedMessage,
  cvExtension,
  formatBookedWhen,
  isValidTimeZone,
  validateBooking,
} from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { AvailabilityService, CalendarUnavailableError } from './availability.service';
import { CalendarProvider, type MailboxRef } from './calendar/calendar-provider';
import { Storage } from './storage/storage';

export interface UploadedCv {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface BookingDto {
  firstName?: string;
  lastName?: string;
  email?: string;
  note?: string;
  startUtc?: string;
  timeZone?: string;
}

export interface AvailabilityQuery {
  timeZone?: string;
  month?: string;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    // Reads go through `AvailabilityService`; creating and cancelling the event are
    // booking actions, so they address the capability directly.
    private readonly calendar: CalendarProvider,
    private readonly storage: Storage,
  ) {}

  /**
   * What the public page renders. Everything internal is absent from the response
   * rather than merely unrendered: the interviewer's name and email never leave the
   * server for this route.
   */
  async publicVacancy(slug: string) {
    const vacancy = await this.findBySlug(slug);
    return {
      organizationName: vacancy.organization.name,
      vacancy: {
        title: vacancy.title,
        description: vacancy.description,
        durationMinutes: vacancy.durationMinutes,
        status: vacancy.status,
      },
    };
  }

  /**
   * One month of the window at a time, keyed by the candidate's own calendar dates.
   *
   * A closed vacancy answers with the window and no slots in it; a calendar that cannot
   * be reached throws instead of answering with an empty map. Those are three different
   * facts and the contract keeps all three distinguishable, because "we could not load
   * times" rendered as "there are no times" is a candidate who quietly goes away.
   */
  async availabilityFor(slug: string, query: AvailabilityQuery) {
    const timeZone = this.requireTimeZone(query.timeZone);
    const vacancy = await this.findBySlug(slug);

    if (vacancy.status !== 'open') {
      const window = this.availability.window(timeZone);
      return {
        timeZone,
        window,
        dates: this.availability.emptyDates(this.availability.monthRange(window, query.month)),
      };
    }

    try {
      return await this.availability.forVacancy({
        interviewerEmail: vacancy.interviewer.email,
        durationMinutes: vacancy.durationMinutes,
        timeZone,
        month: query.month,
      });
    } catch (error) {
      if (error instanceof CalendarUnavailableError) throw this.unavailable();
      throw error;
    }
  }

  /**
   * The order is the specification's (02 §06.25) and the compensation is what makes it
   * atomic: a failure after the CV is stored deletes it, and a failure after the event
   * is created cancels it, before the candidate ever sees an error.
   */
  async book(slug: string, dto: BookingDto, cv: UploadedCv | undefined) {
    const timeZone = this.requireTimeZone(dto.timeZone);
    const vacancy = await this.findBySlug(slug);

    // 1. The vacancy may have closed while the page was open.
    if (vacancy.status !== 'open') {
      throw new ConflictException({
        error: 'vacancy_closed',
        message: HIRING_MESSAGES.booking.vacancyClosed,
      });
    }

    // 2. Field validation, before anything is written or reserved. It runs ahead of the
    //    duplicate and slot checks so an incomplete probe learns nothing about either
    //    (02 §09.37, TC-H02-INT-05).
    const validation = validateBooking({
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      note: dto.note,
      cv: cv ? { fileName: cv.originalname, sizeBytes: cv.size } : null,
    });
    if (!validation.valid) {
      throw new UnprocessableEntityException({ error: 'validation', fields: validation.errors });
    }

    const { firstName, lastName, email, note } = validation.value;

    // 3. The duplicate check, which runs only here — there is no live variant on email
    //    blur, because that would hand out the answer for the price of typing an
    //    address (02 §09.37).
    await this.assertNotAlreadyBooked(vacancy.organizationId, vacancy.id, email);

    // 4. The slot, re-checked against the live calendar. Two questions, deliberately
    //    separate: was this ever on offer, and is it still free.
    const start = this.parseStart(dto.startUtc);
    const end = this.endOf(start, vacancy.durationMinutes);

    const mailbox = await this.resolveMailbox(vacancy.interviewer.email);
    const offered = await this.guard(() =>
      this.availability.isOffered({
        mailbox,
        startUtc: start,
        durationMinutes: vacancy.durationMinutes,
        timeZone,
      }),
    );
    if (!offered) throw this.slotTaken();
    if (!(await this.guard(() => this.availability.isFree(mailbox, start, end)))) {
      throw this.slotTaken();
    }

    const submittedName = `${firstName} ${lastName}`;

    // The ids are minted here so the storage key can be `{applicationId}{extension}` —
    // opaque, application-generated, never derived from the uploaded filename — and so
    // the invite can carry a link to the candidate's card, which needs their id before
    // the row exists. Reading the candidate is not writing one; the upsert below is
    // still the first thing this booking changes.
    const applicationId = randomUUID();
    const candidateId = await this.candidateIdFor(vacancy.organizationId, email);
    const cvKey = `${applicationId}${cvExtension(cv!.originalname)}`;

    let stored = false;
    let eventId: string | null = null;

    try {
      // 5. Store the CV.
      await this.storage.put(cvKey, cv!.buffer, cv!.mimetype);
      stored = true;

      // 6. Create the event. Adding the candidate as an attendee is what delivers the
      //    invite to both parties — this release sends no mail of its own.
      eventId = await this.calendar.createEvent(mailbox, {
        subject: `${vacancy.title} — interview with ${submittedName}`,
        body: this.eventBody({
          vacancy,
          organizationId: vacancy.organizationId,
          candidateId,
          applicationId,
          submittedName,
          email,
          note,
          start,
          timeZone,
        }),
        startUtc: start,
        endUtc: end,
        timeZone,
        attendee: { email, name: submittedName },
        attachment: {
          fileName: cv!.originalname,
          contentType: cv!.mimetype,
          bytes: cv!.buffer,
        },
      });

      // 7. Candidate and application, in one transaction.
      await this.writeBooking({
        applicationId,
        candidateId,
        organizationId: vacancy.organizationId,
        vacancyId: vacancy.id,
        firstName,
        lastName,
        email,
        submittedName,
        start,
        end,
        timeZone,
        note,
        eventId,
        cvKey,
        cvFileName: cv!.originalname,
        cvContentType: cv!.mimetype,
      });
    } catch (error) {
      await this.compensate({ stored, cvKey, mailbox, eventId });
      this.logger.error(
        `Booking failed for vacancy ${vacancy.id} in ${mailbox.address}: ${String(error)}`,
      );
      throw this.bookingFailed();
    }

    // No application id, no candidate id, no internal link (02 API contract).
    return {
      vacancyTitle: vacancy.title,
      durationMinutes: vacancy.durationMinutes,
      startUtc: start.toISOString(),
      timeZone,
      firstName,
      lastName,
      email,
      cvFileName: cv!.originalname,
    };
  }

  /**
   * One future interview per email per vacancy (02 §09).
   *
   * Scoped deliberately on both axes. **Same vacancy only**, because applying to a React
   * role and a .NET role is normal and the candidate database is built on filtering one
   * person's applications by position. **Future only**, because someone who interviewed
   * three months ago is a re-interview, not a duplicate.
   *
   * A cancelled application does not block either. Nothing sets `isCancelled` in this
   * release, so today the clause changes no outcome — it is here so the deferred
   * reschedule flow cannot silently lock a candidate out of rebooking.
   */
  private async assertNotAlreadyBooked(
    organizationId: string,
    vacancyId: string,
    email: string,
  ): Promise<void> {
    const existing = await this.prisma.application.findFirst({
      where: {
        organizationId,
        vacancyId,
        isCancelled: false,
        start: { gt: new Date() },
        candidate: { organizationId, email },
      },
      orderBy: { start: 'asc' },
      select: { start: true, timeZone: true },
    });
    if (!existing) return;

    throw new ConflictException({
      error: 'already_booked',
      message: alreadyBookedMessage(existing.start, existing.timeZone),
    });
  }

  /**
   * The candidate is upserted on `(organizationId, email)` and their name is
   * overwritten by this booking, while `submittedName` on the application is frozen —
   * candidates never sign in, so first-write-wins would make a typo permanent.
   */
  private async writeBooking(input: {
    applicationId: string;
    candidateId: string;
    organizationId: string;
    vacancyId: string;
    firstName: string;
    lastName: string;
    email: string;
    submittedName: string;
    start: Date;
    end: Date;
    timeZone: string;
    note: string;
    eventId: string;
    cvKey: string;
    cvFileName: string;
    cvContentType: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.upsert({
        where: {
          organizationId_email: { organizationId: input.organizationId, email: input.email },
        },
        create: {
          id: input.candidateId,
          organizationId: input.organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
        },
        update: { firstName: input.firstName, lastName: input.lastName },
      });

      // Top of Scheduled, so a new applicant is never buried below the fold (05 §03.12).
      const top = await tx.application.aggregate({
        where: { vacancyId: input.vacancyId, status: 'scheduled' },
        _min: { position: true },
      });
      const position = top._min.position === null ? POSITION_STEP : top._min.position - POSITION_STEP;

      await tx.application.create({
        data: {
          id: input.applicationId,
          organizationId: input.organizationId,
          candidateId: candidate.id,
          vacancyId: input.vacancyId,
          status: 'scheduled',
          position,
          submittedName: input.submittedName,
          start: input.start,
          end: input.end,
          timeZone: input.timeZone,
          graphEventId: input.eventId,
          cvKey: input.cvKey,
          cvFileName: input.cvFileName,
          cvContentType: input.cvContentType,
          note: input.note || null,
        },
      });
    });
  }

  /**
   * The id the invite's deep link will point at — the existing candidate's when this
   * email has booked before, a fresh one otherwise, which the upsert then uses.
   */
  private async candidateIdFor(organizationId: string, email: string): Promise<string> {
    const existing = await this.prisma.candidate.findUnique({
      where: { organizationId_email: { organizationId, email } },
      select: { id: true },
    });
    return existing?.id ?? randomUUID();
  }

  /** No orphaned event, no orphaned CV — whatever succeeded is undone (02 §06.26). */
  private async compensate(state: {
    stored: boolean;
    cvKey: string;
    mailbox: MailboxRef;
    eventId: string | null;
  }): Promise<void> {
    if (state.eventId) {
      await this.calendar
        .cancelEvent(state.mailbox, state.eventId)
        .catch((error) => this.logger.error(`Could not cancel ${state.eventId}: ${String(error)}`));
    }
    if (state.stored) {
      await this.storage
        .delete(state.cvKey)
        .catch((error) => this.logger.error(`Could not delete ${state.cvKey}: ${String(error)}`));
    }
  }

  /**
   * Identical content for both parties — one event, one body (00 §04.19). The deep link
   * to the candidate's card is the only internal thing in it: it is authenticated and
   * the ids are UUIDs, so it reveals that an admin tool exists and nothing else, which
   * 02 §08.32 accepts deliberately.
   */
  private eventBody(input: {
    vacancy: { title: string; durationMinutes: number };
    organizationId: string;
    candidateId: string;
    applicationId: string;
    submittedName: string;
    email: string;
    note: string;
    start: Date;
    timeZone: string;
  }): string {
    const base = process.env.WEB_ORIGIN || 'http://localhost:3000';
    const link = `${base}/org/${input.organizationId}/hiring/candidates/${input.candidateId}?application=${input.applicationId}`;

    return [
      `${input.vacancy.title} — ${input.vacancy.durationMinutes} minutes`,
      // 24-hour, unconditionally: the page's format toggle is the candidate's, not
      // ours, and the zone named is the one they booked in (02 §08.34).
      `${formatBookedWhen(input.start, input.timeZone)} (${input.timeZone})`,
      `${input.submittedName} · ${input.email}`,
      input.note ? `Note: ${input.note}` : null,
      '',
      link,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  private async findBySlug(slug: string) {
    const vacancy = await this.prisma.vacancy.findUnique({
      where: { publicSlug: slug },
      include: {
        organization: { select: { name: true } },
        interviewer: { select: { email: true } },
      },
    });
    // The body must carry no hint that the slug ever existed.
    if (!vacancy) throw new NotFoundException();
    return vacancy;
  }

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

  private async resolveMailbox(email: string): Promise<MailboxRef> {
    return this.guard(() => this.availability.mailbox(email));
  }

  /** Anything the calendar could not answer aborts the booking, never half-books it. */
  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CalendarUnavailableError) throw this.bookingFailed();
      throw error;
    }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({ error: 'availability_unavailable' });
  }

  private bookingFailed(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      error: 'booking_failed',
      message: HIRING_MESSAGES.booking.failed,
    });
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

  private endOf(start: Date, durationMinutes: number): Date {
    return new Date(start.getTime() + durationMinutes * 60_000);
  }

  private slotTaken(): ConflictException {
    return new ConflictException({
      error: 'slot_taken',
      message: HIRING_MESSAGES.booking.slotTaken,
    });
  }
}
