# The spec-to-ship pipeline

`specs/` is authoritative and code is written to match it. This is the machinery that does the
writing: four agents, two of them gated by scripts, with the routing decided in one place.

Planning already existed — the [`spec`](../.claude/skills/spec/SKILL.md) skill for features and
now [`bug`](../.claude/skills/bug/SKILL.md) for defects. This document covers the executing
half.

## Running one

```bash
git switch -c spec/<slug>          # never main; main deploys itself
node scripts/wf.mjs init --spec specs/<area>/NN-name.md
node scripts/wf.mjs preflight
```

Then ask Claude to run the pipeline (`/ship`), or drive the stages yourself. Either way the
loop is the same: run a stage, hand its verdict to `wf`, do what `wf` says.

```bash
node scripts/wf.mjs verdict review --file <verdict.json>
```

`wf` prints exactly one of `goto <stage>`, `retry-stage`, `ready` or `halt`. That is the
instruction.

```bash
npm run wf:status        # where the run is, attempts, budget, notes
npm run wf:log -- --tail 40
node scripts/wf.mjs release   # drop the lock when the run is done or abandoned
```

## Tracks: three weights of document

Not every change earns every stage. A track is a block in `.claude/ai-workflow.config.json`
under `shipConfig`, resolved from the document's path by its `match`, so nothing has to be
passed; `--track <name>` overrides it, and `wf` records the choice in `run.json`.

| Track | Document | Does not run | Refine | Branch |
|---|---|---|---|---|
| `spec` | `specs/<area>/NN-name.md` + bundle | — | required | `spec/` |
| `bug` | `specs/bugs/BUG-NNN-*.md` | `pre_implement` | not required | `fix/` |
| `patch` | `specs/patches/PATCH-NNN-*.md` | `pre_implement`; cheap review | not required | `fix/` |

`npm run config` prints what each track resolves to — the agent, model, shard shape, timeout
and budget of every stage — and refuses an invalid file. Read it rather than inferring the
answer from the JSON.

Two consequences worth knowing:

- **No plan means no `handoff.json`.** The implement and review prompts name the document
  instead, and a review finding addressed to `handoff` routes to `implement` rather than to a
  stage this track does not run — otherwise the run marches through a skipped stage and spends
  the replan budget on a finding nobody can act on.
- **The static gate and QA are on every track.** What a lighter document buys is the stages
  that read intent, never the ones that check the result. The validator refuses a config that
  disables either on any track; `--skip` on the command line is how a person opts out for one
  run, deliberately and visibly.
- **Budgets belong to the track.** `patch` allows three code attempts, `bug` six, `spec`
  eight. A patch that needs more was misfiled, and the halt is the signal; raising the number
  only hides it.

The entry condition for a patch is closed and lives in `.claude/skills/patch/SKILL.md`. It is
the part of this that decays if it is left to judgement: a track is only cheaper than a spec
for as long as the things routed to it are actually small.

## The stages

| Stage | Who | Produces |
|---|---|---|
| `preflight` | script | environment checks; refuses to start on `main`, with the lock held, or on a spec no refine loop admitted |
| `pre_implement` | `pre-implementer-strict` (variant `classic`: `pre-implementer`) | `handoff.json` — the plan, compiled from the spec, with every compile question answered by id |
| `implement` | `implementer` (variant `orchestrated`: `implementer-lead` dispatching `implementer`) | code and tests |
| `static_gate` | `scripts/static-gate.mjs` | two rules; see below |
| `review` | `code-reviewer-lead` dispatching `code-reviewer-open` or `-sweeps` (variant `solo`: the core alone) | verdict against the closed register in `.claude/skills/code-review/references/blocking-criteria.md` |
| `qa` | `qa` | unit in full, integration and E2E targeted, plus the spec's acceptance criteria |

Which agent a stage runs is written out under its track, at
`shipConfig.<track>.stages.<stage>`. Alternatives live in that block's `variants` and are
selected for one run with `--plan-profile`, `--implement-profile` or `--review-profile`; any
variant in force is written into `run.json`. `.claude/agents/VARIANTS.md` lists them and says
what each replaced.

The run ends at **`ready`**, not `merged`: a green branch, and a human opens the PR. `main`
deploys itself, so a pipeline that merges is a pipeline that deploys.

## How routing works

This is the whole policy, and it lives in `scripts/wf.mjs`.

**Every finding names an address** — where the defect lives — and the address decides the
route. Not the severity, not the retry count.

| `target` | Route |
|---|---|
| `code` | back to the implementer — the only address that retries |
| `handoff` | back to the pre-implementer to replan, once per run |
| `spec` | halt for a human. The spec wins here and changes to it are deliberate |
| `self` | halt — a gate rule is wrong; fix the rule, not the code |

Each stage may only hand out the addresses it can justify: the static gate cannot judge a spec
it never read, QA cannot judge a plan it never saw.

