# `.claude/` — what is in here, and how to change it

This directory is the machinery: the agents that do the work, the skills a person invokes, the
registers they judge by, and the one configuration file that decides which of them runs.

It is written for a person deciding what to change. The runbook for *operating* a run is
[docs/ai-workflow.md](../docs/ai-workflow.md); the decisions behind any of this are in
[docs/adr/](../docs/adr/).

```
.claude/
  ai-workflow.config.json     the only knob. Which agent, which model, which stages, per track
  agents/                     what each agent is
    references/               the rules every agent obeys — one copy, never restated
  skills/                     what a person invokes: /spec /refine /ship /bug /patch /code-review
    <skill>/references/       the closed registers those skills judge by
  hooks/                      two hard refusals and the run journal
  settings.json               hook wiring
```

## The one rule that keeps this from rotting

**A rule is written once, in the place that owns it.** Everything else points at it.

| What | Owns | Read by |
|---|---|---|
| What a finding is, what may block, witness, addresses, statuses, coverage | `agents/references/verdict-contract.md` | every judging agent |
| What a lead is, and what it never does | `agents/references/lead-contract.md` | every `*-lead` |
| Which code defects may stop a run | `skills/code-review/references/blocking-criteria.md` | the code reviewers |
| Which spec defects may stop admission | `skills/spec-review/references/admission-criteria.md` | the spec reviewer's lead, quoted to its children |
| The review sweeps | `skills/code-review/SKILL.md` | `code-reviewer-sweeps` |
| Identity, scope, method, output | the agent's own file | that agent, and its lead |

If you are about to write a rule about *what may block* into an agent file, or a rule about
*how to look* into a reference, stop — that is how the two copies start disagreeing, and they
disagreed here before this split existed.

## Agents: a core, and a lead that is a capability over it

Every family is one **core** agent and, where the work is big enough to split, one **lead**.

**The core is the logic.** It holds the method, the conventions and the prohibitions. It runs as
the stage on its own, and it runs unchanged as a child of its lead — the only differences are
where its verdict goes and, for the implementer, that a child commits nothing. Each core file
says so in its last section.

**The lead is a capability, not a second opinion.** It reads its core's file in full and holds no
rule the core does not state. What is its own: splitting the work, the parts no child can see
(what is *absent*, and two things that disagree across a boundary), checking what comes back, and
signing one verdict. A child never blocks a run.

| Family | Core | Lead |
|---|---|---|
| judge a spec | `spec-reviewer` | `spec-reviewer-lead` |
| judge a diff | `code-reviewer-open`, `code-reviewer-sweeps` | `code-reviewer-lead` |
| write the code | `implementer` | `implementer-lead` |
| compile the plan | `pre-implementer`, `pre-implementer-strict` | — |
| repair a spec | `spec-fixer`, `spec-fixer-minimal` | — |
| run the suites | `qa` | — |

Code review has two cores because they are two **methods**, measured against each other:
`-sweeps` enumerates then judges against a checklist, `-open` judges without one. That is a real
choice, not a duplicate — see [ADR 0004](../docs/adr/0004-review-is-a-set-of-sweeps.md).

## Configuring it

Everything is `ai-workflow.config.json`, and `scripts/ship-config.mjs` is the only thing that
reads it. **Run `npm run config` after any edit** — it validates the file and prints what each
track resolves to. It is also run automatically by `ship`, by every `wf` command, and as the
first row of preflight, so a bad edit stops a run before a lock or a branch exists.

**One rule governs the whole file: a thing that can run more than one way lists its ways under
`shapes`, each written out in full, and `use` names the one that runs.** Nothing is merged,
nothing is inherited — not between tracks and not between a shape and the block above it — and
there is no `null` that means "delete a key". What you read under a shape is what that shape
runs.

```
shipConfig.<track>                        match, branchPrefix, requiresRefine
shipConfig.<track>.stages.<stage>         enabled, use, shapes
  …stages.<stage>.shapes.<name>           one complete way to run it: agent, model, shard*,
                                          and the stage's own keys
shipConfig.<track>.convergence            maxCodeAttempts, maxHandoffReplans, infraRetries,
                                          autoContestAfter
shipConfig.<track>.timeoutMin             per stage, in minutes
breakers, isolation, protectedBranches    shared by every track
refine                                    use + shapes, the same idiom, for the refine loop
```

