import { describe, expect, it } from 'vitest';
import {
  AUTOFILL_SOURCES,
  COUNTRY_OPTIONS,
  MASKS,
  PROFILE_LIMITS,
  PROFILE_MESSAGES,
  SENSITIVE_PROFILE_FIELDS,
  composeFullAddress,
  countryName,
  findAutofillSource,
  isMaskedValue,
  isTypeCompatible,
  maskProfileValue,
  resolveAutofill,
  resolveAutofillSource,
  sourcesForFieldType,
  validateAutofillSource,
  validateCountryCode,
  validateProfileField,
  type AutofillContext,
  type AutofillSubject,
} from './autofill';
import { TEMPLATE_FIELD_TYPES, type TemplateFieldType } from './documents';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

/** The spec's running example: Alex Kaminski of Minsk. */
const FULL_SUBJECT: AutofillSubject = {
  firstName: 'Alex',
  lastName: 'Kaminski',
  email: 'alex@example.com',
  jobTitle: 'Contractor',
  // A timestamp, not a date-only value — `Membership.joinedAt` defaults from `now()`.
  joinedAt: new Date('2024-06-01T09:30:00.000Z'),
  addressLine: 'Nezavisimosti Ave 1, apt 5',
  city: 'Minsk',
  postalCode: '220030',
  country: 'BY',
  taxId: '191234567',
  // Date-only, stored at UTC midnight exactly as the Prisma model documents.
  dateOfBirth: new Date(Date.UTC(1991, 2, 14)),
  idDocumentNumber: 'MP1234567',
  bankDetails: 'IBAN BY13 ALFA 3014 0000 0000 0000 0000',
};

const EMPTY_SUBJECT: AutofillSubject = {
  firstName: null,
  lastName: null,
  email: null,
  jobTitle: null,
  joinedAt: null,
  addressLine: null,
  city: null,
  postalCode: null,
  country: null,
  taxId: null,
  dateOfBirth: null,
  idDocumentNumber: null,
  bankDetails: null,
};

const context = (over: Partial<AutofillContext> = {}): AutofillContext => ({
  subject: FULL_SUBJECT,
  organizationName: 'Devscribed',
  timezone: 'Europe/Minsk',
  now: new Date('2026-08-24T09:00:00.000Z'),
  ...over,
});

/* ------------------------------------------------------------------ *
 * TC-03-UNIT-01: Source catalogue resolution
 * ------------------------------------------------------------------ */

