import { Injectable, Logger } from '@nestjs/common';
import {
  DAY_MS,
  type AvailabilityDates,
  type BookingWindow,
  type IsoDate,
  type WorkingHoursSpec,
  bookingWindow,
  bucketByDate,
  datesBetween,
  generateSlots,
  isOfferedSlot,
  monthBounds,
  parseIsoDate,
  parseYearMonth,
  yearMonthOf,
  zonedTimeToUtc,
} from '@devscribed/validation';
import { CalendarProvider, type MailboxRef } from './calendar/calendar-provider';

/**
 * The calendar could not answer. It is a distinct type because the caller's response
 * depends on what it was doing — a read becomes `availability_unavailable`, a booking
 * becomes `booking_failed` — and because "unavailable" must never be flattened into
 * "no times", which is the one distinction a candidate cannot recover from (00 §05.21).
 */
export class CalendarUnavailableError extends Error {
  constructor(operation: string, readonly reason?: unknown) {
    super(`Calendar ${operation} failed`);
    this.name = 'CalendarUnavailableError';
  }
}

export interface VacancyAvailability {
  timeZone: string;
  window: BookingWindow;
  dates: AvailabilityDates;
}

/**
 * Everything between the `CalendarProvider` and the booking rules: resolve the
 * interviewer's mailbox, read their bookable hours and their blocking events, and hand
 * both to the shared engine.
 *
 * No slot arithmetic lives here. That is in `@devscribed/validation` so the booking
 * page can bound its own month navigation with the same window the server enforces.
 */
@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(private readonly calendar: CalendarProvider) {}

  window(timeZone: string, now: Date = new Date()): BookingWindow {
    return bookingWindow(now, timeZone);
  }

  /**
   * The requested month clipped to the window, or `null` when the two do not meet.
   *
   * A month outside the window is not an error — the calendar's next control disables
   * before it can be reached, and a client that asks anyway deserves an empty answer
   * rather than a failure it cannot distinguish from a broken calendar.
   */
  monthRange(window: BookingWindow, month?: string): { from: IsoDate; to: IsoDate } | null {
    const requested = month ?? yearMonthOf(window.from);
    if (!parseYearMonth(requested)) return null;

    const { first, last } = monthBounds(requested);
    const from = first > window.from ? first : window.from;
    const to = last < window.to ? last : window.to;
    return from > to ? null : { from, to };
  }

  /**
   * An interviewer whose mailbox has stopped resolving is not a closed vacancy: the
   * position is still open, the system simply cannot answer (02 §02.7).
   */
  async mailbox(email: string): Promise<MailboxRef> {
    let resolved: MailboxRef | null;
    try {
      resolved = await this.calendar.resolveMailbox(email);
    } catch (error) {
      this.logger.error(`Mailbox resolution failed for ${email}: ${String(error)}`);
      throw new CalendarUnavailableError('resolveMailbox', error);
    }
    if (!resolved) throw new CalendarUnavailableError('resolveMailbox');
    return resolved;
  }

  /** Bookable start instants across a date range, in the candidate's display zone. */
  async slots(input: {
    mailbox: MailboxRef;
    durationMinutes: number;
    timeZone: string;
    from: IsoDate;
    to: IsoDate;
    now?: Date;
  }): Promise<Date[]> {
    const now = input.now ?? new Date();
    const workingHours = await this.workingHours(input.mailbox);
    const busy = await this.busy(input.mailbox, input.from, input.to, input.timeZone);

    return generateSlots({
      workingHours,
      busy,
      durationMinutes: input.durationMinutes,
      from: input.from,
      to: input.to,
      displayTimeZone: input.timeZone,
      now,
    });
  }

  /** The public availability response: the window, and one entry per date in it. */
  async forVacancy(input: {
    interviewerEmail: string;
    durationMinutes: number;
    timeZone: string;
    month?: string;
    now?: Date;
  }): Promise<VacancyAvailability> {
    const now = input.now ?? new Date();
    const window = this.window(input.timeZone, now);
    const range = this.monthRange(window, input.month);
    if (!range) return { timeZone: input.timeZone, window, dates: {} };

    const mailbox = await this.mailbox(input.interviewerEmail);
    const slots = await this.slots({
      mailbox,
      durationMinutes: input.durationMinutes,
      timeZone: input.timeZone,
      from: range.from,
      to: range.to,
      now,
    });

    return {
      timeZone: input.timeZone,
      window,
      dates: bucketByDate(slots, range.from, range.to, input.timeZone),
    };
  }

  /** Every date in the range, all empty — what a closed vacancy has to offer. */
  emptyDates(range: { from: IsoDate; to: IsoDate } | null): AvailabilityDates {
    const dates: AvailabilityDates = {};
    if (range) for (const date of datesBetween(range.from, range.to)) dates[date] = [];
    return dates;
  }

  /**
   * Whether the page could ever have offered this start time — a working day, inside
   * working hours, on the duration anchor, inside the window, not in the past.
   *
   * Busy blocks are deliberately excluded. Whether the slot is *taken* is asked of the
   * calendar separately, at submit time, so that a slot claimed between selection and
   * submission and a slot that was never on offer both come back as `slot_taken`
   * without one masking the other.
   */
  async isOffered(input: {
    mailbox: MailboxRef;
    startUtc: Date;
    durationMinutes: number;
    timeZone: string;
    now?: Date;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    const window = this.window(input.timeZone, now);
    const workingHours = await this.workingHours(input.mailbox);

    return isOfferedSlot(input.startUtc, {
      workingHours,
      durationMinutes: input.durationMinutes,
      from: window.from,
      to: window.to,
      displayTimeZone: input.timeZone,
      now,
    });
  }

  /** The live overlap check. A read failure is not "free" — it is unavailable. */
  async isFree(mailbox: MailboxRef, startUtc: Date, endUtc: Date): Promise<boolean> {
    try {
      return await this.calendar.isFree(mailbox, startUtc, endUtc);
    } catch (error) {
      this.logger.error(`Free/busy check failed for ${mailbox.address}: ${String(error)}`);
      throw new CalendarUnavailableError('isFree', error);
    }
  }

  private async workingHours(mailbox: MailboxRef): Promise<WorkingHoursSpec> {
    try {
      return await this.calendar.workingHours(mailbox);
    } catch (error) {
      this.logger.error(`Working hours read failed for ${mailbox.address}: ${String(error)}`);
      throw new CalendarUnavailableError('workingHours', error);
    }
  }

  private async busy(
    mailbox: MailboxRef,
    from: IsoDate,
    to: IsoDate,
    timeZone: string,
  ): Promise<Array<{ startUtc: Date; endUtc: Date }>> {
    const start = parseIsoDate(from);
    const end = parseIsoDate(to);
    // A day either side of the range: the mailbox's own working day can begin before
    // the candidate's date does and end after it, at any offset between two zones.
    const fromUtc = new Date(
      zonedTimeToUtc(start.year, start.month, start.day, 0, 0, timeZone).getTime() - DAY_MS,
    );
    const toUtc = new Date(
      zonedTimeToUtc(end.year, end.month, end.day + 1, 0, 0, timeZone).getTime() + DAY_MS,
    );

    try {
      return await this.calendar.busy(mailbox, fromUtc, toUtc);
    } catch (error) {
      this.logger.error(`Free/busy read failed for ${mailbox.address}: ${String(error)}`);
      throw new CalendarUnavailableError('busy', error);
    }
  }
}
