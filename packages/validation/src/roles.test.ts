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
      admin: [
        'ViewDocumentTemplates',
        'ManageDocumentTemplates',
        'ViewEnvelopes',
        'ManageEnvelopes',
        'VoidEnvelope',
        'DownloadSignedDocument',
        'ViewEnvelopeAudit',
      ],
      manager: [
        'ViewDocumentTemplates',
        'ViewEnvelopes',
        'ManageEnvelopes',
        'VoidEnvelope',
        'DownloadSignedDocument',
        'ViewEnvelopeAudit',
      ],
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
    expect(capabilitiesFor('admin')).toEqual([
      'ViewDocumentTemplates',
      'ManageDocumentTemplates',
      'ViewEnvelopes',
      'ManageEnvelopes',
      'VoidEnvelope',
      'DownloadSignedDocument',
      'ViewEnvelopeAudit',
    ]);
    expect(capabilitiesFor('manager')).toEqual([
      'ViewDocumentTemplates',
      'ViewEnvelopes',
      'ManageEnvelopes',
      'VoidEnvelope',
      'DownloadSignedDocument',
      'ViewEnvelopeAudit',
    ]);
    expect(capabilitiesFor('member')).toEqual([]);
    expect(capabilitiesFor(null)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * TC-02-UNIT-06: Capability map
 *
 * The five envelope capabilities across every role the column can produce —
 * the target enum, the legacy `member`, an unknown string, and NULL.
 * ------------------------------------------------------------------ */

describe('TC-02-UNIT-06: Capability map', () => {
  const ENVELOPE_CAPABILITIES: readonly Capability[] = [
    'ViewEnvelopes',
    'ManageEnvelopes',
    'VoidEnvelope',
    'DownloadSignedDocument',
    'ViewEnvelopeAudit',
  ];

  // Spec 02, "Roles & Permission Matrix": admin and manager get all five; user and
  // viewer get none. A signer never appears here — a token authorizes signing, not a role.
  const GRANTED: Array<[string | null | undefined, boolean]> = [
    ['admin', true],
    ['manager', true],
    ['user', false],
    ['viewer', false],
    // The legacy value the schema stores today must resolve exactly like `user`.
    ['member', false],
    ['owner', false],
    ['', false],
    [null, false],
    [undefined, false],
  ];

  for (const [role, granted] of GRANTED) {
    for (const capability of ENVELOPE_CAPABILITIES) {
      it(`${JSON.stringify(role)} ${granted ? 'has' : 'lacks'} ${capability}`, () => {
        expect(hasCapability(role, capability)).toBe(granted);
      });
    }
  }

  it('resolves `member` identically to `user`', () => {
    expect(capabilitiesFor('member')).toEqual(capabilitiesFor('user'));
  });

  it('grants an unknown role nothing, because normalization lands on viewer', () => {
    expect(capabilitiesFor('superadmin')).toEqual([]);
  });

  it('leaves the spec 01 capabilities exactly as they were', () => {
    expect(hasCapability('manager', 'ManageDocumentTemplates')).toBe(false);
    expect(hasCapability('manager', 'ViewDocumentTemplates')).toBe(true);
    expect(hasCapability('user', 'ViewDocumentTemplates')).toBe(false);
  });
});
