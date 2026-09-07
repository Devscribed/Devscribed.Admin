# Pre-implement — specs/requests/02-request-topics.md (refine probe)

Run `refine-requests-02-1`. Nothing is implemented and nothing will be implemented from this
plan; the question is whether the spec compiles into one. It very nearly does. The plan is in
`handoff.json`: eight tasks, thirty requirements assigned, thirty-three cases claimed,
twenty-two `##` headings across the three bundle files accounted for by name.

**Verdict: blocked.** Two findings stop it — one contradiction, one unreachable verification
state — plus three lesser ones a person should settle in the same sitting.

## What already exists to build on

| What the spec needs | Where it already lives |
|---|---|
| Path `orgId` checked, never a selector; 404 not 403 | `apps/api/src/auth/org-scope.guard.ts:20` |
| Session attach + `securityStamp` re-read per request | `apps/api/src/auth/session.guard.ts` |
| A capability check in the **service** when the spec names the 403 body | `apps/api/src/holidays/holidays.controller.ts:19`, `apps/api/src/requests/requests.controller.ts:28` |
| `normalizeRole()`, legacy `member` → `user` | `packages/validation/src/roles.ts:37` |
| Capability in both unions, matrix keyed by role so a new member breaks compilation | `packages/validation/src/index.ts:506`, `:613`; `roles.ts:51`, `:108` |
| Case-insensitive per-org uniqueness as a functional index, `P2002` → 409 | `migrations/20260901120000_spec_org_01_clients/migration.sql:30` (also Project, BoardColumn, TaskLabel) |
| Soft delete: `status` + `archivedAt` + `archivedByAccountId`, cleared on restore | `schema.prisma:784` (`Client`) |
| `FOR UPDATE` re-read inside the writing transaction, guard evaluated against that read | `requests.service.ts#lockRequest`, `requests.service.ts:352` |
| Strict query vocabulary — unknown value is 400, never a default | `packages/validation/src/requests.ts:456`, `requests.service.ts:167` |
| Settings nav row gated on a capability, group dropped when empty | `apps/web/src/layout/Sidebar.tsx:155-180` |
| A settings page that renders nothing for a role without the capability | `settings/holidays/page.tsx:173` |
| Integration tests reading columns the API does not return | `apps/api/test/holidays.spec.ts:10`, `:48` |
| `signupOrg`, `inviteAndAcceptViaApi`, `setMembershipRole` | `e2e/tests/helpers.ts:734`, `:921`, `:160` |

Every path above was opened. The Verification Plan's claims about the helpers are true.

## What must be built from zero

The `RequestTopic` table, its functional unique index and the migration's backfill.
`apps/api/src/request-topics/` entire — no topics code exists. `REQUEST_TOPIC_MESSAGES` and
the topic validators. The status label map (today the words are two definitions across three
web surfaces and the API has none). The `closed` filter value and its expansion, on both the
request list *and* the vacation section. `Request.topicId` / `topicLabel` and the `topic`
member of every request response. The Settings screen, its modal, its audience switch and its
reorder control. The About picker and its empty state. The list's About column and topic
filter. `manage-request-topics` / `ManageRequestTopics` in both unions.

And two things the spec asks for that have no route to exist: a database state where an
organization predates the topics migration (P2), and a reorder contract (P1).

## Sweeps

**Contradiction.** One found — P1, the reorder. See below.

**Premises.** Fourteen recorded in `handoff.json`, each against the file that implements it.
Eleven hold. Two are refuted (P2, P5). One is partial and is the pipeline observation below.

**External claims.** None. The spec depends on no third-party system, no key, no MCP server
and sends no mail; the Access table in `.cases.md` says so and nothing in the bundle
contradicts it. No `doubleBehaviours`.

**Call sites.** `organization.create` has exactly one call site in the tree
(`signup.service.ts:46`), so REQ-02-015's "when an organization is created" has one place to
hold rather than a family. The status words have three reading surfaces and two definitions
(`page.tsx:35`, `RequestRow.tsx:8`, and `[requestId]/page.tsx:18` importing the second) —
which is the drift REQ-02-028 exists to end. The bodies that break by design are at
`apps/api/test/requests.spec.ts:157,293,388,401`, `e2e/tests/requests.spec.ts:109,210,277,284`
and `NewRequestModal.tsx:176-177,277,293`; the spec's blast radius names those three files and
**not** `packages/validation/src/requests.test.ts:332-360`, which also drives
`validateNewRequest` with a `type` and no topic. That is an omission in a mitigation, not a
defect — it is in T1's file list.