describe('TC-03-UNIT-01: Source catalogue resolution', () => {
  it('lists the spec table exactly, in the spec order', () => {
    expect(AUTOFILL_SOURCES.map((s) => s.key)).toEqual([
      'member.firstName',
      'member.lastName',
      'member.fullName',
      'member.email',
      'member.jobTitle',
      'member.joinedAt',
      'member.addressLine',
      'member.city',
      'member.postalCode',
      'member.country',
      'member.fullAddress',
      'member.taxId',
      'member.dateOfBirth',
      'member.idDocumentNumber',
      'member.bankDetails',
      'org.name',
      'today',
    ]);
  });

  it('marks exactly the four sensitive sources (requirement 19)', () => {
    expect(AUTOFILL_SOURCES.filter((s) => s.sensitive).map((s) => s.key)).toEqual([
      'member.taxId',
      'member.dateOfBirth',
      'member.idDocumentNumber',
      'member.bankDetails',
    ]);
  });

  it('gives every source a label and a group so the picker needs no client-side table', () => {
    for (const source of AUTOFILL_SOURCES) {
      expect(source.label.length).toBeGreaterThan(0);
      expect(['member', 'org', 'system']).toContain(source.group);
    }
  });

  const RESOLVED_FROM_FULL_SUBJECT: Array<[string, string]> = [
    ['member.firstName', 'Alex'],
    ['member.lastName', 'Kaminski'],
    ['member.fullName', 'Alex Kaminski'],
    ['member.email', 'alex@example.com'],
    ['member.jobTitle', 'Contractor'],
    ['member.joinedAt', '2024-06-01'],
    ['member.addressLine', 'Nezavisimosti Ave 1, apt 5'],
    ['member.city', 'Minsk'],
    // Requirement 9: the stored alpha-2 code is expanded to the country name.
    ['member.postalCode', '220030'],
    ['member.country', 'Belarus'],
    ['member.fullAddress', 'Nezavisimosti Ave 1, apt 5, Minsk, 220030, Belarus'],
    ['member.taxId', '191234567'],
    ['member.dateOfBirth', '1991-03-14'],
    ['member.idDocumentNumber', 'MP1234567'],
    ['member.bankDetails', 'IBAN BY13 ALFA 3014 0000 0000 0000 0000'],
    ['org.name', 'Devscribed'],
    ['today', '2026-08-24'],
  ];

  it('covers every catalogue key — no source may go untested', () => {
    expect(RESOLVED_FROM_FULL_SUBJECT.map(([key]) => key)).toEqual(
      AUTOFILL_SOURCES.map((s) => s.key),
    );
  });

  for (const [key, expected] of RESOLVED_FROM_FULL_SUBJECT) {
    it(`${key} resolves to ${JSON.stringify(expected)} from a full subject`, () => {
      expect(resolveAutofillSource(key, context())).toBe(expected);
    });
  }

  // Requirement 12: `member.*` resolve empty with no subject; `org.*` and `today` still fill.
  for (const source of AUTOFILL_SOURCES) {
    const stillResolves = source.key === 'org.name' || source.key === 'today';
    it(`${source.key} ${stillResolves ? 'still resolves' : 'resolves to an empty string'} with no subject`, () => {
      const value = resolveAutofillSource(source.key, context({ subject: null }));
      if (stillResolves) {
        expect(value.length).toBeGreaterThan(0);
      } else {
        expect(value).toBe('');
      }
    });
  }

  it('never throws for any catalogue key against a null subject (requirement 7)', () => {
    for (const source of AUTOFILL_SOURCES) {
      expect(() => resolveAutofillSource(source.key, context({ subject: null }))).not.toThrow();
    }
  });

  it('treats an all-null profile exactly like a missing one (requirement 14)', () => {
    const missing = context({ subject: null });
    const empty = context({ subject: EMPTY_SUBJECT });
    for (const source of AUTOFILL_SOURCES) {
      expect(resolveAutofillSource(source.key, empty)).toBe(resolveAutofillSource(source.key, missing));
    }
  });

  it('resolves a partly filled profile without inventing separators', () => {
    const subject: AutofillSubject = { ...EMPTY_SUBJECT, firstName: 'Alex', city: 'Minsk' };
    const ctx = context({ subject });
    // No trailing space from the absent last name.
    expect(resolveAutofillSource('member.fullName', ctx)).toBe('Alex');
    expect(resolveAutofillSource('member.city', ctx)).toBe('Minsk');
    expect(resolveAutofillSource('member.bankDetails', ctx)).toBe('');
    expect(resolveAutofillSource('member.country', ctx)).toBe('');
  });

  it('resolves an unknown key to an empty string rather than throwing', () => {
    expect(findAutofillSource('member.unknownThing')).toBeUndefined();
    expect(resolveAutofillSource('member.unknownThing', context())).toBe('');
    expect(resolveAutofillSource('', context())).toBe('');
  });

  it('reports the unknown key as an error where a mistake can still be corrected', () => {
    // The spec's "error for the unknown key" belongs at template-save time, not at
    // resolution time, which requirement 7 forbids failing.
    expect(validateAutofillSource('member.unknownThing', 'text')).toEqual({
      valid: false,
      error: 'Unknown autofill source',
    });
  });

  it('trims whitespace around a stored key', () => {
    expect(findAutofillSource('  member.city  ')?.key).toBe('member.city');
    expect(resolveAutofillSource('  member.city  ', context())).toBe('Minsk');
  });

  it('trims resolved text values (requirement 9)', () => {
    const subject: AutofillSubject = { ...FULL_SUBJECT, city: '  Minsk  ', taxId: ' 191234567 ' };
    expect(resolveAutofillSource('member.city', context({ subject }))).toBe('Minsk');
    expect(resolveAutofillSource('member.taxId', context({ subject }))).toBe('191234567');
  });
});

/* ------------------------------------------------------------------ *
 * Date normalization (requirement 9)
 * ------------------------------------------------------------------ */

