# What a pipeline run costs, by track — and why nobody knew

**Measured** 2026-09-04, on `test/flow-check`, from every run directory on disk.

## Ground truth

Each agent stage writes its own report to `.workflow/runs/<id>/stages/<stage>.attempt-N.log`.
Under the SDK path that file is one JSON message per line and the last of them is the `result`,
which carries `total_cost_usd` and a `usage` block. Under the CLI path (`--output-format json`)
it is a single object of the same shape. Nothing else in a run directory records what a stage
cost: the journal has tool calls and durations, not tokens.

The numbers below are the sum, over every stage log of a run, of `total_cost_usd` and of
`input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens` — every
token the agent reported, cache reads included, which is what dominates the total.

## The defect that hid all of it

`scripts/run-digest.mjs` read the report with

```js
const m = raw.match(/^\s*(\{[\s\S]*?\})\s*$/m);
```

— the **first** brace-delimited block in the file. Under the SDK path that is the `system` init
message, which has neither `total_cost_usd` nor `usage`. So `agentReport` returned nulls, and
the digest — the file that exists to answer "what did this cost" — reported **`$0` for every
stage of every run**, including one that had just spent $108.

It was invisible for the usual reason: `$0` is a number, the summary printed without error, and
nobody had a second source to disagree with it. Fixed by scanning the file backwards for the
last line whose `type` is `result`, falling back to parsing the whole file.

## The numbers

| Track | Outcome | Stage logs | Tokens | Cost |
|---|---|---|---|---|
| spec | ready | 13 | 155.1M | $108.61 |
| spec | halted (spec-defect) | 10 | 83.3M | $71.09 |
| spec | ready | 9 | 66.9M | $71.43 |
| spec | ready | 6 | 74.5M | $64.40 |
| spec | halted (spec-defect) | 4 | 47.1M | $52.95 |
| spec | aborted | 6 | 18.2M | $39.94 |
| spec | halted (spec-defect) | 4 | 20.7M | $29.23 |
| spec | halted (spec-defect) | 3 | 13.0M | $22.02 |
| spec | ready | 2 | 13.1M | $16.09 |
| spec | aborted | 2 | 12.6M | $12.40 |
| spec | ready | 4 | 9.0M | $7.81 |
| spec | halted (spec-defect) | 1 | 7.5M | $7.81 |
| spec | halted (spec-defect) | 1 | 4.3M | $5.30 |
| spec | `init` never finished — no status | 1 | 8.4M | $7.58 |
| **patch** | **ready** | **3** | **1.6M** | **$1.64** |

The patch run is the one this session produced: `PATCH-001`, a one-variable rename, implement →
static gate → review (`code-reviewer-lead`, one shard) → QA, no attempt repeated. Its three
stages were $0.56 implement, $0.66 review, $0.42 QA.

**The bug-track run of the same shape is not in this table.** It reached `ready` in one attempt
per stage and its verdicts are in git, but stage logs are `.gitignore`d and its run directory was
deleted before the cost was read. What it cost is not recoverable, and guessing from the patch
run would be a number with no artefact behind it.

## What it says about the tracks

A completed spec run is **$7.81 to $108.61**; the median of the five that reached `ready` is
$64.40. A patch run of the same pipeline minus the plan stage, on a one-file diff, is **$1.64**
— between one and two orders of magnitude cheaper. That is the whole argument for the lighter
tracks, and until now it was an argument nobody could check.

The second thing the table says is where the money actually goes: **close to half the spend on
this repository bought halts and abandonments**, not merged work. Eight of the fourteen spec
runs above ended `spec-defect` or `aborted`, and they account for $240.74 of the $516.66 those
fourteen cost. That is the case for `/refine` admitting a spec before a run is paid for, priced.

One run directory is left out entirely: it halted on an infrastructure error and no stage log it
wrote carries a `result` message, so it has no cost to report rather than a cost of zero.

## The hypothesis that died: `breakers.runTokenCap = 3000000`

The config carried a whole-run token fuse of 3M, and it read as a sensible ceiling.

It is wrong by fifty times. The **smallest** spec run in the table — one that halted after a
single stage — spent 4.3M, and the largest spent 155M. Had the breaker ever been enforced, every
spec run in this repository's history would have been halted during its first or second stage,
and the halt would have looked like a pipeline defect rather than a budget.

It was never enforced. Nothing read `breakers` at all, in either script, so the number sat in the
config being wrong for the entire life of the file and cost nothing — which is the only reason
the mistake is a note here and not an incident. The fuse is now enforced by `scripts/ship.mjs`
before each stage is dispatched, and the cap is 250M: above the largest observed run with
headroom, low enough to catch a runaway.

The general lesson is the one `npm run pipeline` now checks mechanically: **a setting nothing
reads is not inert.** It is a number a person trusts, and it drifts away from reality precisely
because nothing ever tests it against anything.
