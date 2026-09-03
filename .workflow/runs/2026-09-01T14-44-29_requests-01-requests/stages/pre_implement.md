# pre_implement — requests/01 Requests

Run `2026-09-01T14-44-29_requests-01-requests`, branch `spec/requests`, diff base `f06c7d8`.

Verdict: **pass**, three notes for the human. Coverage 47/47 requirements, 41/41 live cases,
20/20 sections.

## The situation this plan is written into

This is not a fresh spec. Three commits on the branch already implement it — `481a165`
(the feature), `6f2dbb5` (a static-gate repair), `ffa814d` (two spec fixes and the spec 10
amendment). The diff against the base is 8,646 insertions across 47 files, and the whole
6 / 22 / 13 unit / integration / E2E suite the spec names exists and references every case id.

So the honest plan is not "build requests". It is: name what is there, name the four things
review found that are still wrong, and keep the rules that must hold while they are fixed
attached to the code that must hold them. Nine tasks, of which four carry live work.

## The carried findings, checked one at a time

The instruction was to take none of them as fact. Each was re-read against the current tree.

**F1 — the decline branch's missing `message_posted` event. Still present.**
`requests.service.ts:522` writes the reason as a `RequestMessage`; the only `events.record`
in that block is the `status_changed` one at `:548`. The other `RequestMessage` writer,
`postMessage`, does record the event, at `:455`. Requirement 19 is unconditional — *every*
message — and requirement 25 makes the decline reason a message, so the rule reaches this
call site and is not obeyed there. Requirement 21 is what makes it observable: the History
panel of a declined request shows the status change and never records that the reason exists.
Planned as **T4**, with **T7** extending TC-01-INT-11, which today queries only
`action:'status_changed'` and is therefore the reason the suite is green.

Worth stating plainly, because it is the trap in this fix: the new event's action is
`message_posted`, not a second `status_changed`. State-machine invariant 4 requires exactly
one `status_changed` per transition, and AC-6 asserts it.

**F2 — the page reads capabilities from an un-normalized role. Still present.**
`page.tsx:87` is `const role = session.role as Role`, and `:88`–`:90` pass it into `can()`.
`session-context.tsx:33` types the role `string` and nothing normalizes on the way;
`index.ts:717` returns `false` for a key the matrix does not hold. CLAUDE.md states the
database holds `member`, and the spec's own Roles section says capability checks run against
`normalizeRole()`. For such an organization the New Request control, the project filter and
the modal's project picker are all withheld while the server answers 201 — the service
normalizes first. `Sidebar.tsx:120` already does it the right way. Planned as **T5**, which
also fixes `requests-badge-context.tsx:38`: harmless today only because neither `member` nor
`user` holds `view-requests`, which is an accident and not a design.

**F3 — spec 10's reversed cases. Already fixed, by `ffa814d`.**
`specs/user-management/10-organization-requests-page.md:305` now carries `- **Retired.**`
naming TC-01-INT-18 and TC-01-E2E-08. The second half of the old finding is fixed too: the
retirement note at `:329`, which had justified itself by the now-false TC-10-INT-03, names the
same two surviving cases. TC-10-INT-01 and TC-10-INT-02 carry the vocabulary amendment
(`pending`→`open`, `approved`→`granted`). Kept in the plan as **T9** so a later stage does not
rediscover it as missing; no work is owed.

**F4 — TC-01-E2E-11's closing assertion cannot fail. Still present.**
The badge is rendered only when `badgeCount` is truthy (`Sidebar.tsx:88`) and remounts at 0
(`requests-badge-context.tsx:39`), so after a reload the node is absent before the GET has
resolved and `toHaveCount(0)` passes on its first poll. The anchor beside it,
`sidebar-requests-link`, renders synchronously from the session. The spec calls this case the
regression witness for requirement 44; half of it currently witnesses nothing. Planned as **T8**.

**F5 — TC-01-E2E-08's `user` half cannot fail. Still present.**
`openRequestsPage` waits for `requests-page`, the outer div rendered before any fetch;
`requests-vacation-section` renders only from `data.vacation`. The absence assertion holds
even if the server wrongly returned a vacation block. Narrowed exactly as review narrowed it:
the `requests-scope-toggle` assertion in the same block is sound, because `canScopeAll` is a
synchronous render from the session. Planned as **T8**.

