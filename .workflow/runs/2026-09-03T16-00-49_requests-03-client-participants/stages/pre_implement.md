# Pre-implement — requests/03 Client Participants & Client-Addressed Requests

Spec: `specs/requests/03-client-participants.md` (+ `.contracts.md`, `.cases.md`)
Base: `de9c5f916fa328734ed5f8f9c77023e8720e35e8`

42 numbered requirements (REQ-03-001…041 plus REQ-03-042), 42 cases (2 unit, 35 integration,
5 E2E), 17 acceptance criteria. Verdict: **pass** — the spec compiles into a plan. Three notes
below, none blocking.

---

## What already exists to build on

Every path below was opened, not inferred.

| What | Where |
|---|---|
| Session cookie, stamp re-read on every request | `apps/api/src/auth/session.guard.ts` |
| Org scope, 404 not 403, path `orgId` never a selector | `apps/api/src/auth/org-scope.guard.ts` |
| Capability → **404** (not the guard's 403) discipline | `apps/api/src/clients/clients.service.ts:360` (`requireManageCapability`), `:369` (`requireViewCapability`) |
| Membership-before-password refusal at sign-in | `apps/api/src/auth/login.service.ts:35-40` |
| Identity endpoint, today `null` for a non-staff account | `apps/api/src/members/me.controller.ts:27` |
| Invitation token: SHA-256 hash, 7-day expiry, accept screen | `apps/api/src/invitations/invitation-token.ts`, `apps/api/src/invitations/invitations.service.ts` |
| Supersession — one live pending invitation per (email, org) | `apps/api/src/invitations/invitations.service.ts:105` (`updateMany` inside the create transaction) |
| Port declared as an abstract class used as its own DI token | `apps/api/src/mail/mail.service.ts:152`, driver chosen in `apps/api/src/mail/mail.provider.ts`, registered global in `apps/api/src/core.module.ts` |
| `FOR UPDATE` re-read + guard evaluated against that read | `apps/api/src/requests/requests.service.ts:848` (`lockRequest`) |
| Append-only event writer, always takes the caller's `tx` | `apps/api/src/requests/request-events.service.ts` |
| Request wire shape, `assignee.kind` already a column read | `apps/api/src/requests/requests.serializer.ts` |
| Topic read → audience compare → assignee → project ordering | `apps/api/src/requests/requests.service.ts:317-400` |
| `normalizeRole` / `hasCapability` / `can` / `canReadRequest` | `packages/validation/src/roles.ts`, `packages/validation/src/index.ts:763` |
| Empty-catalogue picker + submit-not-drawn, per audience | `apps/web/app/org/[orgId]/requests/NewRequestModal.tsx:255-330` |
| `Select` option `label` is a `React.ReactNode` | `1_DS for dev/components/forms/Select.d.ts:3` |
| E2E helpers the cases need | `e2e/tests/helpers.ts` — `signupOrg`, `createBareAccount`, `latestInvitationToken`, `inviteAndAcceptViaApi`, `assignProjectMembersViaApi`, `createProjectViaApi`, `listRequestTopicsViaApi`, `archiveRequestTopicViaApi` |
| Provider double in an integration test | `apps/api/test/clients.spec.ts:136`, `apps/api/test/requests.spec.ts:270` (`overrideProvider`) |

## What must be built from zero

- `ClientMembership` — model, migration, service, and the three contacts routes.
- `RequestNotification` — the outbox table, its `@@unique([eventId, recipientKind, recipientId])`.
- `RequestNotifier` — the port, `NullRequestNotifier`, the post-commit dispatcher.
- `CLIENT_USER_MESSAGES` and the `ClientCapability` union + `CLIENT_CAPABILITIES` list in
  `packages/validation/src/index.ts`. Neither name exists in the tree today (grepped).
- Principal resolution: the second principal kind on the session, and the rule that decides
  which organization routes a client principal may reach at all.
- The `client` branches of sign-in, `/api/me` and invitation acceptance.
- Web: the contacts section on client detail, the addressee-kind control and contact picker in
  the new-request modal, and the client shell (sidebar gating + post-auth landing).

---

## Sweeps

### Premises — every claim the spec makes about this repository, checked at the file

| Claim | Verified at | Verdict |
|---|---|---|
| Migrations run before the services roll out; skipped on a web-only deploy | `infra/deploy.sh:175-185` (migrate, guarded on `api` being in `SERVICES`) then `:187-192` (`tf apply`) | true |
| `GET /api/me` answers `null` for an account with no staff membership | `apps/api/src/members/me.controller.ts:27` | true |
| The shell sends a `null` identity answer back to sign-in | `apps/web/app/org/[orgId]/layout.tsx:45-49` | true |
| `nav-members` is drawn unconditionally | `apps/web/src/layout/Sidebar.tsx:71-77` | true |
| Sign-in refuses an account with no active `Membership`, before the password compare | `apps/api/src/auth/login.service.ts:35-40` | true |
| `hasCapability` normalizes an absent role to `viewer`, and `viewer` holds `ViewOwnRequests` | `packages/validation/src/roles.ts` (`normalizeRole`, `ROLE_CAPABILITIES.viewer`) | true |
| `can` answers `false` for a role its matrix has no row for | `packages/validation/src/index.ts:763-765` | true |
| The legacy `member` value therefore holds neither `manage-clients` nor `view-clients` | same; `CAPABILITY_MATRIX` is keyed `admin\|manager\|user\|viewer` | true |
| `manager` holds `manage-clients` and `view-clients` (TC-03-INT-12 needs it) | `packages/validation/src/index.ts` manager row | true |
| The staff invitation's duplicate check reads staff rows only | `apps/api/src/invitations/invitations.service.ts:90-95` (`memberships` include) | true |
| `Invitation.role` is a free-form `String`; `clientId` is a new nullable column | `apps/api/prisma/schema.prisma:109-133` | true |
| `Request.assigneeMembershipId` is already nullable, `assigneeKind` a `String` | `apps/api/prisma/schema.prisma:1147-1151` | true |
| `MailService` is an abstract class used as its own token | `apps/api/src/mail/mail.service.ts:152` | true |
| Today's client-addressee refusal is `400 assigneeMembershipId: "Choose who this request is for"` | `packages/validation/src/requests.ts:219-231` (`REQUEST_ASSIGNEE_KINDS = ['member']`) | true — matches the probe transcript verbatim |
| The modal already replaces the picker with `pickerEmpty` and draws no submit | `NewRequestModal.tsx:255-266`, `:281-292` | true |
| `Select`'s option label may be a `ReactNode` (the DS-gaps "no gap" claim) | `1_DS for dev/components/forms/Select.d.ts:3` | true |
| `apps/api/test/clients.spec.ts` replaces a provider with `overrideProvider` | `apps/api/test/clients.spec.ts:136` | true |

No stale premise found.

### Contradiction sweep — the absolutes, against the call sites they forbid

- *"An account never holds an active `Membership` and an active `ClientMembership` at once"* — the
  writers are: client accept (REQ-03-014 refuses), staff invitation write and staff accept
  (REQ-03-042 refuses), and `POST /api/signup`. Signup cannot reach it: `Account.email` is
  `@unique` and `apps/api/src/signup/signup.service.ts:36` refuses an existing address, so a
  client contact cannot sign up a second organization under the same address. The cell the table
  marks unreachable has no third writer.
- *"A client principal is refused 404 on every organization route other than the ones REQ-03-019
  names"* — every controller mounted under `api/organizations/:orgId` already applies
  `OrgScopeGuard` (checked: `grep -L OrgScopeGuard` over all of them returns nothing), so there is
  one choke point and no route that escapes it. Listed in T3's `allCallSites`.
- *"The principal kind is asked before any role-keyed helper"* — the call sites that would violate
  it are enumerated in T3/T7's `allCallSites`. `RequestsService.requireCaller` (`:894`) currently
  throws `Forbidden` for an account with no membership, which is the one a client principal
  reaches first.
- REQ-03-013 (any client of the organization, whatever the status) vs the state-machine row
  `removed | invite` (an invitation is written): the row is the **same** client's removed row and
  the contracts file says so in the paragraph under the table. No conflict.
- REQ-03-011 (a contact invitation supersedes pending staff invitations) vs REQ-03-042 (a staff
  invitation for a client contact is refused at write): REQ-03-042 keys on an **active
  `ClientMembership`**, not on a pending invitation, so TC-03-INT-31's "invite as a contact, then
  as staff" sequence is writable and both rules hold.
- REQ-03-029 (`scope=all` → 200 for a client) vs the list route's `403 scopeForbidden`: the 403 is
  reached only after the principal kind is resolved as staff. No conflict.

No contradiction found.

### External claims

The spec's "Access this needs" table is a single row saying there is none, and the shipped
adapter makes no outbound call. There is no `Assumed` observation carrying a requirement, so no
`spec` finding is owed here. The doubles the cases register are of **our own port**, and
`doubleBehaviours` is planned from the port's own table of members and outcomes, not from prose.

### Call sites — the "every X" requirements

- REQ-03-019 ("every other organization route") → the 17 controllers under
  `api/organizations/:orgId`, listed in T3.
- REQ-03-035 ("every notifiable event") → `createRequest:317`, `postMessage:465`,
  `transition:534` (answer/grant/decline/cancel), `reassignRequest:756`. `patchRequest:625`
  writes `field_changed`, which REQ-03-035's list does not name, so it notifies nobody.
- REQ-03-017 ("when a right is checked") → API: `requests.service.ts:894`, `:130` (`can`),
  `:283` (`canReadRequest`); web: `Sidebar.tsx:180`, `requests/page.tsx:117-119`,
  `requests/[requestId]/page.tsx:47-49`, `requests-badge-context.tsx:41`.

### Writers and locks

- `Request.status` — the existing `SELECT … FOR UPDATE` re-read (`requests.service.ts:848`) is
  the lock, and state-machine invariant 3 extends it unchanged to a client actor.
- `Organization.nextRequestNumber` — the existing `FOR UPDATE` on the organization row.
- `ClientMembership` — writers are accept (create/restore) and remove. `accountId @unique` is the
  race backstop for two concurrent accepts; removal does the status write and the `securityStamp`
  rotation in one transaction (REQ-03-006), which is the whole of the concurrency the spec asks
  for. The repository takes no row lock on `Membership` today and this row is planned the same
  way.
- `RequestNotification` — no lock; `@@unique([eventId, recipientKind, recipientId])` is the
  mechanism REQ-03-039 names.

### Messages

Every row of the Error Messages table is placed in `handoff.messages`, with the module that
exports it and the route that emits it. Five are new (`CLIENT_USER_MESSAGES.*`), three are new
keys on the existing `REQUEST_MESSAGES` (`clientProjectRequired`, `clientProjectMismatch`,
`notOnProject`) — that const is extended in place, never duplicated. The remaining rows exist
verbatim already and were grepped (`packages/validation/src/index.ts:1818-1890`, `:2219-2226`,
`:217-232`, `:337-345`).

### Verification plan

Every state a case needs is reached through this spec's own routes or through a helper that
exists today; the "Exists today" column checks out against `e2e/tests/helpers.ts`. **This spec
owes no test fixture** and adds nothing under `apps/api/src/test-support/`. The three rows marked
`not run` are the ones this change creates.

---

## Things the implementer will hit that the spec does not spell out

These are planned, not raised as blockers — each is derivable from a rule the spec does state.

1. **How a screen knows the client principal is the addressee.** `request-detail/page.tsx:86`
   learns "who am I" from `GET …/members`, which answers a client principal 404 (REQ-03-019).
   The answer follows from REQ-03-034 and REQ-03-029: every request a client principal can read
   is one they are the addressee of, so `isAssignee` is true for any request that loads.
   No new endpoint field, and none is invented.
2. **Where sign-in lands.** `apps/web/app/login/LoginForm.tsx:92` and
   `apps/web/app/accept-invite/AcceptInviteScreen.tsx:322` both hardcode
   `/org/{orgId}/members`. TC-03-E2E-01 requires a contact to land on the requests screen. The
   contracts amend `/api/me` and do **not** amend the login body, so the branch reads
   `/api/me` — the pattern the accept screen already uses.
3. **The requests list's two side reads.** `requests/page.tsx:224` (projects) and `:251`
   (topics) will 404 for a client principal. Both already swallow a failure, so nothing breaks,
   but they are gated on the principal kind so no refused call is made at all.
4. **A decline writes two events.** `transition` records `message_posted` *and* `status_changed`
   in one transaction. REQ-03-035 is written per event ("in the same transaction as the
   `RequestEvent`") and REQ-03-039's uniqueness is per event, so the plan writes one row per
   recipient per notifiable event, and a decline therefore produces two. Note N1.

---

## Notes handed to the human (not blocking)

- **N1 — a decline notifies twice.** Reading REQ-03-035 per event (which is what its own words and
  REQ-03-039's uniqueness key say) means a decline, which writes two events, produces two outbox
  rows per recipient. No case asserts the count for a decline, so nothing catches it either way.
- **N2 — TC-03-INT-24 and TC-03-INT-26 together fix the dispatch shape.** TC-03-INT-26 requires
  the route to answer *before* the notifier double is released, so delivery cannot be awaited in
  the request path; TC-03-INT-24 asserts the rows have reached `skipped`/`attempts: 1` after the
  three calls. Both hold only if the case waits for the drain rather than reading immediately.
  Planned as: dispatch scheduled after commit, not awaited, with the test polling.
- **N3 — the client's post-auth landing is asserted but not required.** TC-03-E2E-01 observes it;
  no REQ states it. Planned from the case.

## Test levels

The 5 E2E cases each buy something an API test cannot reach: mail-to-accept-to-sign-in as a
journey (E2E-01), a control that must not be drawn and a URL typed by hand (E2E-02), a session
revoked mid-visit across two browser contexts (E2E-03), focus and the per-audience re-read in a
modal (E2E-04), the drawn/undrawn action controls (E2E-05). Every server rule — status code,
message, token state, authorization decision — sits at integration. Nothing is duplicated across
levels.
