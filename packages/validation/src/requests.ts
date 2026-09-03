/**
 * Requests spec 01 — the pure half of requests between members of an organization.
 *
 * Everything here is isomorphic: the Next.js screens use it for immediate feedback and
 * the NestJS service re-runs every rule server-side on the way in. The client's copy is
 * a convenience, never a gate — rules 8 (an active membership) and 9 (an available
 * project) are only decidable server-side and have no function here at all.
 *
 * Messages come from `REQUEST_MESSAGES` in `./index`, which is extended in place rather
 * than duplicated so web and API cannot disagree about a single word. That import is a
 * cycle with `./index`'s `export * from './requests'` and is safe only because nothing
 * below reads `REQUEST_MESSAGES` at module scope — every read happens inside a function.
 */

import { REQUEST_MESSAGES } from './index';

/* ------------------------------------------------------------------ *
 * The closed value sets. Every one is a documented `String` column rather than a
 * Prisma enum, so adding a type or an access kind is additive (Data Model / New Enums).
 * ------------------------------------------------------------------ */

export type RequestType = 'access' | 'question';
export const REQUEST_TYPES: readonly RequestType[] = ['access', 'question'];

export type AccessKind =
  | 'repository'
  | 'environment'
  | 'server'
  | 'vpn'
  | 'saas'
  | 'admin_panel'
  | 'documentation'
  | 'other';
export const ACCESS_KINDS: readonly AccessKind[] = [
  'repository',
  'environment',
  'server',
  'vpn',
  'saas',
  'admin_panel',
  'documentation',
  'other',
];

export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';
export const REQUEST_PRIORITIES: readonly RequestPriority[] = ['low', 'normal', 'high', 'urgent'];

export type RequestStatus = 'open' | 'answered' | 'granted' | 'declined' | 'cancelled';
export const REQUEST_STATUSES: readonly RequestStatus[] = [
  'open',
  'answered',
  'granted',
  'declined',
  'cancelled',
];

/** Requirement 22 — nothing leaves these three. */
export const TERMINAL_REQUEST_STATUSES: readonly RequestStatus[] = [
  'granted',
  'declined',
  'cancelled',
];

export function isTerminalRequestStatus(status: string): boolean {
  return (TERMINAL_REQUEST_STATUSES as readonly string[]).includes(status);
}

/**
 * `member` is the only addressee kind this spec accepts. The column exists so spec 02's
 * `client` is an additive validation change rather than a column change; until then an
 * unknown kind is rejected rather than ignored (TC-01-UNIT-03).
 */
export type RequestAssigneeKind = 'member';
export const REQUEST_ASSIGNEE_KINDS: readonly RequestAssigneeKind[] = ['member'];

export const REQUEST_TITLE_MIN = 3;
export const REQUEST_TITLE_MAX = 200;
export const REQUEST_DESCRIPTION_MAX = 5000;
export const REQUEST_MESSAGE_BODY_MAX = 5000;
export const REQUEST_DECLINE_REASON_MAX = 1000;

/* ------------------------------------------------------------------ *
 * Field validators (Validation Rules 1–7, 10, 11)
 * ------------------------------------------------------------------ */

export type FieldOutcome<T> = { valid: true; value: T } | { valid: false; error: string };

/** Trim, then collapse every run of whitespace to a single space (rule 1). */
export function normalizeRequestTitle(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
}

/** Rule 1 — required, 3–200 characters after trim + whitespace collapse. */
export function validateRequestTitle(raw: unknown): FieldOutcome<string> {
  const title = normalizeRequestTitle(raw);
  if (title.length === 0) return { valid: false, error: REQUEST_MESSAGES.titleRequired };
  if (title.length < REQUEST_TITLE_MIN) {
    return { valid: false, error: REQUEST_MESSAGES.titleTooShort };
  }
  if (title.length > REQUEST_TITLE_MAX) {
    return { valid: false, error: REQUEST_MESSAGES.titleTooLong };
  }
  return { valid: true, value: title };
}

