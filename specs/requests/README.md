# Requests Specifications

Functional specifications for the requests surface of Devscribed.Admin — one record for
"somebody needs something from somebody else", whether that somebody sits inside the
organization or works for a client. Each spec is self-contained with requirements, UI, API
contracts, and test cases. Specs use YAML frontmatter (`tags`, `routes`, `api`, `entities`) for
discoverability — grep frontmatter to find relevant specs.

## Why this area exists

Two things happen today outside the product and leave no record.

A developer needs an access — a repository, a staging environment, a VPN profile, a seat on a
paid tool — and asks for it in a chat message. Nobody can say afterwards what was asked, by
whom, when, or whether it was ever granted.

More expensively, a developer needs an access **from a client**, and the work stops until it
arrives. In a company that bills by the hour, a blocked developer is not an inconvenience: the
salary is paid and the hour is not billed. The chase happens in email and instant messages, the
deadline is implicit, and when the client goes quiet there is nothing to point at.

This area makes both a first-class record with a lifecycle, an addressee, a deadline, a thread
and an audit trail, and puts them in the one place a person already looks.

## Spec Index

| # | Spec | Design | Tags |
|---|------|--------|------|
| 01 | [Requests](01-requests.md) | — | request, access-request, question, inbox, thread, audit-trail, blocking, overdue |
| 02 | [Request Topics & Vocabulary](02-request-topics.md) | — | topic, catalogue, preset, settings, vocabulary, status-label, seeding, audience |
| 03 | [Client Participants & Client-Addressed Requests](03-client-participants.md) | — | client, client-user, principal, invitation, capability, navigation, session, notification, outbox, port |

**Each spec ends at a working product.** Spec 01 ships requests between members of staff: a
developer asks a colleague for an access, the colleague answers, the developer confirms it
works. Spec 02 replaces the two-level `type` + `accessKind` classifier with a catalogue the
organization curates itself, and fixes the words the screens use for where a request stands.
Spec 03 makes a person at a client a signed-in principal, lets a request be addressed to them,
and puts the notification port behind a no-op adapter.

**02 comes before 03 deliberately.** The alternative shipped client-addressed requests
classified by `type` and `accessKind` and retired that classifier a release later, so every
client request raised in between would carry a vocabulary nothing else uses. Ordering the
catalogue first means a client request is born under the classifier it keeps, and the
`client` audience is curated and seeded before anything can select it.

Spec 01's route was walked in full before its cases were written and owes no test fixture. The
rigs for 02 and 03 were walked together on one throwaway probe, recorded in each bundle's
`.cases.md`; 03's rows that depend on a principal which does not exist yet say `not run`.

