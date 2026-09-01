import { describe, expect, it } from 'vitest';
import {
  ROLE_CAPABILITIES,
  canEditProfile,
  canReadProfile,
  canReadProfilePii,
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
        'ViewMemberProfile',
        'ViewMemberProfilePii',
        'EditMemberProfile',
        // Spec 04: choosing the provider is admin only.
        'ViewSigningSettings',
        'ManageSigningSettings',
        // Spec organization/01: full client-management rights.
        'ViewClients',
        'ManageClients',
        // Spec organization/03: the whole holiday calendar, deletion included.
        'ViewHolidays',
        'ManageHolidays',
        'DeleteHolidays',
      ],
      manager: [
        'ViewDocumentTemplates',
        'ViewEnvelopes',
        'ManageEnvelopes',
        'VoidEnvelope',
        'DownloadSignedDocument',
        'ViewEnvelopeAudit',
        // Spec 03: the masked view and nothing more.
        'ViewMemberProfile',
        // Spec 04: a manager sees the setting and cannot change it.
        'ViewSigningSettings',
        // Spec organization/01: identical client-management rights to admin.
        'ViewClients',
        'ManageClients',
        // Spec organization/03: view and edit the calendar, but not delete.
        'ViewHolidays',
        'ManageHolidays',
      ],
      // Spec 03's "user (own)" column is not a row here — see `canReadProfile` below.
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
      'ViewMemberProfile',
      'ViewMemberProfilePii',
      'EditMemberProfile',
      'ViewSigningSettings',
      'ManageSigningSettings',
      'ViewClients',
      'ManageClients',
      'ViewHolidays',
      'ManageHolidays',
      'DeleteHolidays',
    ]);
    expect(capabilitiesFor('manager')).toEqual([
      'ViewDocumentTemplates',
      'ViewEnvelopes',
      'ManageEnvelopes',
      'VoidEnvelope',
      'DownloadSignedDocument',
      'ViewEnvelopeAudit',
      'ViewMemberProfile',
      'ViewSigningSettings',
      'ViewClients',
      'ManageClients',
      'ViewHolidays',
      'ManageHolidays',
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

/* ------------------------------------------------------------------ *
 * Spec 03 — member profile capabilities and the self helpers
 *
 * The spec's matrix has five columns: admin, manager, user (own), user (other), viewer.
 * Only four of them are role columns. The "own" column is the identity question, which
 * `canReadProfile` and friends answer by composing the table with `isSelf` — so every case
 * below is exercised with `isSelf` both true and false.
 * ------------------------------------------------------------------ */

describe('spec 03 profile capabilities', () => {
  const PROFILE_CAPABILITIES: readonly Capability[] = [
    'ViewMemberProfile',
    'ViewMemberProfilePii',
    'EditMemberProfile',
  ];

  // From the matrix: admin gets all three, manager gets the masked view only, and both
  // `user` and `viewer` get nothing at all from the role table.
  const GRANTED: Record<string, readonly Capability[]> = {
    admin: PROFILE_CAPABILITIES,
    manager: ['ViewMemberProfile'],
    user: [],
    viewer: [],
    // The legacy value the column stores today must behave exactly like `user`.
    member: [],
    superadmin: [],
  };

  for (const [role, granted] of Object.entries(GRANTED)) {
    for (const capability of PROFILE_CAPABILITIES) {
      const expected = granted.includes(capability);
      it(`${role} ${expected ? 'has' : 'lacks'} ${capability}`, () => {
        expect(hasCapability(role, capability)).toBe(expected);
      });
    }
  }

  for (const capability of PROFILE_CAPABILITIES) {
    it(`null and undefined lack ${capability}`, () => {
      expect(hasCapability(null, capability)).toBe(false);
      expect(hasCapability(undefined, capability)).toBe(false);
    });
  }

  it('does not disturb the spec 01 and 02 capabilities', () => {
    expect(hasCapability('manager', 'ManageDocumentTemplates')).toBe(false);
    expect(hasCapability('manager', 'ManageEnvelopes')).toBe(true);
    expect(hasCapability('user', 'ViewEnvelopes')).toBe(false);
  });

  it('never invents a `self` role — the table only holds values the column can hold', () => {
    expect(Object.keys(ROLE_CAPABILITIES)).toEqual(['admin', 'manager', 'user', 'viewer']);
    expect(normalizeRole('self')).toBe('viewer');
    expect(capabilitiesFor('self')).toEqual([]);
  });
});

describe('canReadProfile / canReadProfilePii / canEditProfile', () => {
  type Row = [string | null | undefined, boolean, boolean, boolean];

  // role, canRead, canReadPii, canEdit — with isSelf false, i.e. looking at someone else.
  const OTHERS: Row[] = [
    ['admin', true, true, true],
    ['manager', true, false, false],
    ['user', false, false, false],
    ['viewer', false, false, false],
    ['member', false, false, false],
    ['superadmin', false, false, false],
    ['', false, false, false],
    [null, false, false, false],
    [undefined, false, false, false],
  ];

  for (const [role, read, pii, edit] of OTHERS) {
    it(`${JSON.stringify(role)} viewing another member: read=${read} pii=${pii} edit=${edit}`, () => {
      expect(canReadProfile(role, false)).toBe(read);
      expect(canReadProfilePii(role, false)).toBe(pii);
      expect(canEditProfile(role, false)).toBe(edit);
    });
  }

  // Every role reading its own record. The matrix spells this out for `user`; the same
  // principle covers the rest, because nobody's own date of birth is a secret from them.
  for (const [role] of OTHERS) {
    it(`${JSON.stringify(role)} viewing their own record has full access`, () => {
      expect(canReadProfile(role, true)).toBe(true);
      expect(canReadProfilePii(role, true)).toBe(true);
      expect(canEditProfile(role, true)).toBe(true);
    });
  }

  it('gives a plain user their own contract details and nobody else\'s (TC-03-E2E-06/07)', () => {
    expect(canReadProfile('user', true)).toBe(true);
    expect(canEditProfile('user', true)).toBe(true);
    expect(canReadProfile('user', false)).toBe(false);
    expect(canEditProfile('user', false)).toBe(false);
  });

  it('lets a manager create a contract for a member whose passport number they cannot read', () => {
    // TC-03-INT-06 / TC-03-E2E-05: masked read, no edit, but envelopes stay available.
    expect(canReadProfile('manager', false)).toBe(true);
    expect(canReadProfilePii('manager', false)).toBe(false);
    expect(canEditProfile('manager', false)).toBe(false);
    expect(hasCapability('manager', 'ManageEnvelopes')).toBe(true);
  });

  it('composes the table with identity rather than hiding identity inside the table', () => {
    // The helper must be exactly capability-OR-self: same answer as the two parts.
    for (const role of ['admin', 'manager', 'user', 'viewer']) {
      expect(canReadProfile(role, false)).toBe(hasCapability(role, 'ViewMemberProfile'));
      expect(canReadProfilePii(role, false)).toBe(hasCapability(role, 'ViewMemberProfilePii'));
      expect(canEditProfile(role, false)).toBe(hasCapability(role, 'EditMemberProfile'));
    }
  });
});

/* ------------------------------------------------------------------ *
 * Spec 04 — the two signing-settings capabilities
 *
 * The whole point of the split: `ManageSigningSettings` is admin only while
 * `ManageEnvelopes` is admin and manager, because choosing the provider changes where
 * every future contract of the organization is executed and who holds the evidence.
 * ------------------------------------------------------------------ */

describe('spec 04 signing-settings capabilities', () => {
  const GRANTED: Record<string, readonly Capability[]> = {
    admin: ['ViewSigningSettings', 'ManageSigningSettings'],
    manager: ['ViewSigningSettings'],
    user: [],
    viewer: [],
    // The legacy column value must behave exactly like `user`.
    member: [],
    nonsense: [],
  };

  for (const [role, granted] of Object.entries(GRANTED)) {
    for (const capability of ['ViewSigningSettings', 'ManageSigningSettings'] as const) {
      const expected = granted.includes(capability);
      it(`${role} ${expected ? 'has' : 'lacks'} ${capability}`, () => {
        expect(hasCapability(role, capability)).toBe(expected);
      });
    }
  }

  it('never lets a manager change the provider while letting them send documents', () => {
    expect(hasCapability('manager', 'ManageEnvelopes')).toBe(true);
    expect(hasCapability('manager', 'ManageSigningSettings')).toBe(false);
  });
});