/**
 * Rule 2 — optional, at most 5000 characters, stored and rendered as plain text. An
 * omitted or whitespace-only description collapses to `null`; the text itself is kept
 * exactly as typed, because a description is prose and its line breaks are meaning.
 */
export function validateRequestDescription(raw: unknown): FieldOutcome<string | null> {
  if (raw === undefined || raw === null) return { valid: true, value: null };
  if (typeof raw !== 'string') return { valid: false, error: REQUEST_MESSAGES.descriptionTooLong };
  if (raw.trim().length === 0) return { valid: true, value: null };
  if (raw.length > REQUEST_DESCRIPTION_MAX) {
    return { valid: false, error: REQUEST_MESSAGES.descriptionTooLong };
  }
  return { valid: true, value: raw };
}

export interface RequestKindInput {
  type?: unknown;
  accessKind?: unknown;
}

export interface RequestKindResult {
  valid: boolean;
  fields: { type?: string; accessKind?: string };
  value?: { type: RequestType; accessKind: AccessKind | null };
}

/**
 * Rules 3 and 4, which cannot be checked apart: `accessKind` is required exactly when
 * `type` is `access`, one of the eight values there, and forbidden on a question
 * (TC-01-UNIT-02, edge cases 5 and 6).
 */
export function validateRequestKind(input: RequestKindInput): RequestKindResult {
  const fields: { type?: string; accessKind?: string } = {};
  const type = input.type;
  const rawKind = input.accessKind;
  const kindGiven = rawKind !== undefined && rawKind !== null && rawKind !== '';

  if (!(REQUEST_TYPES as readonly unknown[]).includes(type)) {
    fields.type = REQUEST_MESSAGES.typeUnknown;
  }

  if (type === 'access') {
    if (!kindGiven) {
      fields.accessKind = REQUEST_MESSAGES.accessKindRequired;
    } else if (!(ACCESS_KINDS as readonly unknown[]).includes(rawKind)) {
      fields.accessKind = REQUEST_MESSAGES.accessKindUnknown;
    }
  } else if (type === 'question' && kindGiven) {
    fields.accessKind = REQUEST_MESSAGES.accessKindNotAllowed;
  }

  if (fields.type || fields.accessKind) return { valid: false, fields };
  return {
    valid: true,
    fields,
    value: {
      type: type as RequestType,
      accessKind: type === 'access' ? (rawKind as AccessKind) : null,
    },
  };
}

/** Rule 5 — one of four values; an omitted priority is `normal` (requirement 6). */
export function validateRequestPriority(raw: unknown): FieldOutcome<RequestPriority> {
  if (raw === undefined || raw === null || raw === '') return { valid: true, value: 'normal' };
  if (!(REQUEST_PRIORITIES as readonly unknown[]).includes(raw)) {
    return { valid: false, error: REQUEST_MESSAGES.priorityUnknown };
  }
  return { valid: true, value: raw as RequestPriority };
}

/** Is `s` a parseable 'YYYY-MM-DD' (strict format and a real calendar day)? */
function isCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const date = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === s;
}

/**
 * Rule 6 — optional ISO date. `today` is passed in ('YYYY-MM-DD' in the caller's zone)
 * so this stays pure.
 *
 * `enforceNotPast` is false on edit deliberately: requirement 8 scopes the rule to
 * creation ("it may become past afterwards, which is what makes a request overdue"),
 * and the Error Messages table lists `neededByPast` under `POST` alone while every
 * other shared field says POST/PATCH.
 */