## Product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope of the entity | One `Request` with a `type` discriminator, not one entity per kind | A single inbox is the whole point: an addressee with three places to look checks none of them. |
| What `type` is in the database | A `String` column with a documented value set, not a Prisma enum | Adding a request type must not require a migration. Matches `Project.status` and `Client.status`; the documents area's Prisma enums are the other convention in the tree and are not followed here for that reason. |
| Vacation requests | **Not** folded into `Request` in this release | `VacationRequest` freezes `workingDays` and `deductionAmount` at submission and drives debit/refund rows in the reserve ledger. Absorbing it means editing transactional code that moves money, for a read-layer benefit. The page unifies; the model does not, yet. |
| Where the inbox lives | The existing `/org/{orgId}/requests` page becomes it | Rejected: a second page at `/inbox`. Two lists of things waiting for you is the problem, not the solution. |
| Who may open that page | Everyone; the *contents* are gated | A person must be able to see requests addressed to them regardless of role, so the page opens for all and the org-wide vacation section keeps `view-requests` unchanged. |
| "Answered" vs "granted" | Two states, never one | "We'll do it tomorrow" is not an access. Collapsing them makes the blocking register lie within a week, and the blocking register is the reason the feature exists. |
| Who writes `granted` | The **requester**, not the addressee | Only the person who needs the access knows whether it works. An addressee who marks their own work done produces a register of intentions. Recorded dissent: in a flat organization where one person closes everything this is friction; the mitigation is that an admin may act for the requester. Spec 03 extends the same rule to a client addressee, who may never grant. |
| Priority | A stored field, `low`/`normal`/`high`/`urgent` | Asked for explicitly. Recorded dissent: `blocking` is a checkable fact and `priority` is a self-assessment, and two dials that both mean "urgent" collapse into one and inflate together. Mitigation rather than removal — the default sort puts the checkable signals above the claimed one. |
| Overdue | Derived on read, never stored | `neededBy` in the past with a non-terminal status. Correctness therefore does not depend on a scheduler, matching the expiry rule in documents spec 02. |
| Human-readable number | `Organization.nextRequestNumber`, allocated under a row lock | People refer to these out loud and in mail. Mirrors `Project.nextTaskNumber`, the accepted pattern in this tree. |
| **What a request is about** | **An organization-curated `RequestTopic`, not a fixed enum** | Asked for as "presets". Rejected: a closed list in `packages/validation`. "Claude" is a company-and-month-specific topic, and a list only a release can change is wrong within a month. The cost is one settings screen. |
| **How many classifiers a caller supplies** | **One — the topic** | `type` stays as a column and is written by the server from the topic; `accessKind` is no longer accepted on the way in. Two dials that both answer "what is this about" drift apart invisibly until somebody filters on the wrong one. Rejected: keeping both and validating agreement, which is the same defect with extra code. |
| A retired field sent by a caller | **Refused, not ignored** | A caller sending `type` is working from a stale contract. Dropping it silently produces a request classified as something nobody chose. |
| Topic naming after the fact | The request stores a **snapshot** of the topic's name | Renaming or archiving a topic must never rewrite what an old request says it was about. The snapshot is also what makes archiving lossless enough that no delete is needed. |
| Topic uniqueness | Per organization **and audience** | "Access" is a natural staff topic and is also the client default; forbidding that pair buys nothing and costs a rename. |
| **Status vocabulary** | **Relabel, do not rename** | The screens read Pending, In progress, Completed and Closed over the five stored statuses. Rejected: renaming the stored values, which rewrites live rows, retires contract values, collapses `declined` and `cancelled` into one, and makes a code rollback need a data rollback. Rejected: adding a sixth `in_progress` state, which is one more transition people forget to click. |
| The `Closed` filter | A sixth **filter** value, `closed`, over two statuses | One control on one page must not mean two things. The five stored values stay accepted on the endpoint, so a link somebody saved still resolves. |
| **How a client reaches the product** | **A session, like anyone else** | Rejected: a magic link and a thread-scoped token of the kind documents spec 02 issues to a signer. Holding an account removes an entire unauthenticated surface, a rate limiter, a token table, four token-invalidation rules and the forwardable-link exposure. |
| **What links a client account to the organization** | **A `ClientMembership`, not a `Membership` with a fifth role** | `Membership` means "member of staff" at 37 query sites across 17 files (`grep -rn "prisma\.membership\." apps/api/src`). A client row there would reach vacation accrual, the members list, project assignment and time tracking, where nothing crashes and everything is quietly wrong. The separate table cannot be read by any of those queries, so the property is enforced by the schema instead of by a rule every future author must remember. The cost is one branch in `CapabilityGuard`. |
| Client capabilities | A flat `CLIENT_CAPABILITIES` list, not a role table | There is one kind of client contact, and a role dimension over a set of one produces a table nobody can populate a second row of. |
| Client invitations | Reuse `Invitation` with a nullable `clientId` and a `client` role value | The token, its SHA-256 storage, the seven-day expiry, supersession and the accept screen are all built and tested in user-management spec 03. A parallel invitation flow would be a second thing to get wrong. The cost is a branch in the accept path. |
| Where accepting lands a client | The requests destination | A staff accept lands on the members screen, which a client principal is refused. |
| Refusing a client principal elsewhere | **404, not 403** | Matching `OrgScopeGuard`'s answer for an organization the caller has no part in, so the shape of the staff product is not enumerable by a contact. |
| A client-addressed request | **Must name a project** the requester is assigned to and that belongs to the addressee's client | The project makes the ask legible to the person receiving it and bounds who may raise it. An admin is not carved out: anyone may assign themselves first, and the carve-out would remove the only rule keeping a client's inbox to people they work with. A staff request keeps its optional project. |
| Direction | **Staff ask clients**, not the reverse, this release | The direction that pays for this release is a blocked developer. A contact with something to ask replies in the thread. Named out of scope rather than half-built. |
| **Notifying anybody** | **A port and an outbox; the adapter that ships delivers nothing** | Asked for as "no email yet, but make it easy to add". Every notifiable event writes its outbox rows in the transaction that caused it and a `RequestNotifier` handles them afterwards; the row already carries `channel`, `providerKey` and `providerRef`, so an email adapter is an adapter and not a migration. Rejected: emitting nothing at all and adding the whole mechanism later, which would mean the recipient rules were never tested. |
| Where a notification sits relative to the request | **Derived, never irreplaceable** | The request and its trail are the asset. A delivery failure leaves them untouched and the row re-derivable, and no read path consults the outbox. |
| A recipient's address | Resolved at delivery, never copied into the outbox | Keeps the only copy of an address on `Account`, where the rest of the product already governs it. A row whose principal has since been removed is marked `skipped`. |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Every query scopes by `session.organizationId`, never the path `orgId`; cross-org access returns 404 | 01 | 02, 03 |
| A request's `status` is written only inside a transaction that re-read the row with `FOR UPDATE`, and every transition writes its `RequestEvent` in that same transaction | 01 | 02, 03 |
| `granted` is written by the requester or an admin; `declined` by the addressee or an admin; `cancelled` by the requester or an admin | 01 | 03 |
| Overdue is computed on read from `neededBy` and `status`; no column stores it and no job sets it | 01 | 02, 03 |
| A request's classifier is the topic, and `type` is derived from it | 02 | 03 |
| A topic's audience must match the addressee's kind | 02 | 03 |
| The screens read Pending / In progress / Completed / Closed from one exported label map | 02 | 03 |
| An account holds an active `Membership` or an active `ClientMembership`, never both | 03 | — |
| Capability is resolved from the principal kind first, then from the role | 03 | — |
| Capability checks on a staff role run against `normalizeRole()` (`packages/validation/src/roles.ts`) | 01 | 02, 03 |
| Every new capability is registered in **both** `Capability` and `MemberCapability` | organization/01 | 02 |
| No outbound call runs inside a database transaction | documents/04 | 03 |

