# Pre-implement — requests/02 Request Topics & Vocabulary

**Run** `refine-requests-02-2` (refine probe — nothing is implemented from this plan)
**Spec** `specs/requests/02-request-topics.md` · sha256 `e533fe70…9674`
**Bundle** `02-request-topics.contracts.md` `0d873d42…7432`, `02-request-topics.cases.md` `5051a3a8…dadd`
**Verdict** `blocked` — 4 blockers, 4 notes. The plan below is complete for everything else.

---

## What this is

Nine tasks, T1–T9. The whole of the spec compiles into them except four points that an
implementer would have to settle by guessing, and settling those is a person's job. The
handoff is written anyway, so that when the four are answered the plan is ready rather than
restarted.

`node scripts/handoff-coverage.mjs` passes. **It passes vacuously on two of its three
checks, and that is worth recording**: the script counts requirements by matching `^\d+\. `
inside the `## Functional Requirements` section, and this spec numbers its requirements as
`#### REQ-02-001` headings — nought matches. It counts live cases by matching `^### TC-`
in the file named by `run.json`, and this spec's 34 cases live in the bundle member
`02-request-topics.cases.md` — nought matches there too. Only the section check did any
work. A bundled spec of this shape is invisible to the requirement and case halves of the
gate, so `requirementsIndex` and `testCaseOwners` in the handoff answer both by hand.

---

## What already exists to build on

| What | Where |
|---|---|
| Org scoping, 404 not 403, path `:orgId` never a selector | `apps/api/src/auth/org-scope.guard.ts:22` |
| Session attach and `securityStamp` re-read per request | `apps/api/src/auth/session.guard.ts` |
| The reason a named refusal message is checked in the service, not by the guard | `apps/api/src/auth/capability.guard.ts:64` (fixed `TEMPLATE_MESSAGES.generic.forbidden`), precedent stated at `apps/api/src/holidays/holidays.controller.ts:22-26` and `apps/api/src/requests/requests.controller.ts:27-31` |
| `normalizeRole()` — the legacy `member` column value resolves to `user` | `packages/validation/src/roles.ts:37` |
| A capability registered in both unions | `packages/validation/src/index.ts:506`, `packages/validation/src/roles.ts:51` |
| The hand-written functional case-insensitive unique index Prisma cannot express | `apps/api/prisma/migrations/20260901120000_spec_org_01_clients/migration.sql:30` |
| A guard evaluated against a `FOR UPDATE` read inside the writing transaction | `apps/api/src/requests/requests.service.ts:79` (`TRANSITIONS`), `#lockRequest` |
| `FOR UPDATE` allocation on the `Organization` row inside the creating transaction | `apps/api/src/requests/requests.service.ts:432` |
| `REQUEST_MESSAGES`, one export, extended in place | `packages/validation/src/index.ts:1807` |
| `vacationStatusesFor` — an exhaustive switch, so `closed` cannot be forgotten silently | `packages/validation/src/requests.ts:479` |
| A capability-gated Settings row, empty group dropped label and all | `apps/web/src/layout/Sidebar.tsx:155-181` |
| The identical two-value switch, already on a DS primitive | `apps/web/app/org/[orgId]/requests/page.tsx:321-331` (`Tabs`) |
| The states the cases need | `e2e/tests/helpers.ts` — `signupOrg:734`, `inviteAndAcceptViaApi:921`, `setMembershipRole:160`, `login:765` |
| Two concurrent calls fired without awaiting the first | `apps/api/test/requests.spec.ts:343`, `:586` |
| The only place an `Organization` row is created | `apps/api/src/signup/signup.service.ts:46`, inside the transaction opened at `:42` |

## What must be built from zero

- The `RequestTopic` table, its functional unique index, and the migration that backfills
  every existing organization.
- The topics controller and service. Six routes, none of which exists.
- `REQUEST_TOPIC_MESSAGES`, the four topic validators, the order validator, the comparator.
- The exported status label map and its closure sub-label. Today two private maps hold the
  words, in `page.tsx:35` and `RequestRow.tsx:8`, and both say `Open` / `Answered` /
  `Granted` where the spec says Pending / In progress / Completed.
- `expandRequestStatusQuery` and the `closed` value across the query vocabulary and the
  vacation mapping.
- **Seed-on-read.** This is the first read path in the repository that writes, and it is
  where blocker P3 sits.
- The Settings › Request topics screen, its audience switch, its reorder controls.
- The topic picker and the empty-catalogue state in the new-request modal.
- `apps/api/test/request-topics.spec.ts` and `e2e/tests/request-topics.spec.ts`.

---

## Sweeps