export function validateRequestNeededBy(
  raw: unknown,
  today: string,
  options: { enforceNotPast: boolean },
): FieldOutcome<string | null> {
  if (raw === undefined || raw === null || raw === '') return { valid: true, value: null };
  if (typeof raw !== 'string' || !isCalendarDate(raw)) {
    return { valid: false, error: REQUEST_MESSAGES.neededByInvalid };
  }
  if (options.enforceNotPast && raw < today) {
    return { valid: false, error: REQUEST_MESSAGES.neededByPast };
  }
  return { valid: true, value: raw };
}

export interface RequestAssigneeInput {
  assigneeKind?: unknown;
  assigneeMembershipId?: unknown;
}

/**
 * Rule 7 — the addressee is structurally valid: kind `member` with a membership id
 * present. Whether that membership is active and in the caller's organization is rule 8
 * and is decidable only server-side (TC-01-UNIT-03).
 */
export function validateRequestAssignee(
  input: RequestAssigneeInput,
): FieldOutcome<{ assigneeKind: RequestAssigneeKind; assigneeMembershipId: string }> {
  const kind = input.assigneeKind;
  const id = input.assigneeMembershipId;
  if (!(REQUEST_ASSIGNEE_KINDS as readonly unknown[]).includes(kind)) {
    return { valid: false, error: REQUEST_MESSAGES.assigneeInvalid };
  }
  if (typeof id !== 'string' || id.trim().length === 0) {
    return { valid: false, error: REQUEST_MESSAGES.assigneeInvalid };
  }
  return { valid: true, value: { assigneeKind: 'member', assigneeMembershipId: id } };
}

/** Rule 10 — a message body is required, 1–5000 characters, plain text. */
export function validateRequestMessageBody(raw: unknown): FieldOutcome<string> {
  const body = typeof raw === 'string' ? raw : '';
  if (body.trim().length === 0) return { valid: false, error: REQUEST_MESSAGES.messageRequired };
  if (body.length > REQUEST_MESSAGE_BODY_MAX) {
    return { valid: false, error: REQUEST_MESSAGES.messageTooLong };
  }
  return { valid: true, value: body };
}

/** Rule 11 — a decline reason is required, 1–1000 characters (edge case 21). */
export function validateDeclineReason(raw: unknown): FieldOutcome<string> {
  const reason = typeof raw === 'string' ? raw : '';
  if (reason.trim().length === 0) {
    return { valid: false, error: REQUEST_MESSAGES.declineReasonRequired };
  }
  if (reason.length > REQUEST_DECLINE_REASON_MAX) {
    return { valid: false, error: REQUEST_MESSAGES.declineReasonTooLong };
  }
  return { valid: true, value: reason };
}

/* ------------------------------------------------------------------ *
 * The whole new-request body, and the editable subset
 * ------------------------------------------------------------------ */

export interface NewRequestInput extends RequestKindInput, RequestAssigneeInput {
  /** Requests spec 02 rule 7. `type` and `accessKind` survive on `RequestKindInput`
   * only so requirement 22's presence check can read them; neither is validated. */
  topicId?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  blocking?: unknown;
  neededBy?: unknown;
  projectId?: unknown;
}

export interface NewRequestValue {
  /** Requests spec 02 rule 7 — the only classifier a caller supplies. */
  topicId: string;
  title: string;
  description: string | null;
  priority: RequestPriority;
  blocking: boolean;
  neededBy: string | null;
  assigneeKind: RequestAssigneeKind;
  assigneeMembershipId: string;
  projectId: string | null;
}

export interface RequestValidationResult<T> {
  valid: boolean;
  /** Field-keyed messages, the `fields` object of a 400 `validation_error` body. */
  fields: Record<string, string>;
  value?: T;
}

/** The two names requests spec 02 requirement 22 refuses on a create body. */
export const RETIRED_CLASSIFIER_FIELDS: readonly string[] = ['type', 'accessKind'];