## New infrastructure introduced by this area

None outside the application. No AWS service, no queue, no scheduled job, no public surface.
Spec 03 introduces the **notification port** — an abstract class used as its own DI token, the
shape `MailService` already uses — with an in-process dispatcher and a database outbox. The
adapter that ships makes no outbound call, so nothing in this area reaches the network.

## Cross-Spec Side Effects

| Trigger | Source | Effect | Target |
|---------|--------|--------|--------|
| Member soft-deleted | user-management/04 | Requests they raised or hold are retained and readable; open requests **addressed to** them are flagged inactive, which draws the reassign banner on the detail screen | 01 |
| Member soft-deleted | user-management/04 | Their open requests are **not** auto-cancelled — an access already asked for may still be needed by whoever takes over | 01 |
| Project archived | user-management/11 | Existing requests keep the project and remain readable; the project is no longer offered in the new-request picker | 01 |
| Organization created | user-management/01 | `nextRequestNumber` starts at 1 | 01 |
| Organization created | user-management/01 | The default request topics are written in the same transaction | 02 |
| Topic archived | 02 | The topic leaves the picker; requests raised under it keep their snapshot name, stay readable and stay filterable by it | 02, 03 |
| Topic renamed | 02 | No existing request changes; the catalogue alone reads the new name | 02, 03 |
| Client archived | organization/01 | Its contacts keep their sessions and their open requests; no new contact may be invited to it, and the client is not offered for new work | 03 |
| Client contact removed | 03 | Sessions revoked via `securityStamp`; open requests addressed to them are flagged inactive and nothing is cancelled | 03, user-management/02 |
| Client contact invited | 03 | Supersedes any live pending invitation for that address in the organization, staff or client | user-management/03 |
| Requester unassigned from a project | user-management/11 | Requests already raised to that client are unaffected; the rule is a gate at creation, not a standing condition | 03 |

## Dependency Graph

