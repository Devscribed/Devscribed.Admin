# The refine loop grew the spec it was refining

**Date:** 2026-09-03
**Ground truth:** the ledger `.workflow/refine/requests-02.loop.2026-09-03T05-14-07-385Z.json`,
the two pre-implement verdicts under `requests-02.probe.2026-09-03T05-14-07-385Z/{1,2}/`, and
the commits `9016f45` (draft), `088ec93` (repair of round 1), `f4ef338` (repair of round 2),
read with `git show --stat` and `git show`. The request was the `--request` argument recorded
in the ledger. No number here comes from an agent's account of itself.

## What ran

`node scripts/refine-loop.mjs specs/requests/02-request-topics.md`, twice, on the loop as it
was after ADR 0011 (gate order T0 → T1 → T2, fixer on T2's verdict only).

| Round | Head | T0 | T1 | T2 | Fixer | Stopped |
|---|---|---|---|---|---|---|
| 1 | `78b04fd` | clean | blocked, 2 spec blockers (+1 major, 2 minor) | never ran | never ran | `spec-defect` |
| 2 | `088ec93` | clean | blocked, 4 spec blockers (+4 notes) | never ran | never ran | `spec-defect` |
| 3 | — | — | interrupted by the operator | — | — | `budget` on the retry |

The judge the loop exists to dispatch ran zero times. Both repairs were made in the
conversation by the session that wrote the spec.

## The findings, and where each came from

Origin was settled by `git show 9016f45:<file> | grep` for the quoted text.

| Round | Finding | Rule as filed | In the draft? | Repair made | Net lines |
|---|---|---|---|---|---|
| 1 | Reorder: "one PATCH per row" against "one transaction" | contradiction | yes | new route `PATCH …/request-topics/order`, REQ-02-031, AC-17, TC-02-INT-22, two testids, a validation row | +66 for the round |
| 1 | TC-02-INT-02 needs the migration run inside jest | unverifiable-criterion | yes | REQ-02-016 rewritten: a catalogue read that finds no rows seeds them | (same round) |
| 1 | Type filter: kept or replaced | ambiguous-requirement (major) | yes | one sentence | |
| 1 | Unknown `status` query value | ambiguous-requirement (minor) | yes | one row | |
| 1 | `ManageRequestTopics` guard emits a fixed message | stale-premise (minor) | yes | one sentence | |
| 2 | Rename with `audience: partner`: two messages | contradiction | yes — missed in round 1 | one word, plus edge case 12d and a case step | +39 for the round |
| 2 | History panel renders the stored status | ambiguous-requirement | yes — missed in round 1 | one sentence, plus a testid and an E2E step | |
| 2 | Two first reads of an empty catalogue race | silent-on-concurrency | **no — written by the round-1 repair** | `FOR UPDATE` on `Organization`, TC-02-INT-24, AC-18, edge case 12c, invariant text | |
| 2 | TC-02-INT-22 "force the transaction to fail partway" | unverifiable-case | **no — written by the round-1 repair** | step deleted; TC-02-INT-23 (concurrent reorder) added | |

Two of nine findings blocked a run in the sense that matters — a case that cannot execute, a
guard that answers with the wrong body — and both were in the draft. Two of nine were
manufactured by the previous repair. Five closed in one sentence each, and were.

Of the six rules T1 filed under, three (`spec/silent-on-concurrency`,
`spec/unverifiable-case`, `spec/unverifiable-criterion`) exist in no agent definition.

## The bundle, by commit

| Commit | `02-request-topics.md` | `.contracts.md` | `.cases.md` | Bundle |
|---|---|---|---|---|
| `9016f45` draft | 329 | 397 | 505 | 1231 |
| `088ec93` repair 1 | 336 | 422 | 539 | 1297 |
| `f4ef338` repair 2 | 331 | 432 | 573 | 1336 |

Net growth per blocker: 33 lines in round 1, 10 in round 2. The behaviour file stayed inside
its `120 + 7 × requirements` budget throughout, because the growth went into the contracts
and the cases — the budget measures one file of three.

## The hypothesis that died: the judge is too strict

It was not the judge. The judge never ran. What ran was the pre-implementer — a gate with no
closed rule list, no diff mode, and a criterion (plannability) it did not apply to the finding
it blocked on: the round-2 concurrency finding's own report plans the lock as a task.

## The hypothesis that died: the loop's convergence check would catch this

`not-converging` fires when a round finds at least as many blockers as the one before. Rounds
went 2 → 4. It did not fire, because the check was written on T2's verdict and T2 never
produced one. A stop rule on the wrong gate is no stop rule.

## What was changed, and what it would have done here

Recorded as ADR 0012. Replayed against the two rounds:

- **T1 last, after a clean T2.** Round 1 goes to the judge in full; T1 does not run until the
  judge is satisfied. Whether T2 would have found the two real draft defects is unmeasured.
- **Closed rule list enforced by the loop.** Round 2's concurrency and fault-injection
  findings are demoted to notes. Round 2 has two blockers, not four, and both are one-word
  repairs.
- **Fixer on any gate's verdict, never a hand repair.** The fixer's own rule — the shortest
  statement — applies to round 1. Whether it would have kept to it is the thing the growth
  stop exists for.
- **`growing` at 15 lines a finding.** Round 1's repair (33 a finding) stops the loop with the
  commit in place. Round 2's (10 a finding) does not; it is the rule list that removes its two
  mechanism-adding findings, leaving two one-word repairs.

The draft was restored to `9016f45` and the seven draft-origin findings repaired by hand, once,
one sentence each, before the new loop is run on it. The bundle is 1242 lines, 11 over the
draft, all of them those repairs.
