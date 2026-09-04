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
  | 'ManageClients'
  // Spec organization/03 — holidays. Three capabilities, not two, because a manager
  // may add and correct the calendar while only an admin may remove a day from it:
  // a delete changes what every future Amounts Owed report pays out.
  | 'ViewHolidays'
  | 'ManageHolidays'
  | 'DeleteHolidays'
  // Spec user-management/16 — toggle billable on another member's entry. Duplicates
  // `edit-others-billable` in the lowercase-dashed `MemberCapability` union, kept in
  // both shapes so `RequireCapability` decorators and `can(role, ...)` call sites can
  // both name it, matching the pattern used by clients and holidays above.
  | 'EditOthersBillable'
  // Requests spec 01 — requests between members. Duplicates of `create-request` /
  // `view-own-requests` / `view-all-requests` in the lowercase-dashed
  // `MemberCapability` union for the same reason the client capabilities are
  // duplicated: this set is what `@RequireCapability` decorators consume, the other is
  // what `can(role, ...)` reads, and the spec requires both.
  | 'CreateRequest'
  | 'ViewOwnRequests'
  | 'ViewAllRequests'
  // Requests spec 02 — the request-topic catalogue. Duplicates
  // `manage-request-topics` in the lowercase-dashed `MemberCapability` union for the
  // same reason every capability above is duplicated: this set is what
  // `@RequireCapability` decorators name, the other is what `can(role, ...)` reads.
  // The refusal itself is raised in the topics service, because it must carry
  // `REQUEST_TOPIC_MESSAGES.manageForbidden` and `CapabilityGuard`'s message is fixed.
  | 'ManageRequestTopics'
  // Spec reports/01 — the nine reporting capabilities. Each report has a paired
  // (All, My) capability so the report screen can be gated per owner-scope, plus
  // two column-permission capabilities that shape the Time & Activity projection,
  // plus `ExportReports` which gates every PDF endpoint. Duplicated in
  // `MemberCapability` (lowercase-dashed) for the same reason as clients and
  // holidays above.
  | 'ViewAmountsOwed'
  | 'ViewMyAmountsOwed'
  | 'ViewTimeAndActivity'
  | 'ViewMyTimeAndActivity'
  | 'ViewTimeOff'
  | 'ViewMyTimeOff'
  | 'ViewTimeAndActivityBilled'
  | 'ViewTimeAndActivitySpent'
  | 'ExportReports';

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
    'ViewHolidays',
    'ManageHolidays',
    'DeleteHolidays',
    'EditOthersBillable',
    'CreateRequest',
    'ViewOwnRequests',
    'ViewAllRequests',
    'ManageRequestTopics',
    // Reports (spec reports/01). Admin sees everything, including the Spent column
    // (pay-rate × hours), which manager does not.
    'ViewAmountsOwed',
    'ViewMyAmountsOwed',
    'ViewTimeAndActivity',
    'ViewMyTimeAndActivity',
    'ViewTimeOff',
    'ViewMyTimeOff',
    'ViewTimeAndActivityBilled',
    'ViewTimeAndActivitySpent',
    'ExportReports',
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
    // Spec organization/03's matrix: a manager sees and edits the holiday calendar
    // but `DeleteHolidays` stops here — deleting is admin only.
    'ViewHolidays',
    'ManageHolidays',
    // Spec user-management/16's matrix: a manager may toggle billable on any
    // member's entry, same as an admin.
    'EditOthersBillable',
    // Requests spec 01's matrix gives a manager the same request rights as an admin
    // everywhere except the transitions, which are decided by identity rather than by
    // capability (see `canReadRequest` below).
    'CreateRequest',
    'ViewOwnRequests',
    'ViewAllRequests',
    // Requests spec 02's matrix gives a manager the same curating rights as an admin:
    // the catalogue is the vocabulary of the day-to-day work the role exists for.
    'ManageRequestTopics',
    // Spec reports/01's matrix: a manager sees every All-variant report and can
    // export PDFs, but is denied the Spent column — pay rate is admin-only.
    'ViewAmountsOwed',
    'ViewMyAmountsOwed',
    'ViewTimeAndActivity',
    'ViewMyTimeAndActivity',
    'ViewTimeOff',
    'ViewMyTimeOff',
    'ViewTimeAndActivityBilled',
    'ExportReports',
  ],
  // Requests spec 01 is the first spec to put anything in these two rows. A member
  // reading and editing *their own* contract details is still authorized below by
  // `canReadProfile` and friends rather than from this table — see the note above those
  // helpers for why "self" must never become a row here. Reports/01 adds the three "My"
  // variants plus `ExportReports`, so a regular user can see and PDF their own payable,
  // hours and time off.
  user: [
    'CreateRequest',
    'ViewOwnRequests',
    'ViewMyAmountsOwed',
    'ViewMyTimeAndActivity',
    'ViewMyTimeOff',
    'ExportReports',
  ],
  // Being asked something is not a privilege: a `viewer` sees the requests they raised
  // or that are addressed to them, and may not raise one. Reports/01 adds "My Time Off"
  // — the calendar that affects their own schedule — and no export.
  viewer: ['ViewOwnRequests', 'ViewMyTimeOff'],
};

