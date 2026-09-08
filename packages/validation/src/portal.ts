/**
 * Portal spec 01 (Home) — the vocabulary shared by the API and the web app: the
 * user-facing messages, the entry-id and cursor codecs, the anniversary-date rule, and
 * the two request validators. The ten messages through `noCountry` are verbatim from
 * specs/portal/01-home.contracts.md, "Error Messages"; the five `*Failed` messages below
 * them are client-only — no route emits them — and exist so the four portal screens draw
 * one sentence per failure instead of each screen inlining its own.
 */

export const PORTAL_MESSAGES = {
  noProject: '(No project)',
  limitInvalid: 'Ask for between 1 and 50 entries.',
  cursorInvalid: 'That page marker is not one this feed issued.',
  groupsInvalid: 'Say true or false for People, Hiring and Work.',
  settingsForbidden: 'You do not have permission to change the portal settings.',
  feedEmptyTitle: 'Nothing has happened yet',
  feedEmptyBody: 'When somebody joins, a vacancy opens or a project starts, it shows up here.',
  monthEmpty: 'No time tracked yet this month.',
  requestsEmpty: 'Nothing is waiting on you, and you have asked for nothing.',
  noCountry: 'Nobody has stated your country, so no holiday calendar reaches you.',

  /* Client-only failure sentences — no server route emits these. Each screen falls back
   * to its own sentence here only when the failed response carried none of its own
   * (settings' PUT answers a `422` with `groupsInvalid` in `fields.groups`, which is
   * shown as the server wrote it). */
  monthLoadFailed: 'Something went wrong loading your month. Try reloading the page.',
  feedLoadFailed: "Something went wrong loading what's new. Try reloading the page.",
  entryLoadFailed: 'Something went wrong loading this entry. Try reloading the page.',
  settingsLoadFailed: 'Something went wrong loading the portal settings. Try reloading the page.',
  settingsSaveFailed: 'Something went wrong saving the portal settings. Try again.',
} as const;

/* ------------------------------------------------------------------ *
 * Entry ids — REQ-01-023
 *
 * `{kind}:{sourceId}` for every kind but `member-anniversary`, which also carries the
 * anniversary number: `member-anniversary:{membershipId}:{year}`. `parseEntryId` never
 * throws — a malformed, unknown or truncated id is a `404` on the entry route, not a
 * 500, so the parser answers `null` for anything it cannot read.
 * ------------------------------------------------------------------ */

export type PortalEntryKind =
  | 'member-joined'
  | 'vacancy-opened'
  | 'project-started'
  | 'member-anniversary';

const PORTAL_ENTRY_KINDS: readonly PortalEntryKind[] = [
  'member-joined',
  'vacancy-opened',
  'project-started',
  'member-anniversary',
];

function isPortalEntryKind(value: string): value is PortalEntryKind {
  return (PORTAL_ENTRY_KINDS as readonly string[]).includes(value);
}

export interface PortalEntryId {
  kind: PortalEntryKind;
  sourceId: string;
  /** Present only for `member-anniversary`: the anniversary number (1, 2, 3, …). */
  year?: number;
}

export function composeEntryId(
  kind: PortalEntryKind,
  sourceId: string,
  year?: number,
): string {
  if (kind === 'member-anniversary') {
    return `member-anniversary:${sourceId}:${year}`;
  }
  return `${kind}:${sourceId}`;
}

export function parseEntryId(value: string): PortalEntryId | null {
  if (typeof value !== 'string' || value.length === 0) return null;

  const parts = value.split(':');
  const kind = parts[0];
  if (!isPortalEntryKind(kind)) return null;

  if (kind === 'member-anniversary') {
    if (parts.length !== 3) return null;
    const [, sourceId, yearRaw] = parts;
    if (!sourceId) return null;
    if (!/^\d+$/.test(yearRaw)) return null;
    const year = Number(yearRaw);
    if (!Number.isInteger(year) || year < 1) return null;
    return { kind, sourceId, year };
  }

  if (parts.length !== 2) return null;
  const sourceId = parts[1];
  if (!sourceId) return null;
  return { kind, sourceId };
}

/* ------------------------------------------------------------------ *
 * Cursors — REQ-01-025
 *
 * `{ISO-8601}|{entryId}`. Both halves must parse or the whole cursor is rejected —
 * `PORTAL_MESSAGES.cursorInvalid`, never a thrown error.
 * ------------------------------------------------------------------ */

export interface PortalCursor {
  instant: string;
  entryId: string;
}

export function composeCursor(instant: string | Date, entryId: string): string {
  const iso = instant instanceof Date ? instant.toISOString() : instant;
  return `${iso}|${entryId}`;
}

function isIsoInstant(value: string): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString() === value;
}

export function parseCursor(value: string): PortalCursor | null {
  if (typeof value !== 'string' || value.length === 0) return null;

  const separator = value.indexOf('|');
  if (separator === -1) return null;

  const instant = value.slice(0, separator);
  const entryId = value.slice(separator + 1);
  if (!isIsoInstant(instant)) return null;
  if (!parseEntryId(entryId)) return null;

  return { instant, entryId };
}

/* ------------------------------------------------------------------ *
 * Anniversary dates — REQ-01-029, Edge case 4
 *
 * A 29 February joining has no nominal date in a non-leap year; the first day on or
 * after it is 1 March. `year` is the anniversary number (the first anniversary is 1),
 * never the calendar year, and 0 is refused rather than silently producing the join
 * date itself as an "anniversary".
 * ------------------------------------------------------------------ */

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function anniversaryDate(joinedAt: Date, year: number): Date {
  if (!Number.isInteger(year) || year < 1) {
    throw new RangeError('anniversaryDate: year must be a positive integer, the lowest being 1');
  }

  const nominalYear = joinedAt.getUTCFullYear() + year;
  const month = joinedAt.getUTCMonth();
  const day = joinedAt.getUTCDate();

  if (month === 1 && day === 29) {
    return isLeapYear(nominalYear)
      ? new Date(Date.UTC(nominalYear, 1, 29))
      : new Date(Date.UTC(nominalYear, 2, 1));
  }

  return new Date(Date.UTC(nominalYear, month, day));
}

/* ------------------------------------------------------------------ *
 * Request validators — Validation Rules 1, 3, 4, 5
 * ------------------------------------------------------------------ */

export type PortalLimitValidation =
  | { valid: true; value: number }
  | { valid: false; error: string };

export function validateFeedLimit(value: unknown): PortalLimitValidation {
  if (value === undefined) {
    return { valid: true, value: 20 };
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 50) {
    return { valid: false, error: PORTAL_MESSAGES.limitInvalid };
  }
  return { valid: true, value };
}

export interface PortalGroups {
  people: boolean;
  hiring: boolean;
  work: boolean;
}

export type PortalGroupsValidation =
  | { valid: true; value: PortalGroups }
  | { valid: false; error: string };

export function validatePortalGroups(body: unknown): PortalGroupsValidation {
  if (typeof body !== 'object' || body === null) {
    return { valid: false, error: PORTAL_MESSAGES.groupsInvalid };
  }
  const { people, hiring, work } = body as Record<string, unknown>;
  if (typeof people !== 'boolean' || typeof hiring !== 'boolean' || typeof work !== 'boolean') {
    return { valid: false, error: PORTAL_MESSAGES.groupsInvalid };
  }
  return { valid: true, value: { people, hiring, work } };
}
