import "server-only";

import type {
  MailboxSettings,
  WorkingHours,
} from "@microsoft/microsoft-graph-types";

import { getGraphClient } from "@/lib/graph/client";

/**
 * A single busy interval on the hiring manager's calendar, as returned by
 * Graph's getSchedule. Times are wall-clock strings in {@link timeZone}.
 */
export interface BusyInterval {
  /** Graph free/busy status: busy | tentative | oof | workingElsewhere. */
  status: string;
  /** Local start, e.g. "2026-07-09T14:00:00". */
  start: string;
  /** Local end, e.g. "2026-07-09T14:30:00". */
  end: string;
  /** IANA/Windows time zone the start/end are expressed in. */
  timeZone: string;
}

/**
 * Read the hiring manager's configured working hours from their mailbox
 * settings. This is the canonical source of bookable hours per the spec
 * (working hours are derived from the MS 365 calendar, not a separate config).
 */
export async function getWorkingHours(
  mailbox: string,
): Promise<WorkingHours | undefined> {
  const settings: MailboxSettings = await getGraphClient()
    .api(`/users/${encodeURIComponent(mailbox)}/mailboxSettings`)
    .select("workingHours")
    .get();

  return settings.workingHours ?? undefined;
}

/**
 * Read busy intervals on the hiring manager's calendar within a window, via
 * getSchedule. `start`/`end` are wall-clock strings (no offset) interpreted in
 * `timeZone`, e.g. start="2026-07-09T00:00:00", timeZone="Pacific Standard Time".
 */
export async function getBusyIntervals(
  mailbox: string,
  start: string,
  end: string,
  timeZone: string,
  availabilityViewIntervalMinutes = 15,
): Promise<BusyInterval[]> {
  const response = await getGraphClient()
    .api(`/users/${encodeURIComponent(mailbox)}/calendar/getSchedule`)
    .post({
      schedules: [mailbox],
      startTime: { dateTime: start, timeZone },
      endTime: { dateTime: end, timeZone },
      availabilityViewInterval: availabilityViewIntervalMinutes,
    });

  const schedule = response?.value?.[0];
  const items: unknown[] = schedule?.scheduleItems ?? [];

  return items.map((raw): BusyInterval => {
    const item = raw as {
      status?: string;
      start?: { dateTime?: string; timeZone?: string };
      end?: { dateTime?: string; timeZone?: string };
    };
    return {
      status: item.status ?? "busy",
      start: item.start?.dateTime ?? "",
      end: item.end?.dateTime ?? "",
      timeZone: item.start?.timeZone ?? timeZone,
    };
  });
}