Four live, one already closed. None of the four was retired by the corrected spec — requirements
19, 37/38, 42 and 44 all still say what made them defects.

## What already exists to build on

With paths, because "the existing auth guard" sends nobody anywhere.

| What | Where |
|---|---|
| 404-not-403 org scoping | `apps/api/src/auth/org-scope.guard.ts:22` |
| session re-read from `Account.securityStamp` | `apps/api/src/auth/session.guard.ts` |
| PascalCase capability at the route | `apps/api/src/auth/capability.guard.ts` |
| role normalization, and `hasCapability` that normalizes internally | `packages/validation/src/roles.ts:38`, `:154` |
| capability composed with identity — the shape "party to a request" follows | `packages/validation/src/roles.ts:191`, `:225` |
| a per-parent counter under `FOR UPDATE` in the creating transaction | `apps/api/src/kanban/tasks.service.ts:157-211` |
| the injected Prisma service, no repository layer | `apps/api/src/prisma.service.ts` |
| display-name snapshots in an audit trail | `schema.prisma` model `TaskActivity` |
| the `[parentId, createdAt]` thread index | `schema.prisma` model `TaskComment` |
| `REQUEST_MESSAGES`, extended in place and never duplicated | `packages/validation/src/index.ts:1746` (base) |
| the untouched vacation aggregation, moved file only | `apps/api/src/requests/vacation-request-feed.service.ts` |
| `overrideProvider(MailService)` in an integration spec | `apps/api/test/clients.spec.ts:136` |
| the DS client barrel | `apps/web/src/ds.ts` |
| every e2e fixture the cases need | `e2e/tests/helpers.ts:160, 734, 921, 1081, 1128, 1270` |

Every line number above was checked against the diff base, not assumed.

## What must be built from zero

Three tables and a defaulted column; the five-state machine and its actor guards; the
per-organization number under an `Organization` row lock; the append-only event trail; derived
overdue computed per reader timezone; the comparator whose first key is non-terminal before
terminal; three capabilities in both unions — and with them the first non-empty
`ROLE_CAPABILITIES` entries `user` and `viewer` have ever had; thirty message keys; the unified
status vocabulary and the 400 that replaces `parseRequestStatusFilter`'s silent fallback; the
`counts` envelope and the badge that reads it; the detail screen with its thread, history and
four modals; and the inbox page that turns a manager-only vacation feed into everyone's.

## The sweeps

**Contradiction.** Every absolute — *every*, *always*, *never*, *no X* — was taken to its call
sites.

- Requirement 19's "every message" has exactly two call sites and one obeys it. That is F1.
- Requirement 17 ("a message may be posted in `open` and `answered` only") looked like it
  contradicted requirement 25, which writes a message during the transition *to* `declined`.
  It does not: 17 constrains the `POST …/messages` route, and the decline writes its message
  while the locked row is still non-terminal, before the status update. Ordering resolves it,
  and the code already relies on that ordering.
- Requirement 43 orders by `overdue`, which requirement 33 derives per reader. That is a
  design constraint — the sort cannot go into SQL — not a contradiction. Recorded as a risk,
  because the next person to optimise the list query is the one who breaks it.
- Requirement 23's 403-for-a-party against Security's 404-for-a-non-party is explicitly
  reconciled by requirement 23 itself and asserted by AC-16.
- AC-3 against requirements 37, 38 and the new `all` default is reconciled in AC-3's own text
  and in README backward-compatibility point 5.
- **One real contradiction survived:** the area README says a soft-deleted addressee's requests
  "surface in the reassignment filter"; requirement 36 says no such filter exists and
  requirement 42's closed sets could not express one. Spec 02 defers to requirement 36, so the
  README is the stale side. Raised as note **P1** rather than a blocker, because requirement 36
  names the claim and overrules it in the same sentence — the plan compiles without a human.