To change what a stage runs, change its `use`. To add a way to run it, add a shape. Every key
in a shape is one a script reads — `npm run pipeline` refuses one that nothing does.

### Solo or lead is one field

The same core agent, run two ways:

```json
"review": {
  "enabled": true,
  "use": "lead-open",
  "shapes": {
    "lead-open": { "agent": "code-reviewer-lead", "model": "opus",
                   "shardAgent": "code-reviewer-open", "shardModel": "opus", "shardSize": 15 },
    "solo-open": { "agent": "code-reviewer-open", "model": "opus" }
  }
}
```

`lead-open` is a lead on opus dispatching the same definition to children on opus; change
`shardModel` to `sonnet` and the children get cheaper, and the judgement they apply is the same
file either way. `solo-open` has no `shardAgent` at all — which you can see, rather than having
to work out from a `null`.

Every review stage carries a `solo-*` shape, so you can compare a lead against the agent it
dispatches without editing anything:

```bash
node scripts/ship.mjs <doc> --review-shape solo-open
node scripts/ship.mjs <doc> --review-shape lead-sweeps
npm run config -- --track patch          # what patch runs, and what else it could be asked for
```

### What the validator refuses

An unknown key anywhere (`shardsize` for `shardSize`), a stage missing from a track or one that
is not a stage, an `agent` or `shardAgent` with no definition in `agents/`, a model outside
opus/sonnet/haiku/fable, a `script` that does not exist, `static_gate` or `qa` disabled on any
track, a replan budget on a track with no plan stage, a timeout for a stage the track does not
run, two tracks claiming one path, a `match` that is not a valid regular expression.

This is what makes the config safe to write out per track: renaming an agent means three edits,
and missing one is refused loudly rather than found by a stage twenty minutes in.

### `npm run pipeline` — the question after that one

The validator answers "would every stage start". `npm run pipeline` answers the ones that come
after it, which all have the same shape: two places name one thing and only one was edited.

- an agent definition whose `name:` no longer matches its filename;
- a lead that dispatches a `subagent_type` nobody defines;
- the `SubagentStart` / `SubagentStop` matchers in `settings.json`, a second list of agent names;
- **a setting the config accepts and no script reads** — the worst of them, because
  `npm run config` prints it back and a person believes it took effect. `effort` and
  `shardEffort` were exactly that, and the printer reported a reasoning effort nothing applied;
- an agent bound by a contract in `agents/references/` that does not read it;
- the E2E port ladder, kept in both `scripts/ports.mjs` and `e2e/environment.ts`.

Run it after renaming an agent, adding a setting, or moving a rule between files.

## Skills: what a person invokes

| Command | Writes | Then |
|---|---|---|
| `/spec` | a three-file bundle in `specs/<area>/` | `/refine`, then `/ship` |
| `/refine` | a judged verdict and its repairs | admits the spec into the pipeline |
| `/bug` | `specs/bugs/BUG-NNN-*.md` | `/ship bug <report>` |
| `/patch` | `specs/patches/PATCH-NNN-*.md` | `/ship patch <note>` |
| `/ship` | nothing — it runs the pipeline | reads the outcome |
| `/code-review` | the sweeps, for a person reviewing by hand | — |

`npm run spec | refine | bug | patch | ship` open Claude Code on the same commands.

## Changing an agent

1. **Is it a rule about what may block?** It goes in a register or in
   `agents/references/verdict-contract.md`, and every agent gets it at once. Not in an agent file.
2. **Is it about how this agent looks, or what it is?** Its own file. If its lead needs it too,
   it already has it — the lead reads the core file.
3. **Renaming or adding one?** Update `ai-workflow.config.json`, then `npm run config`. The
   validator will tell you every track you forgot.
4. **A new shape rather than a new rule?** That is a `shapes` entry, not a new agent file.

Agent prompts are **rules only** — no measurements, no history, no justification. Write the
conclusion, not the evidence for it; the evidence goes in `docs/`, written for people. See the
rule in [CLAUDE.md](../CLAUDE.md).

## Hooks

`hooks/guard-protected-branch.mjs` denies rather than reports: a push to `main` or a `v*` tag
(both deploy), and `prisma generate` outside `apps/api`. `hooks/run-logger.mjs` writes the run
journal under `.workflow/runs/<runId>/`. The matchers in `settings.json` name the agents whose
work is journalled — add a new agent there or its work is invisible to the board.
