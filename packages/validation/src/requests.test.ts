import { describe, expect, it } from 'vitest';
import {
  REQUEST_MESSAGES,
  can,
  capabilitiesFor,
  compareRequestRows,
  isRequestOverdue,
  parseRequestScope,
  parseRequestStatusQuery,
  parseRequestTypeQuery,
  todayInTimeZone,
  vacationStatusesFor,
  validateDeclineReason,
  validateNewRequest,
  validateRequestAssignee,
  validateRequestEdit,
  validateRequestKind,
  validateRequestMessageBody,
  validateRequestNeededBy,
  validateRequestTitle,
  type SortableRequestRow,
} from './index';

/* ------------------------------------------------------------------ *
 * TC-01-UNIT-01 — title
 * ------------------------------------------------------------------ */

describe('TC-01-UNIT-01 — request title', () => {
  it('rejects 2 characters as too short', () => {
    const result = validateRequestTitle('ab');
    expect(result).toEqual({ valid: false, error: 'Title must be at least 3 characters' });
  });

  it('accepts 3 characters', () => {
    expect(validateRequestTitle('abc')).toEqual({ valid: true, value: 'abc' });
  });

  it('accepts 200 characters', () => {
    const title = 'a'.repeat(200);
    expect(validateRequestTitle(title)).toEqual({ valid: true, value: title });
  });

  it('rejects 201 characters as too long', () => {
    const result = validateRequestTitle('a'.repeat(201));
    expect(result).toEqual({ valid: false, error: 'Title must be 200 characters or fewer' });
  });

  it('rejects a whitespace-only title as missing', () => {
    expect(validateRequestTitle('   \t \n ')).toEqual({ valid: false, error: 'Enter a title' });
  });

  it('collapses interior whitespace before measuring', () => {
    expect(validateRequestTitle('  Staging   DB   access  ')).toEqual({
      valid: true,
      value: 'Staging DB access',
    });
  });
});

/* ------------------------------------------------------------------ *
 * TC-01-UNIT-02 — type / accessKind pairs
 * ------------------------------------------------------------------ */

describe('TC-01-UNIT-02 — type and access kind', () => {
  it('accepts (access, repository)', () => {
    const result = validateRequestKind({ type: 'access', accessKind: 'repository' });
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ type: 'access', accessKind: 'repository' });
  });

  it('rejects (access, absent) with accessKindRequired', () => {
    const result = validateRequestKind({ type: 'access' });
    expect(result.valid).toBe(false);
    expect(result.fields.accessKind).toBe('Choose what kind of access this is');
  });

  it('accepts (question, absent) and stores no access kind', () => {
    const result = validateRequestKind({ type: 'question' });
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ type: 'question', accessKind: null });
  });

  it('rejects (question, vpn) with accessKindNotAllowed', () => {
    const result = validateRequestKind({ type: 'question', accessKind: 'vpn' });
    expect(result.valid).toBe(false);
    expect(result.fields.accessKind).toBe('A question does not have an access kind');
  });

  it('rejects (access, nonsense) with accessKindUnknown', () => {
    const result = validateRequestKind({ type: 'access', accessKind: 'nonsense' });
    expect(result.valid).toBe(false);
    expect(result.fields.accessKind).toBe('Choose a valid access kind');
  });

  it('rejects an unknown type with typeUnknown', () => {
    const result = validateRequestKind({ type: 'wish' });
    expect(result.valid).toBe(false);
    expect(result.fields.type).toBe('Choose a request type');
  });
});

/* ------------------------------------------------------------------ *
 * TC-01-UNIT-03 — the addressee
 * ------------------------------------------------------------------ */

describe('TC-01-UNIT-03 — addressee', () => {
  it('accepts kind member with a membership id', () => {
    expect(
      validateRequestAssignee({ assigneeKind: 'member', assigneeMembershipId: 'm-1' }),
    ).toEqual({
      valid: true,
      value: {
        assigneeKind: 'member',
        assigneeMembershipId: 'm-1',
        assigneeClientMembershipId: null,
      },
    });
  });

  it('rejects kind member with no membership id', () => {
    expect(validateRequestAssignee({ assigneeKind: 'member' })).toEqual({
      valid: false,
      error: 'Choose who this request is for',
    });
  });

  it('rejects kind client carrying a MEMBERSHIP id — that kind selects the other id', () => {
    expect(
      validateRequestAssignee({ assigneeKind: 'client', assigneeMembershipId: 'c-1' }),
    ).toEqual({ valid: false, error: 'Choose who this request is for' });
  });

  it('rejects an empty kind', () => {
    expect(validateRequestAssignee({ assigneeKind: '', assigneeMembershipId: 'm-1' })).toEqual({
      valid: false,
      error: 'Choose who this request is for',
    });
  });
});