**Premise.** Sixteen claims checked against the file that implements each; all recorded in
`handoff.premises`. The deploy order was read from `infra/deploy.sh` and not from prose about
it: `infra/migrate.sh` runs at `:184` as a one-off task on the new image, `tf apply` of the
services at `:188`. That is the whole justification for the additive rule, and it is restated
in T2's migration note. `MAIL_MESSAGE_TYPES` holds exactly nine entries and
`git diff f06c7d8..HEAD -- apps/api/src/mail/` is empty, so AC-13 holds today. Every
`e2e/tests/helpers.ts` line the spec cites is exact. One drifted: `parseRequestStatusFilter` is
at `:1893` at the base, not `:1878` — the symbol and the behaviour are as described, so it is
note **P3** and the premise carries the corrected line.

**External claims.** There are none to sweep. The spec's access table says in full that this
feature depends on no third-party system, no API key and no MCP server, and sends no mail —
verified by the untouched `mail.service.ts`. The only double is `InMemoryMailService`, and it
exists to make a *negative* claim observable: requirement 47 and AC-13 assert that nothing was
sent, and a negative claim with no recorder passes because nothing was watching.

**Call sites.** `RequestMessage` has two writers (F1). `lastActivityAt` is written by all four
mutating paths (`:450`, `:536`, `:655`, `:742`), which is requirement 32. The `FOR UPDATE`
re-read is a single shared helper at `:783` taken by `postMessage`, `transition`, `patchRequest`
and `reassignRequest`, which is what makes requirement 28 hold by construction rather than by
four copies of a rule. The un-normalized `can()` calls are enumerated in T5.

**Writers.** The `Request` row is written by create, the four transitions, the edit and the
reassign — the seven the state machine's invariant 8 names — and by nothing outside this module,
because the tables are new. The `Organization` row is the interesting one: this spec's create
locks it `FOR UPDATE`, and so do `members.service.ts:157` and `:379` and `accrual.service.ts:74`.
That is why nothing slow may run under that lock, and it is recorded in T3's `concurrency`.

**Messages.** All 31 Error Messages rows exist as exports and are wired: 18 validated in
`packages/validation/src/requests.ts` and re-run server-side, 11 emitted from
`requests.service.ts`, and `emptyMine` / `emptyFiltered` rendered by the page from
`counts.total` — which is the one job that counter has and the reason it ignores the filters.
`neededByPast` is listed under `POST` alone, deliberately: PATCH not re-applying it is what
makes TC-01-INT-13's second route and TC-01-E2E-04 reachable at all.

**Verification.** Nothing in the Verification Plan is `not run` and the spec owes no fixture —
confirmed by checking each helper at its cited line. Its steps 2 and 3 were one-off environment
repair (`prisma generate`, building the validation package); the `dist` is current now, so they
are premises and not tasks.

**Sections.** All twenty `##` headings answered by name in `handoff.sections`, including the
four that carry neither a requirement nor a case — Summary, Screens, Out of Scope, Known Gaps.
Out of Scope earns its entry: it is a list of things *not* to build, and T4 in particular must
not import `MailService`.

## The one DS gap

`apps/web/src/ds.ts` exports `Input` and no `Textarea`, so this feature's three multi-line
fields each style a raw `<textarea>` — the only two hardcoded sizes in the whole feature, a
`1.5px` border and `12px` padding. Four screens already shipped the same workaround, so the gap
predates this spec and this spec must not widen it. Everything else is tokens, and the `1px`
hairline borders match what `projects/page.tsx:326` already does. Recorded in `handoff.dsGaps`,
and raised as note **P2** because the spec's UI Description promises a DS-gaps table it does
not contain.

## Why this passes rather than blocks

Three findings, all `spec`, all notes. P1 is a genuine contradiction but the spec resolves it
in the sentence that creates it; P2 is a missing table, not a missing rule; P3 is fifteen lines
of drift in a citation whose substance is right. None of them stops an implementer, and halting
a run for a stale README row that the spec already corrects would spend a human on nothing.

The work that matters is in the plan, not in the findings: four defects that a green suite
cannot see, three of them because the tests that should have caught them assert things nothing
can break.