/**
 * Rules 1–7 over a create body. Every failing field is reported, never the first one
 * only: the form shows every error at once and focuses the first invalid field
 * (AC-10, edge case 19).
 *
 * Requests spec 02 replaced the kind fields with the topic. `type` and `accessKind` are
 * no longer *validated* here at all — the route answers none of `typeUnknown`,
 * `accessKindRequired`, `accessKindUnknown` or `accessKindNotAllowed` (requirement 21) —
 * and their mere presence is refused with `classifierNotAccepted` under the name that was
 * sent (requirement 22), because a silent drop turns a caller on a stale contract into a
 * request classified as something nobody chose. `validateRequestKind` itself is untouched
 * and stays exported; no route calls it on create any more.
 */
export function validateNewRequest(
  input: NewRequestInput,
  today: string,
): RequestValidationResult<NewRequestValue> {
  const fields: Record<string, string> = {};

  // Presence, not value: `hasOwnProperty` is the shape `validateRequestEdit` already uses
  // for an immutable field, so `type: undefined` sent explicitly is still a refusal.
  for (const field of RETIRED_CLASSIFIER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      fields[field] = REQUEST_MESSAGES.classifierNotAccepted;
    }
  }

  const topicId = typeof input.topicId === 'string' ? input.topicId.trim() : '';
  if (topicId.length === 0) fields.topicId = REQUEST_MESSAGES.topicRequired;

  const title = validateRequestTitle(input.title);
  if (!title.valid) fields.title = title.error;

  const description = validateRequestDescription(input.description);
  if (!description.valid) fields.description = description.error;

  const priority = validateRequestPriority(input.priority);
  if (!priority.valid) fields.priority = priority.error;

  const neededBy = validateRequestNeededBy(input.neededBy, today, { enforceNotPast: true });
  if (!neededBy.valid) fields.neededBy = neededBy.error;

  const assignee = validateRequestAssignee(input);
  if (!assignee.valid) fields.assigneeMembershipId = assignee.error;

  const projectId =
    typeof input.projectId === 'string' && input.projectId.trim().length > 0
      ? input.projectId
      : null;

  if (Object.keys(fields).length > 0) return { valid: false, fields };

  return {
    valid: true,
    fields,
    value: {
      topicId,
      title: (title as { valid: true; value: string }).value,
      description: (description as { valid: true; value: string | null }).value,
      priority: (priority as { valid: true; value: RequestPriority }).value,
      blocking: input.blocking === true,
      neededBy: (neededBy as { valid: true; value: string | null }).value,
      assigneeKind: 'member',
      assigneeMembershipId: (
        assignee as { valid: true; value: { assigneeMembershipId: string } }
      ).value.assigneeMembershipId,
      projectId,
    },
  };
}

/** The only five fields an edit may carry (requirement 34). */
export const EDITABLE_REQUEST_FIELDS: readonly string[] = [
  'title',
  'description',
  'priority',
  'blocking',
  'neededBy',
];

/**
 * The fields a PATCH may never carry. Naming them rather than rejecting "anything not
 * editable" is what lets the 400 say which field was refused (requirement 34).
 */
export const IMMUTABLE_REQUEST_FIELDS: readonly string[] = [
  'type',
  'accessKind',
  'projectId',
  'number',
  'assigneeKind',
  'assigneeMembershipId',
  // Requests spec 02 requirement 24 — the topic is chosen once. Changing it would
  // re-classify a request after the fact while `topicLabel` still records the word it
  // was raised under.
  'topicId',
];

export interface RequestEditValue {
  title?: string;
  description?: string | null;
  priority?: RequestPriority;
  blocking?: boolean;
  neededBy?: string | null;
}

/**
 * Requirement 34 over a PATCH body. Only the keys actually present are validated and
 * returned, so a caller may edit one field without restating the rest. `neededBy` is
 * *not* checked against today here — see `validateRequestNeededBy`.
 */
