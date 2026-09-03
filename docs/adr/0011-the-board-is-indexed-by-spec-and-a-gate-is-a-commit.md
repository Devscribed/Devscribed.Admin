# 0011 — The board is indexed by spec, and every gate is a commit

**Status:** current.

## The rules

**One.** The board opens on the **specs**, not on the runs. A spec opens on everything run
against it — refine loops and ship runs together, newest first — and one of those opens on the
report the board has always drawn. Three levels, each answering one question.

**Two.** A **refine loop is an entry like any other**, addressed as `refine:<stem>`, drawn from
the same payload shape as a run by the same page.

**Three.** **Every gate of a refine loop commits what it wrote, when it wrote it**, and the
ledger is saved between gates rather than at the end of a round. The spec bundle rides with the
fixer's commit and no other.

## Why the index is the spec

A run id is a fact about the pipeline. `2026-09-01T14-44-29_requests-01-requests` answers "when
did this start" and nothing else, and eleven of them for one spec is a list in which the thing
being worked on appears only as a suffix. The question a person arrives with is "where is spec
02" — which of my specs is moving, what has it cost, what stopped it last time.

The numbers on the current tree make the point. Twenty-six specs exist; three have ever been
run against. Sixteen runs and one loop hang off those three, eleven of them off `requests/01`
alone. A flat list of seventeen entries shows the eleven at full weight and the twenty-three
untouched specs not at all.

**A spec's cost sums; its wall clock does not.** The spec view adds up dollars across entries
and refuses to add up time: a run abandoned in August and stamped again in September spans a
fortnight in which nobody worked, and four of those add to a number that reads as effort and is
calendar. Per entry the span is honest, because that is what an entry is.

## Why a refine loop had to be visible at all

Before this, a loop was a line of console output. `scripts/refine-loop.mjs` wrote its ledger
when a **round ended**, so a T1 gate that had been thinking for twelve minutes was in no file
the board read — and the ledger that was there said `blocked`, the state the *previous* round
stopped in, for as long as the current one ran. The board would have reported the opposite of
the truth.

What made it possible is that the loop runs its agents through the SDK when it is started from
inside a Claude session, appending one JSON message per line as they arrive. So a gate in
flight has a per-message clock, a tool-call stream and a running turn count — richer, in fact,
than a ship stage, whose log is written once at the end. `scripts/refine-read.mjs` parses that
stream; `scripts/refine-report.mjs` turns a loop into the run-shaped payload the page draws.

**The ledger is now written between gates.** That is the half that does not depend on parsing
anything: the round is recorded when it starts, and each gate's decision as it lands.

## Why a gate is a commit

`.gitignore` has carried a deliberate policy since the pipeline was built: a run's **summaries**
are committed — `run.json`, `handoff.json`, the verdicts, the stage reports — and its **raw
transcripts** are not, because blobs and thinking snapshots are measured in hundreds of
megabytes a week. That policy was written for `.workflow/runs/*/…` and the refine loop's probe
directories were never added to it, so a 900 KB `pre_implement.log` sat untracked in the working
copy next to the verdict that mattered.

The rule now covers both, and the loop commits per gate rather than per round. Per round was not
enough for a reason that shows up on every stop: `commitRound` ran **after the fixer**, and a
round that halted at T0 or T1 never reached it. The verdict that stopped the loop, the plan it
was compiled from, and the ledger recording it were left untracked — which is what a person
finds later as fourteen unexplained files in a commit panel, and what they lose when they clear
the working copy.

A gate is the smallest thing that produced a judgement, so it is the thing worth a commit:

```
refine(requests-02): round 1 T0 spec-lint — clean
refine(requests-02): round 1 T1 pre-implement — blocked, 2 spec finding(s)
refine(requests-02): round 2 T2 spec-refiner — 5 blocker(s), 3 note(s)
refine(requests-02): round 2 fix spec-fixer — 5 fixed, 2 decided, 0 left
```

**Only the fixer's commit carries the spec.** The next round is judged against a commit range,
and that range must hold repairs and nothing else — a range that also carried three gates' worth
of `.workflow` churn would have the judge sweeping its own bookkeeping.

**The shared verdicts are copied into the round that produced them.** `spec-refiner` and
`spec-fixer` each write to one path that the next round overwrites, so a commit carrying only
that file records nothing durable. This closes the gap
[0009](0009-specs-are-frozen-and-the-newest-one-governs.md) recorded and could not fix from
where it stood: *"a refine loop leaves no history — only the last verdict survives"*.

## What it costs

**More commits, and they are machine-written.** A three-round loop that reaches the fixer every
time leaves twelve. They are confined to `.workflow/refine` except for the fixer's, and each one
names what it decided, which is what makes the history worth reading rather than worth hiding.
If this is ever re-litigated, the argument on the other side is squashing a finished loop into
one commit — and the thing that argument has to answer is what happens to a loop that stops at
T1, which is most of them.

**A killed round consumes its number.** The record is pushed when the round starts, so a loop
killed mid-round leaves a record marked `running` and the next invocation continues at the next
number rather than retrying. That is the honest version — an interrupted round happened — and it
is visible on the board as a round that never ended.

**The page renders payloads it did not build.** `run-report.mjs --from-json` exists so the
markup has one definition and two producers. The alternative was a second copy of eight hundred
lines of page, which drifts.

## A bug this work found

`--dry-run` **destroyed the last verdict of a loop**. `runAgent` deleted the stale verdict file
before it checked the dry-run flag, so `node scripts/refine-loop.mjs <spec> --dry-run` — the
command whose contract is "print what each gate would run, change nothing" — removed
`.workflow/refine/<stem>.verdict.json` and returned success. Found by running it against real
artefacts and reading `git status` afterwards. The delete now happens after the flag is checked,
and `saveLedger` is a no-op under it for the same reason.
