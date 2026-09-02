/**
 * Screen-level formatting for hiring.
 *
 * The arithmetic itself lives in `@devscribed/validation`, so the page and the API
 * cannot disagree about what a start time reads as. What is here is the little that is
 * only ever rendered: how long an interview is, and how a zone is named in a picker.
 *
 * Internal screens are 24-hour and UTC. The public booking page is the exception — it
 * renders in the candidate's chosen zone, with their chosen format.
 */

import { formatBookedWhen, zoneLabel, zoneOffsetMs } from '@devscribed/validation';

export const formatDuration = (minutes: number): string => `${minutes} minutes`;

/** "Tuesday, 25 August 2026 at 14:00" in the zone the value belongs to. */
export const formatWhen = (iso: string, timeZone = 'UTC'): string =>
  formatBookedWhen(new Date(iso), timeZone);

/**
 * The zone the browser thinks it is in, which is what the booking page opens with.
 * `Intl` answers `undefined` in a handful of old environments; UTC is the honest
 * fallback because it is also what the server would assume.
 */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface TimeZoneOption {
  value: string;
  label: string;
  /** Options are otherwise addressable only by their text, which repeats per offset. */
  testId: string;
}

/**
 * Every zone the browser knows, labelled `(UTC+03:00) Minsk` and ordered by offset.
 *
 * The whole list rather than a curated one: a candidate whose zone is missing has no
 * way to say when they are free, and a shortlist that covers every offset still strands
 * anyone whose city observes a different summer-time rule. The consequence is a long
 * unsearchable popover, which is the design system's `Combobox` gap and is noted as
 * such in the README.
 */
export function timeZoneOptions(include?: string, at: Date = new Date()): TimeZoneOption[] {
  const zones = new Set(supportedTimeZones());
  // The browser's own zone always appears, even when it is one `Intl` will not list.
  if (include) zones.add(include);

  return [...zones]
    .map((value) => ({ value, label: zoneLabel(value, at), offset: zoneOffsetMs(at, value) }))
    .sort((left, right) => left.offset - right.offset || left.label.localeCompare(right.label))
    .map(({ value, label }) => ({ value, label, testId: `timezone-option-${value}` }));
}

function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
  try {
    const values = intl.supportedValuesOf?.('timeZone');
    if (values && values.length > 0) return values;
  } catch {
    // Falls through to the minimum any environment can name.
  }
  return ['UTC'];
}

const KB = 1024;

/**
 * `180 KB`, `1.4 MB` — enough to tell a real CV from an empty one.
 *
 * Here rather than beside either caller: the candidate card states a stored CV's weight and
 * the booking form states the weight of the one just chosen, and a person comparing the two
 * is looking at the same file.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / (KB * KB)).toFixed(1)} MB`;
}
