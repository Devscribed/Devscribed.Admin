---
name: ship
description: Run a specification, a bug report or a patch note through the implementation pipeline — pre-implement, implement, static gate, code review, QA. Use when asked to implement a spec, ship a spec, run the pipeline, fix a bug that already has an investigation report, or ship a patch.
---

# Shipping a document

One command. The orchestrator is `scripts/ship.mjs`, not you:

```bash
node scripts/ship.mjs specs/<area>/NN-name.md --branch spec/<slug>
```

It runs preflight, spawns each agent stage as a headless `claude -p --agent <name>`, runs the
static gate, hands every verdict to `scripts/wf.mjs`, and follows whatever `wf` decides —
until the run reaches `ready` or halts. The loop is mechanical, so a script runs it.

## Three documents, three tracks

The track decides which stages the document earns, and it is read off the path — there is
nothing to pass:

| Invoked as | Document | Runs | Branch |
|---|---|---|---|
| `/ship <spec>` | `specs/<area>/NN-name.md` | every stage; refused unless refine admitted it | `spec/<slug>` |
| `/ship bug <report>` | `specs/bugs/BUG-NNN-*.md` | no plan stage — the report carries the cause | `fix/<slug>` |
| `/ship patch <note>` | `specs/patches/PATCH-NNN-*.md` | no plan stage, review on its cheap shape | `fix/<slug>` |

`bug` and `patch` before the path are how a person says which they mean; the script does not
need them and `--track <name>` overrides the path when they disagree. **Every track runs the
static gate and QA.** A lighter document buys speed against the stages that read intent, never
against the ones that check the result.

If the named document does not exist yet, write it first — `/bug` for a defect, `/patch` for a
small change of agreed behaviour — and do not ship something else instead.

Useful shapes:

```bash
node scripts/ship.mjs <doc> --skip qa       # small change, you will run the suites yourself
node scripts/ship.mjs --resume              # continue the active run
node scripts/ship.mjs <doc> --dry-run       # print what each stage would run, change nothing
node scripts/ship.mjs <doc> --track patch   # override the track the path implies
```

## Your part

**Do not drive the stages by hand and do not second-guess the router.** If you find yourself
deciding whether something deserves another attempt, stop — that decision is written down in
`wf`, and overriding it turns the pipeline back into a conversation.

What you do is the part either side of the run:

- **Before** — make sure the document exists and the branch is not `main`. `ship` refuses both,
  but saying so first is faster than reading a refusal. Create the branch with the prefix the
  track names: `spec/` for a spec, `fix/` for a bug or a patch.
- **After** — read the outcome and explain it.

## Reading the outcome

`ready` means the branch is green. Summarise what changed, which `TC-*` now exist, and any
notes the run collected. **Open no pull request and push nothing** unless asked: the pipeline
stops at a green branch because `main` deploys itself.

A halt is not a crash, and most halts are the pipeline working:

| Halt | What it means | What helps |
|---|---|---|
| `spec-defect`, `spec-ambiguity` | A requirement has two readings, or two rules contradict each other | Draft the wording that removes the ambiguity, with the `spec` skill. This is the most valuable thing the pipeline produces |
| `contested`, `stuck-finding` | The implementer and a gate disagree about a fact | Show both sides — the finding's witness and the counter-witness — and let the person choose |
| `gate-rule-defect` | A gate rule is wrong | Fix the rule in `scripts/static-gate.mjs`, not the code |
| `infra-error` | The environment failed twice | Fix the environment and re-run; nothing about the code is known yet |
| `budget-exhausted` | Five code attempts without converging | Read `wf:log`; if the detectors above never fired, the feedback was probably too vague to act on |

```bash
npm run wf:status
npm run wf:log -- --tail 30 --agents
node scripts/wf.mjs release        # drop the lock when the run is done or abandoned
```

The runbook is [docs/ai-workflow.md](../../../docs/ai-workflow.md).
