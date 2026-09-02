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
| 02 | [Client Participants](02-client-participants.md) | — | client, client-user, principal, invitation, capability-guard, navigation, session |

**The split is by principal, and each spec ends at a working product.** Spec 01 ships requests
between members of staff: a developer asks a colleague for an access, the colleague answers, the
developer confirms it works. Nothing in it is a stub. Spec 02 then makes a person at a client a
signed-in principal and lets a request be addressed to them.

Spec 01's route was walked in full before its cases were written and owes no test fixture.
**Spec 02's cannot be walked until 01 is merged** — the entity its cases hang off does not exist
yet — so its Verification Plan is explicitly in two parts and its unreachable rows say `not run`.

## Product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope of the entity | One `Request` with a `type` discriminator, not one entity per kind | A single inbox is the whole point: an addressee with three places to look checks none of them. The types that ship are `access` and `question`. |
| What `type` is in the database | A `String` column with a documented value set, not a Prisma enum | Adding a request type must not require a migration. Matches `Project.status` and `Client.status` (`apps/api/prisma/schema.prisma:719`, `:763`); the documents area's Prisma enums are the other convention in the tree and are not followed here for that reason. |
| Vacation requests | **Not** folded into `Request` in this release | `VacationRequest` (`apps/api/prisma/schema.prisma:680`) freezes `workingDays` and `deductionAmount` at submission and drives debit/refund rows in the reserve ledger. Absorbing it means editing transactional code that moves money, for a read-layer benefit. The page unifies; the model does not, yet. |
| Where the inbox lives | The existing `/org/{orgId}/requests` page becomes it | Rejected: a second page at `/inbox`. Two lists of things waiting for you is the problem, not the solution. The cost is an amendment to user-management spec 10, taken deliberately. |
| Who may open that page | Everyone; the *contents* are gated | Today `view-requests` gates the page itself, so a `user` cannot reach it at all (probed: `GET …/requests` as `user` → 403, and the sidebar row is not drawn). A person must be able to see requests addressed to them regardless of role, so the page opens for all and the org-wide vacation section keeps `view-requests` unchanged. |
| "Answered" vs "granted" | Two states, never one | "We'll do it tomorrow" is not an access. Collapsing them makes the blocking register lie within a week, and the blocking register is the reason the feature exists. |
| Who writes `granted` | The **requester**, not the addressee | Only the person who needs the access knows whether it works. An addressee who marks their own work done produces a register of intentions. Recorded dissent: in a flat organization where one person closes everything, this is friction; the mitigation is that an admin may always act for the requester. |
| Priority | A stored field, `low`/`normal`/`high`/`urgent` | Asked for explicitly. Recorded dissent: `blocking` is a checkable fact with a consequence and `priority` is a self-assessment, and two dials that both mean "urgent" tend to collapse into one and inflate together. Mitigation rather than removal — the default sort is non-terminal first, then `blocking`, then overdue, then priority (spec 01 requirement 43), so the checkable signals outrank the claimed one. |
| Overdue | Derived on read, never stored | `neededBy` in the past with a non-terminal status. Correctness therefore does not depend on a scheduler, matching the expiry rule in documents spec 02. |
| **How a client reaches the product** | **A session, like anyone else** | Rejected: a magic link and a thread-scoped token, of the kind documents spec 02 issues to a signer. That design was written and then discarded once the product decision was made that a client holds an account. Discarding it removed an entire unauthenticated surface, a rate limiter, a token table, four token-invalidation rules and the forwardable-link exposure — all of which existed only to serve a participant without an account. |
| **What links a client account to the organization** | **A `ClientMembership`, not a `Membership` with a fifth role** | `Membership` means "member of staff" at **35 query sites across 16 files** (`grep -rn "prisma\.membership\." apps/api/src`). A client row there would reach vacation accrual, the members list, project assignment and time tracking, where nothing crashes and everything is quietly wrong. The separate table cannot be read by any of those queries, so the property is enforced by the schema instead of by a rule every future author must remember. The cost is one branch in `CapabilityGuard`. |
| Client capabilities | A flat `CLIENT_CAPABILITIES` list, not a role table | There is one kind of client user. Inventing a role dimension for a set with one member produces a table nobody can populate a second row of. |
| Client invitations | Reuse `Invitation` with a nullable `clientId` and a `client` role value | The token, its SHA-256 storage, the seven-day expiry, supersession and the accept screen are all built and tested in user-management spec 03. A parallel invitation flow would be a second thing to get wrong. |
| Human-readable number | `Organization.nextRequestNumber`, allocated under a row lock | People refer to these out loud and in mail. Mirrors `Project.nextTaskNumber` (`apps/api/prisma/schema.prisma:719`), the accepted pattern in this tree. |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Every query scopes by `session.organizationId`, never the path `orgId`; cross-org access returns 404 | 01 | 02 |
| A request's `status` is written only inside a transaction that re-read the row with `FOR UPDATE`, and every transition writes its `RequestEvent` in that same transaction | 01 | 02 |
| `granted` is written by the requester or an admin; `declined` by the addressee or an admin; `cancelled` by the requester or an admin | 01 | 02 |
| Overdue is computed on read from `neededBy` and `status`; no column stores it and no job sets it | 01 | 02 |
| Neither spec adds an unauthenticated route, a token or a rate limiter | 01, 02 | — |
| An account holds an active `Membership` or an active `ClientMembership`, never both | 02 | — |
| Capability is resolved from the principal kind first, then from the role | 02 | — |
| Capability checks on a staff role run against `normalizeRole()` (`packages/validation/src/roles.ts`) | 01 | 02 |
| Every new capability is registered in **both** `Capability` and `MemberCapability` | organization/01 | 01, 02 |
| No outbound call runs inside a database transaction | documents/04 | 02 |

