# pre-implement — specs/requests/02-request-topics.md

Probe run. Nothing is implemented and nothing will be implemented from this plan; the question
answered here is whether the spec compiles into one.

**Verdict: it compiles.** Thirty-one requirements, thirty-four live cases and all twenty-two
`##` sections across the three bundle files are assigned to eight tasks. No contradiction, no
stale premise and no unverified external claim was found. Seven notes are recorded below; none
of them blocks, and each is either a decision a person should confirm or a detail the plan has
settled in the spec's favour.

---

## What already exists to build on

| What | Where |
|---|---|
| Session attach + `securityStamp` re-read | `apps/api/src/auth/session.guard.ts` |
| Org scoping, 404 not 403, path `orgId` never a selector | `apps/api/src/auth/org-scope.guard.ts` |
| Capability guard whose message is fixed — the reason a spec that names its refusal checks in the service | `apps/api/src/auth/capability.guard.ts:12-24` |
| `normalizeRole()` and the `admin`/`member` → `admin\|manager\|user\|viewer` transition | `packages/validation/src/roles.ts` |
| Both capability unions and the role matrix | `packages/validation/src/index.ts:506` (`MemberCapability`, `CAPABILITY_MATRIX`), `packages/validation/src/roles.ts:51` (`Capability`, `ROLE_CAPABILITIES`) |
| `REQUEST_MESSAGES`, extended in place by spec 01 and extended in place again here | `packages/validation/src/index.ts:1807-1871` |
| `fieldImmutable` and `IMMUTABLE_REQUEST_FIELDS` — `topicId` joins the list | `packages/validation/src/index.ts:1865`, `packages/validation/src/requests.ts:357` |
| Request query vocabulary, and the vacation mapping `closed` must extend | `packages/validation/src/requests.ts:433`, `:479` |
| Trim + whitespace-collapse name normalization | `packages/validation/src/index.ts:2189` |
| Functional `LOWER(name)` unique index, written by hand in migration SQL | `apps/api/prisma/migrations/20260901120000_spec_org_01_clients/migration.sql:26-30` |
| P2002 mapped to the same 409 as the pre-check | `apps/api/src/clients/clients.service.ts:392` |
| `FOR UPDATE` re-read with the guard evaluated against that read | `apps/api/src/requests/requests.service.ts#lockRequest` |
| `nextRequestNumber` under a lock on the organization row | `apps/api/src/requests/requests.service.ts#createRequest` |
| One include validator and one serializer for the request row | `apps/api/src/requests/requests.serializer.ts` |
| The signup transaction that already writes Account + Organization + Membership | `apps/api/src/signup/signup.service.ts:42` |
| Flat controller registration | `apps/api/src/app.module.ts:94-122` |
| A capability-gated settings screen that redirects an unauthorized caller to Members | `apps/web/app/org/[orgId]/settings/holidays/page.tsx:59-64` |
| The Settings sidebar group that drops label and all when a role holds no row in it | `apps/web/src/layout/Sidebar.tsx:155-180` |
| e2e fixtures for signup, invite/accept and role change | `e2e/tests/helpers.ts:160, :734, :921` |
| `@ds` barrel — `Badge`, `Button`, `Card`, `Modal`, `Select`, `Tabs`, `Table` | `apps/web/src/ds.ts` |

## What must be built from zero

The `RequestTopic` table with its functional unique index and the two nullable `Request`
columns; a second migration file holding only the backfill; the eleven-row seed constant and
its insertion into the signup transaction; `RequestTopicsController` and
`RequestTopicsService` — five routes, none of which exists in any shape today;
`REQUEST_TOPIC_MESSAGES`, the topic validators, the ordering comparator and a topic status
parser that refuses rather than defaults; the status label map and the status-query expander
that replace two hardcoded lists in the web app; the Settings catalogue screen with its modal
and up/down ordering controls; the topic picker, its empty state and the list's topic filter;
the `topic` member on every request row including the label-without-row case; and two new
suites, `apps/api/test/request-topics.spec.ts` and `e2e/tests/request-topics.spec.ts`.

## Sweeps

**Contradiction.** Every absolute in the spec was taken to its call sites. `no route removes a
RequestTopic row` — nothing calls for one. `every read and write scoped by
session.organizationId` — the seed and the backfill are writers with no session; State Machine
invariant 5 names them as writers in their own right and requirement 1 governs the topics
service, so the two do not collide, and the plan gives the seed helper `organizationId` as a
required argument with no default. `topicLabel is written once and no topic write may alter
it` — every other writer of a `Request` row (`postMessage`, `transition`, `patchRequest`,
reassign) touches neither column. `the immutability refusal is answered before the
name-uniqueness one` is a stated order, not a conflict, and TC-02-INT-06 pins it. `one name per
audience` counts archived rows, which the functional index enforces and Known Gaps
acknowledges. Nothing was found that no implementation satisfies.

**Premise.** Sixteen claims checked against the file implementing each; all sixteen hold, and
they are listed in `handoff.premises` with paths. The load-bearing ones: migrations run before
the rollout (`infra/deploy.sh:27`, `:183`), the `201` body carries exactly the nineteen members
the contracts say it does (`requests.dto.ts#RequestRowDto`), the four status render sites are
what the spec says they are and the history prints the raw stored value today
(`RequestHistory.tsx#describe`), the retired controls and the bodies that send them exist where
the blast radius says, the `@ds` barrel exports no sortable and no segmented control, and the
capability names and message keys this spec adds collide with nothing.

