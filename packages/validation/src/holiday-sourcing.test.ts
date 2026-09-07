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

describe('TC-02-UNIT-01: the sourced country set is every active member’s stated country', () => {
  it('TC-02-UNIT-01: four memberships, one of them stating nothing', () => {
    // REQ-02-001 — one stating PL, one stating US, one stating PL again, one stating
    // nothing.
    const set = buildSourcedCountrySet({ memberCountries: ['PL', 'US', 'PL', null] });
    // Distinct and order-stable. PATCH-012 — the member stating nothing contributes
    // NOTHING: there is no organization country behind them any more.
    expect(set).toEqual(['PL', 'US']);
  });

  it('drops a code that names no country rather than refusing the set (Rule 7)', () => {
    expect(buildSourcedCountrySet({ memberCountries: ['XX', 'PL'] })).toEqual(['PL']);
  });

  it('no member country makes an empty set (Edge case 3)', () => {
    expect(buildSourcedCountrySet({ memberCountries: [null, ''] })).toEqual([]);
  });

  /**
   * PATCH-012 — TC-02-UNIT-02 asked whether the organization's country joined the set
   * while the `includeOrgCountry` setting was on. **Retired**: neither the setting nor
   * the organization's country exists, and the case below is what replaces it — the set
   * is the members' own countries, and an organization column could not put one in it
   * even if it held one.
   */
  it('a member who states nothing adds nothing, whoever else states what', () => {
    expect(buildSourcedCountrySet({ memberCountries: [null] })).toEqual([]);
    expect(buildSourcedCountrySet({ memberCountries: ['GB', null, 'gb'] })).toEqual(['GB']);
  });
});

describe('§Error Messages — the six rows, verbatim', () => {
  it('carries each message exactly as the table states it', () => {
    // The literal text of the document, not the constant the screen imports: asserting
    // the constant would certify whatever the code happens to say.
    expect(HOLIDAY_SOURCING_MESSAGES.yearInvalid).toBe('Choose a year between 2000 and 2100.');
    expect(HOLIDAY_SOURCING_MESSAGES.includeOrgCountryInvalid).toBe(
      "Choose whether to include the organization's country.",
    );
    expect(HOLIDAY_SOURCING_MESSAGES.syncFailedSome).toBe('Some countries could not be sourced.');
    expect(HOLIDAY_SOURCING_MESSAGES.countryNotCovered).toBe(
      'The holiday service does not cover this country. Add its holidays by hand.',
    );
    // Edge case 5a — `empty` is covered-but-empty and takes its own sentence.
    expect(HOLIDAY_SOURCING_MESSAGES.countryNoHolidays).toBe(
      'The holiday service lists no public holidays for this country this year. Add any by hand.',
    );
    expect(HOLIDAY_SOURCING_MESSAGES.syncing).toBe('Fetching public holidays…');
    expect(HOLIDAY_SOURCING_MESSAGES.summaryUnavailable).toBe(
      'The day and cost totals could not be loaded.',
    );
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

  it('discards a day the month does not have rather than storing it', () => {
    // `2026-02-31` matches YYYY-MM-DD and names no day; a Date built from it rolls
    // forward to 3 March, which is not the day the provider sent.
    const result = acceptProviderEntries(
      [entry({ date: '2026-02-31' }), entry({ date: '2026-13-01' }), entry({ date: '2026-02-28' })],
      { countryCode: 'PL', year: 2026 },
    );
    expect(result.accepted.map((e) => e.date)).toEqual(['2026-02-28']);
    expect(result.discarded).toBe(2);
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
