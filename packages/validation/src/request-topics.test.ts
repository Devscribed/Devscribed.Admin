import { describe, expect, it } from 'vitest';
import {
  REQUEST_STATUS_LABELS,
  compareRequestTopics,
  expandRequestStatusQuery,
  parseTopicAudienceQuery,
  parseTopicStatusQuery,
  validateTopicAudience,
  validateTopicName,
  validateTopicSortOrder,
  validateTopicType,
} from './index';

/* ------------------------------------------------------------------ *
 * Every message below is the spec's literal text, never the constant the code
 * imports — an assertion about copy has to be able to fail when the wording drifts.
 * ------------------------------------------------------------------ */

const COPY = {
  nameRequired: 'Enter a topic name',
  nameTooLong: 'Topic name must be 60 characters or fewer',
  audienceUnknown: 'Choose a valid audience',
  typeUnknown: 'Choose whether this topic is an access or a question',
  sortOrderInvalid: 'Enter a whole number for the order',
} as const;

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-01 — the topic name (REQ-02-005)
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-01 — topic name', () => {
  it('rejects an empty name', () => {
    expect(validateTopicName('')).toEqual({ valid: false, error: COPY.nameRequired });
  });

  it('rejects a whitespace-only name', () => {
    expect(validateTopicName('   ')).toEqual({ valid: false, error: COPY.nameRequired });
  });

  it('trims and collapses whitespace before the length checks', () => {
    expect(validateTopicName('  VPN   profile ')).toEqual({ valid: true, value: 'VPN profile' });
  });

  it('accepts 60 characters and rejects 61', () => {
    const sixty = 'a'.repeat(60);
    expect(validateTopicName(sixty)).toEqual({ valid: true, value: sixty });
    expect(validateTopicName('a'.repeat(61))).toEqual({
      valid: false,
      error: COPY.nameTooLong,
    });
  });
});

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-02 — the audience (REQ-02-002)
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-02 — topic audience', () => {
  it('accepts the two audiences', () => {
    expect(validateTopicAudience('staff')).toEqual({ valid: true, value: 'staff' });
    expect(validateTopicAudience('client')).toEqual({ valid: true, value: 'client' });
  });

  it('refuses anything else, case included', () => {
    // The value is sent by our own screens and never typed by a person, so the check is
    // exact rather than case-insensitive.
    for (const bad of ['Staff', '', 'partner']) {
      expect(validateTopicAudience(bad)).toEqual({
        valid: false,
        error: COPY.audienceUnknown,
      });
    }
  });
});

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-03 — the kind (REQ-02-003)
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-03 — topic type', () => {
  it('accepts access and question', () => {
    expect(validateTopicType('access')).toEqual({ valid: true, value: 'access' });
    expect(validateTopicType('question')).toEqual({ valid: true, value: 'question' });
  });

  it('refuses a vacation kind and an empty one', () => {
    for (const bad of ['vacation', '']) {
      expect(validateTopicType(bad)).toEqual({ valid: false, error: COPY.typeUnknown });
    }
  });
});

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-04 — the order (REQ-02-009)
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-04 — topic ordering comparator', () => {
  it('orders by sortOrder, then by name case-insensitively', () => {
    const rows = [
      { sortOrder: 20, name: 'beta' },
      { sortOrder: 10, name: 'zulu' },
      { sortOrder: 20, name: 'Alpha' },
      { sortOrder: 20, name: 'alpha' },
    ];

    const sorted = [...rows].sort(compareRequestTopics).map((row) => row.name);

    // `zulu` first on its lower sortOrder; then the two spellings of alpha adjacent to
    // each other, in either order — case never decides between two *different* names —
    // and `beta` last.
    expect(sorted[0]).toBe('zulu');
    expect(sorted[3]).toBe('beta');
    expect(sorted.slice(1, 3).sort()).toEqual(['Alpha', 'alpha']);
  });
});

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-05 — the four words (REQ-02-028, REQ-02-029)
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-05 — the status label map', () => {
  it('renders each stored status as its word, with the closure reason beside it', () => {
    expect(REQUEST_STATUS_LABELS.open).toEqual({ label: 'Pending', closure: null });
    expect(REQUEST_STATUS_LABELS.answered).toEqual({ label: 'In progress', closure: null });
    expect(REQUEST_STATUS_LABELS.granted).toEqual({ label: 'Completed', closure: null });
    expect(REQUEST_STATUS_LABELS.declined).toEqual({ label: 'Closed', closure: 'declined' });
    expect(REQUEST_STATUS_LABELS.cancelled).toEqual({ label: 'Closed', closure: 'cancelled' });
  });

  it('has an entry for every stored request status and for no vacation status', () => {
    // No request status can render as a raw column value; a vacation card keeps its own
    // word, so `approved` and `rejected` are deliberately absent.
    expect(Object.keys(REQUEST_STATUS_LABELS).sort()).toEqual([
      'answered',
      'cancelled',
      'declined',
      'granted',
      'open',
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-06 — the status expander (REQ-02-027)
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-06 — the list status expander', () => {
  it('expands closed to the two closures', () => {
    expect(expandRequestStatusQuery('closed')).toEqual(['declined', 'cancelled']);
  });

  it('expands all to every stored status', () => {
    expect([...(expandRequestStatusQuery('all') ?? [])].sort()).toEqual([
      'answered',
      'cancelled',
      'declined',
      'granted',
      'open',
    ]);
  });

  it('expands a stored status to itself, so a saved link still resolves', () => {
    expect(expandRequestStatusQuery('open')).toEqual(['open']);
    expect(expandRequestStatusQuery('declined')).toEqual(['declined']);
  });

  it('rejects an unknown value rather than defaulting it', () => {
    expect(expandRequestStatusQuery('nonsense')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * The read's query vocabulary (REQ-02-002) — the half the integration cases drive
 * through the route, asserted here on the pure function that decides it.
 * ------------------------------------------------------------------ */

describe('the catalogue read query parsers', () => {
  it('defaults an omitted status to active and refuses an unknown one', () => {
    expect(parseTopicStatusQuery(undefined)).toBe('active');
    expect(parseTopicStatusQuery('')).toBe('active');
    expect(parseTopicStatusQuery('archived')).toBe('archived');
    expect(parseTopicStatusQuery('all')).toBe('all');
    // Never coerced to `active`: a typo must not look like an empty catalogue.
    expect(parseTopicStatusQuery('activ')).toBeNull();
  });

  it('reads an omitted audience as both audiences and refuses an unknown one', () => {
    expect(parseTopicAudienceQuery(undefined)).toBe('any');
    expect(parseTopicAudienceQuery('staff')).toBe('staff');
    expect(parseTopicAudienceQuery('partner')).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Validation rule 6 — clamped where it is an integer, refused where it is not.
 * ------------------------------------------------------------------ */

describe('topic sortOrder', () => {
  it('leaves an absent value for the service to default', () => {
    expect(validateTopicSortOrder(undefined)).toEqual({ valid: true, value: null });
  });

  it('clamps an out-of-range integer to the bound', () => {
    expect(validateTopicSortOrder(40000)).toEqual({ valid: true, value: 32767 });
    expect(validateTopicSortOrder(-5)).toEqual({ valid: true, value: 0 });
  });

  it('refuses a value that is not an integer rather than coercing it', () => {
    for (const bad of ['top', 1.5, true]) {
      expect(validateTopicSortOrder(bad)).toEqual({
        valid: false,
        error: COPY.sortOrderInvalid,
      });
    }
  });
});