export function validateRequestEdit(
  input: Record<string, unknown>,
  today: string,
): RequestValidationResult<RequestEditValue> {
  const fields: Record<string, string> = {};
  const value: RequestEditValue = {};

  for (const field of IMMUTABLE_REQUEST_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      fields[field] = REQUEST_MESSAGES.fieldImmutable;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    const title = validateRequestTitle(input.title);
    if (title.valid) value.title = title.value;
    else fields.title = title.error;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'description')) {
    const description = validateRequestDescription(input.description);
    if (description.valid) value.description = description.value;
    else fields.description = description.error;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'priority')) {
    const priority = validateRequestPriority(input.priority);
    if (priority.valid) value.priority = priority.value;
    else fields.priority = priority.error;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'blocking')) {
    value.blocking = input.blocking === true;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'neededBy')) {
    const neededBy = validateRequestNeededBy(input.neededBy, today, { enforceNotPast: false });
    if (neededBy.valid) value.neededBy = neededBy.value;
    else fields.neededBy = neededBy.error;
  }

  if (Object.keys(fields).length > 0) return { valid: false, fields };
  return { valid: true, fields, value };
}

/* ------------------------------------------------------------------ *
 * The list's query vocabulary (requirement 42)
 *
 * Strict on purpose. Spec 10's `parseRequestStatusFilter` falls back to `pending` for
 * anything it does not recognise, which turns a typo in a URL into a filtered page that
 * looks correct; a closed set is only a contract if breaking it is observable. That
 * function and its unit suite stay for spec 10's own callers — the vocabulary is retired
 * on this endpoint, not the export.
 * ------------------------------------------------------------------ */

export type RequestScope = 'mine' | 'all';
export const REQUEST_SCOPES: readonly RequestScope[] = ['mine', 'all'];

/**
 * Requests spec 02 adds `closed`, one filter value over two stored statuses
 * (REQ-02-027). The five stored values stay in the set: a link somebody saved carrying
 * `declined` still resolves, and the control simply shows Closed as the nearest
 * selection.
 */
export type RequestStatusQuery = 'all' | 'closed' | RequestStatus;
export const REQUEST_STATUS_QUERIES: readonly RequestStatusQuery[] = [
  'all',
  'closed',
  ...REQUEST_STATUSES,
];

/**
 * The stored statuses one query value selects (REQ-02-027, TC-02-UNIT-06).
 *
 * `null` means "refuse with 400" — an unrecognised value is never mapped to a default,
 * because a closed set is only a contract if breaking it is observable. Every other
 * value answers with the exact set of stored statuses the list must return: `closed`
 * expands to the two closures, `all` to every stored status, and each stored status to
 * itself.
 */
export function expandRequestStatusQuery(value: unknown): readonly RequestStatus[] | null {
  if (value === 'all') return REQUEST_STATUSES;
  if (value === 'closed') return ['declined', 'cancelled'];
  return (REQUEST_STATUSES as readonly unknown[]).includes(value)
    ? [value as RequestStatus]
    : null;
}

export type RequestTypeQuery = 'all' | RequestType | 'vacation';
export const REQUEST_TYPE_QUERIES: readonly RequestTypeQuery[] = [
  'all',
  'access',
  'question',
  'vacation',
];

/** A parameter that is genuinely absent from the URL, as opposed to one with a value. */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** `scope`, defaulting to `mine`. `null` means "reject with 400" — never a fallback. */
export function parseRequestScope(value: unknown): RequestScope | null {
  if (isAbsent(value)) return 'mine';
  return (REQUEST_SCOPES as readonly unknown[]).includes(value) ? (value as RequestScope) : null;
}

/** `status`, defaulting to `all`. `null` means "reject with 400" — never a fallback. */
export function parseRequestStatusQuery(value: unknown): RequestStatusQuery | null {
  if (isAbsent(value)) return 'all';
  return (REQUEST_STATUS_QUERIES as readonly unknown[]).includes(value)
    ? (value as RequestStatusQuery)
    : null;
}

