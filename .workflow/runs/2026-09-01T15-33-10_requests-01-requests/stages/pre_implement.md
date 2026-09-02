# pre_implement — requests/01 Requests

Run `2026-09-01T15-33-10_requests-01-requests`, branch `spec/requests`, base `f06c7d8`, head `9afbcb4`.

## The situation this plan is written into

This is the fourth run against the same spec on the same branch. The branch already carries a
full implementation of it — `481a165` (the feature), `6f2dbb5` (static gate 1), `e17de7a`
(review 1), `2d802e9` and `9afbcb4` (the spec-10 amendment). Writing a plan that pretends the
tree is empty would send the implementer to rewrite eleven thousand lines that a static gate
and a review have already been through. So each task below names the file that holds the work
and what the next stage owes against it. The two lists the plan turns on are still the two
lists — they are just answered against the base commit rather than against nothing.

## The two lists

### What already exists to build on (at the base commit, `f06c7d8`)

| What | Where |
|---|---|
| Session, and the securityStamp re-read on every request | `apps/api/src/auth/session.guard.ts` |
| Org scoping, 404 not 403 | `apps/api/src/auth/org-scope.guard.ts:22` |
| Capability decoration for a route whose refusal message is unnamed | `apps/api/src/auth/capability.guard.ts`, `require-capability.decorator.ts` |
| `normalizeRole()` and capability-composed-with-identity (`canReadProfile`) | `packages/validation/src/roles.ts` |
| Per-organization number allocation under `FOR UPDATE` | `apps/api/src/kanban/tasks.service.ts:161` (`Project.nextTaskNumber`) |
| Append-only trail with display-name snapshots; the thread index shape | `apps/api/prisma/schema.prisma:1047` (`TaskActivity`), `:1014` (`TaskComment`) |
| The spec-10 vacation aggregation, moved not rewritten | now `apps/api/src/requests/vacation-request-feed.service.ts` |
| The DS barrel the screens compose from | `apps/web/src/ds.ts` |
| Every fixture the cases need | `e2e/tests/helpers.ts:734, :921, :160, :1128, :1081, :1270`; `apps/api/src/projects/projects.controller.ts:54` |
| The MailService recording-double pattern | `apps/api/test/clients.spec.ts:136` |

### What had to be built from zero

The `Request` / `RequestMessage` / `RequestEvent` tables and `Organization.nextRequestNumber`;
the entire write side of `apps/api/src/requests`, which was a read-only vacation projection;
`packages/validation/src/requests.ts` entire; three capabilities in both unions; 31
`REQUEST_MESSAGES` keys; the request detail route and its four components; the new-request
modal; an unconditional sidebar row and a redefined badge; 41 test cases.

All of it is present at HEAD. What is left for this run is verification and repair.

## The carried findings

Both were raised by review of `2026-09-01T14-44-29` against `specs/user-management/10-*.md`,
and both are **already fixed** — by commit `9afbcb4`, "docs(specs): finish the spec-10
amendment, all thirteen statements". Verified line by line rather than taken on the commit
message:

- **F1** — the banner promised each affected statement was marked in place and nine were not.
  All thirteen now carry an amendment: `:35-37` the summary, `:50` the matrix row (`View
  Requests page` now yes for all four roles), `:43` the actors line, requirement 2 at `:62`
  (default `all`, the six-value vocabulary, 400 on unknown), requirement 7 at `:70` (the badge
  is `counts.waitingOnMe` plus the vacation pending count), requirement 8 at `:71-74` (the row
  is rendered for every member), requirement 9 at `:75-78`, the alt flow at `:141-142`, the
  query contract at `:151`, the response envelope at `:190-202`
  (`{requests, vacation:{requests,pendingCount}, counts:{waitingOnMe,total}}`, and `totalCount`
  named as retired), the Error Messages row at `:221` (retired, naming `scopeForbidden` as the
  refusal that survives and `viewForbidden` as emitted by no route), and `:230` and `:237` the
  sidebar row and the filter options.
- **F2** — TC-10-INT-01's Expected Result had been left describing the retired envelope while
  its Steps moved to `?status=open`. `:308` now reads `vacation.requests` holding the three
  rows, `vacation.pendingCount: 3`, `requests: []` and `counts {waitingOnMe: 0, total: 0}`,
  which is what `apps/api/test/requests-page.spec.ts:210-236` asserts.