```
user-management/04 (Membership, soft delete)  ─┐
user-management/10 (Requests page)            ─┼─►  requests/01  ─►  requests/02  ─┐
user-management/11 (Projects)                 ─┘                                   │
                                                                                   ├─►  requests/03
organization/01   (Client)                    ─┐                                   │
user-management/03 (Invitation, token)        ─┴───────────────────────────────────┘
```

Everything 01 depends on is implemented and merged, and 01 itself is merged: `Request`,
`RequestMessage` and `RequestEvent` are in `apps/api/prisma/schema.prisma` and the module is
`apps/api/src/requests/`. `organization/01` landed with
`apps/api/prisma/migrations/20260901120000_spec_org_01_clients`. **03 depends on 02 being
merged and running**, not merely written: its client-addressed requests select a `client`
audience topic that 02 seeds.

## Blast Radius

### Spec 01

**Database.** Three new tables (`Request`, `RequestMessage`, `RequestEvent`) and one new column
on an existing one (`Organization.nextRequestNumber`, `Int @default(1)`). No column is altered,
renamed or dropped, and no existing table gains a `NOT NULL`. *Mitigation:* the migration is
additive. Note the deploy order, read from `infra/deploy.sh` rather than from prose about it:
the migration runs **before** `tf apply` rolls the services out, so there is a window in which
the new schema is live and the **previous** code is still serving. Three unreferenced tables and
one defaulted column are invisible to that code.

**`apps/api/src/requests/` stops being a read-only projection.** `RequestsService` was a single
method that aggregated `VacationRequest` rows and hard-coded `type: 'vacation'`. It gained a
writer, a state machine and a thread. *Mitigation:* the vacation aggregation moved unchanged
into `VacationRequestFeedService` and the controller composes two sources, so the existing
behaviour has one owner and the new code cannot regress it.

**The Requests page stopped being capability-gated.** *Mitigation:* the gate moved inward — the
vacation section and the All scope keep their capability, so no role sees anything it could not
see before.

**Sidebar navigation.** `apps/web/src/layout/Sidebar.tsx` composes its groups from capabilities;
the Requests row moved out of the `view-requests` branch and became unconditional for a
signed-in member, so the "no dead links" rule holds by construction.

**`packages/validation`.** Three new capabilities in `MemberCapability` **and** `Capability`,
plus new keys on the existing `REQUEST_MESSAGES`, which already held the vacation keys. None
collided, so the const is extended in place — it is not a new export, and a second one must not
be created.

### Spec 02

**Database.** One new table (`RequestTopic`) and two new nullable columns on `Request`
(`topicId`, `topicLabel`). *Mitigation:* additive, so the previous code serving during the
migration window sees an unreferenced table and two nullable columns.

**The migration also inserts rows.** Every existing organization is given the default catalogue.
*Mitigation:* it is an insert and nothing else — no `Request` row is read or written — and the
functional unique index on `(organizationId, audience, LOWER(name))` makes a re-run harmless.

**`POST …/requests` stops accepting `type` and `accessKind`.** Every caller sending them breaks
by design. *Mitigation:* the callers are enumerated and changed with the spec —
`apps/api/test/requests.spec.ts` and `e2e/tests/requests.spec.ts` both post `type: 'access'`
with an `accessKind` today, and `apps/web/app/org/[orgId]/requests/NewRequestModal.tsx` loses
the two controls that send them. TC-02-INT-11 is the witness that the refusal is real, since
today the same body answers `201`.

**The status words move out of the web app.** `STATUS_OPTIONS` in
`apps/web/app/org/[orgId]/requests/page.tsx` and `REQUEST_STATUS_META` in
`apps/web/app/org/[orgId]/requests/RequestRow.tsx` are replaced by one exported map in
`packages/validation`. *Mitigation:* one map, read by the list, the detail header and the filter
control, so the three cannot disagree; TC-02-UNIT-05 asserts an entry exists for every stored
status, which is what stops a status rendering as a raw column value.

**E2E cases that name the retired controls.** `e2e/tests/requests.spec.ts` drives
`request-new-type` and asserts `request-new-error-accessKind`. *Mitigation:* those cases are
rewritten onto the topic picker rather than deleted — they guard the create form's validation
behaviour, which this spec keeps.