**Writers.** `RequestTopic` is written by create, rename, reorder, archive, restore, the
signup seed and the migration backfill. Every writer of an existing row takes
`SELECT … FOR UPDATE` in its transaction (invariant 3). `Request.topicLabel` has exactly one
writer, the create path, in the same transaction as the row.

**Messages.** Fifteen rows mapped to an export and an emitter. The four new `REQUEST_MESSAGES`
keys were checked against `index.ts:1807-1870` line by line — none collides.
`REQUEST_TOPIC_MESSAGES.typeUnknown` and the existing `REQUEST_MESSAGES.typeUnknown`
(`index.ts:1841`, "Choose a request type") are different objects and both stay.
`manageForbidden` cannot come from `CapabilityGuard` — P5.

**Verification.** Every row of the Verification Plan marked *created here* becomes a case that
drives the real transition. The one row that is neither reachable nor createable is P2.

**Sections.** All twenty-two, by name, in `handoff.sections`.

## Findings

### P1 — blocker · the reorder writes one row and many rows

`Known Gaps` row 4: *"a reorder rewrites the affected rows in one transaction."*
`DS gaps` row 1: up and down controls on each row, *"each issuing one `PATCH`."*
`Routes`: `PATCH …/request-topics/{topicId}` *"Accepts `name` and `sortOrder`"* — one row, and
it is the only write route that touches ordering.

No implementation satisfies all three. A single-row `PATCH` cannot rewrite *the affected rows*
in one transaction; a transaction that rewrites two rows cannot be reached through any route
the spec publishes. Nor does anything say what a press of the up control **sends**: with the
seed at 10, 20, …, 90, moving `Other` (90) above `Question` (80) is either the client computing
`79` and writing one row, or the server swapping the pair. Both satisfy every sentence of the
spec and they differ where it matters — under the second, two curators reordering at once
serialize on two locked rows; under the first they do not collide at all and the catalogue can
end with two topics at the same `sortOrder`, whose order then falls to the name tiebreak
(REQ-02-009) rather than to what either curator dragged. And nothing pins it: `reorder` appears
in the permission matrix, the actor table and two rows of the State Machine, and in **no**
numbered requirement and **no** test case.

### P2 — blocker · TC-02-INT-02 names a database state the integration harness cannot produce

TC-02-INT-02 is the only observer of AC-2 ("an organization that existed before this spec has
the same catalogue after the migration, with no request rewritten"). Its steps:

> Against a database holding an organization and at least one request created before this
> migration, **run the migration**, then read the catalogue for that organization.

`apps/api/test/global-setup.ts:28` runs `npx prisma migrate deploy` before the suite starts —
it is declared as `globalSetup` in `apps/api/jest.config.js` — and workers 2..N are `CREATE
DATABASE … TEMPLATE` copies of the migrated database. Every migration is therefore already
applied when the first test body runs, and there is no route back: no test can create an
organization that predates a migration that has already run, and no test can run the migration
again. The Verification Plan's own row for this state points at `e2e/global-setup.ts` — the
E2E harness — for a case that is declared Integration, and marks it *not run*.

The state is not merely unproven; it has no way to exist. The two implementations an author
will reach for diverge: (a) delete the org's seeded `RequestTopic` rows, insert legacy-shaped
`Request` rows, then execute a **copy** of the backfill SQL pasted into the test — which
passes while the shipped migration is wrong, since the copy is the thing under test; or (b)
open a second database, apply migrations up to the one before, seed, then apply the last one —
which nothing in the harness supports today. AC-2 is unobservable until the spec says which.

### P3 — major · the amended list drops the Type filter, or does not

REQ-02-003's rationale: *"the list's type filter already turns on this distinction, so a topic
that could not declare it would leave the filter guessing"* — the type filter is the stated
reason `RequestTopic.type` exists at all. The amended list wireframe draws
`( Mine | All )  About [ Any ▾ ]  Status [ … ]  Project [ Any ▾ ]  🔍` — no Type control. The
testid table adds `requests-topic-filter`, never mentions `requests-type-filter`, and is
explicit about removal only for the modal's two controls ("`request-new-type` and
`request-new-access-kind` are **removed**").

`requests-type-filter` exists today at `apps/web/app/org/[orgId]/requests/page.tsx:338` with
options All types / Access / Question / **Vacation**, and its `vacation` value is not a filter
but the *section selector* of requests spec 01 (requirement 41), pinned by
`apps/api/test/requests.spec.ts:1294-1303`. So: keep the control and the wireframe is wrong;
drop it and the vacation section becomes unreachable from the page that spec 01 built to be the
one inbox, with no requirement, no case and no Blast Radius line recording the loss. Two
readings, both consistent with the text, observably different on the shipped screen.

### P4 — minor · `GET …/request-topics?status=` has no stated behaviour for an unknown value

The contract gives `status` three values with `active` as the default, and REQ-02-002 plus
TC-02-INT-04 make an unknown **`audience`** a 400 with a stated reason: *"a typo in a query
string cannot look like an empty catalogue."* The identical argument applies to `status` and
the spec is silent, so `?status=activee` either 400s or quietly returns the active catalogue.
The repository's habit is the former (`parseRequestStatusQuery`, `requests.ts:456`, returns
`null` for an unknown value and `requests.service.ts:167` turns that into a 400), which makes
the silence look like an omission rather than a decision. Related and equally silent: Validation
Rule 6 says an out-of-range `sortOrder` is *clamped* — a deliberate departure from that same
habit — and says nothing about a non-integer.

