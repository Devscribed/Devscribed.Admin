import { describe, expect, it } from 'vitest';
import {
  can,
  CLIENT_MESSAGES,
  namesEqual,
  normalizeClientName,
  parseClientStatusFilter,
  validateClientName,
} from './index';
import { hasCapability, normalizeRole } from './roles';

// Spec organization/01 capabilities — manage-clients & view-clients
// (admin/manager); user/viewer denied.
describe('spec organization/01 client capabilities', () => {
  it('admin and manager can manage clients', () => {
    expect(can('admin', 'manage-clients')).toBe(true);
    expect(can('manager', 'manage-clients')).toBe(true);
  });

  it('user and viewer cannot manage clients', () => {
    expect(can('user', 'manage-clients')).toBe(false);
    expect(can('viewer', 'manage-clients')).toBe(false);
  });

  it('admin and manager can view clients', () => {
    expect(can('admin', 'view-clients')).toBe(true);
    expect(can('manager', 'view-clients')).toBe(true);
  });

  it('user and viewer cannot view clients', () => {
    expect(can('user', 'view-clients')).toBe(false);
    expect(can('viewer', 'view-clients')).toBe(false);
  });

  // TC-01-UNIT-09: `normalizeRole('member')` maps to `user`, which lacks
  // `ManageClients` in the documents-style Capability matrix too.
  it('legacy member role has no ManageClients capability', () => {
    expect(normalizeRole('member')).toBe('user');
    expect(hasCapability('member', 'ManageClients')).toBe(false);
    expect(hasCapability('member', 'ViewClients')).toBe(false);
  });

  it('admin and manager have ManageClients in the documents-style Capability set', () => {
    expect(hasCapability('admin', 'ManageClients')).toBe(true);
    expect(hasCapability('manager', 'ManageClients')).toBe(true);
    expect(hasCapability('admin', 'ViewClients')).toBe(true);
    expect(hasCapability('manager', 'ViewClients')).toBe(true);
  });
});

// TC-01-UNIT-01..06 — validateClientName.
describe('validateClientName', () => {
  it('TC-01-UNIT-01: rejects an empty string as required', () => {
    expect(validateClientName('')).toEqual({
      valid: false,
      error: CLIENT_MESSAGES.nameRequired,
    });
  });

  it('TC-01-UNIT-02: rejects a whitespace-only string as required (trim first)', () => {
    expect(validateClientName('   ')).toEqual({
      valid: false,
      error: CLIENT_MESSAGES.nameRequired,
    });
  });

  it('TC-01-UNIT-03: rejects a 121-character name as too long', () => {
    expect(validateClientName('a'.repeat(121))).toEqual({
      valid: false,
      error: CLIENT_MESSAGES.nameTooLong,
    });
  });

  it('TC-01-UNIT-04: accepts an exactly-120-character name', () => {
    const name = 'a'.repeat(120);
    expect(validateClientName(name)).toEqual({ valid: true, value: name });
  });

  it('TC-01-UNIT-05: accepts the full allowed punctuation set', () => {
    expect(validateClientName("Smith & Sons, Ltd. (US)")).toEqual({
      valid: true,
      value: 'Smith & Sons, Ltd. (US)',
    });
    // Forward slash is in the allowed set too.
    expect(validateClientName('Alpha / Beta')).toEqual({
      valid: true,
      value: 'Alpha / Beta',
    });
  });

  it('TC-01-UNIT-06: rejects a disallowed character (angle brackets)', () => {
    expect(validateClientName('Acme <script>')).toEqual({
      valid: false,
      error: CLIENT_MESSAGES.nameInvalidChars,
    });
  });

  it('normalises before length check — a 121-char string that collapses to 120 is accepted', () => {
    // 120 chars + trailing space run collapses to 120 chars — should be valid.
    expect(validateClientName('a'.repeat(120) + '     ')).toEqual({
      valid: true,
      value: 'a'.repeat(120),
    });
  });

  it('measures length in Unicode codepoints, not UTF-16 code units', () => {
    // 🚀 is one codepoint (astral plane, 2 UTF-16 units). Rejects if valid chars
    // fail; emoji is not in the allowed class, so this rejects with invalidChars,
    // which proves codepoint iteration reached the pattern check with `.length`
    // counting 1 rather than 2.
    const one = '🚀';
    expect(validateClientName(one)).toEqual({
      valid: false,
      error: CLIENT_MESSAGES.nameInvalidChars,
    });
  });

  it('accepts Cyrillic and other non-Latin scripts (any Unicode letter)', () => {
    expect(validateClientName('ООО Ромашка')).toEqual({
      valid: true,
      value: 'ООО Ромашка',
    });
  });
});

// TC-01-UNIT-07 — normalizeClientName.
describe('normalizeClientName', () => {
  it('TC-01-UNIT-07: trims and collapses runs of whitespace to one space', () => {
    expect(normalizeClientName('  Acme   Corp  ')).toBe('Acme Corp');
  });

  it('collapses tabs and non-breaking-space-like whitespace runs too', () => {
    expect(normalizeClientName('Foo\t\t\nBar')).toBe('Foo Bar');
  });

  it('is idempotent on already-normal input', () => {
    expect(normalizeClientName('Alpha Bravo')).toBe('Alpha Bravo');
  });
});

// TC-01-UNIT-08 — namesEqual.
describe('namesEqual', () => {
  it('TC-01-UNIT-08: matches case-insensitively over the normalised value', () => {
    expect(namesEqual('Acme Corp', 'acme corp')).toBe(true);
    expect(namesEqual('  ACME  Corp  ', 'acme corp')).toBe(true);
  });

  it('does not match different names', () => {
    expect(namesEqual('Acme Corp', 'Beta Analytics')).toBe(false);
  });
});

// parseClientStatusFilter — mirrors parseProjectStatusFilter.
describe('parseClientStatusFilter', () => {
  it('accepts each valid filter unchanged', () => {
    expect(parseClientStatusFilter('active')).toBe('active');
    expect(parseClientStatusFilter('archived')).toBe('archived');
    expect(parseClientStatusFilter('all')).toBe('all');
  });

  it('defaults to `active` for undefined / empty / unknown', () => {
    expect(parseClientStatusFilter(undefined)).toBe('active');
    expect(parseClientStatusFilter('')).toBe('active');
    expect(parseClientStatusFilter('bogus')).toBe('active');
  });
});

// Message shape — spec is authoritative; guard against wording drift.
describe('CLIENT_MESSAGES wording', () => {
  it('archive-with-active-projects message includes the name and count', () => {
    const msg = CLIENT_MESSAGES.archiveConfirmActive('Acme Corp', 4);
    expect(msg).toContain('Acme Corp');
    expect(msg).toContain('4 active project(s)');
    expect(msg).toContain('until it is restored');
  });

  it('archive-with-no-active-projects message is the short one-line form', () => {
    expect(CLIENT_MESSAGES.archiveConfirmNoActive('Acme Corp')).toBe('Archive Acme Corp?');
  });

  it('empty-search message quotes the query', () => {
    expect(CLIENT_MESSAGES.emptySearch('ac')).toBe(
      'No clients match "ac". Try a shorter query.',
    );
  });
});
