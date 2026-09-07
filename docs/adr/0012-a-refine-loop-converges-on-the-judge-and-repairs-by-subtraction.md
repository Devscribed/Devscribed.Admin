# 0012 — A refine loop converges on the judge, and a repair subtracts before it adds

**Decided** 2026-09-03. Amends 0008 (where the pre-implementer sits) and the loop that 0011
made a sequence of commits.

## The rule now

The gate order in `scripts/refine-loop.mjs` is **T0 → T2 → T1**. The judge runs first — the
whole document on round one, the previous repair's commit range after that — and the
pre-implementer runs **once, last, after a clean verdict**. Whichever gate blocked, its verdict
goes to `spec-fixer`; a person never repairs a verdict in the conversation.

A finding blocks only under the closed rule list, and the loop enforces the list itself: a
blocker filed under any other rule is demoted to a note before the arithmetic runs, whichever
agent wrote it. The list is in `.claude/ai-workflow.config.json` (`refine.blockingRules`).

The loop has a fourth arithmetic stop, **`growing`**: after the fixer's commit it reads
`git diff --numstat` over the bundle, and a repair that added more than
`refine.maxGrowthPerFinding` net lines per blocker stops the loop for a person, with the
commit standing so the person can read what was added.

`spec-fixer` repairs in a fixed order — delete the statement, narrow the rule, change the
word, add one sentence — and a repair that would add a route, a writer, a lock, a column, a
screen or a concurrency case is `left`, not made. `pre-implementer` carries the same closed
rule list and the same "refining is not growing" rule the judge already had.

`/spec` states the request in the Summary's first sentence and every addition beyond it in its
last lines. The refiner's scope sweep blocks on an unnamed addition when it is a new route, a
migration, a new writer of an existing row, or a changed contract of a shipping route; every
other over-coverage stays a note. The checklist's "every writer has a lock and a concurrency
case" became "where two writers race in ordinary use"; where they do not, one line says so.

## What it replaced

0008 placed the pre-implementer first in the loop — "the pipeline's own gate, run early" — and
left its contract unchanged: a plannability test with no closed rule list and no diff mode. The
convergence arithmetic (`stuck-finding`, `not-converging`) applied to T2 only, and a T1 block
ended the round before the fixer ran.

## Why

Two rounds of `refine-loop` on `specs/requests/02-request-topics.md` on 2026-09-03, both
stopped by T1, neither reaching T2. The measurements are in
[docs/research/2026-09-03-the-refine-loop-grew-the-spec.md](../research/2026-09-03-the-refine-loop-grew-the-spec.md);
the shape:

- **T1 returned a different subset each round.** Round 2 raised two blockers that were
  verbatim in the draft T1 had judged in round 1. That is the behaviour the judge was given a
  diff mode to prevent, on the one gate that had none.
- **T1 blocked on rules it invented**, and on findings it planned anyway. `spec/silent-on-
  concurrency` and `spec/unverifiable-case` are not in any list; the concurrency finding's own
  report contains the task that implements the lock. A plannability gate that blocks on a
  plannable finding is not applying its criterion.
- **The repairs were made by hand, and they added mechanism.** T1 stopped the loop before the
  fixer, so the author repaired in the conversation: a contradiction between "one PATCH per
  row" and "one transaction" was closed with a new route, a requirement, an acceptance
  criterion, a case and two testids; an unrunnable migration case was closed by making a read
  path a writer. Two of the four round-2 blockers lived in that new text. The two repairs added
  66 and 39 net lines to the bundle, for two and four blockers.
- **Nothing in the loop could see it.** Blockers went 2 → 4 and the loop did not stop, because
  the arithmetic lived on the gate that never ran.

The fixer's "shortest statement that closes the finding" was the right rule and it was in the
one agent the loop never dispatched. Moving the rule into the loop's arithmetic — a growth
budget read from git — is what makes it hold whoever repairs.

## What it costs

**A spec defect the pre-implementer would have found in fifteen minutes is now found after a
judge pass.** T1 runs only on a document T2 has passed, so its findings cost one more round.
Accepted: T1's findings were the ones that did not converge, and a T1 that runs on a settled
document has less to find.

**The growth budget can stop a repair that was right.** A `spec/missing-artefact` whose honest
repair is a decision table is stopped at fifteen lines a finding. The stop leaves the commit in
place; the person reads it and runs again. That is a minute, against a round.

**Over-coverage is now partly a blocker**, which cuts against 0008's "you never ask for more
feature" in the other direction: the refiner now asks for less. The boundary is narrow by
design — a route, a migration, a writer, a shipping contract — because those are the additions
every caller and every later spec pays for.

## What is not settled

Whether a spec written under the new Summary rule comes back `pass` on the first judged round.
Every measurement here is of a loop that never reached its judge.

Whether fifteen lines a finding is the right budget. Round 1's hand repair (33 net lines a
blocker) stops under it; round 2's (10 a blocker) does not, and is caught instead by the rule
list — the two findings it answered with a lock and two concurrency cases were filed under
rules outside the closed list and are notes now, which no fixer repairs. A one-sentence repair
with its observing case stays under the budget. It is a config value for that reason.
