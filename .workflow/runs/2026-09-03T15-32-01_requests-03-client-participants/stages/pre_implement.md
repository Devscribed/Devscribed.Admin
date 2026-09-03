# pre-implement — requests/03 Client Participants & Client-Addressed Requests

Run `2026-09-03T15-32-01_requests-03-client-participants`
Spec `specs/requests/03-client-participants.md` (+ `.contracts.md`, `.cases.md`)
Base `fbaac455fb9cc458f83f8911c02f4815603487ac`

**Verdict: blocked.** One blocking finding (`P1`, `spec/stale-statement`) and eleven notes.
`handoff.json` is written and complete regardless — 41/41 requirements assigned, 42/42 live
cases claimed, 23/23 `##` headings accounted, ten tasks. The plan is executable the moment
`P1` is answered; nothing else in the spec resisted compilation.

## What already exists to build on

The spec is unusually well-anchored: almost every mechanism it needs is already in the tree,
and the honest reading of this change is "a second principal kind threaded through machinery
that exists", not "a new subsystem".

| What | Where |
|---|---|
| 404-not-403 for a caller who may not see the resource | `apps/api/src/auth/org-scope.guard.ts` |
| a per-request re-read of `Account.securityStamp` — the one query that can resolve the principal kind for free | `apps/api/src/auth/session.guard.ts:20-30` |
| the role-keyed capability gate that must gain a client branch | `apps/api/src/auth/capability.guard.ts:47-58` |
| membership-checked-before-password, and the `deactivated` body verbatim | `apps/api/src/auth/login.service.ts:33-38` |
| the identity answer, and its `null` for an account with no staff membership | `apps/api/src/members/me.controller.ts:29-31` |
| invitation token, SHA-256 storage, seven-day expiry | `apps/api/src/invitations/invitation-token.ts` |
| supersession of every pending invitation for one (address, org) in the writing transaction | `apps/api/src/invitations/invitations.service.ts:105-121` |
| capability gates that answer 404, and P2002 handling | `apps/api/src/clients/clients.service.ts:360-375, 394-396` |
| soft-remove + `securityStamp` rotation in one transaction | `apps/api/src/members/members.service.ts:193-199` |
| the request row lock, the actor-guard table, the party rule | `apps/api/src/requests/requests.service.ts:80-116, 836-882` |
| the create path's read order, the topic snapshot, `nextRequestNumber` under `FOR UPDATE` | `apps/api/src/requests/requests.service.ts:300-455` |
| an abstract class used as its own DI token — the port shape the spec names | `apps/api/src/mail/mail.service.ts:139-166`, `mail.provider.ts:30`, `core.module.ts` |
| after-commit, fire-and-forget dispatch that logs instead of throwing, with a test-only `whenIdle()` | `apps/api/src/queue/job-queue.ts:84-97, 108-115` |
| the two seeded client topics the spec's cases rely on | `apps/api/src/requests/request-topics.seed.ts:37-38` |
| `Select` options whose label is a `ReactNode` | `1_DS for dev/components/forms/Select.d.ts:3` |
| every E2E helper the Verification Plan claims exists | `e2e/tests/helpers.ts:734, 765, 794, 812, 898, 921, 1128, 1148, 1212` |
| `overrideProvider` for a port double | `apps/api/test/clients.spec.ts:136`, `requests.spec.ts:270` |

## What must be built from zero

Two tables and four nullable columns; the resolved principal and the decorator that says which
seven handlers a client may reach; `CLIENT_USER_MESSAGES` and three new `REQUEST_MESSAGES`
keys; `CLIENT_CAPABILITIES` and the kind-first rights resolver; three contacts routes and
their service; the client branch of invitation acceptance; the client half of the create route
and of party/list/answer/decline/thread/grant; the notification port, outbox, recipient rule,
dispatcher and null adapter; the contacts section and invite modal; the addressee-kind control
and contact picker; the client shell. Forty-two cases.

## The sweeps

### Premises

Twenty-three premises checked against the file that implements them; twenty-two hold and are
recorded in `handoff.premises` with a path. The rehearsal's quoted observations still read as
quoted: the `400 {"error":"validation_error","fields":{"assigneeMembershipId":"Choose who this
request is for"}}` refusal of a client addressee comes from `REQUEST_ASSIGNEE_KINDS` at
`packages/validation/src/requests.ts:75` holding `['member']` alone, and the sign-in refusal
comes from `login.service.ts:37`. The deploy order the migration note must state was read from
`infra/deploy.sh:183-192`, not from prose about it.

Two claims are **refuted** — see `P1`.

### Contradiction

Every absolute in the spec was taken to the call sites it forbids.

