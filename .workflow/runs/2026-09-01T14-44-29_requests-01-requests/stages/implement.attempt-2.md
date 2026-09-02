# implement — attempt 2

Run `2026-09-01T14-44-29_requests-01-requests`, spec `specs/requests/01-requests.md`,
branch `spec/requests`, diff base `f06c7d844daeba66bc0f2545c5071600e6cb4037`.

**Verdict: blocked, with two `spec` findings.** Neither review finding is contested — I
verified both against HEAD and both are correct. Neither is fixable by this stage: the
only repair for either is an edit to `specs/user-management/10-organization-requests-page.md`,
and the implement stage may not edit anything under `specs/`. The attempt-1 code (commit
`e17de7a`) stands unchanged; this attempt adds no code.

## Why these two cannot be fixed here

Two independent authorities forbid the edit the findings ask for, and both name the same
alternative:

1. **The static gate, rule 1** — `scripts/static-gate.mjs:74` iterates
   `git diff --name-only <run.headAtInit> -- specs`. The pathspec is `specs`, not
   `run.spec`, so **every** file under `specs/` is covered, spec 10 included. Any edit I
   make there returns as a `pipeline/spec-immutable` blocker whose own `suggestedFix`
   (`static-gate.mjs:84`) reads: *"revert the spec edit and raise a finding with target
   'spec' instead — that halts the run for a human, which is the intended path."*
   `run.headAtInit` is `1f92f73`, and `git diff --name-only 1f92f73 -- specs` is currently
   empty — so the edit would be attributed to this stage, correctly.
2. **My own standing rule** — never edit anything under `specs/`; if the spec is wrong,
   say so and let a person change it deliberately. CLAUDE.md states the same principle:
   *"When behaviour and spec disagree, the spec wins — change the spec first,
   deliberately."*

`scripts/wf.mjs:64` gives this stage exactly one address, `spec`, and `TARGET_PRIORITY`
routes a spec blocker to a halt. So the escalation below **is** the mechanism, not an
evasion of it.