**The signup transaction grows.** `apps/api/src/signup/signup.service.ts` must write the seed
alongside the `Organization`. *Mitigation:* one insert of a constant list inside the transaction
that already exists; a failure rolls the organization back rather than producing one without a
catalogue.

**Sidebar navigation.** A Settings › Request topics row joins Signing and Holidays in
`apps/web/src/layout/Sidebar.tsx`, gated on the new capability so no role sees a destination its
routes refuse.

**`packages/validation`.** One new capability in `MemberCapability` **and** `Capability`, a new
`REQUEST_TOPIC_MESSAGES` export, new keys on `REQUEST_MESSAGES`, and the status label map.
*Mitigation:* `CAPABILITY_MATRIX` is keyed by role and typed against the union, so adding a
member fails compilation until every role is revisited.

### Spec 03

**The meaning of a signed-in principal.** Until now every session belonged to a member of staff.
*Mitigation:* the new principal lives in its own table, so the 37 `prisma.membership.*` call
sites across 17 files keep their present meaning without being visited, and TC-03-INT-13 asserts
that against the surfaces where a wrong answer would be silent rather than loud.

**`CapabilityGuard` gains a branch.** `apps/api/src/auth/capability.guard.ts` answers 403
whenever no `Membership` is found. *Mitigation:* the second branch is added in the one place
capability is decided, and the fall-through still fails closed.

**The login service.** `apps/api/src/auth/login.service.ts` refuses an account with no active
`Membership` — observed: `400 {"message":"Your account has been deactivated. Contact your
administrator."}`. *Mitigation:* the refusal body is unchanged for every case that is still a
refusal, pinned by TC-03-INT-04, so the change cannot become an account-existence oracle it was
not already.

**`GET /api/me` returns `null` for an account with no staff membership**
(`apps/api/src/members/me.controller.ts`), and `apps/web/app/org/[orgId]/layout.tsx` sends a
`null` answer back to the sign-in screen. *Mitigation:* a client would otherwise sign in and
bounce forever; the endpoint learns the second principal and answers one shape for both.

**`nav-members` is drawn unconditionally** (`apps/web/src/layout/Sidebar.tsx`), so a non-staff
principal would see the staff list. *Mitigation:* this is a real defect against the existing "no
nav item a role cannot use" rule the moment such a principal exists, and spec 03 fixes it rather
than carving it out. `e2e/tests/app-shell.spec.ts` is the regression witness that the fix did not
over-reach and remove the row from staff.

**`Invitation` gains a nullable `clientId` and a new `role` value**, which widens
`isValidRole`'s accepted set in `packages/validation`. *Mitigation:* both are additive; every
existing row stays valid, and the accepted set is widened in the one function every caller
already goes through.

**`Request`, `RequestMessage` and `RequestEvent` each gain a nullable client column**, and
`assigneeKind`, `authorKind` and `actorKind` each gain the value the columns were written for.
*Mitigation:* no column changes type or nullability, and the serializers branch on a kind that
was already stored.

**A new dispatcher runs after every request-mutating call.** *Mitigation:* it is bounded, it
runs after the commit, and with the shipped adapter it performs no I/O at all; TC-03-INT-29
asserts every read path is correct with nothing ever delivered.

## Backward Compatibility

1. **Every migration in all three specs is additive** — new tables and new columns, each
   nullable or defaulted. No rename, no drop, no new `NOT NULL` on an existing table.
   *Mechanism:* `infra/deploy.sh` migrates before it rolls the services out, so the guarantee
   that matters is that the **previous** code keeps working against the new schema; unreferenced
   tables and nullable columns satisfy it by construction, and a rollback of the application
   needs no rollback of the schema.
2. **`Organization.nextRequestNumber` has `@default(1)`**, so organizations that predate the
   column need no backfill. *Mechanism:* the column default, applied by Postgres at migration
   time.
3. **`VacationRequest` gains no column, no write and no transaction in any of the three specs.**
   *Mechanism:* the vacation feed is read-only in this area; `e2e/tests/vacation-requests.spec.ts`
   runs unchanged as the regression witness.
4. **Requests raised before spec 02 keep working.** *Mechanism:* `topicId` and `topicLabel` are
   nullable, the response's `topic` member is `null` for them, and the screens fall back to the
   stored `type`. No backfill guesses at a topic nobody chose. TC-02-INT-02.
