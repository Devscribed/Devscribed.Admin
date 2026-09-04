# 15. One core agent, one lead, and the rules in one place

Date: 2026-09-04

## Status

Accepted. Renames the agents named in ADRs 0002, 0004, 0008, 0012 and 0013; changes none of
their decisions.

## Context

Fourteen agent definitions had grown by copying. A family was a judge and one or two shards, and
each shard carried its own copy of the register rule, the witness rule, the coverage accounting
and the finding schema — because a shard starts cold and must be told.

The copies had already diverged, in the direction that matters least visibly. `code-reviewer.md`
said a blocker naming no criterion is "demoted to a note by `scripts/wf.mjs`, whichever agent
wrote it"; `review-shard.md` said only "demoted to a note", naming no mechanism. Neither is wrong
and the pair is worse than either: the second reads as a thing the shard should do, and a shard
that thinks demotion is its own job files differently from one that knows a script does it.

Worse, the shards were required to set `target` on every finding and were **never given the
address table**. Only the root had it. Three agents were writing a routing field from a rule none
of them had been shown.

The naming had the same history. `code-reviewer`, `review-shard`, `review-shard-open`,
`spec-review`, `spec-review-shard`, `spec-refiner`, `implement-lead`, `implement-shard`: eight
names, four naming conventions, and no way to read off which of them was a variant of which.

## Decision

**A family is one core agent and, where the work is big enough to split, one lead.**

| Family | Core | Lead |
|---|---|---|
| judge a spec | `spec-reviewer` | `spec-reviewer-lead` |
| judge a diff | `code-reviewer-open`, `code-reviewer-sweeps` | `code-reviewer-lead` |
| write the code | `implementer` | `implementer-lead` |

Three rules hold it together.

**1. The core is the logic, and it is one file that runs both ways.** A shard is not a different
agent from the reviewer; it is the reviewer with a smaller scope. So there is one definition, and
the only conditional in it is where the verdict goes: as the stage it writes the verdict file, as
a child it returns JSON as its final message and never blocks. The implementer carries three more
— a child creates no migration, runs no suite and makes no commit — stated once, in its own
"Running as a child" section.

**2. The lead holds no rule its core does not state.** It reads the core's definition in full and
treats it as its own. What is the lead's: splitting, the parts no child can see (what is
*absent*, and two things that disagree across a boundary), checking what comes back, and the
signature. A lead prompt that restates the register is the defect this ADR exists to remove.

**3. A rule about what may block is written once, outside every agent.**

| Document | Owns |
|---|---|
| `.claude/agents/references/verdict-contract.md` | the finding, the addresses, the witness rule, the criterion rule, the statuses, the coverage rule, where a verdict goes |
| `.claude/agents/references/lead-contract.md` | what a lead is, and what it never does |
| `.claude/skills/<area>/references/*criteria.md` | the closed registers, unchanged |

An agent file owns identity, scope, method and output. Nothing about what may block belongs in
one, and nothing about how to look belongs in a reference. Where the two appear to disagree, the
reference wins and the agent file is the defect.

**Solo or sharded is then one config field**, because both shapes run the same definition:

```json
"review": { "agent": "code-reviewer-open", "model": "opus" }
"review": { "agent": "code-reviewer-lead", "model": "opus",
            "shardAgent": "code-reviewer-open", "shardModel": "opus" }
```

A `null` in a variant removes a key, so a `solo` variant can say there is no shard agent — a
shallow merge could otherwise only add or change, and a leftover `shardAgent` makes a solo run
dispatch children.

## Consequences

Eight definitions become seven files, and about 300 lines of restated rule become two references
that every judge reads. Renaming an agent is now a config edit the validator checks (ADR 14)
rather than a search through prompts.

The cost is real and worth stating. **A reference is a request, not a mechanism**: instructions
inside a prompt are guaranteed to be in context, and instructions in a file are there only if the
agent opened it. Two existing enforcements make that safe rather than hopeful — `requireCriteriaMap`
rejects a judged verdict that carries no criteria map, and `enforceCriteria` in `scripts/wf.mjs`
demotes any blocker naming no criterion, whoever wrote it. Without those two this decision would
trade a visible duplication for an invisible omission, and should be revisited if either is ever
switched off.

The second cost: five children each read an 87-line register where one prompt used to carry one
copy. That is five reads instead of one, and it is not free — it is small against the diff, and it
is the price of the copies agreeing.

## What this does not change

`code-reviewer-open` and `code-reviewer-sweeps` remain two files, because they are two **methods**
and ADR 0004 measured both. Collapsing them would have made the naming tidier and thrown away a
measured alternative. `pre-implementer` / `pre-implementer-strict` and `spec-fixer` /
`spec-fixer-minimal` are untouched: they are superseded prompts kept for comparison under ADR 0013,
not a core-and-lead pair, and folding them is a separate decision with its own evidence to gather.