**A finding blocks only if it carries a witness** — a failing test, a concrete failure
scenario, or a quoted rule with its source. Without one it is demoted to a note, collected for
the human at the end, and the run carries on. A false positive almost always fails to produce
a witness; that is what makes it false.

**A review finding blocks only if it also names a criterion** — an id from
`.claude/skills/code-review/references/blocking-criteria.md`, or a numbered requirement of the
spec under review. The witness makes a finding checkable; the criterion makes the blocking
surface the same on the next pass, so an implementer who fixed what was named does not meet a
fresh objection over the same lines. Anything the register does not carry is still reported —
as a note, which is also where a criterion the register is missing gets proposed.

**The implementer may contest one finding** with a counter-witness, and a contested finding is
never retried — the run halts. Contesting cannot produce a pass, so there is nothing to win by
contesting work you simply do not want to do.

Three other things halt a run: a blocker that survived two attempts (treated as contested,
because it has been tried), an exhausted budget, and a fuse (time or tokens). In each case the
answer is a person, not another attempt.

## The static gate is two rules

Not eight. It exists only because the reviewer is a model and might not notice, in a large
diff, the two changes that would let a bad run *pass*:

1. **The spec was edited.** The implementation may not rewrite the contract it is checked
   against.
2. **A check was weakened.** A new `.skip`, `@ts-ignore`, `as any` or `eslint-disable`; an
   assertion commented out; more assertions removed than added in a test file.

Everything else a checklist could enforce is left to the reviewer, because a wrong reviewer
costs a note or an appeal while a wrong pass costs a merge. Design-system token rules already
exist as oxlint config in `1_DS for dev/_adherence.oxlintrc.json` and are not duplicated here.

## The journal

Hooks in `.claude/settings.json` write `.workflow/runs/<runId>/`:

| File | In git | Holds |
|---|---|---|
| `run.json` | yes | status, attempts, budget, notes, halt reason |
| `handoff.json`, `stages/*` | yes | the plan and each stage's verdict |
| `events.jsonl` | no | every tool call with duration and outcome |
| `blobs/`, `thinking/` | no | tool output over 2 KB, and transcript snapshots |

Outputs over 2 KB go to `blobs/` with a sha256; anything touching `.env`, `Info.txt`, a key
file or a credential-shaped string is dropped rather than patched. Reasoning is not in the hook
payload — it is copied out of the session transcript on `SubagentStop`, before compaction can
lose it.

## Two hard refusals

`.claude/hooks/guard-protected-branch.mjs` denies, rather than reports:

- a push to `main`, or a `v*` tag — both deploy,
- `prisma generate` outside `apps/api`, which produces a client that cannot find
  `apps/api/.env` and fails the first query with "client password must be a string".

## Configuration

Everything is in `.claude/ai-workflow.config.json`, and `scripts/ship-config.mjs` is the only
thing that reads it. The shape is track first:

```
shipConfig.<track>                 match, branchPrefix, requiresRefine
shipConfig.<track>.stages.<stage>  enabled, agent, model, effort, shard*, and the stage's own keys
shipConfig.<track>.stages.<stage>.variants.<name>   a partial override of that block
shipConfig.<track>.convergence     maxCodeAttempts, maxHandoffReplans, infraRetries, autoContestAfter
shipConfig.<track>.timeoutMin      per stage, in minutes
breakers, isolation, protectedBranches, refine                shared by every track
```

Nothing is inherited between tracks. What you read under `patch` is what `patch` runs, and the
cost — three places to edit when an agent is renamed — is what the validator exists to catch.

**Validate before you run.** `npm run config` parses the file, checks it, and prints what each
track resolves to; `--track <name>` narrows it and `--json` gives the resolved blocks. It is
also run automatically at the top of `ship`, by every `wf` command, and as the first row of
preflight, so a bad edit stops the run before a lock, a branch or a stage exists.

It checks the things that are silent at the point of failure: an unknown key anywhere
(`shardsize` for `shardSize`), a stage missing from a track or one that is not a stage, an
`agent` or `shardAgent` with no definition under `.claude/agents/`, a model outside
opus/sonnet/haiku/fable, a `script` that does not exist, a QA level that is not
unit/int/e2e, `static_gate` or `qa` disabled, a replan budget on a track with no plan stage, a
timeout for a stage the track does not run, two tracks claiming one path, and a `match` that is
not a valid regular expression.

## One run at a time

`concurrentRuns` is 1 and `init` takes a lock. Worktrees isolate files and nothing else — two
runs share ports 3000 and 4000, `devscribed_dev`, `devscribed_test`, the mail sink and
`.local-storage`. Until those are per-run, a second run does not fail cleanly; it produces
verdicts about the wrong code.

For the same reason QA runs E2E with `CI=1`. Without it `reuseExistingServer` attaches
Playwright to whatever is already on those ports — possibly a developer's own checkout — and
the verdict is then about a diff that never ran. `CI=1` also turns on `retries: 1`, which is
what produces a trace on failure.
