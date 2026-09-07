# Pre-implement (replan) — requests/03 Client Participants & Client-Addressed Requests

Spec: `specs/requests/03-client-participants.md` @ `6da7bca3…` (+ `.contracts.md`, `.cases.md`)
Base: `de9c5f916fa328734ed5f8f9c77023e8720e35e8` · Branch head: `5840d41`

The spec was amended after the first implementation was reviewed: commit `30401b4` adds
**REQ-03-043** and **TC-03-INT-36** — a contacts read of the requester's own, guarded by
`create-request` and bounded by the projects they are assigned to. So this is a **delta plan on
a working tree**: `771451a` already carries the model, the principal, the contacts routes,
client-addressed requests, the notification port, the shell and the cases. 43 cases (2 unit,
36 integration, 5 E2E), 17 acceptance criteria. Verdict: **pass**, with five notes.

`node scripts/handoff-coverage.mjs` — pass (requirements 0/0, cases 0/0 in the main file,
sections 8/8; the cases live in the bundle and are listed in `testCases` in full).

---

## What sent this back — every finding, answered

### F1 — reassign leaves a client-addressed request with no trail of who it was taken from

**Fixed in the plan (T5), and one half of the suggested fix contested.**

Verified at the code, not from the finding. `reassignRequest` looks `previous` up from
`locked.assigneeMembershipId` alone, so on a row whose addressee is a contact the
`assignee_changed` event is written with `oldValue: null, oldLabel: null` while the update
clears `assigneeClientMembershipId`. The request leaves the contact's inbox naming nobody.

That much is a defect against a written rule, and it needs no decision from anybody:

- spec 01 requirement 35 — reassignment writes the event "carrying the old and new display
  names in `oldLabel` / `newLabel`, so the trail stays readable after a member is removed";
- this spec's contracts, on `RequestEvent` — "Display names keep being snapshotted into the
  event's label columns, so the trail survives a removed contact".

T5 reads the outgoing `ClientMembership` inside the same transaction — `lockRequest` already
selects `assigneeKind` and `assigneeClientMembershipId`, so no second pre-transaction read is
needed — and writes the contact's id and display name into `oldValue` / `oldLabel`.

**Contested: "stop drawing the Reassign control for a client-addressed row."** Counter-witness:
spec 01 requirement 35 permits an admin or manager to reassign "an open or answered request to
a different **member**" — the restriction is on the *target*, not on the row — and requirement
36 makes the inactive-addressee flag draw "the reassign banner and the reassign control **on
the detail screen**", which the UI-states row repeats ("Addressee inactive |
`request-detail-assignee-inactive-banner` above the actions; reassign offered to admin/manager
only"). Spec 03 states no requirement withdrawing that control, and its Known Gaps row names
what is missing as "a reassign path that **accepts a client addressee**" — a body that may
*name* a contact, which is exactly the refusal the code keeps (`400`
`REQUEST_MESSAGES.assigneeInvalid`). Hiding a control the route accepts, so that a transition a
numbered requirement grants is unreachable through the product, is a product decision nobody has
written down; withdrawing a shipping control is growing the spec, not refining it. So the
control stays drawn, the route keeps answering, and the trail is repaired.

Two comments assert the opposite of what the code does and are corrected by the same task: the
one at the top of `reassignRequest`, and the one beside the inactive-addressee banner in
`requests/[requestId]/page.tsx` that reads "this release has no reassign path that accepts a
client addressee" next to a control that is drawn and works. Both are replaced with what is
true — the body takes a colleague; a client-addressed request may be handed to one, and the
outgoing contact is snapshotted into the event.

Carried to a person as **P2**: whether staff should be able to take a request away from a
contact at all is the product question underneath this, and answering it either way is a
sentence in the spec, not a decision for a gate. The row it leaves behind carries a
client-audience topic with a member addressee, a pairing REQ-03-024 refuses at creation and
constrains nowhere else.

### F2 — a `user` may address a contact but may not list one

**Fixed in the spec, by a person, and compiled here.** `30401b4` adds REQ-03-043 and
`GET /api/organizations/{orgId}/request-contacts`, guarded by `create-request` and bounded by
REQ-03-023's own boundary, and leaves the client-detail contacts route on `view-clients`.

