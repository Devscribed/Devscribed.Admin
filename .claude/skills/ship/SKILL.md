---
name: ship
description: Run a specification or a bug report through the implementation pipeline — pre-implement, implement, static gate, code review, QA — with routing, retries and a run journal. Use when asked to implement a spec, ship a spec, run the pipeline, or fix a bug that already has an investigation report.
---

# Driving the pipeline

You are the driver. You do not implement, review or test — you invoke the stage agents, hand
each verdict to `scripts/wf.mjs`, and do what it tells you next. **Every routing decision
belongs to `wf`, not to you.** If you find yourself deciding whether something deserves
another attempt, stop: that decision is already written down, and overriding it is how a
pipeline quietly becomes a conversation again.

## Start

```bash
git switch -c spec/<slug>                          # never run on main; main deploys itself
node scripts/wf.mjs init --spec specs/<area>/NN-name.md
node scripts/wf.mjs preflight
```

`init` refuses to start on a protected branch or while another run holds the lock. Runs share
ports, both databases, the mail sink and `.local-storage`, so they are serialised on purpose.

If preflight fails, fix the environment and re-run it. Do not proceed past a failed preflight:
every check it makes is something that, left broken, makes a later stage *lie* rather than
fail — a missing `apps/api/.env` surfaces as a Prisma error, a bound port surfaces as a test
result about somebody else's code.

## The loop

Read `node scripts/wf.mjs status` to learn the current stage, then run that stage:

| Stage | What you do |
|---|---|
| `pre_implement` | Delegate to the `pre-implementer` agent. It writes `handoff.json`. |
| `implement` | Delegate to the `implementer` agent with the handoff and, on a retry, the findings from the stage that sent it back. |
| `static_gate` | `node scripts/static-gate.mjs --out .workflow/runs/<runId>/gate.json` |
| `review` | Delegate to the `code-reviewer` agent. |
| `qa` | Delegate to the `qa` agent. |

After each stage, feed the verdict in and obey the answer:

```bash
node scripts/wf.mjs stage <name> --start      # before delegating
node scripts/wf.mjs verdict <name> --file <verdict.json>
```

`verdict` prints one of: `goto <stage>`, `retry-stage`, `ready`, or `halt`. That is the
instruction. Follow it literally.

## What the router will do, so you are not surprised

Every finding carries a **target** naming where the defect lives, and the target decides the
route — not the severity, not how many times it has happened.

- `code` → back to the implementer. The only address that retries.
- `handoff` → back to the pre-implementer to replan, once per run.
- `spec` → **halt.** The spec wins in this repository and changing it is deliberate. A spec
  defect found here is the most valuable thing the pipeline produces; it is not a failure.
- `self` → halt. A gate rule is wrong; fix the rule, not the code.

Three things also halt the run: a **contested** finding, a finding that **survived two
attempts**, and an exhausted budget. In each case the answer is a person, not another attempt.

A finding without a witness never blocks — it is demoted to a note and collected for the human
at the end. You do not need to police this; `wf` does it when it ingests the verdict.

## When it halts

Do not restart the loop, do not "try once more", and do not edit the spec to make the run
proceed. Write up what happened and hand it over:

```bash
node scripts/wf.mjs status
node scripts/wf.mjs log --tail 40
```

For a `spec-defect`, `spec-ambiguity` or `stuck-finding` halt, the useful handover is the
finding's witness plus a proposed wording that removes the ambiguity. Use the `spec` skill to
draft the change; a human decides whether to take it.

## Finishing

When `wf` says `ready`, the branch is green. Summarise for the human: what changed, which
`TC-*` now exist, the notes collected along the way, and the run id. **Open no pull request
and push nothing** unless asked — the pipeline stops at a green branch by design, because
`main` deploys itself.

Release the lock when the run is done or abandoned:

```bash
node scripts/wf.mjs release
```

## Turning stages off

`.claude/ai-workflow.config.json` has an `enabled` flag per stage. Skipping `qa` on a
one-line change is reasonable; skipping `static_gate` is not, because it is the only thing
standing between the loop and a weakened test suite.