- *"A client principal is refused with 404 on every organization route other than the ones
  REQ-03-019 names."* Today those routes answer such a caller **403**, from five separate
  `requireCaller` helpers (`requests.service.ts:914`, `request-topics.service.ts:439-445`,
  `clients.service.ts:338-344`, `projects.service.ts:681-687`, `members.service.ts:262-274`).
  Not a contradiction — the spec states 404 plainly, twice — but it is why the plan puts the
  refusal in `OrgScopeGuard` with an `@AllowClientPrincipal()` decorator naming the seven
  handlers, rather than editing twenty services. That also discharges REQ-03-017 structurally:
  the kind is resolved before any handler runs, so no role-keyed helper can be reached with a
  principal that has no role. Edge case 17 is explicit that the wrong answer here is a *grant*
  — `hasCapability(null, 'ViewOwnRequests')` is `true` via `normalizeRole`'s viewer default
  (`roles.ts:39-44`, `roles.ts:176-181`) — so the ordering had to be made a property of the
  chain and not of where checks happen to sit.
- *`cancel`, `patch` and `reassign` for a client principal.* Not in REQ-03-019's exception
  list, therefore 404 — including on their own request. Determinate, planned, and the reason
  `reassign`'s `CapabilityGuard` never sees a client principal.
- *State-machine invariant 1 (never both principals).* This is where the spec breaks. See `P1`.
- *REQ-03-024's table vs REQ-03-020's 404.* The contracts fix the decision order — body shape
  together, then the topic row, then the addressee row (rule 6 before rule 7), then the
  audience, then the project — so the combination "cross-organization contact id **and**
  mismatched audience" resolves to the 404, not the mismatch. Determinate.
- *REQ-03-029 vs the list's `400`.* `scope=everything` must be the 400 every principal gets,
  decided before the kind is looked at; `requests.service.ts:172-190` already parses before it
  gates, so the order is already right.
- *Permission matrix "client contact ❌ grant" vs the existing actor guard.* A client is never
  `isAdmin` and never the requester, so the existing guard already answers `notYoursToGrant`
  once the client is a party. No new authorization scheme, exactly as REQ-03-028 says.

### Call sites

`allCallSites` is filled for the three requirements phrased absolutely: REQ-03-019 (the twenty
controllers behind `OrgScopeGuard`, plus the single enforcement point), REQ-03-035/036 (the
seven notifiable write paths in `requests.service.ts`, and `patchRequest` named explicitly as
the one that writes no notification), and REQ-03-011 (both invitation writers, so a staff
invitation supersedes a client one and vice versa).

### Writers and locks

Recorded per task. The two that needed a decision the spec is silent on, planned with the lock
this repository already uses for that row: the contact removal re-reads its `ClientMembership`
with `SELECT … FOR UPDATE` before testing `status` (the device `lockRequest` uses), and two
concurrent accepts race on `ClientMembership.accountId @unique` and are answered 409 from the
P2002 handler `clients.service.ts:394-396` already models. `Account.securityStamp` has three
other unlocked writers (`members.service.ts:196`, `password-reset.service.ts:123`,
`account.service.ts:242-249`) and needs none: every rotation revokes, so a lost update cannot
go in the unsafe direction.

### Messages

