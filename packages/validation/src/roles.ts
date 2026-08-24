/**
 * Role normalization and capability lookup — the first role-based authorization in the
 * codebase, shared by the Next.js app and the NestJS API.
 *
 * Why this exists at all: `Membership.role` is a free-form string holding `admin` /
 * `member` today, while specs/user-management declares the target enum
 * `admin | manager | user | viewer`. The documents area must not silently pick a side, so
 * every capability check runs against `normalizeRole()` instead of against the raw column.
 * Permissions therefore work on today's data and survive the enum migration untouched
 * (see "Role enum debt" in specs/documents/README.md).
 */

export type NormalizedRole = 'admin' | 'manager' | 'user' | 'viewer';

/**
 * The closed set of roles capability checks are allowed to see. Anything the database
 * hands us is funnelled through here first, so a typo, a NULL, or a role added by a
 * future migration can never accidentally widen access.
 */
export const NORMALIZED_ROLES: readonly NormalizedRole[] = ['admin', 'manager', 'user', 'viewer'];

/**
 * Explicit legacy mappings. `member` is the only value the current schema produces
 * besides `admin`, and the spec pins it to `user` — the least-privileged role that still
 * has an application surface.
 */
const LEGACY_ALIASES: Record<string, NormalizedRole> = {
  member: 'user',
};

/**
 * Maps the legacy free-form `Membership.role` and the target enum onto one closed set.
 *
 * Unknown values normalize to `viewer` rather than throwing: an authorization helper that
 * throws turns a data anomaly into a 500, whereas least privilege turns it into a clean
 * 403 that is both safe and debuggable.
 */
export function normalizeRole(role: string | null | undefined): NormalizedRole {
  const value = (role ?? '').trim().toLowerCase();
  if ((NORMALIZED_ROLES as readonly string[]).includes(value)) {
    return value as NormalizedRole;
  }
  return LEGACY_ALIASES[value] ?? 'viewer';
}

/**
 * Capabilities, not roles, are what call sites check. Specs 02 and 03 extend this union;
 * because ROLE_CAPABILITIES is keyed by role and typed against the union, adding a member
 * here forces every role's list to be revisited at compile time.
 */
export type Capability =
  // Spec 01 — document templates.
  | 'ViewDocumentTemplates'
  | 'ManageDocumentTemplates'
  // Spec 02 — envelopes and signing.
  | 'ViewEnvelopes'
  | 'ManageEnvelopes'
  | 'VoidEnvelope'
  | 'DownloadSignedDocument'
  | 'ViewEnvelopeAudit';

/**
 * Permission matrix from spec 01 and spec 02, "Roles & Permission Matrix".
 *
 * Spec 02 gives `manager` the full envelope set, unlike templates where a manager may
 * only look: authoring a template is a change to the org's legal boilerplate, whereas
 * sending, voiding, and auditing one contract is the day-to-day work the role exists for.
 *
 * Signing itself appears nowhere here on purpose. A signer is authorized solely by their
 * token (spec 02, "Roles & Permission Matrix"), and a signer who happens to be a member
 * gets no extra rights from their session — so routing that check through a role-keyed
 * table would be the exact mistake the note in the spec warns against.
 */
export const ROLE_CAPABILITIES: Record<NormalizedRole, readonly Capability[]> = {
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
};

/** Accepts the raw role string so call sites cannot forget to normalize first. */
export function hasCapability(role: string | null | undefined, capability: Capability): boolean {
  return ROLE_CAPABILITIES[normalizeRole(role)].includes(capability);
}

/** Convenience for UI gating, which usually needs the whole set rather than one probe. */
export function capabilitiesFor(role: string | null | undefined): readonly Capability[] {
  return ROLE_CAPABILITIES[normalizeRole(role)];
}