5. **`accessKind` values already stored are never rewritten.** *Mechanism:* the column and its
   data are untouched; only the create path stops accepting the field. TC-02-INT-02.
6. **The five stored statuses stay accepted on `GET …/requests`.** *Mechanism:* `closed` is
   added to the accepted set rather than replacing anything, so a saved link resolves.
   TC-02-INT-17.
7. **No role gains visibility of any pre-existing row it cannot see today** — no vacation row,
   and no request it is not a party to. *Mechanism:* every capability this area adds is new; no
   existing capability changes meaning or grants.
8. **Every existing `Membership` query returns the same rows after spec 03 as before.**
   *Mechanism:* a client is never a `Membership` row, which the schema enforces rather than a
   rule. TC-03-INT-13.
9. **The login refusal body is unchanged for every case that remains a refusal.** *Mechanism:*
   the message is not rewritten; only the set of rows that can resolve a principal grows.
   TC-03-INT-04 pins the exact body observed before the change.
10. **Existing `Invitation` rows stay valid.** *Mechanism:* `clientId` is nullable and `role`
    was already a free-form `String`.
11. **`GET /api/me` keeps every member it answers with today.** *Mechanism:* `principal` and
    `client` are added; nothing is removed or renamed, and a staff caller's `role` still
    answers exactly as it does now. TC-03-INT-05.
12. **Adding a delivery channel later needs no migration.** *Mechanism:* `RequestNotification`
    carries `channel`, `providerKey` and `providerRef` from its first migration, and the port
    is declared before any adapter exists. TC-03-INT-30.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| Vacation requests are unified on the page but not in the model | The page delivers the single inbox, which is the user-visible goal; absorbing the ledger-bearing entity for a read-layer benefit is a poor trade this release | A future spec: a header row written in the vacation transaction plus a backfill migration, with the reserve math untouched |
| Nobody outside the product is told anything | The port, the outbox and every recipient decision ship and are tested; only the adapter is absent, and adding one writes no migration | An adapter spec that adds an email channel and its templates |
| No generic notification centre | The addressee learns from the sidebar badge and the list, the pattern already shipped for vacation | A future spec whose first consumers would be this area and the task watchers of user-management/14 |
| No registry of what was granted, and no cost | Knowing an access was granted is not the same as knowing who holds it and what the seat costs. That is asset accounting, not request handling | A future spec introducing `Grant`, fed from `granted` transitions, with a monthly cost and a revocation checklist on member removal |
| A client cannot raise a request | Spec 03 makes them an addressee only. A client asking *us* for something is natural and not built | Granting the create capability in `CLIENT_CAPABILITIES` and building the two screens; the model needs no change |
| A `client`-audience topic is curatable before anything can select it | The audience is what makes the catalogue's second half seedable and manageable before it is needed, and the mismatch refusal is a live, tested rule rather than a dormant one | Spec 03, which admits `client` topics to the picker |
| Spec 03's verification route is walked in two parts | Its unreachable states depend on a principal that does not exist yet. Everything independent of it was walked and is recorded as observed | Walking the remainder at the start of 03's implementation, on a branch with 02 merged |
| Login distinguishes "no such active principal" from "wrong password" by message | **Pre-existing**, found while probing and not introduced here | An amendment to user-management spec 02 making the two refusals identical |
| A person who is both staff and a client contact needs two addresses | Both membership tables hold `accountId @unique`, the same single-org constraint staff live under | The spec that makes them non-unique and adds a principal switcher — also what multi-org would need |

## Open bug investigations

Follow-ups this area owes, per [specs/bugs](../bugs/README.md).

- **[BUG-007](../bugs/BUG-007-request-topic-name-error-drawn-twice.md)** — `SPEC-GAP`. The
  Add topic modal hands the name error to the `@ds` `Input`, which renders it, and then draws
  it a second time beside the control to carry the `request-topic-error-name` id the spec
  names. Spec 02's UI Description rows state that the error is *present*, never that it is
  drawn once, so the E2E case selects the tagged node and passes over the duplicate. The
  report proposes the missing UI Description row and a DS-gaps row for the `errorId` the
  design system does not offer; both go into spec 02 before the fix.