describe('date normalization across timezones', () => {
  it('resolves `today` as the server date in the organization timezone', () => {
    const at = new Date('2026-08-24T02:00:00.000Z');
    expect(resolveAutofillSource('today', context({ now: at, timezone: 'UTC' }))).toBe('2026-08-24');
    // Still 23 August in Los Angeles at 02:00 UTC.
    expect(resolveAutofillSource('today', context({ now: at, timezone: 'America/Los_Angeles' }))).toBe(
      '2026-08-23',
    );
    // Already 24 August, 11:00, in Tokyo.
    expect(resolveAutofillSource('today', context({ now: at, timezone: 'Asia/Tokyo' }))).toBe(
      '2026-08-24',
    );
  });

  it('rolls `today` forward across the dateline the other way too', () => {
    const at = new Date('2026-08-24T22:00:00.000Z');
    expect(resolveAutofillSource('today', context({ now: at, timezone: 'Asia/Tokyo' }))).toBe(
      '2026-08-25',
    );
    expect(resolveAutofillSource('today', context({ now: at, timezone: null }))).toBe('2026-08-24');
  });

  it('falls back to UTC for an unrecognized timezone rather than throwing', () => {
    const at = new Date('2026-08-24T02:00:00.000Z');
    expect(resolveAutofillSource('today', context({ now: at, timezone: 'Not/AZone' }))).toBe(
      '2026-08-24',
    );
    expect(resolveAutofillSource('today', context({ now: at, timezone: '' }))).toBe('2026-08-24');
  });

  it('never re-zones a date-only value — a birthday must not move', () => {
    // 1991-03-14 stored at UTC midnight would render as the 13th in any negative offset.
    for (const timezone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', null]) {
      expect(resolveAutofillSource('member.dateOfBirth', context({ timezone }))).toBe('1991-03-14');
    }
  });

  it('resolves `joinedAt` in the organization timezone, because it is a timestamp', () => {
    const subject: AutofillSubject = {
      ...FULL_SUBJECT,
      joinedAt: new Date('2026-01-01T02:00:00.000Z'),
    };
    expect(resolveAutofillSource('member.joinedAt', context({ subject, timezone: 'UTC' }))).toBe(
      '2026-01-01',
    );
    expect(
      resolveAutofillSource('member.joinedAt', context({ subject, timezone: 'America/Los_Angeles' })),
    ).toBe('2025-12-31');
  });

  it('resolves an invalid Date to an empty string rather than "Invalid Date"', () => {
    const subject: AutofillSubject = { ...FULL_SUBJECT, dateOfBirth: new Date('nonsense') };
    expect(resolveAutofillSource('member.dateOfBirth', context({ subject }))).toBe('');
  });

  it('defaults the clock to now when the context supplies none', () => {
    const ctx: AutofillContext = { subject: null, organizationName: 'Devscribed', timezone: 'UTC' };
    expect(resolveAutofillSource('today', ctx)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/* ------------------------------------------------------------------ *
 * TC-03-UNIT-02: Full address composition skips blanks
 * ------------------------------------------------------------------ */

describe('TC-03-UNIT-02: Full address composition skips blanks', () => {
  const assertWellFormed = (value: string) => {
    expect(value).not.toMatch(/,\s*,/); // No doubled separator.
    expect(value).not.toMatch(/^[\s,]/); // No leading punctuation.
    expect(value).not.toMatch(/[\s,]$/); // No trailing punctuation.
  };

  it('joins all four parts in order, expanding the country code', () => {
    const value = composeFullAddress({
      addressLine: 'Nezavisimosti Ave 1, apt 5',
      city: 'Minsk',
      postalCode: '220030',
      country: 'BY',
    });
    expect(value).toBe('Nezavisimosti Ave 1, apt 5, Minsk, 220030, Belarus');
    assertWellFormed(value);
  });

  it('skips a missing middle part without leaving a gap', () => {
    const value = composeFullAddress({
      addressLine: 'Nezavisimosti Ave 1',
      city: null,
      postalCode: '220030',
      country: 'BY',
    });
    expect(value).toBe('Nezavisimosti Ave 1, 220030, Belarus');
    assertWellFormed(value);
  });

  it('skips both middle parts, the spec case with postalCode and city missing', () => {
    const value = composeFullAddress({
      addressLine: 'Nezavisimosti Ave 1',
      city: null,
      postalCode: null,
      country: 'BY',
    });
    expect(value).toBe('Nezavisimosti Ave 1, Belarus');
    assertWellFormed(value);
  });

  it('returns one bare part with no separators at all', () => {
    const value = composeFullAddress({
      addressLine: null,
      city: 'Minsk',
      postalCode: null,
      country: null,
    });
    expect(value).toBe('Minsk');
    assertWellFormed(value);
  });

  it('returns an empty string when every part is blank, not a run of commas', () => {
    expect(
      composeFullAddress({ addressLine: null, city: null, postalCode: null, country: null }),
    ).toBe('');
    expect(
      composeFullAddress({ addressLine: '  ', city: '', postalCode: '\t', country: '  ' }),
    ).toBe('');
  });

  it('treats a whitespace-only part as blank rather than as a part', () => {
    const value = composeFullAddress({
      addressLine: 'Nezavisimosti Ave 1',
      city: '   ',
      postalCode: '220030',
      country: null,
    });
    expect(value).toBe('Nezavisimosti Ave 1, 220030');
    assertWellFormed(value);
  });

  it('keeps an unknown country code in the address rather than dropping it', () => {
    const value = composeFullAddress({
      addressLine: 'Somewhere 1',
      city: null,
      postalCode: null,
      country: 'ZZ',
    });
    expect(value).toBe('Somewhere 1, ZZ');
  });

  it('agrees with member.country on the expansion, so the two can never diverge', () => {
    expect(composeFullAddress({ addressLine: null, city: null, postalCode: null, country: 'BY' })).toBe(
      resolveAutofillSource('member.country', context()),
    );
  });
});

/* ------------------------------------------------------------------ *
 * TC-03-UNIT-03: Type compatibility
 * ------------------------------------------------------------------ */

describe('TC-03-UNIT-03: Type compatibility', () => {
  it('rejects member.fullName for a date field and accepts it for a text field', () => {
    const fullName = findAutofillSource('member.fullName')!;
    expect(isTypeCompatible('date', fullName.type)).toBe(false);
    expect(isTypeCompatible('text', fullName.type)).toBe(true);
  });

  it('accepts member.dateOfBirth for a date field and rejects it for text and email', () => {
    const dob = findAutofillSource('member.dateOfBirth')!;
    expect(isTypeCompatible('date', dob.type)).toBe(true);
    expect(isTypeCompatible('email', dob.type)).toBe(false);
    // The spec's picker hides date sources from a text field, and TC-03-INT-12 requires
    // the bind to be rejected outright.
    expect(isTypeCompatible('text', dob.type)).toBe(false);
    expect(isTypeCompatible('multiline', dob.type)).toBe(false);
  });

  it('accepts member.email for an email field and rejects everything else there', () => {
    expect(sourcesForFieldType('email').map((s) => s.key)).toEqual(['member.email']);
  });

  it('lets a text field take everything renderable as free text, dates excepted', () => {
    const dateSources = ['member.joinedAt', 'member.dateOfBirth', 'today'];
    const freeText = AUTOFILL_SOURCES.map((s) => s.key).filter((key) => !dateSources.includes(key));
    expect(sourcesForFieldType('text').map((s) => s.key)).toEqual(freeText);
    expect(sourcesForFieldType('multiline').map((s) => s.key)).toEqual(freeText);
    // A multiline source is offered to a single-line text field — the spec's own mockup
    // lists "Member · Full address" for one.
    expect(sourcesForFieldType('text').map((s) => s.key)).toContain('member.fullAddress');
  });

  it('offers a date field only the three date sources', () => {
    expect(sourcesForFieldType('date').map((s) => s.key)).toEqual([
      'member.joinedAt',
      'member.dateOfBirth',
      'today',
    ]);
  });

  it('offers select, checkbox and number nothing at all', () => {
    for (const fieldType of ['select', 'checkbox', 'number'] as TemplateFieldType[]) {
      expect(sourcesForFieldType(fieldType)).toEqual([]);
      for (const source of AUTOFILL_SOURCES) {
        expect(isTypeCompatible(fieldType, source.type)).toBe(false);
      }
    }
  });

  it('has a row for every field type the template editor can produce', () => {
    for (const fieldType of TEMPLATE_FIELD_TYPES) {
      expect(() => sourcesForFieldType(fieldType)).not.toThrow();
    }
  });

  it('validateAutofillSource enforces rule 9 with the spec sentences', () => {
    expect(validateAutofillSource('member.fullName', 'text')).toEqual({
      valid: true,
      value: 'member.fullName',
    });
    expect(validateAutofillSource('member.fullName', 'date')).toEqual({
      valid: false,
      error: 'This source cannot fill a date field',
    });
    expect(validateAutofillSource('member.dateOfBirth', 'text')).toEqual({
      valid: false,
      error: 'This source cannot fill a text field',
    });
    // "no autofill" is always a valid choice.
    expect(validateAutofillSource(null, 'select')).toEqual({ valid: true, value: '' });
    expect(validateAutofillSource('', 'date')).toEqual({ valid: true, value: '' });
  });
});

/* ------------------------------------------------------------------ *
 * TC-03-UNIT-04: Masking
 * ------------------------------------------------------------------ */

describe('TC-03-UNIT-04: Masking', () => {
  it('names exactly the four sensitive fields (requirement 19)', () => {
    expect(SENSITIVE_PROFILE_FIELDS).toEqual([
      'taxId',
      'dateOfBirth',
      'idDocumentNumber',
      'bankDetails',
    ]);
  });

  it('masks a tax id to its last four characters', () => {
    expect(maskProfileValue('taxId', '191234567')).toBe('***4567');
  });

  it('masks an id document number the same way', () => {
    expect(maskProfileValue('idDocumentNumber', 'MP1234567')).toBe('***4567');
  });

  it('masks a date of birth to the year only', () => {
    expect(maskProfileValue('dateOfBirth', '1991-03-14')).toBe('1991');
  });

  it('masks bank details opaquely — no prefix, no length hint', () => {
    expect(maskProfileValue('bankDetails', 'IBAN BY13 ALFA 3014 0000')).toBe(MASKS.bankDetails);
    expect(MASKS.bankDetails).toBe('••••');
  });

  it('masks a short value entirely, leaking no digits', () => {
    expect(maskProfileValue('taxId', '123')).toBe('***');
    expect(maskProfileValue('taxId', '1234')).toBe('***');
    expect(maskProfileValue('idDocumentNumber', 'A')).toBe('***');
    // Five characters is the first length that can show a window without showing it all.
    expect(maskProfileValue('taxId', '12345')).toBe('***2345');
  });

  it('leaves null as null — an absent value is not a secret', () => {
    for (const field of SENSITIVE_PROFILE_FIELDS) {
      expect(maskProfileValue(field, null)).toBeNull();
    }
  });

  it('leaves an empty string empty, so the empty state stays reachable', () => {
    for (const field of SENSITIVE_PROFILE_FIELDS) {
      expect(maskProfileValue(field, '')).toBe('');
      expect(maskProfileValue(field, '   ')).toBe('   ');
    }
  });

  it('returns non-sensitive fields untouched, so a whole profile can be mapped through it', () => {
    expect(maskProfileValue('city', 'Minsk')).toBe('Minsk');
    expect(maskProfileValue('addressLine', 'Nezavisimosti Ave 1')).toBe('Nezavisimosti Ave 1');
    expect(maskProfileValue('country', 'BY')).toBe('BY');
  });

  it('falls back to the opaque mask for a malformed date rather than guessing at it', () => {
    expect(maskProfileValue('dateOfBirth', '14 March 1991')).toBe(MASKS.bankDetails);
  });

  it('never returns a value containing the original tail of a long secret', () => {
    const secret = 'BY13ALFA30140000000000000000';
    const masked = maskProfileValue('bankDetails', secret)!;
    expect(masked).not.toContain('0000');
    expect(masked.length).toBeLessThan(secret.length);
  });
});

/* ------------------------------------------------------------------ *
 * Requirement 22 — a mask is never written back
 * ------------------------------------------------------------------ */

describe('isMaskedValue round-trips every mask shape', () => {
  const MASKABLE: Array<[string, string]> = [
    ['taxId', '191234567'],
    ['taxId', '123'],
    ['idDocumentNumber', 'MP1234567'],
    ['idDocumentNumber', 'A1'],
    ['dateOfBirth', '1991-03-14'],
    ['dateOfBirth', '14 March 1991'],
    ['bankDetails', 'IBAN BY13 ALFA 3014 0000'],
  ];

  for (const [field, value] of MASKABLE) {
    it(`recognizes what maskProfileValue produced for ${field} = ${JSON.stringify(value)}`, () => {
      const masked = maskProfileValue(field, value)!;
      expect(isMaskedValue(field, masked)).toBe(true);
    });

    it(`does not mistake the real ${field} ${JSON.stringify(value)} for a mask`, () => {
      expect(isMaskedValue(field, value)).toBe(false);
    });
  }

  it('recognizes a mask even when it does not match the current value', () => {
    // The stale-client case: the caller holds `***4567` from before the tax id changed.
    expect(isMaskedValue('taxId', '***4567')).toBe(true);
    expect(isMaskedValue('taxId', '***0000')).toBe(true);
    expect(isMaskedValue('taxId', '***')).toBe(true);
  });

  it('tolerates whitespace around a mask, which a form control can add', () => {
    expect(isMaskedValue('bankDetails', ' •••• ')).toBe(true);
    expect(isMaskedValue('dateOfBirth', ' 1991 ')).toBe(true);
  });

  it('treats a bare year as a mask, because a real date of birth is a full ISO date', () => {
    expect(isMaskedValue('dateOfBirth', '1991')).toBe(true);
    expect(isMaskedValue('dateOfBirth', '1991-01-01')).toBe(false);
  });

  it('never treats a non-sensitive field as masked, whatever it contains', () => {
    expect(isMaskedValue('city', '••••')).toBe(false);
    expect(isMaskedValue('addressLine', '***4567')).toBe(false);
    expect(isMaskedValue('postalCode', '1991')).toBe(false);
  });

  it('is false for an empty or absent value, which clears rather than masks', () => {
    expect(isMaskedValue('taxId', '')).toBe(false);
    expect(isMaskedValue('bankDetails', '')).toBe(false);
    expect(isMaskedValue('taxId', undefined as unknown as string)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * TC-03-UNIT-05: Truncation flagging
 * ------------------------------------------------------------------ */

describe('TC-03-UNIT-05: Truncation flagging', () => {
  const longAddress = 'N'.repeat(250);

  const withAddress = (addressLine: string) =>
    context({ subject: { ...FULL_SUBJECT, addressLine } });

  it('stores a 250-character address truncated to 200 and flags the key', () => {
    const result = resolveAutofill(
      [{ key: 'contractor_address', type: 'text', maxLength: 200, autofillSource: 'member.addressLine' }],
      withAddress(longAddress),
    );
    expect(result.values.contractor_address).toHaveLength(200);
    expect(result.values.contractor_address).toBe('N'.repeat(200));
    expect(result.truncated).toEqual(['contractor_address']);
    // Requirement 11: a truncated value is still an autofilled value.
    expect(result.autofilled).toEqual(['contractor_address']);
  });

  it('does not flag a value that sits exactly on the limit', () => {
    const result = resolveAutofill(
      [{ key: 'contractor_address', type: 'text', maxLength: 200, autofillSource: 'member.addressLine' }],
      withAddress('N'.repeat(200)),
    );
    expect(result.values.contractor_address).toHaveLength(200);
    expect(result.truncated).toEqual([]);
    expect(result.autofilled).toEqual(['contractor_address']);
  });

  it('does not flag a value one character under the limit', () => {
    const result = resolveAutofill(
      [{ key: 'contractor_address', type: 'text', maxLength: 200, autofillSource: 'member.addressLine' }],
      withAddress('N'.repeat(199)),
    );
    expect(result.truncated).toEqual([]);
  });

  it('leaves a value untouched when the field has no length budget', () => {
    const result = resolveAutofill(
      [{ key: 'contractor_address', type: 'multiline', maxLength: null, autofillSource: 'member.addressLine' }],
      withAddress(longAddress),
    );
    expect(result.values.contractor_address).toHaveLength(250);
    expect(result.truncated).toEqual([]);
  });

  it('flags every over-long field, not just the first', () => {
    const result = resolveAutofill(
      [
        { key: 'a', type: 'text', maxLength: 5, autofillSource: 'member.addressLine' },
        { key: 'b', type: 'text', maxLength: 5, autofillSource: 'member.bankDetails' },
        { key: 'c', type: 'text', maxLength: 200, autofillSource: 'member.city' },
      ],
      context(),
    );
    expect(result.truncated).toEqual(['a', 'b']);
    expect(result.values.c).toBe('Minsk');
  });
});

/* ------------------------------------------------------------------ *
 * resolveAutofill — requirements 6-12
 * ------------------------------------------------------------------ */

describe('resolveAutofill', () => {
  const FIELDS = [
    { key: 'contractor_full_name', type: 'text' as const, maxLength: 200, autofillSource: 'member.fullName' },
    { key: 'contractor_tax_id', type: 'text' as const, maxLength: 200, autofillSource: 'member.taxId' },
    { key: 'contractor_bank', type: 'multiline' as const, maxLength: 2000, autofillSource: 'member.bankDetails' },
    { key: 'org_name', type: 'text' as const, maxLength: 200, autofillSource: 'org.name' },
    { key: 'contract_date', type: 'date' as const, maxLength: 10, autofillSource: 'today' },
    { key: 'contract_no', type: 'text' as const, maxLength: 200, autofillSource: null },
  ];

  it('resolves every bound field and leaves unbound ones out of the map entirely', () => {
    const result = resolveAutofill(FIELDS, context());
    expect(result.values).toEqual({
      contractor_full_name: 'Alex Kaminski',
      contractor_tax_id: '191234567',
      contractor_bank: 'IBAN BY13 ALFA 3014 0000 0000 0000 0000',
      org_name: 'Devscribed',
      contract_date: '2026-08-24',
    });
    expect(result.values).not.toHaveProperty('contract_no');
    expect(result.autofilled).toEqual([
      'contractor_full_name',
      'contractor_tax_id',
      'contractor_bank',
      'org_name',
      'contract_date',
    ]);
    expect(result.truncated).toEqual([]);
  });

  it('fills org.name and today but no member.* when there is no subject (requirement 12)', () => {
    const result = resolveAutofill(FIELDS, context({ subject: null }));
    expect(result.values).toEqual({
      contractor_full_name: '',
      contractor_tax_id: '',
      contractor_bank: '',
      org_name: 'Devscribed',
      contract_date: '2026-08-24',
    });
    // Only the two that actually received a value are marked for the ⟲ badge.
    expect(result.autofilled).toEqual(['org_name', 'contract_date']);
  });

  it('keeps a bound-but-empty key in values, so a gap is distinguishable from an unbound field', () => {
    const result = resolveAutofill(FIELDS, context({ subject: EMPTY_SUBJECT }));
    expect(Object.keys(result.values)).toContain('contractor_tax_id');
    expect(result.values.contractor_tax_id).toBe('');
    expect(result.autofilled).not.toContain('contractor_tax_id');
  });

  it('resolves a removed member normally — a contract may be issued for someone who left', () => {
    // Requirement 13: removal is a status the picker warns about, not a resolution rule.
    // Nothing in the subject shape marks removal, which is the point: this module never
    // has to know, and cannot accidentally start refusing.
    const removed = { ...FULL_SUBJECT };
    const result = resolveAutofill(FIELDS, context({ subject: removed }));
    expect(result.values.contractor_full_name).toBe('Alex Kaminski');
    expect(result.values.contractor_tax_id).toBe('191234567');
    expect(result.autofilled).toContain('contractor_tax_id');
  });

  it('resolves regardless of who fills the field (requirement 6)', () => {
    // `filledBy` is not even in the input shape — a signer-owned field is pre-filled too.
    const result = resolveAutofill(
      [{ key: 'signer_name', type: 'text', maxLength: 200, autofillSource: 'member.fullName' }],
      context(),
    );
    expect(result.values.signer_name).toBe('Alex Kaminski');
  });

  it('skips a stale binding to a source that no longer exists', () => {
    const result = resolveAutofill(
      [{ key: 'ghost', type: 'text', maxLength: 200, autofillSource: 'member.salary' }],
      context(),
    );
    expect(result.values).toEqual({});
    expect(result.autofilled).toEqual([]);
  });

  it('skips a binding whose field type stopped being compatible', () => {
    const result = resolveAutofill(
      [{ key: 'when', type: 'date', maxLength: 10, autofillSource: 'member.fullName' }],
      context(),
    );
    expect(result.values).toEqual({});
  });

  it('never throws on an empty, absent, or degenerate input', () => {
    expect(resolveAutofill([], context({ subject: null }))).toEqual({
      values: {},
      autofilled: [],
      truncated: [],
    });
    expect(() =>
      resolveAutofill(
        [{ key: 'x', type: 'text', maxLength: 0, autofillSource: '  ' }],
        context({ subject: null }),
      ),
    ).not.toThrow();
  });

  it('is a pure snapshot — resolving twice from one context gives one answer', () => {
    // Requirement 8: the values are frozen at creation, so the function must not depend on
    // anything but its inputs.
    const ctx = context();
    expect(resolveAutofill(FIELDS, ctx)).toEqual(resolveAutofill(FIELDS, ctx));
  });
});

/* ------------------------------------------------------------------ *
 * Countries (requirement 17)
 * ------------------------------------------------------------------ */

describe('validateCountryCode', () => {
  it('accepts a known code and normalizes it to upper case', () => {
    expect(validateCountryCode('BY')).toEqual({ valid: true, value: 'BY' });
    expect(validateCountryCode('by')).toEqual({ valid: true, value: 'BY' });
    expect(validateCountryCode('  us  ')).toEqual({ valid: true, value: 'US' });
  });

  it('accepts absence — every profile field is optional (requirement 16)', () => {
    expect(validateCountryCode(null)).toEqual({ valid: true, value: '' });
    expect(validateCountryCode(undefined)).toEqual({ valid: true, value: '' });
    expect(validateCountryCode('')).toEqual({ valid: true, value: '' });
    expect(validateCountryCode('   ')).toEqual({ valid: true, value: '' });
  });

  it('rejects an unassigned or malformed code with the spec sentence', () => {
    for (const code of ['ZZ', 'XX', 'B', 'BYE', 'Belarus', '12']) {
      expect(validateCountryCode(code)).toEqual({ valid: false, error: 'Enter a valid country' });
    }
  });

  it('cannot be fooled by an inherited Object property', () => {
    expect(validateCountryCode('constructor')).toEqual({
      valid: false,
      error: 'Enter a valid country',
    });
    expect(countryName('toString')).toBe('TOSTRING');
  });
});

describe('countryName', () => {
  it('expands a known code to its English short name', () => {
    expect(countryName('BY')).toBe('Belarus');
    expect(countryName('by')).toBe('Belarus');
    expect(countryName('US')).toBe('United States');
    expect(countryName('GB')).toBe('United Kingdom');
  });

  it('returns null only for a genuinely absent code', () => {
    expect(countryName(null)).toBeNull();
    expect(countryName(undefined)).toBeNull();
    expect(countryName('')).toBeNull();
    expect(countryName('  ')).toBeNull();
  });

  it('returns the code itself when unknown, so an address never loses its country', () => {
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName('zz')).toBe('ZZ');
  });

  it('carries the whole ISO 3166-1 alpha-2 table, not a convenient subset', () => {
    expect(COUNTRY_OPTIONS).toHaveLength(249);
    for (const option of COUNTRY_OPTIONS) {
      expect(option.code).toMatch(/^[A-Z]{2}$/);
      expect(option.name.length).toBeGreaterThan(0);
      expect(countryName(option.code)).toBe(option.name);
      expect(validateCountryCode(option.code).valid).toBe(true);
    }
  });

  it('sorts the options by name, the order a human scans a select in', () => {
    const names = COUNTRY_OPTIONS.map((option) => option.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

/* ------------------------------------------------------------------ *
 * Profile field validation (Validation Rules 1-8)
 * ------------------------------------------------------------------ */

describe('validateProfileField', () => {
  const NOW = new Date('2026-08-24T00:00:00.000Z');

  const LENGTH_RULES: Array<[string, number, string]> = [
    ['addressLine', PROFILE_LIMITS.addressLineMax, PROFILE_MESSAGES.addressLine.tooLong],
    ['city', PROFILE_LIMITS.cityMax, PROFILE_MESSAGES.city.tooLong],
    ['postalCode', PROFILE_LIMITS.postalCodeMax, PROFILE_MESSAGES.postalCode.tooLong],
    ['idDocumentNumber', PROFILE_LIMITS.idDocumentNumberMax, PROFILE_MESSAGES.idDocumentNumber.tooLong],
    ['bankDetails', PROFILE_LIMITS.bankDetailsMax, PROFILE_MESSAGES.bankDetails.tooLong],
  ];

  for (const [field, max, message] of LENGTH_RULES) {
    it(`${field} accepts exactly ${max} characters and rejects one more`, () => {
      expect(validateProfileField(field, 'x'.repeat(max), NOW)).toEqual({
        valid: true,
        value: 'x'.repeat(max),
      });
      expect(validateProfileField(field, 'x'.repeat(max + 1), NOW)).toEqual({
        valid: false,
        error: message,
      });
    });
  }

  it('the limits match the spec table', () => {
    expect(PROFILE_LIMITS).toEqual({
      addressLineMax: 200,
      cityMax: 100,
      postalCodeMax: 20,
      taxIdMax: 40,
      idDocumentNumberMax: 40,
      bankDetailsMax: 500,
    });
  });

  it('treats null, undefined, and blank as a valid clear on every field', () => {
    const fields = [
      'addressLine',
      'city',
      'postalCode',
      'country',
      'taxId',
      'dateOfBirth',
      'idDocumentNumber',
      'bankDetails',
    ];
    for (const field of fields) {
      expect(validateProfileField(field, null, NOW)).toEqual({ valid: true, value: '' });
      expect(validateProfileField(field, undefined, NOW)).toEqual({ valid: true, value: '' });
      expect(validateProfileField(field, '   ', NOW)).toEqual({ valid: true, value: '' });
    }
  });

  it('trims a stored value, so an accidental paste of spaces is not persisted', () => {
    expect(validateProfileField('city', '  Minsk  ', NOW)).toEqual({ valid: true, value: 'Minsk' });
  });

  it('accepts a tax id in any script, because a УНП is as valid as an EIN', () => {
    expect(validateProfileField('taxId', '191234567', NOW)).toEqual({
      valid: true,
      value: '191234567',
    });
    expect(validateProfileField('taxId', 'BY 191-234-567', NOW).valid).toBe(true);
    expect(validateProfileField('taxId', 'УНП 191234567', NOW).valid).toBe(true);
  });

  it('rejects a tax id with punctuation the rule does not allow', () => {
    expect(validateProfileField('taxId', '191/234/567', NOW)).toEqual({
      valid: false,
      error: PROFILE_MESSAGES.taxId.invalidChars,
    });
    expect(validateProfileField('taxId', '<script>', NOW)).toEqual({
      valid: false,
      error: PROFILE_MESSAGES.taxId.invalidChars,
    });
  });

  it('reports an over-long tax id by length, not by characters', () => {
    // The more actionable of the two errors for a 400-character paste.
    expect(validateProfileField('taxId', '/'.repeat(41), NOW)).toEqual({
      valid: false,
      error: PROFILE_MESSAGES.taxId.tooLong,
    });
  });

  it('validates the country through the shared code rule', () => {
    expect(validateProfileField('country', 'by', NOW)).toEqual({ valid: true, value: 'BY' });
    expect(validateProfileField('country', 'ZZ', NOW)).toEqual({
      valid: false,
      error: PROFILE_MESSAGES.country.invalid,
    });
  });

  it('accepts a real date of birth at least sixteen years ago', () => {
    expect(validateProfileField('dateOfBirth', '1991-03-14', NOW)).toEqual({
      valid: true,
      value: '1991-03-14',
    });
  });

  it('rejects a malformed or impossible date', () => {
    for (const value of ['14-03-1991', '1991-3-14', '1991/03/14', 'yesterday', '1991-02-31', '1991-13-01']) {
      expect(validateProfileField('dateOfBirth', value, NOW)).toEqual({
        valid: false,
        error: PROFILE_MESSAGES.dateOfBirth.invalid,
      });
    }
  });

  it('rejects a date of birth in the future', () => {
    expect(validateProfileField('dateOfBirth', '2027-01-01', NOW)).toEqual({
      valid: false,
      error: PROFILE_MESSAGES.dateOfBirth.future,
    });
  });

  it('rejects a date of birth fewer than sixteen years ago', () => {
    expect(validateProfileField('dateOfBirth', '2021-01-01', NOW)).toEqual({
      valid: false,
      error: PROFILE_MESSAGES.dateOfBirth.tooRecent,
    });
    // The day before the sixteenth birthday.
    expect(validateProfileField('dateOfBirth', '2010-08-25', NOW)).toEqual({
      valid: false,
      error: PROFILE_MESSAGES.dateOfBirth.tooRecent,
    });
  });

  it('accepts the sixteenth birthday itself', () => {
    expect(validateProfileField('dateOfBirth', '2010-08-24', NOW).valid).toBe(true);
  });

  it('coerces a non-string body value rather than throwing at the API boundary', () => {
    expect(validateProfileField('postalCode', 220030, NOW)).toEqual({ valid: true, value: '220030' });
    expect(validateProfileField('city', { nested: true }, NOW)).toEqual({ valid: true, value: '' });
  });

  it('rejects a field name the profile does not have', () => {
    expect(validateProfileField('salary', '1000', NOW)).toEqual({
      valid: false,
      error: PROFILE_MESSAGES.generic.unknownField,
    });
  });

  it('defaults its clock to now, so a caller need not pass one', () => {
    expect(validateProfileField('dateOfBirth', '1991-03-14').valid).toBe(true);
    expect(validateProfileField('dateOfBirth', '2099-01-01')).toEqual({
      valid: false,
      error: PROFILE_MESSAGES.dateOfBirth.future,
    });
  });
});

/* ------------------------------------------------------------------ *
 * Messages — every row of the spec's Error Messages table
 * ------------------------------------------------------------------ */

describe('PROFILE_MESSAGES', () => {
  it('matches the spec table verbatim', () => {
    expect(PROFILE_MESSAGES.addressLine.tooLong).toBe('Address must be at most 200 characters');
    expect(PROFILE_MESSAGES.city.tooLong).toBe('City must be at most 100 characters');
    expect(PROFILE_MESSAGES.postalCode.tooLong).toBe('Postal code must be at most 20 characters');
    expect(PROFILE_MESSAGES.country.invalid).toBe('Enter a valid country');
    expect(PROFILE_MESSAGES.taxId.tooLong).toBe('Tax ID must be at most 40 characters');
    expect(PROFILE_MESSAGES.taxId.invalidChars).toBe('Tax ID contains invalid characters');
    expect(PROFILE_MESSAGES.dateOfBirth.invalid).toBe('Enter a valid date');
    expect(PROFILE_MESSAGES.dateOfBirth.future).toBe('Date of birth cannot be in the future');
    expect(PROFILE_MESSAGES.dateOfBirth.tooRecent).toBe(
      'Date of birth must be at least 16 years ago',
    );
    expect(PROFILE_MESSAGES.idDocumentNumber.tooLong).toBe(
      'ID document number must be at most 40 characters',
    );
    expect(PROFILE_MESSAGES.bankDetails.tooLong).toBe('Bank details must be at most 500 characters');
    expect(PROFILE_MESSAGES.source.unknown).toBe('Unknown autofill source');
    expect(PROFILE_MESSAGES.subject.missing).toBe('The selected member no longer exists');
    expect(PROFILE_MESSAGES.permission.view).toBe(
      'You do not have permission to view these details',
    );
    expect(PROFILE_MESSAGES.permission.edit).toBe(
      'You do not have permission to edit these details',
    );
    expect(PROFILE_MESSAGES.masked.hint).toBe('Some values are hidden. Ask an admin if you need them.');
    expect(PROFILE_MESSAGES.autofill.truncated).toBe(
      'This value was shortened to fit. Check it before sending.',
    );
    expect(PROFILE_MESSAGES.generic.networkError).toBe('Something went wrong. Please try again.');
    expect(PROFILE_MESSAGES.toast.saved).toBe('Contract details saved');
    expect(PROFILE_MESSAGES.generic.emptyState).toBe(
      'No contract details yet. Add them to fill contracts automatically.',
    );
  });

  it('assembles the parameterized rows in exactly one place', () => {
    expect(PROFILE_MESSAGES.source.incompatible('text')).toBe(
      'This source cannot fill a text field',
    );
    expect(PROFILE_MESSAGES.source.incompatible('date')).toBe(
      'This source cannot fill a date field',
    );
    expect(PROFILE_MESSAGES.autofill.gaps(2, 'bank details or ID document')).toBe(
      "2 field(s) could not be filled — this member's profile has no bank details or ID document",
    );
  });
});
