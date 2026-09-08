# implement — attempt 5 (orchestrated)

Spec `specs/portal/01-home.md`, branch `spec/portal-home`, base
`7a6e059e2389ff0b34ee85001a0e6ecf450c8a84`, commit `6bfa212`.

The stage ran across five sessions; attempts 1–4 were interrupted mid-flight, and each
resumption re-established state from disk rather than from a report. Two children
(T6, T10) and one fix shard (13) never returned a report at all — their files had
landed, and the integration read below is what stands in for the report they owed.

## What each task produced

| Task | Who | Files | Cases |
|---|---|---|---|
| T1 — capabilities, `PORTAL_MESSAGES`, codecs, validators | shard 1 | `packages/validation/src/portal.ts`, `portal.test.ts`, `roles.ts`, `roles.test.ts`, `index.ts` | TC-01-UNIT-01…05 in `portal.test.ts`, TC-01-UNIT-06 in `roles.test.ts` |
| T2 — the migration | **lead** | `apps/api/prisma/schema.prisma`, `migrations/20260908120000_portal_01_home/migration.sql` | — |
| T3 — route group, guard stack, personal half | shard 3 | `portal.controller.ts`, `portal.module.ts`, `portal-home.service.ts`, `app.module.ts` | — |
| T4 — feed projection, withholding, entry page | shard 4 | `portal-feed.service.ts`, `portal-entry.service.ts`, `portal-entry.types.ts` | — |
| T5 — group switches, backdate fixture | shard 5 | `portal-settings.service.ts`, `test-fixtures.controller.ts` | — |
| T6 — integration cases | shard 6 (no report) | `apps/api/test/portal.spec.ts` | TC-01-INT-01…18 |
| T7 — the home screen | shard 7 (no report) | `page.tsx`, `PortalMonthPanel.tsx`, `PortalTimeOffPanel.tsx`, `PortalRequestsPanel.tsx`, `PortalFeed.tsx`, `portal-types.ts` | — |
| T8 — entry page, settings screen | shard 8 | `news/[entryId]/page.tsx`, `settings/portal/page.tsx` | — |
| T9 — landing, rail, 29 waits | shard 9 | `LoginForm.tsx`, `Sidebar.tsx`, `helpers.ts` + 28 e2e specs | — |
| T10 — e2e cases, shared-edge probe | shard 10 | `e2e/tests/portal.spec.ts`, `ui-invariants.ts` | TC-01-E2E-01…09 |

Three fix shards followed the test runs: **11** (two failing e2e cases), **12** (the feed's
tie comparison), **13** (the feed's double fetch, no report — its diff is on disk and reviewed
below).

## What the lead did, and why it could not be a child's

- **The migration.** One additive table, no backfill; `prisma generate` from `apps/api`.
- **The settings seam.** T3 and T5 each did their half correctly and the join between them was
  wrong in three ways no child could see: `GET .../portal/settings` called `readGroups` directly
  and so answered **200 to a member without `ManagePortalSettings`** instead of the 403 the
  contract requires; the `PUT` passed a raw body to a parameter typed `PortalGroups`, so
  **nothing validated it** and no `422 groupsInvalid` existed; and both verbs answered a bare
  `{people,hiring,work}` where §Routes specifies the `{ "groups": … }` envelope. Added
  `readGroupsForManager` (the capability is asked on the route's own path, leaving `readGroups`
  ungated for the feed, which calls it for every reader), moved `validatePortalGroups` into
  `writeGroups`, and put the envelope in the controller.
- **The integration read of T7**, whose child never reported: two `data-testid`s the document
  does not name (`portal-month-panel`, `portal-requests-panel`) — removed, the table is closed;
  a greeting date computed from `new Date()` in the browser beside a `month.today` the server
  resolves in the caller's timezone — one value, two sources, and they disagree for exactly the
  caller a timezone exists for, so it now formats `month.today` and the line holds its height
  while Q1 is in flight; and `PORTAL_MESSAGES.noCountry` sharing a `<p>` with a link, which
  makes the sentence uncountable — `expectMessageOnce` finds **zero** matches, not one, so
  TC-01-E2E-07 could never have passed. Now its own node.
- **`e2e/tests/responsive.spec.ts`**, which no task's file list contained. T9 reported it as
  blocked: `TC-DS01-E2E-01` asserts `page-title` straight after `signIn()`, and the portal
  home's `<h1>` is `portal-greeting`. The case is about the shell and the title's type ladder,
  not about where a session begins, so it now navigates to a screen carrying the shared id.
- **`TC-01-INT-16`'s failure.** `createMember` wrote `userA16@acme.test` straight through Prisma
  while `LoginService` normalizes what it is given and looks up by the normalized form — an
  account nobody could sign in to, surfacing as `Invalid value "undefined" for header "Cookie"`
  from a later line. The helper now seeds `normalizeEmail(...)`, and a `requireCookies` guard
  names the actor and quotes the response instead of failing three calls later. Every other case
  in the file used lowercase addresses, which is why only this one failed.
