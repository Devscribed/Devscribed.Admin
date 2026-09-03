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

## The stages

| Stage | Who | Produces |
|---|---|---|
| `preflight` | script | environment checks; refuses to start on `main` or with the lock held |
| `pre_implement` | `pre-implementer` | `handoff.json` — the plan, compiled from the spec |
| `implement` | `implementer` | code and tests |
| `static_gate` | `scripts/static-gate.mjs` | two rules; see below |
| `review` | `code-reviewer` | verdict against the closed register in `.claude/skills/code-review/references/blocking-criteria.md` |
| `qa` | `qa` | unit in full, integration and E2E targeted, plus the spec's acceptance criteria |

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

`.claude/ai-workflow.config.json`. Each stage has an `enabled` flag; skipping `qa` on a
one-line change is reasonable, skipping `static_gate` is not.

Limits worth knowing: five code attempts, one replan, two infrastructure retries, and a finding
auto-contested after surviving two attempts.

## One run at a time

`concurrentRuns` is 1 and `init` takes a lock. Worktrees isolate files and nothing else — two
runs share ports 3000 and 4000, `devscribed_dev`, `devscribed_test`, the mail sink and
`.local-storage`. Until those are per-run, a second run does not fail cleanly; it produces
verdicts about the wrong code.

For the same reason QA runs E2E with `CI=1`. Without it `reuseExistingServer` attaches
Playwright to whatever is already on those ports — possibly a developer's own checkout — and
the verdict is then about a diff that never ran. `CI=1` also turns on `retries: 1`, which is
what produces a trace on failure.
