import { describe, expect, it } from 'vitest';
import {
  HOLIDAY_IMPORT_PAID_HOURS,
  HOLIDAY_SOURCING_MESSAGES,
  acceptProviderEntries,
  buildSourcedCountrySet,
  holidayExternalKey,
  validateIncludeOrgCountry,
  validateRefreshFlag,
  validateSyncYear,
} from './index';

// specs/time-off/02-holiday-sourcing.cases.md §Test Cases — Unit.

/** One nationwide entry in the shape the provider hands over. */
const entry = (over: Record<string, unknown> = {}) => ({
  date: '2026-01-01',
  localName: 'Nowy Rok',
  name: "New Year's Day",
  countryCode: 'PL',
  fixed: true,
  global: true,
  counties: null,
  launchYear: null,
  types: ['Public'],
  ...over,
});

describe('TC-02-UNIT-01: the sourced country set is every active member’s resolved country', () => {
  it('TC-02-UNIT-01: four memberships against an organization stating US, flag off', () => {
    // REQ-02-001 — one stating PL, one stating US, one stating PL again, one stating
    // nothing, against an organization stating US.
    const set = buildSourcedCountrySet({
      memberCountries: ['PL', 'US', 'PL', null],
      organizationCountry: 'US',
      includeOrgCountry: false,
    });
    // Distinct and order-stable. The member stating nothing contributes US through the
    // fallback chain — not a null, and not a fourth entry.
    expect(set).toEqual(['PL', 'US']);
  });

  it('drops a code that names no country rather than refusing the set (Rule 7)', () => {
    expect(
      buildSourcedCountrySet({
        memberCountries: ['XX', 'PL'],
        organizationCountry: null,
        includeOrgCountry: false,
      }),
    ).toEqual(['PL']);
  });

  it('an organization with no country and no member country makes an empty set (Edge case 3)', () => {
    expect(
      buildSourcedCountrySet({
        memberCountries: [null, ''],
        organizationCountry: null,
        includeOrgCountry: true,
      }),
    ).toEqual([]);
  });
});

describe('TC-02-UNIT-02: the organization’s country joins the set only while the setting is on', () => {
  it('TC-02-UNIT-02: flag off, then on, then a member who resolves to it', () => {
    // REQ-02-002 — one membership stating PL, an organization stating GB.
    expect(
      buildSourcedCountrySet({
        memberCountries: ['PL'],
        organizationCountry: 'GB',
        includeOrgCountry: false,
      }),
    ).toEqual(['PL']);

    expect(
      buildSourcedCountrySet({
        memberCountries: ['PL'],
        organizationCountry: 'GB',
        includeOrgCountry: true,
      }),
    ).toEqual(['PL', 'GB']);

    // Edge case 4 — a country a member resolves to stays in the set whatever the flag
    // says: the flag governs REQ-02-002's addition and nothing else.
    expect(
      buildSourcedCountrySet({
        memberCountries: ['GB'],
        organizationCountry: 'GB',
        includeOrgCountry: false,
      }),
    ).toEqual(['GB']);
  });

  it('does not repeat the organization’s country when a member already resolves to it', () => {
    expect(
      buildSourcedCountrySet({
        memberCountries: ['GB'],
        organizationCountry: 'GB',
        includeOrgCountry: true,
      }),
    ).toEqual(['GB']);
  });
});

describe('Validation Rule 1 — the sourced year', () => {
  it('accepts 2000 and 2100 and refuses either side of them', () => {
    expect(validateSyncYear(2000)).toEqual({ valid: true, value: 2000 });
    expect(validateSyncYear(2100)).toEqual({ valid: true, value: 2100 });
    expect(validateSyncYear(1999)).toEqual({
      valid: false,
      error: 'Choose a year between 2000 and 2100.',
    });
    expect(validateSyncYear(2101).valid).toBe(false);
  });

  it('accepts the query string a GET carries and refuses anything that is not a year', () => {
    expect(validateSyncYear('2026')).toEqual({ valid: true, value: 2026 });
    expect(validateSyncYear('2026.5').valid).toBe(false);
    expect(validateSyncYear('').valid).toBe(false);
    expect(validateSyncYear(undefined)).toEqual({
      valid: false,
      error: HOLIDAY_SOURCING_MESSAGES.yearInvalid,
    });
  });
});

describe('Validation Rule 2 — includeOrgCountry is refused, never coerced', () => {
  it('takes a boolean and nothing else', () => {
    expect(validateIncludeOrgCountry(true)).toEqual({ valid: true, value: true });
    expect(validateIncludeOrgCountry(false)).toEqual({ valid: true, value: false });
    for (const bad of ['true', 'false', 1, 0, null, undefined, {}]) {
      expect(validateIncludeOrgCountry(bad)).toEqual({
        valid: false,
        error: "Choose whether to include the organization's country.",
      });
    }
  });
});

describe('Validation Rule 3 — refresh', () => {
  it('absent means false, and a value nothing can read is not a refresh', () => {
    expect(validateRefreshFlag(undefined)).toEqual({ valid: true, value: false });
    expect(validateRefreshFlag(null)).toEqual({ valid: true, value: false });
    expect(validateRefreshFlag(true)).toEqual({ valid: true, value: true });
    expect(validateRefreshFlag('true')).toEqual({ valid: false });
  });
});

describe('REQ-02-005 and Validation Rules 4–6 — the provider-entry filter', () => {
  it('keeps a nationwide Public entry and normalizes what it keeps', () => {
    const result = acceptProviderEntries([entry({ countryCode: 'pl', name: '  Nowy Rok  ' })], {
      countryCode: 'PL',
      year: 2026,
    });
    expect(result).toEqual({
      accepted: [{ date: '2026-01-01', name: 'Nowy Rok', countryCode: 'PL' }],
      discarded: 0,
    });
  });

  it('discards a regional entry and counts it (REQ-02-005, Edge case 6)', () => {
    const result = acceptProviderEntries(
      [entry(), entry({ date: '2026-01-06', global: false, counties: ['DE-BY'] })],
      { countryCode: 'PL', year: 2026 },
    );
    expect(result.accepted).toHaveLength(1);
    expect(result.discarded).toBe(1);
  });

  it('discards a non-Public type, a foreign country, a date outside the year and a bad name', () => {
    const result = acceptProviderEntries(
      [
        entry({ types: ['Bank'] }),
        entry({ countryCode: 'DE' }),
        entry({ date: '2025-12-31' }),
        entry({ date: 'not-a-date' }),
        entry({ name: 'a'.repeat(200) }),
        entry({ name: '   ' }),
        null,
      ],
      { countryCode: 'PL', year: 2026 },
    );
    expect(result.accepted).toEqual([]);
    expect(result.discarded).toBe(7);
  });

  it('answers empty for a payload that is not an array at all', () => {
    expect(acceptProviderEntries({ error: 'nope' }, { countryCode: 'PL', year: 2026 })).toEqual({
      accepted: [],
      discarded: 0,
    });
  });
});

describe('§Boundary values — the composed identity', () => {
  it('is {provider}:{countryCode}:{date}, uppercased', () => {
    expect(holidayExternalKey('nager', 'de', '2026-01-01')).toBe('nager:DE:2026-01-01');
  });

  it('an imported holiday is paid eight hours (REQ-02-004)', () => {
    expect(HOLIDAY_IMPORT_PAID_HOURS).toBe(8);
  });
});
