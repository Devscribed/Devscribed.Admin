/**
 * Requests spec 02 — the pure half of the request-topic catalogue.
 *
 * Isomorphic, like every other module here: the Settings screen uses these for immediate
 * feedback and the NestJS service re-runs each one server-side on the way in. Rules 3,
 * 3a and 5 (audience immutability, kind immutability, name uniqueness) need the stored
 * row and so have no function here at all — they live in the service.
 *
 * Messages come from `REQUEST_TOPIC_MESSAGES` in `./index`, which forms a cycle with
 * `./index`'s `export * from './request-topics'`. That is safe only because nothing below
 * reads the messages at module scope — every read happens inside a function, the same
 * arrangement `./requests` already relies on.
 */

import { REQUEST_TOPIC_MESSAGES } from './index';
import type { FieldOutcome } from './requests';

/* ------------------------------------------------------------------ *
 * The closed value sets. Documented `String` columns rather than Prisma enums, so a
 * third audience is additive (Data Model / New Enums).
 * ------------------------------------------------------------------ */

/** Who a topic is written for. `client` is curated now and reachable from spec 03. */
export type TopicAudience = 'staff' | 'client';
export const TOPIC_AUDIENCES: readonly TopicAudience[] = ['staff', 'client'];

/** The request kind a topic produces, written onto the request raised under it. */
export type TopicType = 'access' | 'question';
export const TOPIC_TYPES: readonly TopicType[] = ['access', 'question'];

/** Archiving is the only removal (REQ-02-014); there is no third status. */
export type TopicStatus = 'active' | 'archived';
export const TOPIC_STATUSES: readonly TopicStatus[] = ['active', 'archived'];

/** The `status` a catalogue read may ask for. `all` is a query value, never a stored one. */
export type TopicStatusQuery = TopicStatus | 'all';
export const TOPIC_STATUS_QUERIES: readonly TopicStatusQuery[] = ['active', 'archived', 'all'];

export const TOPIC_NAME_MAX = 60;
/** Postgres `smallint` upper bound — the column is an `Int`, the rule is the spec's. */
export const TOPIC_SORT_ORDER_MIN = 0;
export const TOPIC_SORT_ORDER_MAX = 32767;

/* ------------------------------------------------------------------ *
 * Field validators (Validation Rules 1, 2, 4, 6)
 * ------------------------------------------------------------------ */

/** Trim, then collapse every run of whitespace to a single space (rule 1). */
export function normalizeTopicName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/gu, ' ') : '';
}

/**
 * Rule 1 — required, 1–60 characters after trim and whitespace collapse. The same shape
 * `normalizeClientName` uses, so `"  VPN   profile "` is stored as `VPN profile` and two
 * spellings of one name compare and index equal.
 */
export function validateTopicName(raw: unknown): FieldOutcome<string> {
  const name = normalizeTopicName(raw);
  if (name.length === 0) return { valid: false, error: REQUEST_TOPIC_MESSAGES.nameRequired };
  if ([...name].length > TOPIC_NAME_MAX) {
    return { valid: false, error: REQUEST_TOPIC_MESSAGES.nameTooLong };
  }
  return { valid: true, value: name };
}

/**
 * Rule 2 — exactly `staff` or `client`. Case-sensitive on purpose: the value is sent by
 * our own screens and never typed by a person, so `Staff` is a caller bug and is told so
 * rather than guessed at (TC-02-UNIT-02).
 */
export function validateTopicAudience(raw: unknown): FieldOutcome<TopicAudience> {
  if (!(TOPIC_AUDIENCES as readonly unknown[]).includes(raw)) {
    return { valid: false, error: REQUEST_TOPIC_MESSAGES.audienceUnknown };
  }
  return { valid: true, value: raw as TopicAudience };
}

/** Rule 4 — exactly `access` or `question`, for the same reason. */
export function validateTopicType(raw: unknown): FieldOutcome<TopicType> {
  if (!(TOPIC_TYPES as readonly unknown[]).includes(raw)) {
    return { valid: false, error: REQUEST_TOPIC_MESSAGES.typeUnknown };
  }
  return { valid: true, value: raw as TopicType };
}

/**
 * Rule 6 — an optional whole number, clamped to `0`–`32767`.
 *
 * The two halves of the rule are deliberately different answers. An out-of-range
 * *integer* is a position the caller could not have meant and clamps to the bound,
 * answering `201`/`200`. A value that is not an integer at all — a string, a fraction, a
 * boolean — is refused, because coercing it would order the topic somewhere the caller
 * never asked for and dropping it would do the same silently.
 *
 * An absent value returns `null`: the caller asked for the default, which only the
 * service can compute (it is the highest stored value in that audience plus ten).
 */
export function validateTopicSortOrder(raw: unknown): FieldOutcome<number | null> {
  if (raw === undefined || raw === null || raw === '') return { valid: true, value: null };
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    return { valid: false, error: REQUEST_TOPIC_MESSAGES.sortOrderInvalid };
  }
  return { valid: true, value: clampSortOrder(raw) };
}

/** The bound of rule 6, applied wherever a `sortOrder` is computed rather than supplied. */
export function clampSortOrder(value: number): number {
  if (value < TOPIC_SORT_ORDER_MIN) return TOPIC_SORT_ORDER_MIN;
  if (value > TOPIC_SORT_ORDER_MAX) return TOPIC_SORT_ORDER_MAX;
  return value;
}

/* ------------------------------------------------------------------ *
 * The catalogue read's query vocabulary (REQ-02-002)
 * ------------------------------------------------------------------ */

/** A parameter genuinely absent from the URL, as opposed to one carrying a value. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * `status` on a catalogue read, defaulting to `active`. `null` means "refuse with 400",
 * never a fallback.
 *
 * This deliberately does **not** copy `parseClientStatusFilter`, which coerces anything
 * it does not recognise to `active`: there, a typo shows a shorter list; here it would
 * show an *empty* catalogue and read as "this organization has no topics" (REQ-02-002).
 */
export function parseTopicStatusQuery(value: unknown): TopicStatusQuery | null {
  if (isAbsent(value)) return 'active';
  return (TOPIC_STATUS_QUERIES as readonly unknown[]).includes(value)
    ? (value as TopicStatusQuery)
    : null;
}

/**
 * `audience` on a catalogue read. `'any'` when the parameter is absent — omitting it
 * returns both audiences — and `null` when it carries a value outside the set, which is
 * refused with `400` for the same reason as above.
 */
export function parseTopicAudienceQuery(value: unknown): TopicAudience | 'any' | null {
  if (isAbsent(value)) return 'any';
  return (TOPIC_AUDIENCES as readonly unknown[]).includes(value)
    ? (value as TopicAudience)
    : null;
}

/* ------------------------------------------------------------------ *
 * Order (REQ-02-009)
 * ------------------------------------------------------------------ */

/** The two fields the order is decided by, and nothing else. */
export interface SortableTopic {
  sortOrder: number;
  name: string;
}

/**
 * `sortOrder` ascending, then name case-insensitively (REQ-02-009).
 *
 * The tiebreak is what keeps two topics sharing a `sortOrder` — which the single-integer
 * ordering permits, and which a move against a row already on the bound produces — in a
 * stable, readable order rather than in whatever order the database returned them.
 * Case never decides between two *different* names: `localeCompare` on the lower-cased
 * values, so `Alpha` and `alpha` land adjacent and neither jumps over `beta`.
 */
export function compareRequestTopics(a: SortableTopic, b: SortableTopic): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase());
}
