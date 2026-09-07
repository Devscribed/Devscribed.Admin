# implement — attempt 2

Spec: `specs/requests/03-client-participants.md` (+ `.contracts.md`, `.cases.md`)
Commit: `771451a implement: client participants and client-addressed requests (requests/03)`

Attempt 1 was interrupted mid-run; no commit was made then, so this attempt carries the
whole handoff in one commit. There are no findings from a prior stage to answer.

## Tasks

### T1 — schema and the one migration
- `apps/api/prisma/schema.prisma` — `ClientMembership` and `RequestNotification`; the four
  nullable columns (`Invitation.clientId`, `Request.assigneeClientMembershipId`,
  `RequestMessage.authorClientMembershipId`, `RequestEvent.actorClientMembershipId`) and
  their back-relations.
- `apps/api/prisma/migrations/20260903130000_requests_03_client_participants/migration.sql`
  — the only migration this run creates. Two new tables, four nullable columns, no rename,
  no drop, no new NOT NULL, no backfill. `RequestNotification.recipientId` carries no FK,
  so a row survives the principal it points at being removed.

### T2 — packages/validation
- `src/index.ts` — `CLIENT_USER_MESSAGES` (new export, five keys, text verbatim from the
  Error Messages table); three new keys **on the existing** `REQUEST_MESSAGES`
  (`clientProjectRequired`, `clientProjectMismatch`, `notOnProject`);
  `validateClientContactEmail` (rule 1); `CLIENT_INVITATION_ROLE`, `INVITATION_ROLE_VALUES`
  and `isClientInvitationRole` — `isValidRole` and `ROLE_VALUES` are untouched, so `client`
  can never be assigned through the staff invite body.
- `src/roles.ts` — `ClientCapability`, the flat `CLIENT_CAPABILITIES`, `Principal` and
  `capabilitiesForPrincipal`. `Capability`, `ROLE_CAPABILITIES`, `MemberCapability` and
  `CAPABILITY_MATRIX` gain nothing.
- `src/requests.ts` — `REQUEST_ASSIGNEE_KINDS` widened to `['member','client']`;
  `validateRequestAssignee` branches per kind and reports under the id that kind selects
  (`requestAssigneeFieldFor`); `validateNewRequest` adds rule 8 (a client addressee names a
  project) alongside the body shape.

### T3 — the principal
- `src/auth/principal.ts` (new) — `SessionPrincipal` and `resolvePrincipal`, REQ-03-002's
  table: the staff row wins, an active client row alone resolves the client principal.
- `src/auth/session.guard.ts` — the memberships ride the security-stamp read that already
  happens; the principal is put on the request. No cookie field changed.
- `src/auth/allow-client-principal.decorator.ts` (new) + `src/auth/org-scope.guard.ts` —
  REQ-03-019 at the one choke point, opt-in so a route added later is refused by default.
- `src/auth/login.service.ts` — the principal decision is made **before** the password
  compare, exactly where the membership check already was.
- `src/members/me.controller.ts` — one shape for both principals; the branch is taken on
  the resolved principal, not on which rows exist.
- `src/requests/requests.controller.ts` — `@AllowClientPrincipal()` on exactly seven
  handlers: list, detail, answer, decline, messages, create and grant.

### T4 — client contacts and the two-ended principal conflict
- `src/clients/client-contacts.controller.ts`, `client-contacts.service.ts` (new) — the
  three routes; `manage-clients` / `view-clients` decided in the service through
  `ClientsService`'s own gates (made public, one edit to `clients.service.ts`), so a caller
  lacking either gets the same bare 404 the client's detail route gives them. Invite writes
  the `Invitation` with the client's id and role `client`, superseding every other pending
  invitation for that address in the same transaction. Removal writes the status and
  rotates `Account.securityStamp` in one transaction.
- `src/invitations/invitations.service.ts` — `requireNoConflictingPrincipal` (REQ-03-014 and
  REQ-03-042, one rule at both ends), the `client` accept branch (create or restore the same
  row, no `Membership`), `redirectTo` per principal, and the staff invitation's own refusal
  at write time.
- `src/invitations/invitations.controller.ts` — the destination comes from the service.

### T5 — client-addressed requests
- `src/requests/requests.service.ts` — `ClientCaller` beside `Caller`; `requireCaller`
  resolves either; `requireMemberCaller` for the routes REQ-03-019 does not open. Create
  refuses a client principal first (REQ-03-027), then keeps the existing order: body,
  topic, audience (all four cells), addressee (404 before inactive), project last
  (mismatch, then not-on-project, no admin carve-out). `lockRequest` re-reads
  `assigneeClientMembershipId` under `FOR UPDATE` and every actor guard is evaluated
  against that read. List, party, answer, decline, message and grant per the spec.
- `requests.serializer.ts` / `requests.dto.ts` — `toRequestAssignee` answers both kinds;
  `clientName` added, the contact's email never carried.

### T6 — the notification port
- `request-notifier.ts`, `null-request-notifier.ts`, `request-notifier.provider.ts`,
  `request-notifications.service.ts` (new); registered in `core.module.ts` / `app.module.ts`
  the way `MailService` is. `record` writes in the caller's transaction; `dispatch` runs
  after the commit and is not awaited; `field_changed` notifies nobody; the actor is never
  a recipient; a reassignment notifies the incoming addressee.
- `request-events.service.ts` returns the event id so the outbox rows can carry it.

