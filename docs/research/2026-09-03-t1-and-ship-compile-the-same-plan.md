# T1 and ship's pre-implement compile the same plan

2026-09-03. The refine loop's last gate, `T1 pre-implement`, runs the same agent that opens a
ship run. Its plan is discarded by design — the gate exists to answer whether the spec compiles
at all. So the question is whether it ever tells us something the ship run would not tell us ten
minutes later, and this is what the artefacts say.

## Ground truth

Every ledger in `.workflow/refine/` on this date, and the two `handoff.json` files produced for
`specs/requests/02-request-topics.md` — one by the loop's T1
(`.workflow/refine/requests-02.probe/2/handoff.json`), one by the ship run
`2026-09-03T10-13-32_requests-02-request-topics`. Both were compiled from the same spec against
the same working tree, minutes apart, by `pre-implementer` on opus. Read with a script that
compares tasks, task order, and the union of every path each task names.

## The two plans

| | T1 (refine) | ship |
|---|---|---|
| top-level keys | 13 | the same 13 |
| tasks | 8 | 8, in the same order |
| files named | 36 | 36 |
| files in one and not the other | **0** | **0** |
| bytes | 41 554 | 47 204 |

Four of the eight task titles are reworded and none changes what the task does: "Amend the
suites this spec breaks by design, and write its own cases" against "Cases — write this spec's
suites and amend the ones it breaks by design". The set of paths is identical, element for
element.

**Two independent opus passes over one spec and one tree produced the same plan.** The 14% of
extra bytes in the ship handoff is prose, not scope.

## How often T1 has fired at all

Every recorded loop on this spec, `judge` being T2's blocker count and `plan` T1's:

| loop | r1 | r2 | outcome |
|---|---|---|---|
| 05:14 | judge — · plan blocked/2 | judge — · plan blocked/4 | `spec-defect` |
| 06:57 | judge 7b | | `fixer-error` |
| 07:31 | — | | `judge-error` |
| 07:38 | judge 4b | — | `lint` |
| 08:24 | judge 3b | — | `lint` |
| 08:42 | judge 3b | — | `judge-error` |
| 09:42 | judge 1b | judge 0b · plan pass | `pass` |

**T1 has run twice.** Once in a loop where T2 did not run at all, where it blocked with two then
four spec findings; once after a clean T2, where it passed. There is **no recorded case of T1
blocking a document that T2 had passed** — which is the only case that would justify the pass it
costs.

## What died here

The hypothesis that T1 is the loop's buildability gate, catching what a judge reading for
contradictions cannot. It may still be true; nothing here shows it is. What the evidence shows
is one confirmation and one run where it was the only gate present.

## What this does not measure

Whether the two agents would *disagree* on a spec that does not compile. Both plans agree on a
spec that passed; a defective spec might be caught by both, by one, or by neither. n=1 on the
plan comparison and n=1 on the "confirmed a clean T2" case. **This is not enough to retire a
gate**, and the note is written so the decision can be made from numbers rather than from the
feeling that two agents are doing the same work.

## The recommendation this supports

Make T1 opt-in rather than default. Its plan is provably redundant with the plan that is
actually used, its verdict has never differed from what the next stage said, and it costs one
opus pass per loop that reaches a clean T2 — about thirteen minutes here.

The cost of being wrong is the cheapest failure the pipeline has: a spec that does not compile
halts a ship run at its first agent stage, before any code is written.
