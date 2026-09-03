# pre-implement — requests/02 Request Topics & Vocabulary

Spec `specs/requests/02-request-topics.md` (sha `a9e7771…`), bundled with
`02-request-topics.contracts.md` and `02-request-topics.cases.md`. Branch
`spec/requests-02-client-participants`, base `225e843`. Nothing of this spec exists in the
tree yet — the base is `main`'s tip and the diff is empty.

## What already exists to build on

| What | Where |
|---|---|
| Session and org scoping, 404 not 403, path `orgId` never a selector | `apps/api/src/auth/session.guard.ts`, `apps/api/src/auth/org-scope.guard.ts` |
| Capability guard whose message is fixed — the reason a spec that names its refusal message checks in the service instead | `apps/api/src/auth/capability.guard.ts:12-24` |
| Both capability unions and the role normalization | `packages/validation/src/index.ts#MemberCapability` (506-604), `packages/validation/src/roles.ts#Capability` (51-96), `#normalizeRole` |
| Archive/restore with audit columns, a case-folded name pre-check and P2002 mapped to the same 409 | `apps/api/src/clients/clients.service.ts` (`archiveClient`, `restoreClient`, `:392`) |
| A hand-written functional `LOWER(name)` unique index, because Prisma cannot express one | `apps/api/prisma/migrations/20260901120000_spec_org_01_clients/migration.sql:26-30` |
| `FOR UPDATE` re-read inside the writing transaction, guard evaluated against that read | `apps/api/src/requests/requests.service.ts#lockRequest` |
| The create transaction that allocates `nextRequestNumber` under a lock on the organization row | `apps/api/src/requests/requests.service.ts#createRequest` |
| One include validator + one serializer for the request row shape | `apps/api/src/requests/requests.serializer.ts#REQUEST_ROW_INCLUDE` |
| The signup transaction that already writes Account, Organization and Membership together — the only place an Organization row is created | `apps/api/src/signup/signup.service.ts:42-49`, `:46` |
| A settings screen gated by capability that redirects an unauthorized caller to the members list and draws nothing meanwhile | `apps/web/app/org/[orgId]/settings/holidays/page.tsx:59-64, :172` |
| The Settings sidebar group that drops its label when a role holds no row in it | `apps/web/src/layout/Sidebar.tsx:155-180` |
| Trim + whitespace-collapse before length checks | `packages/validation/src/index.ts#normalizeClientName` (2189) |
| e2e fixtures for admin, user, manager and viewer | `e2e/tests/helpers.ts:734, :921, :160` |

## What must be built from zero

The `RequestTopic` table with its functional unique index and the two nullable `Request`
columns; a **second** migration file holding only the idempotent backfill; the eleven-row
seed constant and its insertion into the signup transaction; `RequestTopicsController` and
`RequestTopicsService` (five routes, nothing like them exists); `REQUEST_TOPIC_MESSAGES`,
four topic validators, the ordering comparator and a status parser that refuses instead of
defaulting; the status label map and the status-query expander that replace two hardcoded
lists in the web app; the Settings › Request topics screen with its modal and up/down
ordering controls; the topic picker, its empty state and the list's topic filter; the
`topic` member on every request row; and three new suites.

## Sweeps

**Contradiction.** Every absolute in the spec was taken to the call sites it forbids.
`GET …/request-topics` is open to every member (REQ-02-008) while the four writes answer
403 (REQ-02-007) — deliberately not the 404 `ClientsService` answers for a missing
capability, because this spec names the message and TC-02-INT-07 asserts it; that is a
newer spec governing, not a conflict. REQ-02-019's single 400 for an archived, foreign or
non-existent topic is the one place this module does not answer 404 for a cross-organization
id, and the spec's Security section states it as the exception. State Machine invariant 5
("each writer of an existing row takes the row lock") reaches further than the two writers
the status guard needs, so **rename and reorder take the row lock too** — the plan follows
the invariant rather than the cheaper reading. No pair of rules was found that no
implementation satisfies.

**Premise.** Sixteen claims checked against the file that implements each, recorded in
`premises`. The deploy order comes from `infra/deploy.sh:183-191` — migrate on the new
image, then roll the services — not from prose about it. Two premises the spec relies on
were confirmed the expensive way: `organization.create` appears exactly once in
`apps/api/src` (so seeding at signup satisfies REQ-02-015 entirely), and `@ds` exports
twenty-one components with no drag, sortable or segmented primitive among them (so both DS
gaps are real).

**External claims.** The spec depends on no third-party system, no key and no MCP server;
its "Access this needs" table says so and nothing in the bundle contradicts it.
`doubleBehaviours` is empty because there is nothing to double.

**Call sites.** REQ-02-028's "a single exported label map that the list, the detail screen,
its history entries and the filter control all read" has exactly four readers, all named in
T7 with line numbers; the history entry today prints the raw stored value. REQ-02-001's
"every read and write" is the five service methods of T4 plus the seed. Every writer of a
`Request` row was enumerated to confirm none can rewrite `topicLabel` (invariant 4).

**Writers.** `RequestTopic` is written by five handlers, the signup seed and the backfill;
`Request` by create, message, transition, patch and reassign. Locks recorded per task.

**Messages.** Every row of the Error Messages table is mapped to its export and the route
that emits it. `pickerEmpty` carries no route by design and is read by the modal.

**Verification.** The two rows marked as not existing today became tasks: the backfill file
TC-02-INT-02 executes by path (T2) and the topic routes every other case drives (T4). No
fixture route and no environment value is needed.

**Sections.** 22 `##` headings across the bundle, each answered in `sections`.

## Coverage

`node scripts/handoff-coverage.mjs` reports `pass  requirements 0/0  cases 0/0
sections 8/8` — it reads only the file named in `run.json`, so the bundle is invisible to
it; it matches requirements as `^(\d+)\. ` while this spec numbers them `#### REQ-02-001`;
and its case regex ends an id on `[: \n]`, which these CRLF files do not offer. The three
checks were therefore re-run bundle-aware and CRLF-normalized: **31/31 requirements
assigned, 34/34 live cases claimed, 22/22 sections accounted for**, with no requirement
planned that the spec does not carry. Recorded as note P6.

## Verdict

Pass. Seven notes, none blocking: two migration files where the pipeline usually ships one
(P1, required by the spec and by TC-02-INT-02); the default `sortOrder` that can exceed its
own bound and the silence about archived rows counting toward it (P2); whether a legacy
row's fallback About value sits inside `request-row-{id}-topic` (P3); whether TC-02-E2E-04's
row assertion is equality or containment against a mock that draws `Closed · cancelled`
(P4); TC-02-INT-07's manager half, which holds under one ordering of its four writes (P5);
the coverage gate's blindness to this spec's shape (P6); and the blast radius that does not
name the fourteen E2E assertions the status vocabulary retires (P7). Each is planned one
way in the handoff, and each says which way.