Every row of the Error Messages table is mapped to an export and an emitting route. Five keys
and one export are new; the other eighteen rows already exist verbatim — including
`CLIENT_MESSAGES.clientArchived` ('This client is archived and cannot be assigned to new
projects.') and `AUTH_MESSAGES.deactivated`. `REQUEST_MESSAGES` is extended in place, as specs
01 and 02 extended it; `CLIENT_USER_MESSAGES` is the new export the contracts require.

### Verification

Nothing in the Verification Plan is owed as a fixture: the "created here" rows are this spec's
own routes, and the "pattern exists" row is `overrideProvider`. The four double behaviours the
notifier needs come from the port's own table of behaviours, not from prose.

### Sections

All twenty-three `##` headings across the bundle are answered by name in `handoff.sections`,
including the four that carry neither a numbered requirement nor a case — Out of Scope, Known
Gaps, DS gaps and Summary. `node scripts/handoff-coverage.mjs` passes; note that it reads only
the spec's main file, so its `0/0` for requirements and cases reflects this bundle's `REQ-…`
headings and its separate cases file, not an empty plan. The accounting above was therefore
also checked directly against all three files.

## The blocking finding

**`P1` — the spec claims a state is unreachable, and two files refute the claim.**

REQ-03-002's decision table marks `staffRow=active, clientRow=active` *"Unreachable — an
accept that would write the second row is refused by REQ-03-014, and no other writer creates
one."* The Data Model reinforces it: `ClientMembership.accountId @unique` is said to be *"what
makes REQ-03-002's invariant a schema fact rather than a rule."* State-machine invariant 1 and
AC-2 both rest on those two sentences.

Both are false against this repository.

REQ-03-014 refuses **only** the accept of a `client` invitation. The **staff** invitation path
is untouched by this spec — `POST /api/invitations` is not in the Routes table — and its
`alreadyMember` check reads `Membership` rows alone (`invitations.service.ts:92-97`), while
`acceptExistingAccount` creates a `Membership` for any account holding none
(`invitations.service.ts:277-289`) without consulting a `ClientMembership`. So: invite
dana@acme as a client contact, accept, then have an admin invite the same address as a
`user` — which REQ-03-011 and TC-03-INT-31 explicitly contemplate — and accept that too. The
account now holds an active `Membership` **and** an active `ClientMembership`. That is the
cell the table calls unreachable, the invariant the State Machine calls never, and the
criterion AC-2 asserts; and TC-03-INT-08 tests only the client-invitation direction, so
nothing in the suite would catch it.

The second sentence is why nobody noticed. `Membership.accountId` is itself `@unique`
(`schema.prisma:196`). Two independent unique constraints on two tables cannot express mutual
exclusion between them; the constraint makes "at most one client membership per account" a
schema fact and says nothing whatever about the staff row. Mutual exclusion here can only be
a rule, and the rule for the staff side is not written.

I am not settling it. Where the staff side refuses is a product decision with two defensible
answers — at invite, beside `alreadyMember`, so nobody is ever handed a token they cannot use;
or at accept, with the 409 `principalConflict` REQ-03-014 already defines — and they differ in
what an admin sees and when. That decision belongs in the document. `handoff.json` plans T5 as
the spec is written and records the hole as risk R1, so the moment the rule is stated the plan
absorbs it.

## Notes (not blocking)

1. **`isValidRole` must not be widened.** The area README's blast radius says the `client`
   role value *"widens `isValidRole`'s accepted set … in the one function every caller already
   goes through."* That function is what `validateInviteCreate` gates the staff invite route
   with (`index.ts:327`), so widening it would let a caller write a **staff** invitation with
   role `client` and no `clientId` — an invitation whose accept no requirement describes. T2
   adds a separate invitation-role predicate instead and leaves `isValidRole` alone. No
   numbered requirement asks for the widening.
2. **A decline writes two events**, the reason's `message_posted` and the `status_changed`.
   Read per event — which is what "in the same transaction as the `RequestEvent`" and a
   uniqueness constraint keyed on `eventId` both mean — a decline therefore produces two
   notification rows for its one recipient. No case observes it. Planned per event; narrow it
   in the spec if one was meant.
3. **The identity of an `invited` contact row** is unspecified: there is no `ClientMembership`
   yet and `client-contact-row-{id}` needs an id. Planned as the pending `Invitation`'s id,
   with the `ClientMembership`'s id from acceptance onwards; no behaviour turns on the choice,
   because a `DELETE` naming no `ClientMembership` is the 404 the state table already gives.
4. **A client's message would render as "Former member."** `RequestThread.tsx:44` falls back to
   that string when `author.displayName` is null, and the message serializer resolves the name
   through the `Membership` relation only (`requests.serializer.ts:126-135`). Events are safe —
   they snapshot `newLabel` — but the thread has no snapshot column, so T6 resolves a client
   author's name from the `ClientMembership`'s account. The spec does not say to; the visible
   alternative is a client's own post attributed to a former member.
5. **The field key for the client addressee's error** is unspecified. Planned under the field
   the rule names (`assigneeClientMembershipId`), with the modal mapping both keys onto the new
   `request-new-error-assignee`.
6. **The principal-conflict check runs before the password comparison** on accept, which is
   what the contracts' "tells a stranger holding a valid token nothing" sentence assumes.
   Recorded because the opposite order is equally implementable and observably different.
7. **`clientName` on the assignee member** is planned as always present and `null` for a member
   addressee, following the reasoning the contracts give for `/api/me` — one shape answers both
   so the shell branches on a value that is always there.
8. **Archived project vs wrong client** — the relative order of `projectUnavailable` and
   `clientProjectMismatch` is unstated. Planned with spec 01's answers first (404, then
   archived), then the two new ones; no case covers an archived project of another client.
9. **`REQUEST_ASSIGNEE_KINDS` widening touches requests spec 01's TC-01-UNIT-03**, which
   asserts a kind outside the set is refused. The rule is unchanged and only the set widened —
   the case keeps asserting the refusal with a value still outside the two.
10. **`nav-members` gated on `view-list`** removes the row for no staff role: admin, manager,
    user and viewer all hold it. The client branch is what withholds it, and
    `e2e/tests/app-shell.spec.ts` is the regression witness the README names.
11. **`whenIdle()` on the dispatcher.** TC-03-INT-26 requires the route to answer before a
    blocking notifier returns, so the dispatch cannot be awaited — and TC-03-INT-24/27/30 read
    the rows immediately afterwards. Without a rendezvous that is a race; with the
    `job-queue.ts:94-97` device it is deterministic. Also: do not reuse `JobQueue` itself, whose
    `Job` is keyed on `envelopeId` — reuse the pattern, not the class.
