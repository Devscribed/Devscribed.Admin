# 0019 — A prompt lives in a definition; a script hands over data

**Status.** Accepted.
**Extends** [0015 — one core agent, one lead, and the rules in one place](0015-one-core-agent-one-lead-and-the-rules-in-one-place.md),
which said two files must not state one rule. This says the second file is often not a file at
all — it is a script that builds a prompt.

## The rule

**A script that spawns an agent passes it values, never sentences.** What the agent is, what it
must do, what it may not call, what its output looks like — all of that is in its definition
under `.claude/agents/`, stated once. The script contributes only what changes between runs, and
it contributes it as data.

A dispatch prompt is now a JSON object:

```json
{ "assignment": ".workflow/refine/…/plan.json", "shard": 3, "of": 10, "answer": "…/shard-3.json" }
```

and the definition says what to do when one arrives.

**A script an agent runs prints facts, not advice.** An inventory says what it counted. It does
not say what to do about it, what is available, or how to proceed — those are rules, and a rule
in a tool's output is a rule the reader obeys in preference to the definition it contradicts.

**Where two instructions could both apply, the choice between them is stated once, at the point
of decision.** Not as an unconditional rule early in a file with a conditional exception later:
a definition read top to bottom acts on the first of the two.

## What it replaced

Prompt text had accumulated in three places at once: the agent's definition, the loop that
dispatched it, and the inventory script it was told to run first. Each was written truthfully
and they disagreed, because only one of them was ever updated at a time.

## What it cost to learn

A lead with a tool that dispatches ten children simultaneously, and a definition telling it not
to call `Task`, called `Task` ten times — because its own definition said unconditionally, higher
up, to send children with `Task`, and because two scripts printed the same advice as it went.
Measured in [2026-09-05 — what parallel sharding costs](../research/2026-09-05-what-parallel-sharding-costs.md).

## What it costs

A definition must now describe a dispatch shape it cannot see an example of, and a reader of the
script cannot tell from the script what the agent will be told. That is the trade: the prompt is
harder to read in one place, and there is only one place to change it.

Two checks already cover the failure this leaves open — `npm run pipeline` reports a contract an
agent no longer reads, and a setting nothing reads ([0016](0016-a-setting-nothing-reads-is-a-defect.md)).
Neither can see a sentence of instruction inside a script, so this one is a convention and is
enforced in review.