/* ------------------------------------------------------------------ *
 * TC-01-UNIT-04 — the default comparator
 * ------------------------------------------------------------------ */

describe('TC-01-UNIT-04 — default ordering', () => {
  const row = (
    id: string,
    over: Partial<SortableRequestRow>,
  ): SortableRequestRow & { id: string } => ({
    id,
    status: 'open',
    blocking: false,
    overdue: false,
    priority: 'normal',
    lastActivityAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  it('sorts blocking, then overdue, then priority, then recency — and terminal last', () => {
    const blocking = row('blocking', { blocking: true });
    const overdue = row('overdue', { overdue: true });
    const urgent = row('urgent', { priority: 'urgent' });
    const newest = row('newest', { lastActivityAt: '2026-06-01T00:00:00.000Z' });
    // Loaded with every other key so the case fails if terminal-last is not the FIRST key.
    const terminal = row('terminal', {
      status: 'granted',
      blocking: true,
      overdue: true,
      priority: 'urgent',
      lastActivityAt: '2026-12-31T00:00:00.000Z',
    });

    const sorted = [terminal, newest, urgent, overdue, blocking]
      .sort(compareRequestRows)
      .map((r) => r.id);

    expect(sorted).toEqual(['blocking', 'overdue', 'urgent', 'newest', 'terminal']);
  });

  it('keeps a terminal row last even against an open row that wins no other key', () => {
    const open = row('open', {});
    const terminal = row('terminal', {
      status: 'cancelled',
      blocking: true,
      overdue: true,
      priority: 'urgent',
      lastActivityAt: '2026-12-31T00:00:00.000Z',
    });
    expect([terminal, open].sort(compareRequestRows).map((r) => r.id)).toEqual([
      'open',
      'terminal',
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * TC-01-UNIT-05 — overdue, derived per reader's timezone
 * ------------------------------------------------------------------ */

describe('TC-01-UNIT-05 — overdue is derived', () => {
  const today = '2026-09-02';
  const yesterday = '2026-09-01';
  const tomorrow = '2026-09-03';

  it('is true only for a past date in a non-terminal status', () => {
    for (const status of ['open', 'answered']) {
      expect(isRequestOverdue({ neededBy: yesterday, status }, today)).toBe(true);
      expect(isRequestOverdue({ neededBy: today, status }, today)).toBe(false);
      expect(isRequestOverdue({ neededBy: tomorrow, status }, today)).toBe(false);
    }
  });

  it('is false in every terminal status, whatever the date', () => {
    for (const status of ['granted', 'declined', 'cancelled']) {
      expect(isRequestOverdue({ neededBy: yesterday, status }, today)).toBe(false);
    }
  });

  it('is false when no date was set', () => {
    expect(isRequestOverdue({ neededBy: null, status: 'open' }, today)).toBe(false);
  });

  it('differs between two timezones straddling the date line on the boundary day', () => {
    // 2026-09-02T11:00Z is already the 3rd in Kiritimati (+14) and still the 2nd in
    // Honolulu (-10). A request needed by the 2nd is overdue for one reader, not the other.
    const instant = new Date('2026-09-02T11:00:00.000Z');
    const kiritimati = todayInTimeZone('Pacific/Kiritimati', instant);
    const honolulu = todayInTimeZone('Pacific/Honolulu', instant);
    expect(kiritimati).toBe('2026-09-03');
    expect(honolulu).toBe('2026-09-02');

    expect(isRequestOverdue({ neededBy: '2026-09-02', status: 'open' }, kiritimati)).toBe(true);
    expect(isRequestOverdue({ neededBy: '2026-09-02', status: 'open' }, honolulu)).toBe(false);
  });

  it('falls back to UTC for an account with no timezone', () => {
    const instant = new Date('2026-09-02T23:30:00.000Z');
    expect(todayInTimeZone(null, instant)).toBe('2026-09-02');
    expect(todayInTimeZone('', instant)).toBe('2026-09-02');
  });
});

/* ------------------------------------------------------------------ *
 * TC-01-UNIT-06 — the capability matrix
 * ------------------------------------------------------------------ */

describe('TC-01-UNIT-06 — capabilities', () => {
  it('grants create-request to admin, manager and user only', () => {
    expect(can('admin', 'create-request')).toBe(true);
    expect(can('manager', 'create-request')).toBe(true);
    expect(can('user', 'create-request')).toBe(true);
    expect(can('viewer', 'create-request')).toBe(false);
  });

  it('grants view-own-requests to all four roles', () => {
    for (const role of ['admin', 'manager', 'user', 'viewer'] as const) {
      expect(can(role, 'view-own-requests')).toBe(true);
    }
  });

  it('grants view-all-requests to admin and manager only', () => {
    expect(can('admin', 'view-all-requests')).toBe(true);
    expect(can('manager', 'view-all-requests')).toBe(true);
    expect(can('user', 'view-all-requests')).toBe(false);
    expect(can('viewer', 'view-all-requests')).toBe(false);
  });

  it('leaves the spec-10 view-requests grants exactly as they were', () => {
    expect(can('admin', 'view-requests')).toBe(true);
    expect(can('manager', 'view-requests')).toBe(true);
    expect(can('user', 'view-requests')).toBe(false);
    expect(can('viewer', 'view-requests')).toBe(false);
  });

  it('registers the same three capabilities in the PascalCase union', () => {
    expect(capabilitiesFor('admin')).toEqual(
      expect.arrayContaining(['CreateRequest', 'ViewOwnRequests', 'ViewAllRequests']),
    );
    expect(capabilitiesFor('manager')).toEqual(
      expect.arrayContaining(['CreateRequest', 'ViewOwnRequests', 'ViewAllRequests']),
    );
    expect(capabilitiesFor('user')).toEqual(['CreateRequest', 'ViewOwnRequests']);
    expect(capabilitiesFor('viewer')).toEqual(['ViewOwnRequests']);
  });
});

/* ------------------------------------------------------------------ *
 * TC-01-UNIT-07 — a needed-by date more than five years out is refused
 * (PATCH-002)
 * ------------------------------------------------------------------ */

describe('TC-01-UNIT-07 — the needed-by ceiling', () => {
  const today = '2026-09-04';

  it('accepts the ceiling itself on creation', () => {
    expect(validateRequestNeededBy('2031-09-04', today, { enforceNotPast: true })).toEqual({
      valid: true,
      value: '2031-09-04',
    });
  });

  it('refuses one day past the ceiling on creation', () => {
    expect(validateRequestNeededBy('2031-09-05', today, { enforceNotPast: true })).toEqual({
      valid: false,
      error: REQUEST_MESSAGES.neededByTooFar,
    });
  });

  it('accepts today on creation', () => {
    expect(validateRequestNeededBy('2026-09-04', today, { enforceNotPast: true })).toEqual({
      valid: true,
      value: '2026-09-04',
    });
  });

  it('reports the six-digit year the control can produce as neededByInvalid, never neededByTooFar', () => {
    expect(validateRequestNeededBy('232131-10-21', today, { enforceNotPast: true })).toEqual({
      valid: false,
      error: REQUEST_MESSAGES.neededByInvalid,
    });
  });

  it('still refuses yesterday as neededByPast on creation', () => {
    expect(validateRequestNeededBy('2026-09-03', today, { enforceNotPast: true })).toEqual({
      valid: false,
      error: REQUEST_MESSAGES.neededByPast,
    });
  });

  it('holds the ceiling on edit, where the lower bound does not apply', () => {
    expect(validateRequestNeededBy('2031-09-05', today, { enforceNotPast: false })).toEqual({
      valid: false,
      error: REQUEST_MESSAGES.neededByTooFar,
    });
    expect(validateRequestNeededBy('2020-01-01', today, { enforceNotPast: false })).toEqual({
      valid: true,
      value: '2020-01-01',
    });
  });
});

/* ------------------------------------------------------------------ *
 * The strict query vocabulary (requirement 42) and the vacation mapping
 * ------------------------------------------------------------------ */

describe('the request list query vocabulary', () => {
  it('defaults status and type to all when the parameter is absent', () => {
    expect(parseRequestStatusQuery(undefined)).toBe('all');
    expect(parseRequestStatusQuery('')).toBe('all');
    expect(parseRequestTypeQuery(undefined)).toBe('all');
    expect(parseRequestScope(undefined)).toBe('mine');
  });

  it('refuses the retired spec-10 vocabulary rather than falling back', () => {
    expect(parseRequestStatusQuery('pending')).toBeNull();
    expect(parseRequestStatusQuery('approved')).toBeNull();
    expect(parseRequestStatusQuery('rejected')).toBeNull();
    expect(parseRequestStatusQuery('nonsense')).toBeNull();
  });

  it('accepts this spec"s own five statuses and `all`', () => {
    for (const value of ['all', 'open', 'answered', 'granted', 'declined', 'cancelled']) {
      expect(parseRequestStatusQuery(value)).toBe(value);
    }
  });

  it('accepts the four type values and refuses anything else', () => {
    for (const value of ['all', 'access', 'question', 'vacation']) {
      expect(parseRequestTypeQuery(value)).toBe(value);
    }
    expect(parseRequestTypeQuery('holiday')).toBeNull();
  });

  it('refuses an unknown scope rather than defaulting it to mine', () => {
    expect(parseRequestScope('all')).toBe('all');
    expect(parseRequestScope('mine')).toBe('mine');
    expect(parseRequestScope('everyone')).toBeNull();
  });

  it('maps this page"s status onto the spec-10 vacation vocabulary', () => {
    expect(vacationStatusesFor('all')).toBeNull();
    expect(vacationStatusesFor('open')).toEqual(['pending']);
    expect(vacationStatusesFor('granted')).toEqual(['approved']);
    expect(vacationStatusesFor('declined')).toEqual(['rejected']);
    expect(vacationStatusesFor('cancelled')).toEqual(['cancelled']);
    // `answered` has no vacation counterpart, so it selects no vacation row at all.
    expect(vacationStatusesFor('answered')).toEqual([]);
    // Requests spec 02's `closed` selects both closures on this side too (edge case 9),
    // so one control on one page still means one thing. A vacation's own vocabulary is
    // untouched: the rows that come back still read Rejected and Cancelled.
    expect(vacationStatusesFor('closed')).toEqual(['rejected', 'cancelled']);
  });
});

/* ------------------------------------------------------------------ *
 * Bodies: create, edit, message, decline reason
 * ------------------------------------------------------------------ */

describe('validateNewRequest', () => {
  const today = '2026-09-02';

  it('reports every failing field at once, not the first', () => {
    const result = validateNewRequest({ assigneeKind: 'member' }, today);
    expect(result.valid).toBe(false);
    expect(result.fields).toEqual({
      topicId: REQUEST_MESSAGES.topicRequired,
      title: REQUEST_MESSAGES.titleRequired,
      assigneeMembershipId: REQUEST_MESSAGES.assigneeInvalid,
    });
  });

  it('rejects a needed-by date in the past at creation', () => {
    const result = validateNewRequest(
      {
        topicId: 't-1',
        title: 'Which invoice template?',
        assigneeKind: 'member',
        assigneeMembershipId: 'm-1',
        neededBy: '2026-09-01',
      },
      today,
    );
    expect(result.fields.neededBy).toBe('The date needed cannot be in the past');
  });

  it('normalizes a valid body, defaulting priority and blocking', () => {
    const result = validateNewRequest(
      {
        topicId: 't-1',
        title: '  Claude   seat ',
        assigneeKind: 'member',
        assigneeMembershipId: 'm-1',
      },
      today,
    );
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({
      topicId: 't-1',
      title: 'Claude seat',
      description: null,
      priority: 'normal',
      blocking: false,
      neededBy: null,
      assigneeKind: 'member',
      assigneeMembershipId: 'm-1',
      assigneeClientMembershipId: null,
      projectId: null,
    });
  });
});

describe('validateRequestEdit', () => {
  const today = '2026-09-02';

  it('refuses every immutable field by name', () => {
    for (const field of ['type', 'accessKind', 'projectId', 'number', 'assigneeMembershipId']) {
      const result = validateRequestEdit({ [field]: 'x' }, today);
      expect(result.valid).toBe(false);
      expect(result.fields[field]).toBe(
        'That field cannot be changed after the request is created',
      );
    }
  });

  it('accepts a needed-by date in the past on edit — the rule is scoped to creation', () => {
    const result = validateRequestEdit({ neededBy: '2020-01-01' }, today);
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ neededBy: '2020-01-01' });
  });

  it('validates only the keys actually present', () => {
    const result = validateRequestEdit({ blocking: true }, today);
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ blocking: true });
  });
});

describe('message body and decline reason', () => {
  it('requires a message body of 1–5000 characters', () => {
    expect(validateRequestMessageBody('   ')).toEqual({
      valid: false,
      error: 'Write a message',
    });
    expect(validateRequestMessageBody('a'.repeat(5001))).toEqual({
      valid: false,
      error: 'Message must be 5000 characters or fewer',
    });
    expect(validateRequestMessageBody('ok')).toEqual({ valid: true, value: 'ok' });
  });

  it('requires a decline reason of 1–1000 characters', () => {
    expect(validateDeclineReason('')).toEqual({
      valid: false,
      error: 'Say why you cannot provide this',
    });
    expect(validateDeclineReason('r'.repeat(1001))).toEqual({
      valid: false,
      error: 'Reason must be 1000 characters or fewer',
    });
    expect(validateDeclineReason('No budget')).toEqual({ valid: true, value: 'No budget' });
  });
});

// A guard against the import above quietly becoming dead: the spec's copy is asserted
// literally in the cases above, and this pins the export those literals must live on.
describe('REQUEST_MESSAGES', () => {
  it('carries this spec"s keys alongside spec 09"s, in one object', () => {
    expect(REQUEST_MESSAGES.createForbidden).toBe(
      'You do not have permission to create requests',
    );
    expect(REQUEST_MESSAGES.scopeForbidden).toBe(
      "You do not have permission to view other people's requests",
    );
    expect(REQUEST_MESSAGES.emptyMine).toBe('Nothing is waiting on you.');
    expect(REQUEST_MESSAGES.emptyFiltered).toBe('No requests match these filters.');
    // Spec 09's keys are still on the same object.
    expect(REQUEST_MESSAGES.toastApproved).toBe('Request approved');
  });
});

/* ------------------------------------------------------------------ *
 * Requests spec 03 — a request addressed to a client contact.
 *
 * Validation rules 5, 8 and 13: the kind is one of two, the id that kind selects is
 * present, and a client-addressed request names a project. Everything else about a
 * client addressee needs stored rows and has no client-side half at all.
 * ------------------------------------------------------------------ */

describe('the client addressee (requests spec 03 rules 5, 8, 13)', () => {
  const today = '2026-09-02';

  it('accepts kind client with a client-membership id', () => {
    expect(
      validateRequestAssignee({
        assigneeKind: 'client',
        assigneeClientMembershipId: 'cm-1',
      }),
    ).toEqual({
      valid: true,
      value: {
        assigneeKind: 'client',
        assigneeMembershipId: null,
        assigneeClientMembershipId: 'cm-1',
      },
    });
  });

  it('rejects kind client with no client-membership id', () => {
    expect(validateRequestAssignee({ assigneeKind: 'client' })).toEqual({
      valid: false,
      error: 'Choose who this request is for',
    });
  });

  it('still rejects a kind outside the two', () => {
    expect(
      validateRequestAssignee({ assigneeKind: 'vendor', assigneeMembershipId: 'm-1' }),
    ).toEqual({ valid: false, error: 'Choose who this request is for' });
  });

  it('reports a client addressee failure under the id that kind selects', () => {
    const result = validateNewRequest(
      { topicId: 't-1', title: 'Warehouse access', assigneeKind: 'client', projectId: 'p-1' },
      today,
    );
    expect(result.valid).toBe(false);
    expect(result.fields).toEqual({
      assigneeClientMembershipId: 'Choose who this request is for',
    });
  });

  it('requires a project for a client addressee and reports it with the body shape', () => {
    const result = validateNewRequest(
      { topicId: 't-1', title: 'Warehouse access', assigneeKind: 'client' },
      today,
    );
    expect(result.valid).toBe(false);
    expect(result.fields).toEqual({
      assigneeClientMembershipId: 'Choose who this request is for',
      projectId: 'Choose the project this request belongs to',
    });
  });

  it('leaves the project optional for a member addressee', () => {
    const result = validateNewRequest(
      {
        topicId: 't-1',
        title: 'Warehouse access',
        assigneeKind: 'member',
        assigneeMembershipId: 'm-1',
      },
      today,
    );
    expect(result.valid).toBe(true);
    expect(result.value?.projectId).toBeNull();
  });

  it('normalizes a valid client-addressed body', () => {
    const result = validateNewRequest(
      {
        topicId: 't-1',
        title: 'Warehouse access',
        assigneeKind: 'client',
        assigneeClientMembershipId: 'cm-1',
        projectId: 'p-1',
      },
      today,
    );
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({
      topicId: 't-1',
      title: 'Warehouse access',
      description: null,
      priority: 'normal',
      blocking: false,
      neededBy: null,
      assigneeKind: 'client',
      assigneeMembershipId: null,
      assigneeClientMembershipId: 'cm-1',
      projectId: 'p-1',
    });
  });

  it('carries this spec"s three new message keys on the same object', () => {
    expect(REQUEST_MESSAGES.clientProjectRequired).toBe(
      'Choose the project this request belongs to',
    );
    expect(REQUEST_MESSAGES.clientProjectMismatch).toBe(
      'That project does not belong to this client',
    );
    expect(REQUEST_MESSAGES.notOnProject).toBe(
      'You can only ask a client about a project you are assigned to',
    );
  });
});
