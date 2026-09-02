# What blocked the eleven runs of `specs/requests/01-requests.md`

**Date:** 2026-09-02
**Ground truth:** the run artefacts on disk — `.workflow/runs/*_requests-01-requests/`, read from
branch `spec/requests` (the eleventh run is on `spec/requests-v2`). Every verdict, every finding
and every timestamp below comes from `run.json`, `*.verdict.json` and `events.jsonl`. No number
here comes from an agent's summary of itself.

## The ground truth

Eleven runs, one spec. Nine of them reached at least `pre_implement`.

| Run | Wall | Halted at | Blockers |
|---|---|---|---|
| `12-17-50` | 26 min | pre_implement | 3 spec |
| `12-43-50` | 1 min | preflight (`worktree-clean`) | — |
| `12-44-23` | 80 min | review | 2 static-gate code, 7 review (5 code, 2 spec) |
| `14-04-24` … `14-42-47` | 41 min | aborted by the operator | — |
| `14-44-29` | 49 min | implement | 2 spec, then review 2 |
| `15-33-10` | 35 min | review | 7 (1 code, 4 spec, 1 pipeline, 1 handoff) |
| `16-08-11` | — | abandoned | 1 pipeline |
| `06-12-40` | 30 min | **ready** | 0 |

`16-08-11`'s wall clock is 844 minutes and means nothing — it spans an overnight break with the
orchestrator stopped. Its stage spans are the honest figure: `review#1=17m`, `review#2=13m`,
`review#3=14m`, `review#4=10m`.

**24 blocking findings across all runs.** Classified by where the defect actually lived, not by
the `target` field the agent wrote:

| Root | Count | Share |
|---|---|---|
| A statement in a spec document | **14** | 58% |
| Product code | 7 | 29% |
| Pipeline code (`scripts/`) inside the spec's own diff | 2 | 8% |
| The handoff plan | 1 | 4% |

Two of the fourteen were routed `target: "code"` while naming a file under `specs/` — a spec
defect addressed to the one agent that is forbidden to fix it
(`.claude/agents/implementer.md:22`). Both came back half-done, and the second pass on the same
document blocked again (`15-33-10` F3: *"the previous run routed the same defect to `code` and it
came back half-done"*).

## The finding: pre-implement saw the defects and filed them as notes

The pre-implementer is not blind to these. It found them, wrote a full witness for them, and
chose `severity: "note"`.

| Defect | Filed as a note | Blocked at |
|---|---|---|
| The spec's UI section demands a DS-gaps table; there is none | `14-04-24` pre_implement P1, `14-44-29` P2 | `15-33-10` review F4 |
| The area README promises a reassignment filter requirement 36 says does not exist | `14-44-29` P1, `15-33-10` P1 | `12-44-23` review F7, `15-33-10` review F2 |
| The 400 for an unknown `status` names no message and no `packages/validation` export | `12-44-23` pre_implement P4 | never fixed — still a review note in the green run |

The note and the blocker carry the *same* witness. `14-04-24` P1 quotes
`specs/requests/01-requests.md:694-696`, enumerates the twenty `##` headings, names the three
hand-styled `<textarea>` elements and the literal `12px` at `NewRequestModal.tsx:337`. Five weeks
of downstream sweeps later, `15-33-10` F4 says the same thing with `grep -rn "DS gap"` and blocks
the run.

### Why: the two agents apply asymmetric criteria to the same artefact

The pre-implementer's own reasons, quoted from its verdicts:

- *"this note does not block, because the work is plannable without an answer"*
- *"Not a blocker: requirement 36 names the README's claim and overrules it in the same sentence, so the plan compiles unambiguously"*
- *"Raised as a note, not a blocker: requirement 36 settles it in writing, so nothing in the plan is undecidable"*

That is exactly what `.claude/agents/pre-implementer.md` asks for: *"Raise `target: "spec"` when
the spec **cannot be compiled into a plan**."* The test is **plannability**. A contradiction the
pre-implementer can resolve by preferring one side is correctly a note under that contract.

The reviewer is given the opposite instruction, in
`.claude/skills/code-review/SKILL.md:161-163`:

> When a rule is unconditional as written and the code gives a reason it should not apply, that is
> a contradiction between the code and the spec. Report it, with `"target": "spec"`, and let a
> human rule on it. **Never settle it yourself by preferring the code.**

So the same document defect is a note upstream and a blocker downstream **by design**. Nobody
regressed. The pipeline is asking two questions and treating the answers as comparable.

## The second finding: the pre-implementer is forbidden to read the spec that broke the run

`specs/requests/01-requests.md` frontmatter: `depends-on: ["user-management/04",
"user-management/10", "user-management/11"]`.

`.claude/agents/pre-implementer.md`, What you read, item 3:

> The specs listed in `depends-on` — their README and Shared Rules **only, not in full**.

Requirement 42 of spec 01 retires spec 10's entire query vocabulary. Eleven statements of spec 10
then assert the opposite of what ships — the page's audience, the endpoint's vocabulary, its
response envelope, its error row, the sidebar rule and the badge's meaning (`14-44-29` implement
I1, each of the eleven verified against HEAD). Those statements were **structurally out of the
pre-implementer's reach**. They surfaced for the first time at `implement`, three completed runs
in, and then cost two more review passes to finish marking.