**External claims.** None. The spec's Access table records that it depends on no third-party
system, no API key and no MCP server, and sends no mail. `doubleBehaviours` is empty, and there
is nothing to fake.

**Call sites.** Recorded per task in `allCallSites`. The two that matter: every reader of a
request status on screen (filter, row badge, detail header, history entry — four, and
`requests-badge-context.tsx` is not one of them because it sends no status and reads only
counts), and every writer or reader of a `RequestTopic` row.

**Writers.** In `handoff.tasks[].concurrency`. `RequestTopic` is written by five handlers plus
the seed plus the backfill; archive and restore take `SELECT … FOR UPDATE` on the row and
evaluate the status guard against that read, which is invariant 3 and what TC-02-INT-16
observes. Rename and reorder take no lock — the functional unique index is the arbiter of a
name race and the loser's P2002 becomes the same 409 the pre-check answers. `Request` keeps its
existing locks; `createRequest` adds no second one.

**Messages.** Eighteen rows, each with its export and the route that emits it, in
`handoff.messages`. Verified absent today: `manage-request-topics`, `ManageRequestTopics`,
`REQUEST_TOPIC_MESSAGES`, and the four new `REQUEST_MESSAGES` keys. `fieldImmutable`,
`createForbidden`, `scopeForbidden` and `editForbidden` exist and are reused unchanged.
`pickerEmpty` is screen copy with no route, as the spec says.

**Verification.** The two rows the spec marks as not existing today are tasks: the backfill
migration file TC-02-INT-02 executes by path (T2) and the topic routes every other new case
drives (T4). The harness applies every migration before a test body runs
(`apps/api/test/global-setup.ts:16-33`), so the file will be on disk when the case reads it.

**Sections.** All twenty-two accounted for by name in `handoff.sections` — eight in the spec,
twelve in the contracts, two in the cases.

## Coverage

`node scripts/handoff-coverage.mjs` cannot be run against this run directory: it resolves
`.workflow/runs/<runId>` and this probe lives under `.workflow/refine/`. Its three checks were
run by hand against these paths, and then again bundle-aware — see note N6, which is the more
interesting result.

| Check | Result |
|---|---|
| Requirements | 31 `REQ-02-0NN` in the spec, 31 assigned, 0 unassigned |
| Cases | 34 in the bundle, 34 live, 34 claimed, 0 claimed-but-absent |
| Sections | 22 across the three files, 0 unaccounted |

## Notes

- **N1 — two migration files in one run.** The Seed Data section requires the backfill to be
  "a migration file of its own, separate from the one creating the table", and TC-02-INT-02
  executes it by path, which is impossible if it shares a file with the `CREATE TABLE`. This
  pipeline's rule for an implementation run is one migration per run. Both files are additive
  and the backfill is idempotent, so the deploy window is safe either way; the deviation is
  recorded rather than resolved because it is a person's call.
- **N2 — the default `sortOrder` has no bound and no status qualifier.** "the highest stored
  value in that audience plus ten" can exceed 32767, and the spec does not say whether archived
  rows count toward that highest value. The plan clamps the default to the bound and counts
  every row of the audience regardless of status, so a restore can never collide. No case
  observes either choice.
- **N3 — `request-row-{id}-topic` on a request that has no topic.** The testid table says
  "present when the request carries a topic"; edge case 8 says such a row "shows the stored
  `type` as its About value". Whether the fallback value is drawn under the same testid is not
  said, and no case asserts it. The plan draws the fallback without the testid.
- **N4 — the closure sub-label on a list row.** The list mock draws `Closed · cancelled` on a
  row; TC-02-E2E-04 says "The rows read Pending, In progress, Completed and Closed". The plan
  follows the mock and REQ-02-029 — the row badge and the detail header both carry the
  sub-label, the filter control and the history entry carry the label alone — which makes the
  case a containment assertion rather than an equality one.
- **N5 — TC-02-INT-07's manager half.** "Every `manager` write succeeds" holds only if the four
  writes run create → rename → archive → restore on one topic; restoring an active topic is
  409 by REQ-02-013. The plan fixes that order.
- **N6 — the coverage gate is blind to this spec, and would have passed vacuously.**
  `scripts/handoff-coverage.mjs` reads only the file named in `run.json`, so it sees none of the
  bundle; it matches requirements as `^\d+\. `, while this spec numbers them
  `#### REQ-02-001`; and its case regex ends the id on `[: \n]`, which does not match the CRLF
  line endings these files are stored with. Run as written it reports zero requirements, zero
  cases and eight sections, and passes a plan that had covered none of them.
- **N7 — the status vocabulary breaks assertions the spec's blast radius does not name.** It
  names the two web modules holding the words, and the two E2E cases naming the retired
  controls, but not the eleven assertions on `'Open'`, `'Answered'`, `'Granted'`, `'Declined'`
  and `'Cancelled'` in `e2e/tests/requests.spec.ts` (lines 229, 247, 253, 255, 390, 395, 422,
  426, 526, 589, 590), the two filter options selected by name there (626, 657), or the one at
  `e2e/tests/requests-page.spec.ts:147`. Not a defect in the spec — refining is not growing —
  but it is work, and T8 owns it with the line numbers.

One thing not raised as a finding: the DS gaps table ships the Staff/Client audience switch as
two `Button`s with `aria-pressed`, while the analogous control one page over — the requests
scope toggle at `apps/web/app/org/[orgId]/requests/page.tsx:321-329` — uses `@ds`'s `Tabs`. The
spec recorded the choice in the sanctioned place and named what closes it, so it is a recorded
gap rather than an improvisation.
