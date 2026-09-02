# 0008 — A spec is judged by a stranger, before the pipeline is paid for

**Decided** 2026-09-02.

## The rule now

`/spec` no longer ends in a self-check. Step 6 dispatches **`spec-refiner`**, a judge on a clean
context that is handed two things — the spec path and the request the spec answers — and inherits
nothing else. `npm run refine -- <spec path>` runs the same judgement standalone, on any spec, at
any time.

It holds no editing tools. It returns findings; the author, or a person, repairs the document.

It asks three questions:

| Sweep | Question |
|---|---|
| **Currency** | Is every claim this spec makes about the repository still true? |
| **Contradiction** | Do two clear statements disagree — inside the spec, against the area README, against a `depends-on` spec, against `CLAUDE.md`? |
| **Consequence** | What has this spec just made false in the documents around it? |

Plus two more: **obligations** the spec imposes on itself and does not meet, and **scope**
against the request it was written to answer.

Its severity rule is the one that matters:

> **Two statements that disagree block, even when you can tell which one is right.** Naming the
> winner is a `suggestedFix`, never a resolution.

It reads **every `depends-on` spec in full**, and every spec that names this one in its own
`depends-on`.

## What it replaces

`.claude/skills/spec/references/checklist.md` was the author's pre-presentation self-check. It
stays, as the refiner's rubric and as the standard to write to. It is no longer run by the
person who wrote the spec, because that is the one reader who cannot see what is missing: they
read the sentence they meant.

## Why not a stage in `ship`

Because `pre-implement` is already there, already runs Contradiction and Premise sweeps, and
already finds these defects. Adding a stage to the pipeline buys an opus pass per run and finds
what an existing pass finds.

What it does not buy is a **block**, and that turned out to be the whole problem.

`.claude/agents/pre-implementer.md` blocks when *"the spec cannot be compiled into a plan"* — a
**plannability** test. `.claude/skills/code-review/SKILL.md:161` forbids the reviewer to settle
anything: *"Never settle it yourself by preferring the code."* — a **truth** test. The same
defect in the same document is therefore a note upstream and a blocker downstream, by design.
Measured over eleven runs of one spec, the pre-implementer filed as notes, with full witnesses,
three of the spec defects that later blocked review — twice for the DS-gaps table, twice for a
filter one requirement promised and another forbade. Its own words in those verdicts: *"this note
does not block, because the work is plannable without an answer"*.

So the value of a "spec validator" is not the agent. It is the severity rule. A new stage inherits
whichever rule it is given, and the rule can be given to an agent that already exists — which is
what the refiner is, moved to where it costs nothing.

## Why outside the pipeline

A spec defect found in `ship` costs a run: the branch is built, the gate runs, the reviewer
shards, and the halt discards none of that but resumes nothing either. Found before, it costs one
pass over one document.

The measured shape, from the same eleven runs: `12-17-50` halted at `pre_implement` in **26
minutes**, before any code existed. `12-44-23`, `14-44-29` and `15-33-10` halted on spec defects
after the code was written, at **80, 49 and 35 minutes**. The eleventh run, once the spec had been
repaired, reached `ready` on the first pass of every stage in **30 minutes** with `code 0/8`.

## Why it may not edit

The precedent is ADR 0004's, and the reason is the same: an agent that repairs what it finds stops
finding things. There is a second reason here — `CLAUDE.md` requires a spec to change
*deliberately*, and deliberation is a property of a person. An agent that resolves a contradiction
by preferring the better-written side is doing exactly what the pre-implementer was doing when it
downgraded contradictions to notes.

## Why it reads dependencies in full

`specs/requests/01-requests.md` declares `depends-on: ["user-management/04", "user-management/10",
"user-management/11"]`, and its requirement 42 retires spec 10's entire query vocabulary. Eleven
statements of spec 10 then asserted the opposite of what shipped — the page's audience, the
endpoint's vocabulary, its response envelope, its error row, the sidebar rule, the badge's
meaning.

The pre-implementer was *forbidden* to see them. Its contract reads: *"The specs listed in
`depends-on` — their README and Shared Rules **only, not in full**."* The eleven statements were
structurally out of reach, surfaced for the first time at `implement`, three completed runs in,
and then took two more review passes to finish marking.

That restriction is right for the pre-implementer, which is compiling a plan and does not need
another document's prose. It is wrong for a judge asking what this document has invalidated.

## What is not settled

**No held-out spec.** Every measurement behind this record comes from one spec's eleven runs. The
sweeps, the six-rule closed list and the severity rule are fitted to defects that spec actually
produced, and a defect of a shape those runs did not contain is one nothing here can see.

**The refiner is not cheap.** It reads every dependency in full, which on an area like
`user-management` is eleven documents. Whether that is worth an opus pass on a spec touching one
dependency is unmeasured; the alternative — reading a dependency only when the spec claims to
change something in it — trusts the spec to know what it changed, which is the claim under test.

**Half of what blocked is decidable by script, and no script runs it.** The checklist already
contains, verbatim, the items behind several blockers: every `data-testid` appearing in an E2E
case and vice versa; every error message present in the Error Messages table naming its
`packages/validation` export and its route; cited file paths existing. These are grep, not
judgement, and a script that blocks costs seconds where a model pass costs minutes. The refiner
runs them as sweeps in the meantime, which is the expensive way to check whether a path exists.

**`scripts/handoff-coverage.mjs` reports success at seeing nothing.** Its live-case regex at line
85 uses the character class `[: \n]`, which does not contain `\r`, so on a CRLF spec it matches no
`### TC-…` heading at all. On `specs/requests/01-requests.md` — 41 cases — it prints `cases 0/0`
and passes. Measured: 0 matches against the file on disk, 41 after normalising `\r\n` to `\n`. An
agent reported this as a `self` note in the last run before the rebuild; nothing carried it. Left
unfixed here deliberately: it is a pipeline change and belongs in its own commit.

## Consequences

- `.claude/agents/spec-refiner.md` — new. Judge, no editing tools, opus.
- `.claude/skills/refine/SKILL.md` — new. Dispatch, apply, re-dispatch.
- `.claude/skills/spec/SKILL.md` step 6 — was "run every item in the checklist", now the dispatch.
- `.claude/skills/spec/references/checklist.md` — three items added, all of them defect classes
  the eleven runs produced and the checklist had no line for: the DS-gaps table, amending an
  overruled statement in the document that holds it, and amending a test case's Expected Result
  alongside its Steps.
- `npm run refine`, and `scripts/claude-cmd.mjs` accepts it.
- The pre-implementer's contract is **unchanged**. Its plannability test is correct for
  compiling a plan, and the defects it downgraded are now blocked by a pass that runs before it.
- Measurements, including the hypothesis that review kept finding new things — it did not, it
  re-reported a fixed set against a moving diff — in
  [docs/research/2026-09-02-what-blocked-the-requests-runs.md](../research/2026-09-02-what-blocked-the-requests-runs.md).
