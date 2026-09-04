# 0004 — A review is a set of sweeps, and clearing an item costs what raising one costs

> **Renamed by [ADR 15](0015-one-core-agent-one-lead-and-the-rules-in-one-place.md).** The agents this record names still exist under the current names; the rules they duplicated now live once, in `.claude/agents/references/`. The decision below is unchanged.

**Decided** 2026-08-30.

## The rule now

`.claude/skills/code-review/SKILL.md` is the reviewer's method. It defines nine sweeps. Each
one **enumerates** something and then answers one question about **every item it enumerated**,
and the enumeration is printed before any finding drawn from it. A sweep that produced no list
did not run.

Three rules govern the sweeps:

- **Enumerate before you judge.** `1. transactions: none` is a complete sweep; silence is not.
- **Dismissing costs what raising costs.** An item enumerated and not reported needs the same
  source a report would need. A comment in the code under review is not a source, and code
  that argues its own exception to a rule is the finding rather than the answer to it.
- **Prove an artefact where the spec puts it.** Same name, wrong home, is a miss. Walk the
  spec's sections in order; a section that contributed no artefact is itself the finding.

Shards run sweeps 1–8 over their files. The root runs sweeps 5 and 9 over the whole change.

## Why the reviewer had no method before

Its rubric was `.claude/skills/spec/references/checklist.md`, which is written for judging a
**spec**. A reviewer handed a rubric for the wrong artefact improvises the method on every run,
and what it improvises is a list of topics to keep in mind rather than a procedure to execute.

## What the sweeps bought

Two arms over the same change, same shard size, same model, differing in one thing — one
raised the shard's reasoning effort, the other replaced the method:

| | effort `high` | sweeps at `medium` |
|---|---|---|
| known defects found | 0/3 | 1/3 |
| blockers corroborated by another arm | 2 of 3 | 6 of 7 |
| wall | 697s | 659s |
| cost | $13.60 | $12.07 |

Method beat effort on every axis at once. On sonnet, adding the sweeps and the two rules moved
an arm from six blockers with two nobody corroborates, to four blockers with none.

## Why the dismissal rule exists

The closed rule list already required a source to **block**. It required nothing to **clear**,
so the two were priced differently and the cheap one won. A shard enumerated a provider call
awaited inside a transaction — correctly, by name — and then let it go on the strength of a
fifteen-line comment in which the implementation argues its own exemption from the invariant.
The spec contains no such carve-out. With the rule symmetrical, that defect is found in every
subsequent run.

## Why the placement rule exists

An artefact sweep that asks only "does this name exist" passes a configuration value that
lives in `.env.example` when the spec places it in the deployment. Five such values, and an
entire unimplemented Infrastructure section, were reported present.

## What is not settled

The section walk is an instruction to remember, not a list handed over, and it behaves like
one: on sonnet shards it found the unimplemented section once in two runs. On opus shards at
`medium` it replicated. The durable fix is to compute the spec's sections and hand them over
the way `review-slice.mjs` hands over files — a worklist, not a reminder.

## The method is a profile, not the only way to review

Deriving sweeps 10 and 11 from what one model found on one change is fitting to the sample. It
cannot be told apart from a real generalisation without a held-out spec, and there is none:
every measurement here is the same commit. A checklist also gives a reviewer a stopping
condition — eleven sweeps done, therefore `pass` — which open-ended judgement does not have,
and a defect of a shape nobody wrote down in advance is exactly what the list cannot see.

So the reviewer has two profiles, set in `.claude/ai-workflow.config.json` under
`stages.review` — moved by ADR 14 to `shipConfig.<track>.stages.review`, where the two are the
block itself and one `variants` entry, and which of them is the default now depends on the
track:

| profile | shard agent | model | what it reads |
|---|---|---|---|
| `open` | `review-shard-open` | opus, `medium` | its own judgement, no checklist |
| `sweeps` | `review-shard` | sonnet, `medium` | the sweeps in this skill |

`shardSize` is set beside them. `scripts/review-slice.mjs` prints both, and the root takes
them from there rather than choosing.

**The default is `open` at fifteen files.** That exact cell is not measured. What is measured
is the open profile on opus at `medium` either side of it — two of three known defects at
twenty files, one of three at thirty — and the same model and effort with the sweeps at
fifteen, which found all three twice. Fifteen is where the size trend and the sweeps evidence
both point, and it is an extrapolation until a run lands on it.

Neither profile is retired. What is measured: the sweeps make a pass **reproducible** — two
runs of the sweeps profile agree on half their blockers, two runs without agree on none — and
they cost a third of the open profile. What is not measured: whether they narrow what a
reviewer can see on a change unlike this one.

## Consequences

- `scripts/review-ledger.mjs` and `scripts/review-coverage.mjs` are deleted; ADR 0003 retired
  them and the reviewer still called the first one.
- Shards are `sonnet` at `effort: medium`. `opus` at `medium` finds roughly twice as many real
  defects for the same wall clock and about $8 more per pass; it is the choice for a change
  large enough that a missed silent defect costs more than the pass.
- Measurements in [docs/research/2026-08-30-review-sharding.md](../research/2026-08-30-review-sharding.md).
