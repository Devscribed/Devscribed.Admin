import {
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
  cvExtension,
  validateBooking,
} from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { CalendarProvider, type MailboxRef } from './calendar/calendar-provider';
import { availableSlots, isOfferedSlot } from './slots';
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

/**
 * The zone every phase-1 time is expressed in. The candidate picks a zone in phase 2,
 * when the calendar control and the real availability engine arrive; until then the
 * page says UTC rather than implying a choice it does not offer.
 */
const DISPLAY_ZONE = 'UTC';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly prisma: PrismaService,
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
   * A closed vacancy returns no slots at all, and a calendar that cannot be reached
   * throws rather than returning an empty list — "no times available" and "we could
   * not load times" must never look the same (00 §05.21).
   */
  async availability(slug: string) {
    const vacancy = await this.findBySlug(slug);
    if (vacancy.status !== 'open') {
      return { durationMinutes: vacancy.durationMinutes, timeZone: DISPLAY_ZONE, slots: [] };
    }

    const mailbox = await this.resolveOrThrow(vacancy.interviewer.email, () => this.unavailable());

    try {
      const free: string[] = [];
      for (const start of availableSlots(vacancy.durationMinutes)) {
        const end = this.endOf(start, vacancy.durationMinutes);
        if (await this.calendar.isFree(mailbox, start, end)) free.push(start.toISOString());
      }
      return { durationMinutes: vacancy.durationMinutes, timeZone: DISPLAY_ZONE, slots: free };
    } catch (error) {
      // Loudly, never as emptiness: an empty list means "fully booked", which is a
      // different thing for the candidate to read.
      this.logger.error(`Availability read failed for ${mailbox.address}: ${String(error)}`);
      throw this.unavailable();
    }
  }

  /**
   * The order is the specification's (02 §06.25) and the compensation is what makes it
   * atomic: a failure after the CV is stored deletes it, and a failure after the event
   * is created cancels it, before the candidate ever sees an error.
   */
  async book(slug: string, dto: BookingDto, cv: UploadedCv | undefined) {
    const vacancy = await this.findBySlug(slug);

    // 1. The vacancy may have closed while the page was open.
    if (vacancy.status !== 'open') {
      throw new ConflictException({
        error: 'vacancy_closed',
        message: HIRING_MESSAGES.booking.vacancyClosed,
      });
    }

    // 2. Field validation, before anything is written or reserved.
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

    // 3. The slot, re-checked against the live calendar. A start time that was never
    //    offered is rejected as taken rather than accommodated.
    const start = this.parseStart(dto.startUtc);
    const end = this.endOf(start, vacancy.durationMinutes);
    if (!isOfferedSlot(start, vacancy.durationMinutes)) throw this.slotTaken();

    const mailbox = await this.resolveOrThrow(vacancy.interviewer.email, () => this.bookingFailed());
    if (!(await this.calendar.isFree(mailbox, start, end))) throw this.slotTaken();

    const { firstName, lastName, email, note } = validation.value;
    const submittedName = `${firstName} ${lastName}`;

    // The id is minted here so the storage key can be `{applicationId}{extension}` —
    // opaque, application-generated, and never derived from the uploaded filename.
    const applicationId = randomUUID();
    const cvKey = `${applicationId}${cvExtension(cv!.originalname)}`;

    let stored = false;
    let eventId: string | null = null;

    try {
      // 4. Store the CV.
      await this.storage.put(cvKey, cv!.buffer, cv!.mimetype);
      stored = true;

      // 5. Create the event. Adding the candidate as an attendee is what delivers the
      //    invite to both parties — this release sends no mail of its own.
      eventId = await this.calendar.createEvent(mailbox, {
        subject: `${vacancy.title} — interview with ${submittedName}`,
        body: this.eventBody(vacancy, submittedName, email, note, start),
        startUtc: start,
        endUtc: end,
        timeZone: DISPLAY_ZONE,
        attendee: { email, name: submittedName },
        attachment: {
          fileName: cv!.originalname,
          contentType: cv!.mimetype,
          bytes: cv!.buffer,
        },
      });

      // 6. Candidate and application, in one transaction.
      await this.writeBooking({
        applicationId,
        organizationId: vacancy.organizationId,
        vacancyId: vacancy.id,
        firstName,
        lastName,
        email,
        submittedName,
        start,
        end,
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
      timeZone: DISPLAY_ZONE,
      firstName,
      lastName,
      email,
      cvFileName: cv!.originalname,
    };
  }

  /**
   * The candidate is upserted on `(organizationId, email)` and their name is
   * overwritten by this booking, while `submittedName` on the application is frozen —
   * candidates never sign in, so first-write-wins would make a typo permanent.
   */
  private async writeBooking(input: {
    applicationId: string;
    organizationId: string;
    vacancyId: string;
    firstName: string;
    lastName: string;
    email: string;
    submittedName: string;
    start: Date;
    end: Date;
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
          timeZone: DISPLAY_ZONE,
          graphEventId: input.eventId,
          cvKey: input.cvKey,
          cvFileName: input.cvFileName,
          cvContentType: input.cvContentType,
          note: input.note || null,
        },
      });
    });
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
   * Identical content for both parties — one event, one body. The deep link to the
   * candidate's card is the only internal thing in it, and it is authenticated.
   */
  private eventBody(
    vacancy: { title: string; durationMinutes: number },
    submittedName: string,
    email: string,
    note: string,
    start: Date,
  ): string {
    const when = start.toISOString().replace('T', ' ').slice(0, 16);
    return [
      `${vacancy.title} — ${vacancy.durationMinutes} minutes`,
      // 24-hour, unconditionally: the page's format toggle is the candidate's, not ours.
      `${when} (${DISPLAY_ZONE})`,
      `${submittedName} · ${email}`,
      note ? `Note: ${note}` : null,
    ]
      .filter(Boolean)
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
   * An interviewer whose mailbox has stopped resolving is not a closed vacancy: the
   * position is still open, the system simply cannot answer. Which failure that is
   * depends on what the caller was doing, so each supplies its own.
   */
  private async resolveOrThrow(
    email: string,
    failure: () => ServiceUnavailableException,
  ): Promise<MailboxRef> {
    let mailbox: MailboxRef | null;
    try {
      mailbox = await this.calendar.resolveMailbox(email);
    } catch (error) {
      this.logger.error(`Mailbox resolution failed for ${email}: ${String(error)}`);
      throw failure();
    }
    if (!mailbox) throw failure();
    return mailbox;
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