## The third finding: the checklist already lists what blocked, and nothing runs it

`.claude/skills/spec/references/checklist.md` contains, verbatim:

- *"Every `data-testid` in the selectors section appears in an E2E case, and vice versa."* —
  violated by `15-33-10` F5 (TC-01-E2E-05 must assert a field error for which no id is named) and
  still violated in the green run (`requests-type-filter` is named in TC-01-E2E-13's selectors and
  exercised by no case).
- *"Every error message in the spec appears in the Error Messages table, and every row of that
  table names its `packages/validation` export and the route that emits it."* — violated by
  `12-17-50` P3 (`notYoursToAnswer`) and `12-44-23` P4 (the unknown-value 400).
- *"The area README index, dependency graph, and cross-spec side effects are updated."* — violated
  by the reassignment-filter row, twice a note and twice a blocker.
- *"Every unconditional invariant was checked against the call sites it already governs"* and
  *"Every state transition writes its audit record in the same transaction"* — violated by
  `12-44-23` F1, the missing `message_posted` event on the decline branch.

The checklist is a pre-presentation self-check inside `/spec`. It runs when the spec is written
and never again. Nothing in the ship pipeline evaluates it.

**Not in the checklist:** the DS-gaps table, and any item about amending a spec this one overrules.
Those are the two largest defect classes of the eleven runs.

## The hypothesis that died: "review kept finding new things"

It did not. Measured across the four review passes of `16-08-11` and the passes of `12-44-23` and
`15-33-10`, the reviewer blocked twice on requirement 36, twice on the spec-10 amendment banner,
and twice on `normalizeRole()` not being applied to a new screen (`12-44-23` F2 on the list page,
`15-33-10` F1 on the detail page — the same rule, a different file, one run apart). The pipeline
was not discovering; it was re-reporting a fixed set of defects against a moving diff.

The corollary is that the loop's cost was not review's thoroughness. It was that **nothing between
runs converted a repeated finding into a rule**, and the one carry mechanism that was built during
these runs carried only `code`-addressed blockers to `pre_implement` and `implement` — the two
stages whose contracts let them be settled rather than raised.

## A detector that cannot fail

`scripts/handoff-coverage.mjs` is the mechanical coverage gate the pre-implementer runs before
reporting done. On this spec it reports:

```
handoff-coverage: pass  (specs/requests/01-requests.md)
  requirements 47/47  cases 0/0  sections 21/21
```

The spec defines **41** test cases. Measured directly:

```js
const cases = [...s.matchAll(/^### (TC-[A-Z0-9-]+)[: \n]([\s\S]*?)(?=\n### |\n## |$)/gm)];
// against the file as it is on disk:            0
// against the same text with \r\n → \n:        41
```

`specs/requests/01-requests.md` has CRLF line terminators. The character class `[: \n]` at
`scripts/handoff-coverage.mjs:85` does not contain `\r`, so a heading of the form
`### TC-01-UNIT-01\r\n` matches nothing. The `case-unclaimed` check has been silently passing on
every run of this spec, and printing `cases 0/0` as evidence of success. The requirement and
section checks are unaffected — they read line *starts*, not line ends.

