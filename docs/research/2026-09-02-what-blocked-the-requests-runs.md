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