### T7/T8/T9 — the web half
- `session-context.tsx` (`principal`, `client`, nullable `role`), `layout.tsx`,
  `Sidebar.tsx` (requests is the only entry for a contact), `requests-badge-context.tsx`,
  `LoginForm.tsx` and `AcceptInviteScreen.tsx` (both branch on `/api/me`; the login
  response body is unchanged), the requests list and detail screens.
- `ClientContactsSection.tsx` + `InviteContactModal.tsx` (new) on client detail.
- `NewRequestModal.tsx` — `request-new-assignee-kind` (a labelled `Select`),
  `request-new-assignee-client` (a `Select` whose option label is a `ReactNode`), the
  per-audience catalogue and the project narrowing.

### T10 — the cases
| Level | File |
|---|---|
| Unit | `packages/validation/src/roles.test.ts` — TC-03-UNIT-01, TC-03-UNIT-02 |
| Unit | `packages/validation/src/requests.test.ts` — the client addressee (rules 5, 8, 13) |
| Integration | `apps/api/test/client-participants.spec.ts` — TC-03-INT-01…23, 31…35 |
| Integration | `apps/api/test/request-notifications.spec.ts` — TC-03-INT-24…30 |
| E2E | `e2e/tests/client-participants.spec.ts` — TC-03-E2E-01…05 |

## Commands run

| Command | Result |
|---|---|
| `npm run test:unit` (root) | `Test Files 23 passed (23)`, `Tests 1098 passed (1098)` |
| `npx tsc --noEmit` in `apps/api` | clean |
| `npx tsc --noEmit` in `apps/web` | clean |
| `npm test -- test/client-participants.spec.ts test/request-notifications.spec.ts test/requests.spec.ts` (apps/api) | `Tests: 58 passed, 58 total` |
| `npm test -- …16 suites the diff touches…` (apps/api) | `Test Suites: 16 passed`, `Tests: 1 skipped, 206 passed, 207 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/client-participants.spec.ts` | `5 passed (33.8s)` |
| `… tests/regressions.spec.ts tests/app-shell.spec.ts tests/requests.spec.ts` | `24 passed (1.1m)` |
| `… tests/clients.spec.ts tests/invitation.spec.ts tests/requests-page.spec.ts tests/request-topics.spec.ts` | `18 passed (50.6s)` |

The 16 API suites were `client-participants`, `request-notifications`, `requests`,
`requests-page`, `login`, `logout`, `invitations`, `clients`, `org-scope`,
`session-revocation`, `members`, `capability`, `reset-password`, `signup`, `projects`,
`request-topics`. `npm run lint` in `apps/web` is `next lint`, which in this checkout has no
ESLint config and drops into an interactive setup prompt; nothing was configured for it.

## Things the reviewer should look at deliberately

1. **A DS gap the spec says is none.** Adding the addressee-kind control made the
   new-request modal taller than a 720px viewport, and `Modal` had no max height and no
   scrolling body: the actions row went off-screen with nothing able to scroll it back
   (Playwright: *element is outside of the viewport*). Fixed **in the design system** —
   `1_DS for dev/components/surfaces/Modal.jsx` now caps the dialog at
   `calc(100vh - 40px)` and scrolls its body, header and actions pinned — rather than
   improvised on the screen. It belongs in this spec's DS gaps table, which I may not
   edit; recorded here and in the verdict instead. Every existing modal-driven E2E suite
   above passes with it.

2. **Two existing assertions moved because this spec governs them now.**
   - `packages/validation/src/requests.test.ts` TC-01-UNIT-03: `kind: 'client'` is no
     longer refused *for being an unknown kind*, so the case now asserts it is refused for
     carrying the wrong id, and a new spec-03 block asserts the accepted shape.
   - `apps/api/test/requests.spec.ts` (spec 01's edge case 7): the same body now answers
     `{assigneeClientMembershipId: assigneeInvalid, projectId: clientProjectRequired}`,
     which is TC-03-INT-32's fourth case plus REQ-03-021. Edge case 19 of this spec names
     that answer as the one it replaces. A refusal of an unknown kind (`vendor`) was added
     beside it, so the case still covers what it covered.

3. **Reassignment still takes a colleague only.** `REQUEST_ASSIGNEE_KINDS` widening means
   `validateRequestAssignee` would accept `client` on the reassign body too;
   `reassignRequest` refuses a non-`member` kind with the answer that route already gives,
   because "a reassign path that accepts a client addressee" is in Known Gaps as not built.

4. **The contact picker's source.** No route serves "the addressable contacts of the
   organization"; the modal fills the picker from `GET …/clients?status=active` plus each
   client's contacts. Both need `view-clients`, so for a `user` holding `create-request`
   the picker comes back empty even though the permission matrix lets them address a
   contact. The narrowing is a convenience and the server decides, so nothing is refused
   incorrectly — but a `user` cannot discover a contact through the product today. Noted,
   not invented around: no route the spec does not have was added.

5. **The invited row's name hints.** The contracts accept optional `firstName`/`lastName`
   "shown in the contacts list until the invitation is accepted", while the Data Model gives
   `Invitation` exactly one new column (`clientId`) — there is nowhere to persist them. They
   are validated, echoed back on the `201` row, and the list shows the account's own names
   once there is an account, falling back to the address. No column was added for them.

6. **A decline writes two outbox rows per recipient** (its `message_posted` and its
   `status_changed`), which is REQ-03-035 read literally per event. No case asserts the
   count; the pre-implement note N1 flagged it and it is implemented as written.

7. **`GET /api/me` for a removed member of staff** still answers the body it answers today
   (with `principal: "member"`), so nothing about the existing shell changed.
