# 0016 — A setting nothing reads is a defect, and a script says so

**Decided** 2026-09-04.

## The rule

**Every key `.claude/ai-workflow.config.json` accepts must be read by a script that runs a
stage.** A key only the validator knows about is removed, or wired to the behaviour it names.
`npm run pipeline` checks it: it resolves every stage of every track through every variant,
collects the keys that survive, and fails on any that no pipeline script mentions.

The same script checks the other places two parts of the pipeline name each other and only one
was edited:

- an agent definition whose `name:` no longer matches its filename;
- a lead that dispatches a `subagent_type` nobody defines;
- the `SubagentStart` / `SubagentStop` matchers in `.claude/settings.json`;
- a contract in `.claude/agents/references/` that an agent bound by it does not read;
- the E2E port ladder, kept in both `scripts/ports.mjs` and `e2e/environment.ts`.

## What it replaced

Nothing — this is the gap `npm run config` left. The validator answers *would every stage
start*, which is a real question and not this one. A config can be entirely valid and still
promise things nothing does.

## What was found the day the rule was written

Nine settings, validated and printed and read by nobody:

- `stages.*.effort` and `stages.*.shardEffort`. Neither the CLI nor the SDK invocation ever
  passed an effort; the agent's own frontmatter owned it. `npm run config` printed
  `pre-implementer-strict on opus (high)` and the `high` reached nothing. **Removed** — effort
  belongs to the agent definition, which is the only thing that can apply it.
- `stages.qa.levels` and `stages.qa.skipE2eIfLowerFailed`. The QA prompt wrote out the same
  policy in prose. **Wired**: the prompt is now built from the track's levels.
- `breakers.runTimeoutMin` and `breakers.runTokenCap`. No script read `breakers` at all.
  **Wired**: `ship` checks both before dispatching each stage. The cap was also wrong by fifty
  times — see [the cost measurement](../research/2026-09-04-what-a-run-costs-by-track.md).
- `refine.shardTimeoutMin`. Refine's shards are dispatched by an agent, inside the parent's
  fuse; a script cannot time them. **Removed.**
- `isolation.testDatabaseTemplate`. A per-run database that does not exist. **Removed**; the
  `$comment` beside it already explained why runs are serialised.
- `isolation.concurrentRuns`. The lock allows one and nothing reads the number. **Kept as an
  invariant**: the validator now refuses any value but 1, so the key states a fact instead of
  offering a choice that does not exist.

## What it costs

One more command to run, and a check that will occasionally be wrong in the boring direction —
a genuinely new setting fails `npm run pipeline` until its reader is written. That ordering is
the point: the reader is the feature, and the key is how it is spelled.

## Why it matters more than it looks

A dead setting is not inert. It is a number a person trusts, and because nothing ever tests it
against reality it drifts. `runTokenCap` sat at 3M while real runs spent 4M to 155M — a value
that would have halted every spec run in the repository's history during its first stage, had
anything ever enforced it. It was harmless only by accident.
