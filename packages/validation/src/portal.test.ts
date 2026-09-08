import { describe, expect, it } from 'vitest';
import {
  PORTAL_MESSAGES,
  anniversaryDate,
  composeCursor,
  composeEntryId,
  parseCursor,
  parseEntryId,
  validateFeedLimit,
  validatePortalGroups,
  type PortalEntryKind,
} from './portal';

describe('TC-01-UNIT-01: entry id round trip and malformed input', () => {
  it('round-trips every non-anniversary kind', () => {
    const kinds: PortalEntryKind[] = ['member-joined', 'vacancy-opened', 'project-started'];
    for (const kind of kinds) {
      const id = composeEntryId(kind, 'abc-123');
      expect(parseEntryId(id)).toEqual({ kind, sourceId: 'abc-123' });
    }
  });

  it('round-trips an anniversary id, carrying the year', () => {
    const id = composeEntryId('member-anniversary', 'membership-1', 2);
    expect(id).toBe('member-anniversary:membership-1:2');
    expect(parseEntryId(id)).toEqual({
      kind: 'member-anniversary',
      sourceId: 'membership-1',
      year: 2,
    });
  });

  it('returns null, and never throws, for every malformed input', () => {
    const malformed = [
      '',
      'member-joined',
      'nope:abc',
      'member-anniversary:abc',
      'member-anniversary:abc:zero',
    ];
    for (const value of malformed) {
      expect(() => parseEntryId(value)).not.toThrow();
      expect(parseEntryId(value)).toBeNull();
    }
  });
});

describe('TC-01-UNIT-02: cursor round trip and malformed input', () => {
  it('round-trips an instant and an entry id', () => {
    const entryId = composeEntryId('member-joined', 'abc-123');
    const instant = '2026-09-03T00:00:00.000Z';
    const cursor = composeCursor(instant, entryId);
    expect(cursor).toBe(`${instant}|${entryId}`);
    expect(parseCursor(cursor)).toEqual({ instant, entryId });
  });

  it('returns null when the timestamp half is not ISO-8601', () => {
    const entryId = composeEntryId('member-joined', 'abc-123');
    expect(parseCursor(`not-a-date|${entryId}`)).toBeNull();
  });

  it('returns null when there is no separator', () => {
    expect(parseCursor('2026-09-03T00:00:00.000Z')).toBeNull();
  });

  it('returns null when the id half is malformed', () => {
    expect(parseCursor('2026-09-03T00:00:00.000Z|nope')).toBeNull();
  });
});

describe('TC-01-UNIT-03: validatePortalGroups', () => {
  it('accepts three strict booleans', () => {
    expect(validatePortalGroups({ people: true, hiring: false, work: true })).toEqual({
      valid: true,
      value: { people: true, hiring: false, work: true },
    });
  });

  it('rejects a body missing a key', () => {
    expect(validatePortalGroups({ people: true, hiring: false })).toEqual({
      valid: false,
      error: PORTAL_MESSAGES.groupsInvalid,
    });
  });

  it('rejects a non-boolean value, even a truthy string', () => {
    expect(validatePortalGroups({ people: true, hiring: 'false', work: true })).toEqual({
      valid: false,
      error: PORTAL_MESSAGES.groupsInvalid,
    });
  });

  it('rejects an empty object', () => {
    expect(validatePortalGroups({})).toEqual({
      valid: false,
      error: PORTAL_MESSAGES.groupsInvalid,
    });
  });
});

describe('TC-01-UNIT-04: validateFeedLimit', () => {
  it('accepts 1, 20 and 50', () => {
    for (const value of [1, 20, 50]) {
      expect(validateFeedLimit(value)).toEqual({ valid: true, value });
    }
  });

  it('defaults undefined to 20', () => {
    expect(validateFeedLimit(undefined)).toEqual({ valid: true, value: 20 });
  });

  it('rejects 0, 51 and a numeric string', () => {
    for (const value of [0, 51, '20']) {
      expect(validateFeedLimit(value)).toEqual({
        valid: false,
        error: PORTAL_MESSAGES.limitInvalid,
      });
    }
  });
});

describe('TC-01-UNIT-05: anniversaryDate', () => {
  const leapJoin = new Date(Date.UTC(2024, 1, 29)); // 29 February 2024, a leap year

  it('lands on 1 March in the two following (non-leap) years', () => {
    expect(anniversaryDate(leapJoin, 1)).toEqual(new Date(Date.UTC(2025, 2, 1)));
    expect(anniversaryDate(leapJoin, 2)).toEqual(new Date(Date.UTC(2026, 2, 1)));
  });

  it('lands on 29 February in the next leap year', () => {
    expect(anniversaryDate(leapJoin, 4)).toEqual(new Date(Date.UTC(2028, 1, 29)));
  });

  it('never produces year 0 — the lowest year accepted is 1', () => {
    expect(() => anniversaryDate(leapJoin, 0)).toThrow();
    expect(() => anniversaryDate(leapJoin, 1)).not.toThrow();
  });
});