**Contradiction.** Four absolute claims were run against the call sites they forbid.
REQ-02-001 ("every read and write … scoped by `session.organizationId`") is satisfiable —
no existing query touches the new table. REQ-02-014 ("no route that removes a
`RequestTopic` row") holds; the `SetNull` on `Request.topicId` therefore never fires in
product code, and TC-02-INT-02 reaches it only by deleting rows directly. Invariant 4
("`topicLabel` … written once, and no topic write may alter it") holds by construction:
the four other writers of a `Request` row — `patchRequest`, `transition`, `postMessage`,
`reassignRequest` — touch neither new column. REQ-02-028's absolute first clause is the
one that does not hold; it is blocker **P2**.

**Premise.** Nineteen claims checked against the files that implement them. Eighteen hold —
they are listed in `handoff.premises` with the path and line for each, including the deploy
order (`infra/deploy.sh:183-188`), the web-only skip (`:168`), the `Client` index device,
the two private status maps, the four `accessKind` call sites in `apps/api/test`, the three
in `e2e/tests`, and the shared-`createdAt` assertion of TC-02-INT-01 (Prisma emits
`DEFAULT CURRENT_TIMESTAMP` and Postgres scopes it to the transaction, so the assertion is
checkable). One is stale: note **P8**.

**External claims.** None. The Verification Plan's access table is a single row saying this
spec depends on no third-party system, no API key and no MCP server, and sends no mail.
Confirmed against the tree — nothing here reaches the network. `doubleBehaviours` is
therefore empty, and it is empty because there is nothing to double, not because the sweep
was skipped.

**Call sites.** REQ-02-028's "the list, the detail screen and the filter control" was
enumerated rather than trusted. Four surfaces render a request status today:
`RequestRow.tsx:8`, `page.tsx:35`, `[requestId]/page.tsx:183`, and
`[requestId]/RequestHistory.tsx:27`. The spec names three. The fourth is **P2**.
REQ-02-015's "when an organization is created" has exactly one call site,
`signup.service.ts:46`.

**Writers.** Recorded per task in `concurrency`. `RequestTopic` has eight writers — five
handlers, the read-path seed, the signup seed and the migration — and the spec's invariant 5
requires a row lock from each writer of an existing row. The reorder handler locks a whole
audience, which is why the plan pins the lock order to `id` rather than to the body's
`topicIds`: two concurrent reorders sent in different orders would otherwise deadlock, and
edge case 12a ("the later one wins whole") assumes they do not.

**Messages.** Sixteen rows named, each with its module and its emitting route.
`REQUEST_TOPIC_MESSAGES` is genuinely new. The four new `REQUEST_MESSAGES` keys were checked
against `index.ts:1807-1885` one by one — none collides, so the export is extended in place
and a second one must not be created. `REQUEST_TOPIC_MESSAGES.typeUnknown` and the existing
`REQUEST_MESSAGES.typeUnknown` are different keys on different exports; that is legal and
is called out so a reviewer does not read it as a duplicate. `REQUEST_MESSAGES.fieldImmutable`
is reuse, not a new row: `PATCH …/requests/{id}` already answers with that exact text, so
REQ-02-024 is one entry added to `IMMUTABLE_REQUEST_FIELDS`.

**Verification.** Every state the cases need is reachable through fixtures that exist —
except one. TC-02-INT-22's closing step, "force the transaction to fail partway", names no
mechanism, and the Verification Plan's own table of states does not list it. That is blocker
**P4**.

**Sections.** All eight `##` headings of the spec and all fourteen of the two bundle members
are answered by name in `handoff.sections`.

---

## Findings

### Blockers

**P1 — `spec/contradiction` — REQ-02-002 against REQ-02-004 and both message tables.**
REQ-02-002 says a **create or rename** call carrying an audience outside `staff` and
`client` answers `400 audienceUnknown`. REQ-02-004 says a rename carrying an audience
different from the stored one answers `400 audienceImmutable`. `partner` is both. The
contracts Routes table lists, for `PATCH …/request-topics/{topicId}`, exactly
`nameRequired`, `nameTooLong` and `audienceImmutable` under `400`; the Error Messages table
lists `audienceUnknown`'s routes as the GET, the POST and the order route and **not** the
rename route. So the requirement says one message and both tables say the other, for one
input, and no case sends it — TC-02-INT-06 sends only `staff` and `client`, TC-02-INT-04
only creates and reads. Both implementations pass every case in the bundle.

**P2 — `spec/ambiguous-requirement` — REQ-02-028, and the fourth surface.**
The requirement's first clause is absolute: "THE SYSTEM SHALL render `open` as Pending …
`granted` as Completed". Its second clause names three readers: the list, the detail screen
and the filter control. `apps/web/app/org/[orgId]/requests/[requestId]/RequestHistory.tsx:27`
renders `` `${actor} marked it ${event.newValue}` `` — a raw stored status — and it is drawn
on the detail screen. TC-02-UNIT-05's stated purpose, "so no status can render as a raw
column value", argues one way; the enumeration of three surfaces argues the other. In
TC-02-E2E-04 the reader opens the cancelled request and sees a header reading
`Closed · cancelled` above a history line reading `Pat marked it cancelled` — or
`Pat marked it Closed`, depending on which reading was implemented. No case observes the
line, so the choice is invisible until a person opens the screen.

**P3 — `spec/silent-on-concurrency` — REQ-02-016 makes a read a writer and gives it no rule.**
Every other writer in this spec has a concurrency rule: invariant 3 for archive and restore,
edge case 12 for two archives, 12a for two reorders, edge case 1 for two renames. The seed
has none. Two concurrent first reads of an organization holding no topics — which a single
page load produces, since the picker reads `status=active` and the topic filter reads
`status=all` (TC-02-E2E-03 requires exactly that split) — both find no row and both insert,
and the functional unique index on `(organizationId, audience, LOWER(name))` fails the
loser. One implementation writes `ON CONFLICT DO NOTHING`, re-reads and answers `200`;
another lets the violation escape as a `500` on a read path. AC-2 rides on this, and no case
in the bundle fires two reads at once.

**P4 — `spec/unverifiable-case` — TC-02-INT-22 cannot be run as written.**
Its closing step is "send a valid list and force the transaction to fail partway", and its
expected result is the atomicity half of AC-17. Nothing in the repository can do it.
`apps/api/src/test-support/` holds three files — `envelope-expiry.controller.ts`,
`signwell-stub.controller.ts`, `fixture-gate.ts` — and none injects a fault. The Verification
Plan's "Reaching the states the cases need" table, which lists every other state the cases
require and says whether it exists today, does not list this one. The nearest available
device, a Jest spy over `PrismaService.$transaction`, replaces the transaction rather than
exercising it, so it proves nothing about a rollback Postgres never performed. AC-17's other
observer, TC-02-E2E-01, watches a reorder survive a reload and says nothing about atomicity.

### Notes

**P5 — the `topic` member's shape when the label outlives the row.** The contracts say
`topic` is `{ id, name, audience, type, status }`, that `name` is the snapshot `topicLabel`,
and that `status` is `null` when the row is gone. They do not say what `id`, `audience` and
`type` are in that state. TC-02-INT-02 reaches it — it deletes every topic row, and the
`SetNull` on `Request.topicId` fires — and asserts only `name` and `status`. Any of `null`,
the stored value and an absent key satisfies the text.

**P6 — the topics read refuses an unknown `audience` and says nothing about an unknown
`status`.** TC-02-INT-04's reasoning is "a typo in a query string cannot look like an empty
catalogue", and it applies equally to `?status=activ`. The sibling endpoint 400s every
unknown query value (`requests.service.ts:163-172`); this one has no rule, so a defaulting
implementation is not refutable from the spec.

**P7 — "archive and re-create is the honest path" is not walkable for the case it is
offered for.** The Known Gaps row for the immutable `type` offers it, and REQ-02-006 plus the
unconditional functional unique index forbid re-creating with the same name while the
archived row still holds it — validation rule 6 says "whatever its status" for the reorder
list and rule 5 says nothing of the kind for the name, so uniqueness spans both statuses.
The remedy therefore costs the topic's word, which the gap row does not say. REQ-02-004's
identical phrase is fine: uniqueness is per audience, and that remedy re-creates in the other
one.

**P8 — the DS gaps row for the segmented control is stale.** It says a segmented-control
primitive is missing and prescribes two hand-rolled `Button`s, closing with "adopted by this
screen and the requests scope toggle together". The requests scope toggle is not hand-rolled:
`apps/web/app/org/[orgId]/requests/page.tsx:321-331` builds it from `Tabs`, which `@ds`
exports and which carries a `testId` per item. CLAUDE.md's rule is that anything missing goes
*into* the design system and is never improvised per screen, so the prescription and the
sibling screen disagree about the same control.

---

## What the plan encodes

- **One migration, additive.** New table, two nullable columns, one insert. The task's
  migration note is read from `infra/deploy.sh:183-188`, not restated from prose: the
  migration runs as a one-off task on the new image and *then* the services are applied, so
  the previous code serves against the new schema for a window — an unreferenced table and
  two nullable columns are invisible to it. `deploy.sh:168` skips the step entirely on a
  web-only deploy, which is a second reason REQ-02-016 puts the mechanism on the read path.
- **Org scoping.** `organizationId` is a required argument with no default on every method;
  the path `:orgId` is checked and never selected on; a mismatch is 404. The one deliberate
  exception is `POST …/requests`, which answers `400 topicUnavailable` for an archived
  topic, another organization's topic and an id naming no row, with one identical body.
- **Roles.** Every check runs through `normalizeRole()`, so the database's `member` resolves
  to `user` and is refused. The capability is registered in **both** unions.
- **Messages** live in `packages/validation` and are re-run server-side. Rules 3, 5, 8 and 9
  need the stored row and exist only there; rule 10 is a contract the client is expected to
  keep.
- **Submit controls.** Never disabled for validation. The topic modal's submit is disabled
  only for the duration of the call. The new-request modal's submit is *absent* when the
  catalogue is empty, which is a control that is not drawn, not a disabled one.
- **`@ds` only, tokens only**, light theme. Both gaps recorded above, one of them contested.

## Route ordering, and the two things that will bite

`PATCH /request-topics/order` must be declared before `PATCH /request-topics/:topicId` or
Nest reads the reorder as a rename of a topic whose id is the string `order`, and every
reorder case fails as a 404 that looks like a routing bug. And the reorder transaction must
take its row locks in `id` order, never in the order `topicIds` arrived, or two concurrent
reorders of one audience deadlock. Both are in the tasks; neither is in the spec.
