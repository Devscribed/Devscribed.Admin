---
name: refine
description: Judge whether a written specification can be delivered on its own — free of self-contradiction, current with the code, complete from itself alone, and testable — by running the refine loop. Use after writing a spec, before shipping one, or when an existing spec has drifted from the code.
---

# Refining a spec

One command. The orchestrator is `scripts/refine-loop.mjs`, not you:

```bash
node scripts/refine-loop.mjs specs/<area>/NN-name.md --request "<the request the spec answers>"
```

It runs three gates, cheapest first, repairs what the last one finds, commits the round, and
judges the next round against **that commit** rather than the document again — until the verdict
is clean or the loop stops and says why.

| Gate | What it is | What it costs |
|---|---|---|
| **T0** `spec-lint` | a script — pointers, joins, cross-product completeness | nothing |
| **T1** `pre-implement` | the spec compiled into a plan, by the agent the pipeline itself runs | one pass |
| **T2** `spec-refiner` | one judge, on what T0 and T1 cannot decide | one pass |

Then `spec-fixer` repairs T2's verdict and the round is committed.

Useful variants:

```bash
node scripts/refine-loop.mjs <spec> --rounds 1      # one judged round, then stop
node scripts/refine-loop.mjs <spec> --skip t1       # skip the plan gate
node scripts/refine-loop.mjs <spec> --no-fix        # stop at the verdict, repair by hand
node scripts/refine-loop.mjs <spec> --dry-run       # print what each gate would run
npm run spec:lint -- <spec>                          # T0 alone, while writing
```

## Your part

**Do not run the agents by hand and do not judge whether a finding deserves another round.**
That decision is arithmetic and it is written down: a round that does not shrink the blocker
count, or a finding that survives a repair, stops the loop. Overriding it turns the loop back
into the conversation it was built to end.

What you do is either side of the run:

- **Before** — the bundle exists (`NN-name.md`, and `.contracts.md` / `.cases.md` beside it if the
  spec has them), the tree is clean, and you can state the request in one line. An existing spec
  nobody is currently writing has no request: leave `--request` off and the Summary is the request.
- **While** — it prints each gate as it goes. Let it run.
- **After** — read the outcome and explain it.

## Watching it go

`npm run board` opens on the specs. Pick one, and everything run against it is under it — this
loop included, live: which round, which gate, what it has spent, and how long it has been quiet.
The ledger is written between gates rather than at the end of a round, so a gate that has been
thinking for a quarter of an hour is on the board rather than absent from it.

## Reading the outcome

The ledger is `.workflow/refine/<area>-<nn>.loop.json`: every round, what each gate found, and the
commit it produced.

**Every gate is its own commit** — `refine(<stem>): round 2 T1 pre-implement — blocked, 2 spec
finding(s)` — carrying the verdict and the plan it wrote. The spec bundle rides with the fixer's
commit and no other, so the range the next round is judged against holds repairs and nothing else.
A loop leaves nothing untracked behind it, on any exit.

`pass` means the spec is deliverable. Say what the rounds changed and hand over any notes — notes
reach the person and stop nothing.

A stop is not a crash. Most stops are the loop working:

| Stop | What it means | What helps |
|---|---|---|
| `lint` | T0 found something decidable | Fix it and run again. Every one has a mechanical repair and no judgement in it — never send these to a model |
| `spec-defect` | `pre-implement` cannot compile the spec | The same finding that would halt a ship run, met before the run was paid for. Repair it in the document |
| `needs-a-person` | The fixer met a fork it may not settle | A repair needing a route, a column or a screen the spec does not have, or a product question. `AskUserQuestion`, one fork, with the trade-off — never pick the cheaper side yourself |
| `stuck-finding` | A finding survived a repair | The requirement is ambiguous or the finding is wrong. Show both sides and let the person choose |
| `not-converging` | A round found as many blockers as the one before | The loop is judging the document again rather than the repair. Check that the round committed |
| `budget` | Rounds spent, findings remain | Ship with them or spend another round deliberately. Both are a person's call |

## What each gate is for, and why the order

**T0 is free and its repairs delete text rather than add it.** That is what keeps the loop from
growing the thing it is refining. A gate that only a model can run costs a pass and answers with
prose the next pass then has to judge.

**T1 is the pipeline's own gate, run early.** `pre-implement` blocks with a `spec` finding when it
cannot compile a document — the same finding that halts a ship run, except a halt there burns a
whole run and a halt here costs one pass.

**T2 is what neither can decide**: a declared domain that is wrong rather than incomplete, a rule
with two readings, business logic walked as a system, a claim the code refutes. It is dispatched
with the spec path, the request, and — from round two — the commit range to judge. The range is an
argument, never something the judge infers, because a judge that re-sweeps a document it has
already accepted returns a different subset every time and the loop never ends.

## Fixing, and the two things the fixer may not do

`spec-fixer` repairs the whole verdict, settling contradictions and ambiguities **by deciding**,
and writes each choice and the alternative it rejected into the document. Two things come back in
`left` instead: a repair needing scope the spec does not have, and a question only the product
owner answers. Those stop the loop for you.

**Read the `decided` entries in `.workflow/refine/<area>-<nn>.fix.json`.** They are choices
somebody made on your behalf, and reversing one is cheap now and expensive after it ships.

**Every sentence added about this repository is checked by the next pass.** Open the file before
writing the claim, prefer a symbol to a line number, and run the command before quoting its count.
A repair written from memory costs the pass that finds it.

**Every fix lands in the bundle being refined, and in no other.** Older specs record decisions
taken then and are not edited to stay current; the newest spec that speaks about a behaviour
governs it. A pointer at what it overrules is not a repair — it sends the reader away instead of
answering them, and T0 rejects it.

## Where this sits

Outside the pipeline, before it. `/spec` ends by running it; `npm run refine:loop -- <spec>` runs
it on any spec at any time, which is what an already-written spec that has drifted needs.

It is not a `ship` stage. `ship` asks whether the code matches the spec; this asks whether the
document is true, and it is not worth an opus pass on every attempt of every run.