I re-checked the bundle for a residual disagreement and found none: the Routes table carries
both rows with different guards, the contracts paragraph says in as many words which caller each
is for, and the permission-matrix row for `user` ("Raise a request, to a colleague or to a
client contact ✅") is now satisfiable — `user` holds `create-request` and
`list-assigned-projects` and needs nothing else to complete the form.

Planned as **T11** (route and service), **T9** (the modal reads it instead of the
clients-then-contacts loop) and **T10** (TC-03-INT-36, three callers: the `user` assigned to one
project, the admin assigned to none, the `viewer`).

### F3 — TC-03-E2E-03 throws before its first assertion

**Fixed in the plan (T10).** Confirmed: `e2e/playwright.config.ts:72` declares `baseURL` under
`use`, and those options are applied by the `context`/`page` fixtures only — a context built by
hand in a test carries none, so `page.goto('/login')` on it is an invalid URL. Every other
hand-built context in this suite navigates with an absolute URL
(`envelopes-signing.spec.ts:102`, `outbox.spec.ts:87`, `regressions.spec.ts:134`); this file is
the only one that goes relative. T10 takes the `baseURL` fixture in the test signature and
passes it to both contexts. The case is the only E2E witness for stamp rotation ending a live
session, so until this lands AC-8 has an integration witness and no browser one.

### F4 — the members screen is served to a client contact

**Fixed in the plan (T7), at one place rather than at the one screen.** Confirmed: the members
page has no gate — a client's read answers 404, the non-ok branch leaves `members` at `null`,
and the render falls to `MembersLoadingSkeleton` under the header, the search field and the
show-removed checkbox. It is the only staff screen in that state, because it is the only one
every staff role may see; the rest short-circuit on a role-keyed helper that answers `false` for
a null role.

CR-18 is about a class of call sites, so the repair goes where the class is: the org layout,
which already resolves the principal before anything renders and already calls `notFound()` for
the wrong organization. A client principal on any path other than the requests destination gets
`notFound()` there. That covers the twenty-one organization pages at once, including the four
project sub-pages and the member detail page, which have no gate of their own either, and it
holds for screens nobody has written yet. `allCallSites` on T7 enumerates all of them with what
each does today, so the next reader can see the class rather than the instance.

T10 strengthens TC-03-E2E-02 to assert the chrome is absent — `members-search-input` and
`show-removed-checkbox` — not only `members-list`, which a page rendering its full chrome over a
stuck skeleton satisfies. The comment left in `members/page.tsx` ("A client contact never
reaches this screen") becomes true and is rewritten to name the gate that makes it so.

### F5 — TC-03-UNIT-02 asserts a normalized role where the case names the absent one

**Fixed in the plan (T10).** Confirmed against the helper: `can` is
`CAPABILITY_MATRIX[role]?.[capability] ?? false`, so `can(null, 'view-own-requests')` is `false`
and the case's stated expectation is directly assertable. The test asserts
`can(normalizeRole(null), …) === true` (true by construction) and `can('client' as Role, …)`,
under a comment claiming the two helpers disagree — the disagreement REQ-03-017 exists for is
asserted nowhere, and nothing in the suite would fail if `can` began granting an absent role.
T10 asserts the pair the case names and rewrites the comment to describe the assertions made.

---

## What already exists to build on

Every path opened, not inferred. Beyond the branch's own work (which the handoff's `state`
fields name per task):

| What | Where |
|---|---|
| Capability → bare **404**, decided in the service, not the guard's fixed 403 | `apps/api/src/clients/clients.service.ts` `requireManageCapability` / `requireViewCapability` |
| Caller resolution and the member narrowing every requests route starts with | `apps/api/src/requests/requests.service.ts#requireCaller`, `#requireMemberCaller` |
| The assignment test REQ-03-043 mirrors, with no admin carve-out | `requests.service.ts#createRequest` — `projectMember.findUnique` on `projectId_membershipId` |
| Project ↔ client link and the assignment row | `apps/api/prisma/schema.prisma` — `Project.clientId`, `ProjectMember @@unique([projectId, membershipId])` |
| The row lock, already selecting the client half of the addressee | `requests.service.ts#lockRequest` |
| The display-name helper the event labels and the serializer share | `requests.serializer.ts#displayNameOf` |
| The shell that resolves the principal before anything renders | `apps/web/app/org/[orgId]/layout.tsx` |
| A page-level short-circuit for a principal that cannot use the screen | `projects/page.tsx` (`notFound()`), `clients/page.tsx` (`return null`) |
| An effect keyed on the modal's open cycle rather than a length guard | `NewRequestModal.tsx` — the topics effect |
| A hand-built context that navigates correctly | `envelopes-signing.spec.ts:102`, `outbox.spec.ts:87`, `regressions.spec.ts:134` |
| E2E preconditions | `e2e/tests/helpers.ts` — `signupOrg`, `findMember`, `assignProjectMembersViaApi`, `acceptInvitationViaApi`, `latestInvitationToken`, `listRequestTopicsViaApi`, `archiveRequestTopicViaApi` |

## What must be built from zero

- `GET /api/organizations/{orgId}/request-contacts` — handler, service method, query. It is the
  whole of the unbuilt product surface in this spec.
- `TC-03-INT-36`.

Everything else this pass is a repair to code that exists: four files, named per task.

---

## Sweeps

### Premises — re-checked against the files, on the amended spec

The fifteen rows are in `handoff.premises` with a path each. The ones this pass turns on:

- `user`: `create-request` **true**, `view-clients` **false**; `viewer`: `create-request`
  **false** — `CAPABILITY_MATRIX` in `packages/validation/src/index.ts`. Both rows of
  TC-03-INT-36 rest on these.
- `can(null, …)` is `false` (`?.` then `?? false`, `index.ts:785-787`) while
  `hasCapability(null, 'ViewOwnRequests')` is `true` (`normalizeRole` → `viewer`, whose list is
  `['ViewOwnRequests']`). F5's repair is assertable exactly as the case words it.
- `createRequest` refuses an archived project (`projectUnavailable`) **before** the assignment
  check, so a picker that ignored project status would offer contacts the create route refuses.
- `lockRequest`'s `SELECT … FOR UPDATE` already lists `assigneeKind` and
  `assigneeClientMembershipId`.
- Context options under `use` reach the `context`/`page` fixtures only.
- The migration for this run already exists on the branch — nothing this pass may add a second.

No stale premise found.

### Contradiction sweep — the absolutes, against the call sites they forbid

- *"A `user` may raise a request to a client contact"* against *"the only contacts route is
  guarded by `view-clients`"* — this was F2's contradiction and it is gone: REQ-03-043 adds the
  route the first statement needs, and the contracts say which caller each route is for.
- *"A client principal is answered 404 on every organization route other than those REQ-03-019
  names"* — one choke point (`OrgScopeGuard`) with an explicit opt-in; T11's new handler does
  **not** opt in, so it is refused by default. The web half becomes one gate in the layout
  (T7), which is what F4 showed was missing at one screen out of twenty-one.
- *"An account never holds an active `Membership` and an active `ClientMembership` at once"* —
  writers unchanged this pass: client accept (REQ-03-014), staff invitation write and accept
  (REQ-03-042), and signup, which cannot reach it (`Account.email` is `@unique` and signup
  refuses an existing address).
- *"Nothing is reassigned"* (edge case 5, Known Gaps row 2) against spec 01 requirement 35 — the
  reading under which both hold: nothing is reassigned **automatically** when a contact is
  removed, and no reassign body may **name** a contact. Handing a client-addressed request to a
  colleague stays permitted by requirement 35, which spec 03 does not narrow in any numbered
  requirement. Recorded as note **P2** rather than settled quietly: the alternative reading is
  available and the choice belongs in the document.
- REQ-03-043 ("every client owning a project that member is assigned to") against REQ-03-023 —
  the same boundary, which is the requirement's own stated reason. The active-project narrowing
  is derived from "offers what the server accepts" and is stated in T11 and as note **P4**.

No contradiction that blocks.

### External claims

The "Access this needs" table is a single row saying there is none, and the shipped adapter
makes no outbound call. No `Assumed` observation carries a requirement. The doubles are of our
own port and `doubleBehaviours` is planned from the port's table of members and outcomes.

### Call sites — the "every X" requirements

- REQ-03-019 ("every other organization route") — API: `OrgScopeGuard`, one choke point, opt-in
  per handler. Web: the twenty-one pages under `apps/web/app/org/[orgId]`, all listed in T7's
  `allCallSites` with what each does today.
- REQ-03-035 ("every notifiable event") — `createRequest`, `postMessage`, `transition`,
  `reassignRequest`. `patchRequest` writes `field_changed`, which the list does not name.
- REQ-03-017 ("when a right is checked") — unchanged this pass; T11's new capability check asks
  the principal kind first by construction, because `OrgScopeGuard` has already refused a client
  principal before the handler runs.
- Writers of the addressee columns — `createRequest` and `reassignRequest`, nothing else
  (`patchRequest` may not touch them, spec 01 requirement 34). Both are in T5's `allCallSites`,
  which is what makes the trail repair land at the whole class rather than at the one branch.

### Writers and locks

- `Request` — the existing `FOR UPDATE` re-read; the reassign repair reads the outgoing contact
  from that locked row, inside the transaction.
- `RequestNotification` — no lock; `@@unique([eventId, recipientKind, recipientId])`.
- The new route takes no lock and holds none; a contact removed between the read and the create
  call is refused by REQ-03-025 at creation, where the decision belongs.

### Messages

Twelve rows in `handoff.messages`, each with the module that exports it and the route that
emits it. The new route emits none — its refusal is a bare `404`, which the Routes table gives
it and which the contacts routes already answer for the same reason (a distinctive body would
say the resource exists to somebody who may not see it).

### Verification plan

Unchanged: every precondition is reached through this spec's own routes or a helper that exists
in `e2e/tests/helpers.ts`. This spec owes no fixture route and adds nothing under
`apps/api/src/test-support/`. TC-03-INT-36 needs only what `apps/api/test/client-participants.spec.ts`
already builds — clients, client-linked projects, project assignment, contacts, and callers of a
named role.

### Sections

All eight `##` headings of the main spec, and the bundle's, are answered by name in
`handoff.sections`. Two carry no task and say why: **Out of Scope** (six things not built) and
**Known Gaps** (four accepted, with the second one's exact reading spelled out, since it is what
F1 turns on).

---

## Notes handed to the human (not blocking)

- **P1 — a decline notifies twice.** Carried from the first plan. `transition` writes
  `message_posted` and `status_changed` in one transaction; REQ-03-035 is written per event and
  REQ-03-039's uniqueness is per event, so a decline produces two outbox rows per recipient. No
  case asserts the count either way.
- **P2 — nobody has decided whether staff may take a request away from a contact.** The route
  accepts it today and spec 01 requirement 35 permits it; the result is a row carrying a
  client-audience topic with a member addressee, which REQ-03-024 refuses at creation and
  constrains nowhere afterwards. The trail is repaired either way; the question is whether the
  transition should exist. One sentence in the spec settles it.
- **P3 — TC-03-E2E-03 has never run green.** Its first navigation throws, so the case has never
  exercised its subject; whatever the first implementation reported about it was reported about
  a case that could not run. Worth knowing when reading that attempt's log.
- **P4 — the active-project narrowing on REQ-03-043.** The requirement says "every client owning
  a project that member is assigned to" without naming project status. The plan filters to
  active projects, because the requirement's own Decided line is that the picker offers what the
  create route accepts, and the create route refuses an archived project. If the intent was
  otherwise, it is a word in REQ-03-043 and an assertion in TC-03-INT-36.
- **P5 — the branch carries work this spec did not ask for.** `git diff baseRef...HEAD` includes
  `scripts/refine-read.mjs`, `scripts/run-report.mjs`, `scripts/ship.mjs`, `scripts/spec-lint.mjs`,
  `scripts/usage-recover.mjs` and `1_DS for dev/components/surfaces/Modal.jsx`. The first five
  came from two `build(pipeline)` commits on this branch; CLAUDE.md sends machinery to a
  `build/*` branch precisely because the reviewer diffs `baseRef...HEAD` and is built to block on
  a file no task names. The Modal change is a shared design-system component the spec's DS gaps
  table records as `None` (the reviewer's N21). Moving them is a person's call — `scripts/aside.mjs`
  is the tool — and no task here touches any of them.

## Test levels

Unchanged from the first plan, plus one case. TC-03-INT-36 is integration: it is a status code
and an authorization decision, which belongs at the API level even though a picker shows the
result. The five E2E cases each still buy something an API test cannot reach — a
mail-to-accept-to-sign-in journey, a control that must not be drawn and a URL typed by hand, a
session revoked mid-visit across two contexts, focus and the per-audience re-read in a modal, the
drawn/undrawn action controls. Nothing is duplicated across levels, and nothing is retired.
