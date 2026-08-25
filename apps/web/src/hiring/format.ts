/**
 * Every hiring screen renders times the same way: 24-hour, and always naming the zone
 * the value is expressed in. The public page gains a zone selector and a 12-hour
 * toggle when the real availability engine lands; until then there is one zone, and
 * saying so is more honest than implying a choice.
 */

const DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const TIME = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export const formatDate = (iso: string): string => DATE.format(new Date(iso));
export const formatTime = (iso: string): string => TIME.format(new Date(iso));
export const formatShortDate = (iso: string): string => SHORT_DATE.format(new Date(iso));

/** "Tuesday, 25 August 2026 at 14:00" — the confirmation's own line. */
export const formatWhen = (iso: string): string => `${formatDate(iso)} at ${formatTime(iso)}`;

export const formatDuration = (minutes: number): string => `${minutes} minutes`;
