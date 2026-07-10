import { DateTime } from "luxon";

/** Fixed Monday→Sunday weekday column letters. */
export const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export type DateCellState = "available" | "unavailable" | "past" | "beyond";

/** e.g. "July 2026" for a "yyyy-MM" month. */
export function monthLabel(month: string): string {
  return DateTime.fromISO(`${month}-01`).toFormat("LLLL yyyy");
}

/** The "yyyy-MM" of an ISO date. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

/** Shift a "yyyy-MM" month by a number of calendar months. */
export function addMonth(month: string, delta: number): string {
  return DateTime.fromISO(`${month}-01`)
    .plus({ months: delta })
    .toFormat("yyyy-MM");
}

/**
 * A Monday-first grid for a "yyyy-MM" month: rows of 7 cells, each an ISO date
 * or null for leading/trailing blanks.
 */
export function buildMonthGrid(month: string): (string | null)[][] {
  const first = DateTime.fromISO(`${month}-01`);
  const daysInMonth = first.daysInMonth ?? 30;
  const cells: (string | null)[] = [];
  // Luxon weekday: 1=Mon..7=Sun — leading blanks before the 1st.
  for (let i = 1; i < first.weekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(first.set({ day: d }).toISODate());
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** e.g. "Tuesday, July 14, 2026" — used for accessible cell names. */
export function fullDateLabel(isoDate: string): string {
  return DateTime.fromISO(isoDate).toFormat("cccc, LLLL d, yyyy");
}

export function dateCellState(
  iso: string,
  minDate: string,
  maxDate: string,
  availableDates: ReadonlySet<string>,
): DateCellState {
  // ISO yyyy-MM-dd strings compare correctly lexicographically.
  if (iso < minDate) return "past";
  if (iso > maxDate) return "beyond";
  if (availableDates.has(iso)) return "available";
  return "unavailable";
}

/**
 * Scan day-by-day from `fromIso` (exclusive) in `direction` (+1/-1) for the
 * next available date within [minDate, maxDate]. Returns null if none.
 */
export function findAvailableDate(
  fromIso: string,
  direction: 1 | -1,
  availableDates: ReadonlySet<string>,
  minDate: string,
  maxDate: string,
): string | null {
  let cursor = DateTime.fromISO(fromIso);
  for (let step = 0; step < 400; step++) {
    cursor = cursor.plus({ days: direction });
    const iso = cursor.toISODate();
    if (!iso) return null;
    if (iso < minDate || iso > maxDate) return null;
    if (availableDates.has(iso)) return iso;
  }
  return null;
}

/** First/last available date within a given "yyyy-MM" month, or null. */
export function edgeAvailableDateInMonth(
  month: string,
  edge: "first" | "last",
  availableDates: ReadonlySet<string>,
): string | null {
  const dates = [...availableDates].filter((d) => monthOf(d) === month).sort();
  if (dates.length === 0) return null;
  return edge === "first" ? dates[0] : dates[dates.length - 1];
}