This was itself reported by an agent, as a `self` note, in the last run before the rebuild
(`16-08-11` pre_implement P2: *"handoff-coverage's live-case check is blind on this spec because
the file is CRLF, so its `pass` says nothing about the testCases block; I verified those 41 ids
directly instead"*). It was carried to no one.

## What the numbers say about a "spec refiner" stage

A new agent between `preflight` and `pre_implement` costs one opus pass per run — the
pre-implementer's own spans put that at 3–14 minutes — and duplicates the sweeps
`.claude/agents/pre-implementer.md` already prescribes: Contradiction, Premise, Messages, Sections.
It would find the same defects the pre-implementer already found.

It would not block on them either, unless its severity rule differed from the pre-implementer's.
**The value people attribute to the new stage is entirely in that severity rule**, which can be
changed in the existing agent for nothing.

The three changes the artefacts support, in order of measured return:

1. **Give the pre-implementer the reviewer's no-settling rule.** Its criterion is "can I compile a
   plan"; the reviewer's is "do these two authoritative statements agree". Two of the four late
   spec blockers (`15-33-10` F2 and F4) were already written up by the pre-implementer, with
   witnesses, as notes.
2. **Widen the `depends-on` read when this spec overrules a dependency.** A spec that says a
   vocabulary is "retired on this endpoint" has just invalidated statements in another document;
   that document is read in full and every overruled statement becomes a task. This is the whole
   of `14-44-29`.
3. **Make the decidable half of the spec checklist a script, run at preflight against the spec
   alone.** Testid list against E2E selectors both ways; Error Messages rows against
   `packages/validation` exports and emitting routes; cited paths exist; `## DS gaps` present when
   the UI section states the obligation; every `TC-*` in the spec present in a test file. These are
   grep, not judgement, and a script that blocks costs seconds where an opus pass costs minutes.

And fix `handoff-coverage.mjs:85` before any of them, because the gate that is supposed to catch a
missing case currently reports success at seeing none.

## Held-out run: the refiner against the spec as it was, before any of it was known

**Ground truth:** `specs/` restored to `ec97c8f` — the tree run `12-17-50` was initialised on,
before any repair. The agent was given the spec path and `no request given`, on a clean context,
and knew nothing of the eleven runs. Its verdict is
`.workflow/refine/requests-01.verdict.json`, written 2026-09-02, 865s, 42 tool calls,
193k tokens.

Its own enumerations: currency 44 statements, contradiction 31 absolute rules, consequence 31
statements across 4 documents, obligations 129 items, scope 0 (skipped, no request). **18
blockers, 8 notes.**

### The seven defects that were known

Each one is a defect some run actually blocked on, and each was verified present in the
`ec97c8f` text before the agent ran.

| # | Defect | Blocked which stage, then | Refiner |
|---|---|---|---|
| 1 | Cross-org `projectId`: requirement 9 (:97) says 400 `projectUnavailable`, the POST contract (:487) says 404 never 403 | `pre_implement` P1 | **R1** |
| 2 | Requirement 42's `status` vocabulary retires the one the shipped page sends | `pre_implement` P2 | **R3**, R7, R8 |
| 3 | Requirement 23 restricts `answered`; no status, no message, no `notYoursToAnswer` row | `pre_implement` P3 | **miss** |
| 4 | TC-01-INT-13 (:948) unsatisfiable — `neededBy` = tomorrow is past for no reader | `review` F6, after the code | **R6** |
| 5 | Reassignment filter: :174 and README:84 against requirement 42's closed set | `review` F7, after the code | **miss** |
| 6 | DS-gaps obligation (:614) with no table | `review` F4, after the code | **R17** |
| 7 | Spec 10 unamended — zero marks, `totalCount` live | `implement` I1, three runs in | **R8** |

**Five of seven.** Four of those five had cost a full run each.

Where it went further than the runs did: `implement` I1 found **eleven** statements in spec 10
over two passes; R8 enumerates **twenty-four**, each with its line and the requirement that
overrules it, and names the one that is live as a passing test
(`apps/api/test/requests-page.spec.ts:324`).

### The two misses

Both are real defects the agent did not raise, and neither is explained by a missing rule — the
closed list has a slot for each.

- **`notYoursToAnswer`.** Its obligations sweep did check the Error Messages table and did report
  three missing rows — but a different three (the reassign route has no `Errors` block at all;
  the inactive-addressee banner copy has no export). It enumerated the table and not the set of
  refusals the transition contract implies.
- **The reassignment filter.** Its contradiction sweep enumerated 31 absolute rules and cleared
  requirement 42's closed filter set as consistent. Requirement 36's clause sits in prose four
  sections earlier; the sweep reads the absolute rule and looks for what violates it, and a
  promise made elsewhere is not something the rule's own neighbourhood contains.

### What it found that no run ever did

Verified against `ec97c8f`, so none of these is an artefact of the setup:

| Finding | What |
|---|---|
| R9 | `10-organization-requests-page.design.md` — 4 statements still specifying the role gate, the badge fetch and the filter default |
| R10 | `00-app-shell.design.md:56,:67` — the nav table still records Requests as admin/manager only |
| R11 | `user-management/README.md:51` cites `TC-01-INT-24`; the integration cases stop at 21 |
| R13 | The Known Gaps row rests on `setMembershipRole` being "used by members-list.spec.ts". At `ec97c8f` its users are `field-autofill.spec.ts` and `helpers.ts` |
| R14 | The Verification Plan records a run against `devscribed_e2e at localhost:5434`. `docker-compose.yml` at `ec97c8f` publishes `5433:5432` and nothing else |
| R16 | TC-01-UNIT-06 asserts on `CAPABILITY_MATRIX`, which is `const` at `index.ts:580` and exported by nothing |
| R18 | The reassign route (:520) states a capability and lists no errors; the inactive-addressee banner copy (:396) is user-facing text with no `packages/validation` export |

R14 is the one worth pausing on. ADR 0006 makes proving the verification route the spec stage's
job, and the route this spec recorded names a port the repository does not publish. Nothing
downstream of `/spec` reads that section closely enough to notice; four runs did not.

### Three notes became blockers, which is the whole point

The severity rule was the change this ADR is about. It fired, and it is checkable:

| Refiner | Same defect, filed earlier as a **note** |
|---|---|
| R2 — AC-3 forbids exactly what requirements 37 and 38 require | `12-17-50` pre_implement **N1** |
| R4 — invariant 8 enumerates the writers of a `Request` row and omits the message handler | `16-08-11` pre_implement **P1** |
| R5 — requirement 43's comparator does not demote terminal rows; TC-01-UNIT-04 says it does | `12-17-50` pre_implement **N3** |

And one more, in the other direction. R22 is a **note**: requirement 25 stores the decline reason
as a `RequestMessage`, requirement 19 says every message writes a `message_posted` event, and the
spec never says whether the decline's does. That ambiguity is what run `12-44-23` met as review
**F1** — a `code` blocker, found after the implementation, on the branch, at 80 minutes. Settled
in the spec it is one sentence.

### The false positives, and whose fault they are

Three findings are artefacts of the setup, not of the agent: the specs on disk came from
`ec97c8f` and the code from `main`, 49 lines apart in `schema.prisma` alone.

| Finding | Claimed | At `ec97c8f` |
|---|---|---|
| R12 (blocker) | `TaskComment` is at :1046, not :997 | `model TaskComment` **is** at 997; `TaskActivity` **is** at 1030 |
| R15 (blocker) | four schema citations in the README are wrong | `VacationRequest` 680, `Project` 719, `Client` 763 — as cited |
| R19 (note) | 19 migrations, not 17 | 17 |
| R21 (note) | 36 sites / 17 files, and `Sidebar.tsx:73` | 16 files, as claimed — but `nav-members` **is** at :73 against the README's :71, so half of this one is real |

**16 of 18 blockers stand. Precision 89%, and the two failures are the harness, not the judge** —
against a spec and a tree at the same commit, the currency sweep would have cleared all three.
That is the sweep behaving correctly: it reported claims that were false against the files in
front of it.

### The hypothesis that died: that a spec judge would drown the author in findings

18 blockers on one spec sounds like a judge with no threshold. It is not what happened. Every
blocker carries a witness with a `file:line` or a command, 16 of 18 survive checking, and the
distribution is lopsided in a way that matters: **four of the blockers are contradictions inside
the spec, four are documents this spec silently invalidated, and six are claims about the
repository that were simply false.** None of them is a matter of taste, and the closed rule list
is what makes that true — the agent could not have raised a style objection if it wanted to.

What is genuinely unmeasured: whether a spec that is *not* broken comes back `pass`. Every
measurement here is one spec, and it is a spec eleven runs had already proven defective.