/* ------------------------------------------------------------------ *
 * Requests spec 03 — the client contact, whose rights come from the principal kind and
 * from no role at all (REQ-03-016, REQ-03-017).
 *
 * A union of its own, and a flat list rather than a table: a value added to a staff
 * union is one every staff role must then be refused, for a right no role can hold. So
 * `Capability` gains nothing, `ROLE_CAPABILITIES` gains no row, `MemberCapability` gains
 * nothing and `CAPABILITY_MATRIX` gains no column.
 * ------------------------------------------------------------------ */

export type ClientCapability =
  | 'read-own-requests'
  | 'answer-request'
  | 'decline-request'
  | 'post-request-message';

/** Every right a client principal holds, and nothing else. */
export const CLIENT_CAPABILITIES: readonly ClientCapability[] = [
  'read-own-requests',
  'answer-request',
  'decline-request',
  'post-request-message',
];

/** Which kind of principal a session resolves to. Read from the database per request. */
export type PrincipalKind = 'member' | 'client';

/**
 * The caller, as an authorization question. `role` is the raw `Membership.role` column
 * for a member and is `null` for a client contact, who holds no role at all.
 */
export interface Principal {
  kind: PrincipalKind;
  role: string | null;
}

/**
 * REQ-03-017 — the principal kind is asked FIRST, and a client principal never reaches a
 * role-keyed helper.
 *
 * That ordering is the whole rule. `normalizeRole` maps an unrecognised value — `null`
 * included — to `viewer`, so `hasCapability` would answer a client principal with the
 * viewer set, which holds `ViewOwnRequests`: a grant, not a refusal. This function is
 * where the two questions are kept apart, so no call site has to remember to ask them in
 * the right order.
 */
export function capabilitiesForPrincipal(
  principal: Principal,
): readonly Capability[] | readonly ClientCapability[] {
  if (principal.kind === 'client') return CLIENT_CAPABILITIES;
  return ROLE_CAPABILITIES[normalizeRole(principal.role)];
}

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

/* ------------------------------------------------------------------ *
 * Requests spec 01 — "party to a request", where role is again only half the answer
 *
 * The same composition `canReadProfile` uses, for the same reason: "may this role see
 * every request in the organization" is a property of the role, while "am I the person
 * who asked, or the person being asked" is a property of the request. A fifth role
 * called `party` would be a value `Membership.role` can never hold.
 * ------------------------------------------------------------------ */

/**
 * Requests spec 01, "Party to a request": the requester, the addressee, or a holder of
 * `ViewAllRequests`. `isParty` is the identity half and is computed by the caller from
 * the request row; a caller who is neither is answered 404, never 403, so request
 * existence is not enumerable.
 */
export function canReadRequest(role: string | null | undefined, isParty: boolean): boolean {
  return isParty || hasCapability(role, 'ViewAllRequests');
}