/** `type`, defaulting to `all`. `null` means "reject with 400" — never a fallback. */
export function parseRequestTypeQuery(value: unknown): RequestTypeQuery | null {
  if (isAbsent(value)) return 'all';
  return (REQUEST_TYPE_QUERIES as readonly unknown[]).includes(value)
    ? (value as RequestTypeQuery)
    : null;
}

/**
 * Requirement 42's fixed mapping from this page's vocabulary onto the spec-10 vacation
 * statuses, because one control on one page must not mean two things.
 *
 * `null` means "every vacation row"; an empty array means "no vacation row" — which is
 * what `answered` selects, since it has no vacation counterpart. The section renders
 * empty, not absent, because the caller may still hold `view-requests`.
 */
export function vacationStatusesFor(status: RequestStatusQuery): readonly string[] | null {
  switch (status) {
    case 'all':
      return null;
    // Requests spec 02's `closed` selects both closures on both sections, so one control
    // on one page still means one thing (edge case 9). A vacation's own vocabulary is
    // untouched: the card that comes back still reads Rejected or Cancelled.
    case 'closed':
      return ['rejected', 'cancelled'];
    case 'open':
      return ['pending'];
    case 'granted':
      return ['approved'];
    case 'declined':
      return ['rejected'];
    case 'cancelled':
      return ['cancelled'];
    case 'answered':
      return [];
  }
}

/* ------------------------------------------------------------------ *
 * Overdue — derived, never stored (requirement 33)
 * ------------------------------------------------------------------ */

/**
 * Today's calendar date in `timezone`, as 'YYYY-MM-DD'. An empty or unset zone falls
 * back to UTC, the answer already given twice in shipped code
 * (`time-tracking.service.ts`, `envelope-completion.ts`).
 */
export function todayInTimeZone(timezone: string | null | undefined, now: Date = new Date()): string {
  const zone = timezone && timezone.trim().length > 0 ? timezone : 'UTC';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    // An unknown zone is a data anomaly, not a reason to fail a read; UTC is the same
    // fallback a null zone gets.
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Requirement 33 — a request is overdue when `neededBy` is strictly before today in the
 * *reading* account's timezone and the status is `open` or `answered`. No column holds
 * it and no scheduled job sets it, so the flag is correct even if nothing is scheduled.
 * Two readers in different zones may legitimately disagree by one day (edge case 10).
 */
export function isRequestOverdue(
  row: { neededBy: string | null; status: string },
  today: string,
): boolean {
  if (!row.neededBy) return false;
  if (isTerminalRequestStatus(row.status)) return false;
  return row.neededBy < today;
}

/* ------------------------------------------------------------------ *
 * The default order (requirement 43)
 * ------------------------------------------------------------------ */

const PRIORITY_RANK: Record<RequestPriority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
};

export interface SortableRequestRow {
  status: string;
  blocking: boolean;
  overdue: boolean;
  priority: string;
  /** ISO timestamp. */
  lastActivityAt: string;
}

/**
 * Non-terminal before terminal, then blocking, then overdue, then priority descending,
 * then `lastActivityAt` descending.
 *
 * Terminal-last is the *first* key rather than a consequence of the others, so a closed
 * but blocking and urgent row cannot climb above an open one. The two checkable signals
 * (blocking, overdue) outrank the self-reported one (priority) deliberately.
 */
export function compareRequestRows(a: SortableRequestRow, b: SortableRequestRow): number {
  const aTerminal = isTerminalRequestStatus(a.status);
  const bTerminal = isTerminalRequestStatus(b.status);
  if (aTerminal !== bTerminal) return aTerminal ? 1 : -1;

  if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;

  const aRank = PRIORITY_RANK[a.priority as RequestPriority] ?? PRIORITY_RANK.normal;
  const bRank = PRIORITY_RANK[b.priority as RequestPriority] ?? PRIORITY_RANK.normal;
  if (aRank !== bRank) return bRank - aRank;

  return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
}
