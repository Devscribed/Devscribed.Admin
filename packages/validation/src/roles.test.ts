import { describe, expect, it } from 'vitest';
import {
  ROLE_CAPABILITIES,
  capabilitiesFor,
  hasCapability,
  normalizeRole,
  type Capability,
  type NormalizedRole,
} from './roles';

describe('normalizeRole', () => {
  const cases: Array<[string | null | undefined, NormalizedRole]> = [
    ['admin', 'admin'],
    ['manager', 'manager'],
    ['user', 'user'],
    ['viewer', 'viewer'],
    // The legacy free-form value the schema actually stores today.
    ['member', 'user'],
    // Unknown, absent, and malformed all fall to least privilege rather than throwing.
    ['owner', 'viewer'],
    ['', 'viewer'],
    [null, 'viewer'],
    [undefined, 'viewer'],
  ];

  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} → ${expected}`, () => {
      expect(normalizeRole(input)).toBe(expected);
    });
  }

  it('tolerates casing and surrounding whitespace from the free-form column', () => {
    expect(normalizeRole('  ADMIN ')).toBe('admin');
    expect(normalizeRole('Member')).toBe('user');
  });
});

describe('ROLE_CAPABILITIES matrix', () => {
  it('matches the spec table exactly', () => {
    expect(ROLE_CAPABILITIES).toEqual({
      admin: ['ViewDocumentTemplates', 'ManageDocumentTemplates'],
      manager: ['ViewDocumentTemplates'],
      user: [],
      viewer: [],
    });
  });
});

describe('hasCapability', () => {
  const matrix: Array<[string | null | undefined, Capability, boolean]> = [
    ['admin', 'ViewDocumentTemplates', true],
    ['admin', 'ManageDocumentTemplates', true],
    ['manager', 'ViewDocumentTemplates', true],
    ['manager', 'ManageDocumentTemplates', false],
    ['user', 'ViewDocumentTemplates', false],
    ['user', 'ManageDocumentTemplates', false],
    ['viewer', 'ViewDocumentTemplates', false],
    ['viewer', 'ManageDocumentTemplates', false],
    // A legacy `member` must behave exactly like `user` (TC-01-INT-11).
    ['member', 'ViewDocumentTemplates', false],
    ['member', 'ManageDocumentTemplates', false],
    ['nonsense', 'ViewDocumentTemplates', false],
    [null, 'ViewDocumentTemplates', false],
    [undefined, 'ManageDocumentTemplates', false],
  ];

  for (const [role, capability, expected] of matrix) {
    it(`${JSON.stringify(role)} ${expected ? 'has' : 'lacks'} ${capability}`, () => {
      expect(hasCapability(role, capability)).toBe(expected);
    });
  }
});

describe('capabilitiesFor', () => {
  it('returns the full set for a role, so UI gating needs one call', () => {
    expect(capabilitiesFor('admin')).toEqual(['ViewDocumentTemplates', 'ManageDocumentTemplates']);
    expect(capabilitiesFor('manager')).toEqual(['ViewDocumentTemplates']);
    expect(capabilitiesFor('member')).toEqual([]);
    expect(capabilitiesFor(null)).toEqual([]);
  });
});