### P5 — minor · the guard named for the topic routes cannot carry the message required of them

Every topic write row of the Routes table lists `ManageRequestTopics` in the **Guards** column
and `403 REQUEST_TOPIC_MESSAGES.manageForbidden` in the **Errors** column.
`CapabilityGuard` — the only reader of `@RequireCapability`
(`apps/api/src/auth/require-capability.decorator.ts:14`) — throws a fixed body,
`TEMPLATE_MESSAGES.generic.forbidden` = *"You do not have permission to manage templates"*
(`apps/api/src/auth/capability.guard.ts:63` → `packages/validation/src/documents.ts:125`).
Wired as the table reads, TC-02-INT-07 fails on the message.

There is a way out and the plan takes it — check in the service, which is what
`HolidaysController` (`:19`) and `RequestsController` (`:28`) already say in as many words —
so this is not a blocker. It is listed because a reviewer reading the Guards column will call
the service-side check a deviation, and because the same sentence would be free to write
correctly.

## What the pipeline's coverage gate cannot see here

`node scripts/handoff-coverage.mjs` was run against this handoff. It passes, and its pass means
less than it looks:

```
handoff-coverage: pass  (specs/requests/02-request-topics.md)
  requirements 0/0  cases 0/0  sections 8/8
```

`scripts/handoff-coverage.mjs:70` matches numbered requirements as `/^(\d+)\. /m`; this spec
numbers its requirements as `#### REQ-02-001` headings, so it finds none. `:85` matches
`### TC-*` in `run.spec` **alone**; every case of this spec lives in
`02-request-topics.cases.md`, so it finds none of the thirty-three. Only the main file's eight
`##` headings are checked, so the contracts file's twelve and the cases file's two are
unguarded.

The counts in this report were therefore compiled by hand and re-checked with a throwaway
script: **30/30 requirements** assigned to a task, **33/33 live cases** claimed, **22/22
sections** accounted, **27/27** required `data-testid`s carried. For a bundled spec the gate is
not a witness, and a future run should not read its green as coverage.

## Plan shape

Eight tasks, ordered by dependency: `T1` validation (vocabulary, messages, label map, both
capability unions) → `T2` schema and the single additive migration → `T3` the topics module →
`T4` signup seeding → `T5` the requests API amendments → `T6` the Settings screen and nav row →
`T7` the requests screens → `T8` cases and the callers this spec breaks by design. The
migration note is read from `infra/deploy.sh:183-188`: migrate from the new image first, roll
the services second, so the previous code serves against the new schema — an unreferenced table
and two nullable columns are invisible to it.

`T3`'s reorder and `T8`'s TC-02-INT-02 are written as far as the spec allows and are the two
places the run stops.