- **Every test run, and the commit.**

## Test commands and their summary lines

| Command | Result |
|---|---|
| `npm run test:unit` | `Test Files 37 passed (37)` · `Tests 1475 passed (1475)` |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| `npm test -- test/portal.spec.ts` (from `apps/api`) | `Tests: 18 passed, 18 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/portal.spec.ts tests/regressions.spec.ts` (from `e2e`) | `18 passed (1.0m)`, exit 0, no flakes |
| same, over `authentication` `app-shell` `members-list` `member-detail` `invitation` `client-participants` | `19 passed`, 4 flaky |
| same two files again with `--retries=0` | `7 passed (27.9s)` |
| `npm run ui:check -- "apps/web/app/org/[orgId]"` | 1 finding on this run's files, answered below |

Ports 3100/4100 throughout; 3000/4000 were never taken.

## The three defects the test runs found, and what each was

1. **A precondition passed an id where a helper wanted an email** (TC-01-E2E-02) —
   `seedReserveCredit(request, admin.id, 300)`. Test defect; fixed at the call site, and every
   other helper call in the file was checked against its signature.
2. **The entry page double-encoded its own route parameter** (TC-01-E2E-04) — a real product
   defect. `use(params)` in an App Router client component yields the segment **still
   percent-encoded**, so `encodeURIComponent(entryId)` produced `%253A`, Express decoded it once
   to `%3A`, no colon survived, `parseEntryId` refused the kind and the route answered 404 —
   which the page read as "gone" and turned into `notFound()`. Shard 11 confirmed both
   directions with curl through the real dev server before changing a line.
3. **The feed appended the same page twice** (TC-01-E2E-05) — two defects wearing one symptom,
   and the first fix did not close it:
   - `compareFeedEntries` broke ties with `localeCompare` while `isAfterCursor` compared ids
     with `>`. Locale collation gives punctuation like the `-` in a uuid a low weight, so the
     order the page was *sorted* in and the boundary the cursor *drew* disagreed at a tie.
     Both now call one ordinal `compareEntryIds` — the sort and the boundary are the same
     comparison used twice, which is the shape that cannot drift.
   - The remaining half was client-side: `loadMore` launched its `fetch` **inside a `setState`
     updater**. React invokes an updater twice in development precisely to catch impurity, and
     it runs the side effect both times — so one press fetched one cursor twice and appended
     both answers. The flag-flip now stays pure and the fetch moved to an effect keyed on it.

   The count assertion alone could not see the second one: with 22 nodes drawn and two keys
   repeated, only 20 distinct entries were on screen. The duplicate-key console error was the
   witness, and `fixtures.ts`'s page-error guard is what surfaced it.

## Answered, not silenced

- **`ui:check` — `uc/index-key` at `news/[entryId]/page.tsx:302`.** The key is the index of a
  paragraph in `entry.body.split('\n')`. The rule's own exception is "correct only where order
  and length never change": the body is an immutable string for the life of the render, the
  paragraphs carry no state, and two identical paragraphs would collide under any content-derived
  key. Left as it is, deliberately.
- **Four flaky cases in the landing-move batch, and two in the first portal run.** Every one was
  a sign-in followed by an assertion, timing out once and passing on retry. Re-running
  `authentication` and `app-shell` with `--retries=0`, after `/org/[orgId]` had been compiled,
  gave `7 passed` — the flakes are the dev server compiling a brand-new route on first hit, not
  a race in the product or in how the tests wait. Recorded so QA reads its own flakes correctly.

## What is deliberately not in this commit

`.claude/agents/implementer.md`, `.claude/ai-workflow.config.json`, `.claude/skills/spec/**`,
`apps/api/jest.config.js`, `apps/api/package.json`, `scripts/run-watch.mjs`, `scripts/ship.mjs`
and `scripts/spec-lint.mjs` are modified in the working tree and are **machinery, not this
spec's work**. They were never staged, so `baseRef...HEAD` does not carry them. They remain on
disk and in force. A stray `apps/api/test/portal.spec.ts.bak` a child left behind was deleted.

## Notes carried to the verdict

`N5` from the plan is real and survives into the shipped screen: §Screens replaces the holidays
list with `PORTAL_MESSAGES.noCountry` whenever no country is stated, while `REQ-01-019` answers
such a member the **global** holidays. On an organization holding a global holiday the screen
therefore says "no holiday calendar reaches you" above rows the body did carry. Built as the
states table says, because the states table is determinate; raised as a note because the copy is
false in that case and no case in the bundle distinguishes the two readings.
