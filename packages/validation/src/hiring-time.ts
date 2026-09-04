/**
 * Time-zone arithmetic for hiring, shared by the API and the public booking page.
 *
 * It lives beside the validation rules for the same reason those do: the client and
 * the server must agree, or the page offers a slot the server rejects. Availability is
 * generated in the interviewer's mailbox zone, bucketed into the candidate's display
 * zone, and bounded by a window both sides compute the same way — three places where a
 * one-hour disagreement is a booking that silently fails.
 *
 * There is no date library in this repository and this does not add one. Everything
 * below is `Intl` plus arithmetic, which is enough because the only zone operations
 * hiring needs are "what is the wall clock there" and "what instant is that wall
 * clock".
 */

const MINUTE_MS = 60_000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

const pad = (value: number): string => String(value).padStart(2, '0');

/* ------------------------------------------------------------------ *
 * Zones
 * ------------------------------------------------------------------ */

/**
 * `Intl.DateTimeFormat` construction is expensive enough to matter when a month of
 * slots is bucketed one instant at a time.
 */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      // `hour12: false` reports midnight as hour 24 in some engines; `h23` never does.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * A candidate can send any string as their zone, and a zone the server cannot resolve
 * would be stored on the application and shown back to them on every internal screen.
 */
export function isValidTimeZone(id: unknown): id is string {
  if (typeof id !== 'string' || id.trim().length === 0) return false;
  try {
    partsFormatter(id).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export interface ZonedParts {
  year: number;
  /** 1–12, not the `Date` API's 0–11 — every ISO date string here is 1-based. */
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday, matching `Date#getUTCDay` and `WorkingHours.daysOfWeek`. */
  weekday: number;
}

/** The wall clock an instant reads as in `timeZone`. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const read = (type: string): number => Number(parts.find((part) => part.type === type)!.value);

  const year = read('year');
  const month = read('month');
  const day = read('day');

  return {
    year,
    month,
    day,
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** How far ahead of UTC `timeZone` is at `instant`, in milliseconds. */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  // The parts carry no milliseconds, so neither may the instant they are compared to.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * The instant at which `timeZone`'s wall clock reads the given date and time.
 *
 * Two passes: the offset is a function of the instant, and the instant is what we are
 * solving for. Guessing with the offset at the naive UTC reading and correcting once
 * resolves every case except a wall clock that a DST jump skipped entirely — which no
 * mailbox reports as a working-hours boundary.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const guess = naive - zoneOffsetMs(new Date(naive), timeZone);
  const settled = naive - zoneOffsetMs(new Date(guess), timeZone);
  return new Date(settled);
}

/** `+03:00`, `-07:00`, `+00:00` — the offset as an invite or a picker would name it. */
export function zoneOffsetLabel(timeZone: string, at: Date = new Date()): string {
  const minutes = Math.round(zoneOffsetMs(at, timeZone) / MINUTE_MS);
  const sign = minutes < 0 ? '-' : '+';
  const absolute = Math.abs(minutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

/**
 * `(UTC+03:00) Minsk` — the offset, then the zone's own city. The identifier's last
 * segment is the city; nothing better is available without shipping a locale database.
 */
export function zoneLabel(timeZone: string, at: Date = new Date()): string {
  const city = timeZone.split('/').pop()!.replace(/_/g, ' ');
  return `(UTC${zoneOffsetLabel(timeZone, at)}) ${city}`;
}

/* ------------------------------------------------------------------ *
 * ISO dates
 * ------------------------------------------------------------------ */

/** `YYYY-MM-DD`. Dates are strings throughout: they are calendar days, not instants. */
export type IsoDate = string;

export const isoDate = (year: number, month: number, day: number): IsoDate =>
  `${year}-${pad(month)}-${pad(day)}`;

export function parseIsoDate(value: IsoDate): { year: number; month: number; day: number } {
  const [year, month, day] = value.split('-').map(Number);
  return { year, month, day };
}

/** The calendar day an instant falls on, as `timeZone` reckons it. */
export function isoDateInZone(instant: Date, timeZone: string): IsoDate {
  const parts = zonedParts(instant, timeZone);
  return isoDate(parts.year, parts.month, parts.day);
}

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const moved = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return isoDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}

/** 0 = Sunday. Calendar days have a weekday independently of any instant. */
export function weekdayOf(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** Every date from `from` to `to`, inclusive. Both are `YYYY-MM-DD`. */
export function datesBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const dates: IsoDate[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/* ------------------------------------------------------------------ *
 * The booking window — 02 §05.21
 * ------------------------------------------------------------------ */

export interface BookingWindow {
  /** Today in the display zone. */
  from: IsoDate;
  /** The same day-of-month one calendar month ahead, clamped. */
  to: IsoDate;
}

/**
 * Today through the same day-of-month one month ahead. When that day does not exist —
 * there is no 31 February — it clamps to the shorter month's last day rather than
 * overflowing into March, which would quietly widen the window by three days.
 */
export function bookingWindow(now: Date, timeZone: string): BookingWindow {
  const today = zonedParts(now, timeZone);
  const year = today.month === 12 ? today.year + 1 : today.year;
  const month = today.month === 12 ? 1 : today.month + 1;

  return {
    from: isoDate(today.year, today.month, today.day),
    to: isoDate(year, month, Math.min(today.day, daysInMonth(year, month))),
  };
}

/* ------------------------------------------------------------------ *
 * The month grid — calendar-control §04
 * ------------------------------------------------------------------ */

/** `M T W T F S S`, never varying by locale (calendar-control §03.12). */
export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/**
 * Weeks of seven cells, Monday first. A cell belonging to an adjacent month is `null`
 * rather than that month's date: leading and trailing cells are blank and
 * non-interactive, so there is no day number for them to carry.
 */
export function monthMatrix(year: number, month: number): Array<Array<IsoDate | null>> {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  // `getUTCDay` counts from Sunday; the grid counts from Monday.
  const leading = (first + 6) % 7;

  const cells: Array<IsoDate | null> = [
    ...Array<IsoDate | null>(leading).fill(null),
    ...Array.from({ length: daysInMonth(year, month) }, (_, index) =>
      isoDate(year, month, index + 1),
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<IsoDate | null>> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

/** `2026-08` — how a month travels in a query string and a cache key. */
export type YearMonth = string;

export const yearMonthOf = (date: IsoDate): YearMonth => date.slice(0, 7);

export function parseYearMonth(value: YearMonth): { year: number; month: number } | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function shiftMonth(value: YearMonth, months: number): YearMonth {
  const parsed = parseYearMonth(value)!;
  const zeroBased = parsed.year * 12 + (parsed.month - 1) + months;
  return `${Math.floor(zeroBased / 12)}-${pad((zeroBased % 12) + 1)}`;
}

/** The month's first and last day, as ISO dates. */
export function monthBounds(value: YearMonth): { first: IsoDate; last: IsoDate } {
  const { year, month } = parseYearMonth(value)!;
  return { first: isoDate(year, month, 1), last: isoDate(year, month, daysInMonth(year, month)) };
}

/* ------------------------------------------------------------------ *
 * Display — time-slot-picker §02.10
 * ------------------------------------------------------------------ */

/**
 * 24-hour zero-pads, 12-hour does not. Assembled from the parts rather than handed to
 * `Intl` with `hour12`, because ICU has changed which space character separates the
 * hour from the meridiem, and a slot label is asserted on character for character.
 */
export function formatSlotTime(instant: Date, timeZone: string, hour12 = false): string {
  const { hour, minute } = zonedParts(instant, timeZone);
  if (!hour12) return `${pad(hour)}:${pad(minute)}`;
  const meridiem = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:${pad(minute)} ${meridiem}`;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** `August 2026` — the calendar header, in English regardless of locale (§02.6). */
export function formatMonthLabel(value: YearMonth): string {
  const { year, month } = parseYearMonth(value)!;
  return `${MONTHS[month - 1]} ${year}`;
}

/** `Tuesday 25 August 2026` — the slot list's own header. */
export function formatLongDate(date: IsoDate): string {
  const { year, month, day } = parseIsoDate(date);
  return `${WEEKDAYS[weekdayOf(date)]} ${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * `Tuesday, 25 August 2026 at 14:00 (Europe/Minsk)` — the confirmation line and the
 * calendar event body, which are 24-hour unconditionally (02 §04.14, §08.34).
 */
export function formatBookedWhen(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  const date = `${WEEKDAYS[parts.weekday]}, ${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
  return `${date} at ${formatSlotTime(instant, timeZone)}`;
}

/**
 * `26 Aug 2026` — the candidate card's collapsed application summary (04 §Copy).
 *
 * Abbreviated rather than spelled out because the collapsed row carries four facts on
 * one line and the date is the least of them.
 */
export function formatShortDate(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  return `${parts.day} ${MONTHS[parts.month - 1].slice(0, 3)} ${parts.year}`;
}

/**
 * `Tue 26 Aug 2026` — the date on its own, with the weekday that makes it readable at a
 * glance during an interview.
 *
 * Split out of `formatShortWhen` when the candidate card's header became a **list of three
 * facts** rather than one run: the date is its own line there, under its own glyph, and the
 * time reads on the next one beside the length and the zone (04 design §Layout).
 */
export function formatShortWeekdayDate(instant: Date, timeZone: string): string {
  const weekday = WEEKDAYS[zonedParts(instant, timeZone).weekday].slice(0, 3);
  return `${weekday} ${formatShortDate(instant, timeZone)}`;
}

/**
 * `Tue 26 Aug 2026, 14:00` — one line carrying both, for a collapsed application summary
 * and for anywhere the two facts have to travel together. Internal screens are 24-hour, so
 * there is no format flag here; the public booking page owns the only 12-hour rendering in
 * the product.
 */
export function formatShortWhen(instant: Date, timeZone: string): string {
  return `${formatShortWeekdayDate(instant, timeZone)}, ${formatSlotTime(instant, timeZone)}`;
}

/**
 * `Europe/Minsk (GMT+3)` — a zone named the way a person reads one.
 *
 * An IANA id alone answers *which* zone and not *what time that is*, and the card states a
 * time in it: `13:00 · 60 min · Europe/Minsk` leaves a reader in another country to work out
 * the difference themselves. The offset is the whole reason the zone is printed at all.
 *
 * Computed for **the instant**, never for now, because an offset is not a property of a zone:
 * an interview booked in July and read in December is an hour out if the clock the reader is
 * shown is today's.
 */
export function formatZoneWithOffset(instant: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(instant);
    const offset = parts.find((part) => part.type === 'timeZoneName')?.value;
    return offset ? `${timeZone} (${offset})` : timeZone;
  } catch {
    // An engine without `shortOffset`, or a zone it does not know: the id alone is still
    // true, and a header is not the place to throw.
    return timeZone;
  }
}

/**
 * Month navigation is bounded by the booking window, not by the calendar: previous is
 * unavailable while the window's first month is displayed, because a candidate can
 * never reach a month wholly in the past, and next stops at the month holding the last
 * bookable date (calendar-control §02.7, §02.8).
 */
export const canShowPreviousMonth = (visible: YearMonth, window: BookingWindow): boolean =>
  visible > yearMonthOf(window.from);

export const canShowNextMonth = (visible: YearMonth, window: BookingWindow): boolean =>
  visible < yearMonthOf(window.to);