Neither is still present, so neither is planned as work. T9 exists so the plan has somewhere to
put the bookkeeping rule, and says in as many words that no work remains.

## The sweeps

**Contradiction.** Every absolute in the spec was taken to its call sites. Requirements 37 and
38 ("every signed-in member", "rendered for every signed-in member") forbid the page-level gate
that spec 10 asserted — that is now amended on both sides, and `apps/web/src/layout/Sidebar.tsx:82`
pushes the row unconditionally. Requirement 42's "unknown status or type is a 400, never a
silent fallback" forbids `parseRequestStatusFilter`'s fallback: that function survives at
`packages/validation/src/index.ts:1957` but has no caller left in `apps/` or `e2e/`, which is
what the retirement means. Requirement 47's "no outbound call of any kind" is consistent with
the diff, which touches nothing under `apps/api/src/mail/`. Requirement 36's "there is no
reassignment filter" contradicts `specs/requests/README.md:84`, which promises one — recorded
as a note below, not a blocker, because requirement 36 is explicit and the filter it forbids
could not even be expressed against a closed set that 400s on an unknown value.

**Premise.** Nine claims checked against the file that implements each; all hold. Two carry
line drift caused by this branch's own edits (`parseRequestStatusFilter` :1878 → :1957,
`TaskComment`/`TaskActivity` :997/:1030 → :1014/:1047) and one arithmetic slip in the area
README (30 new message keys claimed, 31 present, and the spec's own table lists 31). None
changes behaviour; all are in `premises`.

**External claims.** None to plan from. The spec's "Access this needs" table is a single row
saying the feature depends on no third-party system, no API key, no MCP server and sends no
mail — so there is no `Assumed` observation carrying a requirement. The one double this spec
does plan is the `MailService` recorder, and it is planned from what it must reproduce
(records sends, dispatches none), with the second half of TC-01-INT-21 asserting against
`MAIL_MESSAGE_TYPES` directly and not against the double at all.

**Call sites.** Two rules are phrased "every". Requirement 33's derive-on-every-read is listed
at all six serialization points (`requests.service.ts:237, :285, :315, :579, :594, :778`) — the
two GETs and the four write paths that return a row, because a row returned by a transition is
a read too. State-machine invariant 8's writer list is enumerated at `:419, :490, :597, :710`
plus the create handler's organization lock at `:354`.

**Writers.** The create handler shares the `Organization` row lock with six other paths:
`members.service.ts:157` and `:379`, `vacation-requests.service.ts:83`, `:206` and `:340`,
`vacation.service.ts:291`, `accrual.service.ts:74`. That is why nothing slow may run inside
that transaction, and it is written into T3's `concurrency`.

**Messages.** All 31 rows of the Error Messages table are exported from `REQUEST_MESSAGES`
(`packages/validation/src/index.ts:1803-1833`) and every one has an emitter named in the
handoff. The one message that now has no emitter is spec 10's retired
`REQUESTS_PAGE_MESSAGES.viewForbidden` (`:1983`), which is recorded as such rather than deleted
as a side effect.

**Verification.** Every row of the Verification Plan's state table says the route exists today.
The spec owes no fixture, no helper and no environment value, so no task is created for one.
The two environment-repair steps (`prisma generate` from `apps/api`, building
`@devscribed/validation`) are recorded in the spec as repair, not product code, and are not
tasks.

**Sections.** All twenty `##` headings are answered by name in `sections`.

## Two things nothing asserts

Recorded as risks rather than findings, because in each case the spec's own words decide it and
a blocker would halt the run over a sentence that is already there:

1. **The vacation section under `type=access` / `type=question`.** The contract fixes only
   `type=vacation`. The code returns an empty vacation block (`requests.service.ts:251`),
   reading `type` as the choice of section requirement 42 calls it. Consistent, unasserted.
2. **An unknown `scope`.** The spec fixes a 400 for an unknown `status` or `type` and is silent
   on `scope`; the code treats all three alike.

## Coverage

`node scripts/handoff-coverage.mjs` — pass: requirements 47/47, cases 41/41, sections 20/20.

## Verdict

`pass`. The spec compiles into a plan; one note goes to the human about the area README.