**This exact loop has already run once on this branch and worked.** The previous run's
review raised the same class of defect (carried finding F3, spec 10's retirement notes).
It was not fixed by an implement stage — it was fixed by `ffa814d`,
`docs(specs): fix the two spec defects review found, and amend spec 10`, a separate
deliberate commit outside any implement attempt, after which the run resumed with
`--from`. `f06c7d8`, the diff base itself, is the same shape: `docs(specs): resolve the
three requests-spec blockers pre_implement found`. Both sit before `headAtInit`, which is
precisely the case the gate's comment at `static-gate.mjs:56` describes.

**Where the routing went wrong, for the reviewer to note.** The handoff's task T9 lists
`specs/user-management/10-*.md` among its `files` (`handoff.json`, T9). That file list is
not executable by this stage — the gate blocks it. T9's own description says the work was
"ALREADY DONE at commit ffa814d", which is how it was true at plan time: a human had done
it. A plan that assigns a `specs/` path to the implementer will keep producing this
collision; the fix is for T9 to name the amendment as a human prerequisite rather than an
implementer task. I am not addressing `handoff` — that is the reviewer's to route — so I
record it here as instructed.

## The two findings, addressed

### Review F1 — nine unmarked statements in spec 10 assert the opposite of what ships

**Not contested. Verified correct, in full, against HEAD.** Escalated as finding **I1**.

I checked every line the reviewer cites and found one more they did not:

| Line | What it says | What overrules it |
|---|---|---|
| :35 | "`user` and `viewer` have no access to this page" | req 37; `apps/api/test/requests-page.spec.ts:325` asserts 200 for both |
| :42 | matrix row `View Requests page \| ✅ \| ✅ \| ❌ \| ❌` | req 37 |
| :53 | "**Default filter:** pending requests … approved, rejected, cancelled, or all" | req 42 — `?status=pending` now answers 400 (`apps/api/test/requests.spec.ts:1288`) |
| :61 | badge = "the count of pending requests" | req 44; `requests-badge-context.tsx:58` sums `waitingOnMe` + `vacation.pendingCount` |
| **:139** | "Caller must be `admin` or `manager` with `active` membership" — **not in the review's list, same defect** | req 37 |
| :142 | "`status` — `pending` (default), `approved`, `rejected`, `cancelled`, `all`" | req 42, the vocabulary the banner 128 lines above declares retired |
| :178–179 | top-level `"pendingCount": 2, "totalCount": 15` | the envelope is now `{requests, vacation:{requests,pendingCount}, counts:{waitingOnMe,total}}`; `totalCount` exists nowhere in the codebase |
| :198 | Error Messages row "Requests page — forbidden" | req 37; `REQUESTS_PAGE_MESSAGES.viewForbidden` (`packages/validation/src/index.ts:1983`) is emitted by no route — confirmed by `git grep`, its only reader is the unit assertion at `packages/validation/src/requests-page.test.ts:80` |
| :207 | "Visible to `admin` and `manager` only" | req 38; `Sidebar.tsx:83` pushes the row unconditionally |
| :208 | badge = "count of pending requests" | req 44, as :61 |
| :214 | dropdown options "Pending" (default), "Approved", "Rejected", "Cancelled", "All" | shipped control is All statuses/Open/Answered/Granted/Declined/Cancelled (`page.tsx:35`), and `e2e/tests/requests-page.spec.ts:146` selects "Open" |

The reviewer's characterisation is exact: the banner at :14–23 promises "Each affected
statement below is marked in place", and requirements 8 and 9 (:59, :63) *are* marked
while these are not. The banner is a claim about the document that the document does not
keep.

### Review F2 — TC-10-INT-01 amended by half

**Not contested. Verified correct.** Escalated as finding **I2**.

`specs/user-management/10-organization-requests-page.md:281` carries the vocabulary
amendment on the Steps (`?status=open`, with the note), and :285 still reads "Returns 3
requests … `pendingCount: 3`" — the retired top-level envelope. The test carrying that id
(`apps/api/test/requests-page.spec.ts:210`) asserts the shipped shape:
`vacation.requests` length 3, `vacation.pendingCount` 3, `requests` `[]`, `counts`
`{waitingOnMe: 0, total: 0}`. Written to the Expected Result as it stands, the case would
fail — there are no `Request` rows in that fixture, which is requirement 41 working
correctly. **The test is right and the spec sentence is stale**, so the repair is the
sentence. Changing the test to match :285 would make it assert an envelope the endpoint
must not return under requirement 42, and would break `AC-12`'s witness (TC-01-INT-20).

## Amendment text, ready to paste

Written out so the halt costs a person a minute rather than an investigation. Every value
below was read from the code, not from prose.

- **:35** — `- **Actors:** every signed-in member opens this page and sees the requests they raised or hold (requests/01 requirement 37). `admin` and `manager` additionally see the org-wide vacation section, which keeps requiring `view-requests`.`
- **:42** — replace the single row with two:
  `| View Requests page | ✅ | ✅ | ✅ | ✅ |`
  `| View org-wide vacation section (`view-requests`) | ✅ | ✅ | ❌ | ❌ |`
  (verified: `CAPABILITY_MATRIX` holds `'view-requests'` true for admin/manager, false for user/viewer — `packages/validation/src/index.ts:607, 637, 667, 697`.)
- **:53** — `2. **Default filter:** `all` (**amended by requests/01 requirement 42**, was pending). The values are `all`, `open`, `answered`, `granted`, `declined`, `cancelled`; `open` selects vacation `pending`, `granted` selects `approved`, `declined` selects `rejected`. An unknown value is a `400`, never a fallback.`
- **:61** and **:208** — `The sidebar item shows a **badge** counting the requests waiting on the caller (`counts.waitingOnMe`) plus, for a holder of `view-requests`, the pending vacation count (**amended by requests/01 requirement 44**). Hidden at 0.`
- **:139** — `**Authentication:** required. Every `active` member of the organization may call it (**amended by requests/01 requirement 37**); the `vacation` block is present only for a caller holding `view-requests`.`
- **:142** — `- `status` — `all` (default), `open`, `answered`, `granted`, `declined`, `cancelled`.` / `- `type` — `all` (default), `access`, `question`, `vacation`.` / `An unknown value in either is a `400` (**amended by requests/01 requirement 42**).`
- **:144–180** — replace the response block with the envelope in
  `specs/requests/01-requests.md:495-509`, noting that the spec-10 cards live unchanged
  inside `vacation.requests` (that byte-identity is AC-12, witnessed by TC-01-INT-20).
- **:198** — `| ~~Requests page — forbidden~~ | **Retired by requests/01 requirement 37** — the endpoint answers 200 to every member. The refusal that survives is `REQUEST_MESSAGES.scopeForbidden` on `scope=all`. |`
  One decision comes with it, which is why I have not pre-empted it in code:
  `REQUESTS_PAGE_MESSAGES.viewForbidden` is now emitted by no route. Either it is deleted
  along with its assertion at `packages/validation/src/requests-page.test.ts:80`, or it
  stays as dead copy. Deleting an export while spec 10 still lists it would trade one
  inconsistency for another, so it wants the same deliberate pass as the text.
- **:207** — `- Rendered for every signed-in member (**amended by requests/01 requirement 38**), positioned after "Members".`
- **:214** — `- Status filter dropdown (`requests-status-filter`): options are "All statuses" (default), "Open", "Answered", "Granted", "Declined", "Cancelled". A type filter (`requests-type-filter`) sits beside it. Changing either reloads the list.`
- **TC-10-INT-01 :285** — `1. HTTP 200. `vacation.requests` holds the 3 rows across M1 and M2, each with member info, balance and dates, and `vacation.pendingCount` is 3. `requests` is `[]` and `counts` is `{ waitingOnMe: 0, total: 0 }` — nobody raised a spec-01 request in this fixture, because vacation rows are not `Request` rows (requests/01 requirement 41). (**Amended by requests/01 requirement 42:** was a top-level `pendingCount: 3`.)`

## State of the branch

Attempt 1's work is committed at `e17de7a` and unchanged: the `message_posted` event on
the decline branch, `normalizeRole` on the inbox page and the badge provider, the extended
TC-01-INT-11, and the two re-anchored E2E assertions. Nothing in either review finding
touches that code, and I re-ran nothing, because nothing in `apps/`, `packages/` or `e2e/`
changed this attempt.

| Command | Summary |
|---|---|
| `git diff --name-only 1f92f733 -- specs` | empty — this stage has edited no spec, and will not |
| `git diff --stat e17de7a..HEAD -- apps packages e2e` | empty — no code change in attempt 2 |

## Tasks

Unchanged from attempt 1 (T4, T5, T7, T8 done and committed; T1, T2, T3, T6 already on the
branch). **T9 is the blocked one**: its `specs/user-management/10-*.md` file cannot be
written by this stage, and finding I1/I2 below is the route the pipeline provides for it.
