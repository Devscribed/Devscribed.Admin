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
  | 'ViewEnvelopeAudit'
  // Spec 03 — field autofill and the member profile behind it.
  | 'ViewMemberProfile'
  | 'ViewMemberProfilePii'
  | 'EditMemberProfile'
  // Spec 04 — signature providers. `ManageSigningSettings` is admin only while
  // `ManageEnvelopes` is admin and manager: choosing the provider changes where every
  // future contract of the organization is executed and who holds the evidence, which
  // is a different order of decision from sending one document.
  | 'ViewSigningSettings'
  | 'ManageSigningSettings'
  // Spec organization/01 — clients. Duplicates of `manage-clients` / `view-clients` in
  // the lowercase-dashed `MemberCapability` union: this Capability set is what
  // `RequireCapability` decorators consume, the other is what `can(role, ...)` reads,
  // and spec organization/01 requires both because reviewers grep for either shape.
  | 'ViewClients'
  | 'ManageClients';

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
    'ViewMemberProfile',
    'ViewMemberProfilePii',
    'EditMemberProfile',
    'ViewSigningSettings',
    'ManageSigningSettings',
    'ViewClients',
    'ManageClients',
  ],
  manager: [
    'ViewDocumentTemplates',
    'ViewEnvelopes',
    'ManageEnvelopes',
    'VoidEnvelope',
    'DownloadSignedDocument',
    'ViewEnvelopeAudit',
    // Spec 03's matrix gives a manager the masked view and nothing more: they must be
    // able to create a contract for a member without being able to read that member's
    // passport number, so `ViewMemberProfilePii` and `EditMemberProfile` stop here.
    'ViewMemberProfile',
    // Spec 04's matrix: a manager sees which provider the organization signs with and
    // cannot change it. The screen renders read-only and the save button is not drawn.
    'ViewSigningSettings',
    // Spec organization/01: a manager has the same client-management rights as an
    // admin (identical row in the Roles & Permission Matrix table).
    'ViewClients',
    'ManageClients',
  ],
  // `user` looks empty, but a member reading and editing *their own* contract details is
  // authorized below by `canReadProfile` and friends, not from this table. See the note
  // above those helpers for why "self" must never become a row here.
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

/* ------------------------------------------------------------------ *
 * Spec 03 — member profile access, where role is only half the answer
 *
 * The spec's matrix has a column headed "user (own)" that grants a plain `user` all three
 * profile capabilities. It is tempting to encode that as a fifth role called `self`, and
 * that would be a mistake: `self` is not something `Membership.role` can ever contain, so
 * a `self` row would be a value `normalizeRole()` can never produce and every call site
 * would have to *decide* to pass it — which is exactly the decision that must not be
 * hidden inside a lookup table.
 *
 * The two questions are genuinely different. `ROLE_CAPABILITIES` answers "what may this
 * role do", a property of the role alone. "Is this my own record" is a property of the
 * request — the caller's membership id compared with the one in the URL — and only the
 * API (or the UI, which knows which member it is rendering) can answer it. Smuggling the
 * second into the first would mean a table whose truth depends on unstated context, and
 * an `ROLE_CAPABILITIES.user` that reads as "may read anyone's tax id".
 *
 * So the composition happens here, in the open: capability OR identity. Both surfaces
 * call the same three helpers, so the rule cannot drift between the button the UI hides
 * and the 403 the API returns.
 *
 * `isSelf` wins for every role, including `viewer`. The matrix spells the "own" column
 * out only for `user` because that is the interesting case, but the principle behind it
 * is about whose record it is, not about which role happens to be looking: nobody's own
 * date of birth is a secret from them.
 * ------------------------------------------------------------------ */

/** Requirement 19 / the matrix row `ViewMemberProfile`: admin, manager, or the member. */
export function canReadProfile(role: string | null | undefined, isSelf: boolean): boolean {
  return isSelf || hasCapability(role, 'ViewMemberProfile');
}

/**
 * Requirement 19: every read of a sensitive value is authorized by
 * `ViewMemberProfilePii`. A member always sees their own tax id and date of birth in
 * full — masking someone's data from themselves protects nobody.
 */
export function canReadProfilePii(role: string | null | undefined, isSelf: boolean): boolean {
  return isSelf || hasCapability(role, 'ViewMemberProfilePii');
}

/** The matrix row `EditMemberProfile`: admin, or the member editing their own details. */
export function canEditProfile(role: string | null | undefined, isSelf: boolean): boolean {
  return isSelf || hasCapability(role, 'EditMemberProfile');
}
