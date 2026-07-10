import type { DateTime } from "luxon";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/** A half-open time interval [start, end) as absolute instants. */
export interface Interval {
  start: DateTime;
  end: DateTime;
}

/** The hiring manager's bookable hours, as consumed by the engine. */
export interface EngineWorkingHours {
  /** Weekdays that are bookable (lowercased names, as Graph reports them). */
  daysOfWeek: Weekday[];
  /** Wall-clock start in {@link zone}, e.g. "09:00", "05:00:00.0000000". */
  startTime: string;
  /** Wall-clock end in {@link zone} (exclusive upper bound for slots). */
  endTime: string;
  /** IANA zone the working hours are expressed in. */
  zone: string;
}

export interface AvailabilityParams {
  /** Interview length in minutes (15, 30, or 60). */
  durationMinutes: number;
  workingHours: EngineWorkingHours;
  /** Busy intervals as absolute instants (compared by instant, any zone). */
  busyBlocks: Interval[];
  /** IANA zone the candidate is viewing availability in. */
  displayZone: string;
  /** "Now" as an absolute instant; slots starting before it are excluded. */
  now: DateTime;
}
