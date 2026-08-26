/**
 * The only place Microsoft Graph's shapes are read.
 *
 * Everything here takes a Graph payload and answers with a `CalendarProvider` type, so
 * no vendor shape reaches a caller (00 §01.3). It is separate from the provider itself
 * because the translation is the part with rules in it — which statuses block, which
 * zone identifier means what — and rules deserve their own tests.
 */

import { zonedTimeToUtc } from '@devscribed/validation';
import type { Interval, WorkingHours } from './calendar-provider';
import { toIana } from './windows-zones';

/**
 * The statuses that remove a slot. `free` and `workingElsewhere` are absent
 * deliberately: they neither block a slot nor create one (00 §02.8, §02.9). `unknown`
 * is absent too — a status Graph could not determine is not evidence of a commitment.
 */
export const BLOCKING_STATUSES = ['busy', 'tentative', 'oof'] as const;

export interface GraphDateTimeZone {
  dateTime?: string;
  timeZone?: string;
}

export interface GraphScheduleItem {
  status?: string;
  start?: GraphDateTimeZone;
  end?: GraphDateTimeZone;
}

export interface GraphScheduleResponse {
  value?: Array<{ scheduleItems?: GraphScheduleItem[] }>;
}

export interface GraphWorkingHours {
  daysOfWeek?: string[];
  startTime?: string;
  endTime?: string;
  timeZone?: { name?: string };
}

/** Graph names days; `WorkingHours.daysOfWeek` counts them from Sunday. */
const DAY_NUMBERS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/**
 * Graph writes local times as `2026-08-26T10:00:00.0000000` with the zone alongside —
 * no offset in the string, and seven fractional digits that `Date` will not parse.
 */
export function graphDateTimeToUtc(value: GraphDateTimeZone | undefined): Date | null {
  const raw = (value?.dateTime ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw);
  if (!match) return null;

  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  return zonedTimeToUtc(year, month, day, hour, minute, toIana(value?.timeZone));
}

/** `09:00:00.0000000` → `09:00`. */
function graphTimeOfDay(value: string | undefined): string | null {
  const match = /^(\d{2}):(\d{2})/.exec((value ?? '').trim());
  return match ? `${match[1]}:${match[2]}` : null;
}

/**
 * TC-H00-UNIT-02 — only blocking statuses become intervals, so a `free` event cannot
 * remove a slot and a `workingElsewhere` one cannot either.
 */
export function toBusyIntervals(response: GraphScheduleResponse): Interval[] {
  const items = response?.value?.[0]?.scheduleItems ?? [];
  const intervals: Interval[] = [];

  for (const item of items) {
    const status = (item.status ?? '').toLowerCase();
    if (!BLOCKING_STATUSES.includes(status as (typeof BLOCKING_STATUSES)[number])) continue;

    const startUtc = graphDateTimeToUtc(item.start);
    const endUtc = graphDateTimeToUtc(item.end);
    // A block with no readable bounds cannot be honoured, and guessing at one would
    // remove a slot for a reason nobody could explain.
    if (!startUtc || !endUtc || endUtc <= startUtc) continue;

    intervals.push({ startUtc, endUtc });
  }

  return intervals;
}

/**
 * Bookable hours, exactly as the mailbox reports them.
 *
 * An unreadable payload throws rather than falling back to an invented Monday-to-Friday
 * default: there is no working-hours setting anywhere in this product (00 §02.6), so a
 * default here would be one, and it would show a candidate times the interviewer never
 * agreed to. The caller turns the throw into an availability failure, which is the one
 * thing a candidate must be able to tell apart from an empty month.
 */
export function toWorkingHours(payload: GraphWorkingHours | undefined): WorkingHours {
  const startTime = graphTimeOfDay(payload?.startTime);
  const endTime = graphTimeOfDay(payload?.endTime);
  if (!startTime || !endTime) {
    throw new Error('Graph returned mailbox working hours without a usable start or end time');
  }

  const daysOfWeek = (payload?.daysOfWeek ?? [])
    .map((day) => DAY_NUMBERS[(day ?? '').toLowerCase()])
    .filter((day): day is number => day !== undefined);

  return { daysOfWeek, startTime, endTime, timeZone: toIana(payload?.timeZone?.name) };
}