## New infrastructure introduced by this area

None. No new AWS service, no queue, no scheduled job, no public surface. Spec 01 does not touch
`MailService` at all; spec 02 adds two message types to it.

## Cross-Spec Side Effects

| Trigger | Source | Effect | Target |
|---------|--------|--------|--------|
| Member soft-deleted | user-management/04 | Requests they raised or hold are retained and readable; open requests **addressed to** them are flagged `assigneeInactive`, which draws the reassign banner and control on the request's detail screen (there is no reassignment filter — spec 01 requirement 42 enumerates the filters exhaustively) | 01 |
| Member soft-deleted | user-management/04 | Their open requests are **not** auto-cancelled — an access already asked for may still be needed by whoever takes over | 01 |
| Project archived | user-management/11 | Existing requests keep the project and remain readable; the project is no longer offered in the new-request picker | 01 |
| Client archived | organization/01 | Its users keep their sessions and their open requests; the client is not offered for new work | 02 |
| Client user removed | 02 | Sessions revoked via `securityStamp`; open requests addressed to them flagged for reassignment | 02, user-management/02 |
| Client invitation sent | 02 | Supersedes any live pending invitation for that address in the organization, staff or client | user-management/03 |
| Organization created | user-management/01 | `nextRequestNumber` starts at 1 | 01 |

## Dependency Graph

```
user-management/04 (Membership, soft delete)  ─┐
user-management/10 (Requests page)            ─┼─►  requests/01  ─┐
user-management/11 (Projects)                 ─┘                  │
                                                                  ├─►  requests/02
organization/01   (Client)                    ─┐                  │
user-management/03 (Invitation, token)        ─┴──────────────────┘
```

Everything 01 depends on is implemented and merged. `organization/01` landed in PR #9
(`apps/api/prisma/migrations/20260901120000_spec_org_01_clients`). **02 depends on 01 being
merged and running**, not merely written.

## Blast Radius

### Spec 01

**Database.** Three new tables (`Request`, `RequestMessage`, `RequestEvent`) and one new column
on an existing one (`Organization.nextRequestNumber`, `Int @default(1)`). No column is altered,
renamed or dropped, and no existing table gains a `NOT NULL`. *Mitigation:* the migration is
additive. Note the deploy order, read from `infra/deploy.sh` rather than from prose about it:
the migration runs **before** `tf apply` rolls the services out, so there is a window in which
the new schema is live and the **previous** code is still serving. Three unreferenced tables and
one defaulted column are invisible to that code.

**`apps/api/src/requests/` stops being a read-only projection.** `RequestsService` today is a
single method that aggregates `VacationRequest` rows and hard-codes `type: 'vacation'`. It gains
a writer, a state machine and a thread. *Mitigation:* the vacation aggregation moves unchanged
into `VacationRequestFeedService` and the controller composes two sources, so the existing
behaviour has one owner and the new code cannot regress it.

**The Requests page stops being capability-gated.** `apps/web/app/org/[orgId]/requests/page.tsx`
and the sidebar row currently render only for `view-requests`. *Mitigation:* the gate moves
inward — the vacation section and the All scope keep their capability, so no role sees anything
it cannot see today. TC-01-INT-18 and TC-01-E2E-08 assert exactly that.

**Sidebar navigation.** `apps/web/src/layout/Sidebar.tsx` composes its groups from capabilities.
The Requests row moves out of the `view-requests` branch. *Mitigation:* the row becomes
unconditional for a signed-in member, so the "no dead links" rule holds by construction.

**`packages/validation`.** Three new capabilities in `MemberCapability` **and** `Capability`,
plus **30 new keys on the existing `REQUEST_MESSAGES`** (`packages/validation/src/index.ts:1746`,
which already holds spec 09's 21 vacation keys). None of the 30 collides, so the const is
extended in place — it is not a new export, and a second one must not be created.
*Mitigation:* `CAPABILITY_MATRIX` is keyed by role and typed against the union, so adding a
member fails compilation until every role is revisited; for the messages, the existing importers
(`apps/web/app/org/[orgId]/requests/page.tsx`,
`packages/validation/src/vacation-requests.test.ts`) keep compiling because no key is renamed or
removed, which is also what forbids the rename this spec would otherwise invite.

**`parseRequestStatusFilter` (`packages/validation/src/index.ts:1878`).** Spec 01 retires its
five-value vocabulary on `GET …/requests` and makes an unknown value a 400 instead of a silent
fallback to `pending`. *Mitigation:* every caller is enumerated in spec 01 requirement 42 and
changed with it; the fallback's removal is pinned by TC-01-INT-22.

### Spec 02

**The meaning of a signed-in principal.** Until now every session belonged to a member of staff.
*Mitigation:* the new principal lives in its own table, so the 35 `prisma.membership.*` call
sites across 16 files keep their present meaning without being visited, and TC-02-INT-09 asserts
that against the surfaces where a wrong answer would be silent rather than loud.

**`CapabilityGuard` gains a branch.** `apps/api/src/auth/capability.guard.ts` currently answers
403 whenever no `Membership` is found. *Mitigation:* the second branch is added in the one place
capability is decided, and the fall-through still fails closed.

**The login service.** It refuses an account with no active `Membership` — observed:
`400 {"message":"Your account has been deactivated. Contact your administrator."}`. *Mitigation:*
the refusal body is unchanged for every case that is still a refusal, pinned by TC-02-INT-07 and
AC-11, so the change cannot become an account-existence oracle it was not already.

**`nav-members` is drawn unconditionally** (`apps/web/src/layout/Sidebar.tsx:71`), so a
non-staff principal would see the staff list. *Mitigation:* this is a real defect against the
existing "no nav item a role cannot use" rule the moment such a principal exists, and spec 02
fixes it rather than carving it out. TC-02-E2E-05 is the regression witness that the fix did not
over-reach and remove it from staff.

**`MailService` breaks on contact.** It is an abstract class, so adding two message types forces
`ConsoleMailService`, `InMemoryMailService`, the SES transport and
`apps/api/src/mail/test-mail.controller.ts` to change in the same commit — as documents spec 02
did. *Mitigation:* named here so it is expected; `MAIL_MESSAGE_TYPES` is the single list all four
read.

**`Invitation` gains a nullable `clientId` and a new `role` value.** *Mitigation:* both are
additive; every existing row stays valid, and spec 03's supersession index is reused rather than
duplicated.

## Backward Compatibility

1. **Every migration in both specs is additive** — four new tables and five new columns, each
   nullable or defaulted. No rename, no drop, no new `NOT NULL` on an existing table.
   *Mechanism:* `infra/deploy.sh` migrates before it rolls the services out, so the guarantee
   that matters is that the **previous** code keeps working against the new schema; unreferenced
   tables and nullable columns satisfy it by construction, and a rollback of the application
   needs no rollback of the schema.
2. **`Organization.nextRequestNumber` has `@default(1)`**, so organizations that predate the
   column need no backfill. *Mechanism:* the column default, applied by Postgres at migration
   time.
3. **`VacationRequest` gains no column, no write and no transaction.** Its *read* query gains
   one thing: the status mapping of spec 01 requirement 42, which selects which vacation rows
   a filtered page returns. The rows themselves, and the JSON of each, are unchanged.
   *Mechanism:* the vacation feed's code moves file, and the only behaviour added to it is the
   mapping; `e2e/tests/vacation-requests.spec.ts` runs unchanged as the regression witness, and
   TC-01-INT-20 pins the row shape. `e2e/tests/requests-page.spec.ts` is **not** an unchanged
   witness — spec 01 requirement 42 changes it to select the `open` filter explicitly, because
   its regression guard depends on the default view excluding acted-on rows and the default
   becomes `all`. An earlier draft of this section claimed "not a query" and that both E2E specs
   run unchanged; both were false once the status vocabulary was unified, and the claim is
   corrected here rather than in the code.
4. **`GET /api/organizations/{orgId}/requests` keeps its current response shape for vacation
   rows**, byte-identically. *Mechanism:* the vacation branch serializes through the unchanged
   mapper; TC-01-INT-20 compares against the shape the existing E2E asserts today.
5. **No role gains visibility of any pre-existing row it cannot see today** — no vacation row,
   and no request it is not a party to. *Mechanism:* the page-level capability check is
   replaced by two inner ones whose grants are identical to today's `view-requests` grants.
   Two deliberate changes are **not** exceptions to this and are named so nobody reads them as
   violations: spec 01 requirements 37 and 38 give every role the Requests page, its nav row
   and their **own** requests, which is the purpose of that spec; and the `status` default of
   `all` (requirement 42) means a manager's *default* vacation view now shows every row rather
   than only pending ones. The manager could already see those rows today by choosing the "All"
   filter, so what changed is the default view, not the permission.
6. **Every existing `Membership` query returns the same rows after spec 02 as before.**
   *Mechanism:* a client is never a `Membership` row. TC-02-INT-09.
7. **The login refusal body is unchanged for every case that remains a refusal.** *Mechanism:*
   the message is not rewritten; only the set of rows that can resolve a principal grows.
   TC-02-INT-07 pins the exact body observed before the change.
8. **Existing `Invitation` rows stay valid.** *Mechanism:* `clientId` is nullable and `role`
   was already a free-form `String`.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| Vacation requests are unified on the page but not in the model | The page delivers the single inbox, which is the user-visible goal; absorbing the ledger-bearing entity for a read-layer benefit is a poor trade this release | A future `03-vacation-in-requests.md`: a header row written in the vacation transaction plus a backfill migration, with the reserve math untouched |
| No generic notification centre | The addressee learns from the sidebar badge and the list, the pattern already shipped for vacation; a cross-cutting inbox is a bigger subsystem with more consumers than this one | A future spec whose first consumers would be this area and the task watchers of user-management/14, which are data-model-only today |
| No registry of what was granted, and no cost | Knowing an access was granted is not the same as knowing who holds it and what the seat costs. That is asset accounting, not request handling | A future spec introducing `Grant`, fed from `granted` transitions, with a monthly cost and a revocation checklist on member removal |
| A client cannot raise a request | Spec 02 makes them an addressee only. A client asking *us* for something is natural and not built | Granting `CreateRequest` in `CLIENT_CAPABILITIES` and building the two screens; the model needs no change |
| Spec 02's verification route is walked in two parts | Its unreachable states depend on an entity spec 01 creates. Everything independent of 01 was walked and is recorded as observed | Walking the remainder at the start of 02's implementation, on a branch with 01 merged |
| Login distinguishes "no such active principal" from "wrong password" by message | **Pre-existing**, found while probing spec 02 and not introduced by it | An amendment to user-management spec 02 making the two refusals identical |
| A person who is both staff and a client contact needs two addresses | Both membership tables hold `accountId @unique`, the same single-org constraint staff live under | The spec that makes them non-unique and adds a principal switcher — also what multi-org would need |
