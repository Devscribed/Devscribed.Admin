# 14. A document earns its pipeline by its weight

Date: 2026-09-04

## Status

Accepted.

## Context

The pipeline had one shape. Every document went through pre-implement, implement, static gate,
review and QA, and every spec had to clear `/refine` before `wf init` would start a run at all.

That is correct for a spec bundle and wrong for two other things that were already being
written:

- **A bug report.** `specs/bugs/BUG-NNN-*.md` carries the cause to `file:line` and the fix
  approach. There is nothing left to compile into a plan, and there is no refine ledger for it
  — so once `shipRequiresRefine` landed (ADR 13), `wf init` refused every bug report outright.
  The lighter track is not an optimisation there; without it the reports cannot ship.
- **A change of agreed behaviour that is two lines of code.** A field moves above another; a
  control is disabled until a recipient is chosen; a date input gains a year bound. These are
  not defects — the code does what its spec says — so `/bug` has no verdict for them. The only
  route was a three-file spec bundle, a refine loop and the full pipeline, which is enough
  friction that the alternative taken in practice is to patch the code and leave the spec
  saying something else. That divergence is then found later, by a gate that is forbidden to
  resolve it.

## Decision

**A track decides which stages a document earns, and what each of them is.** The config is
keyed by track first: `shipConfig.<track>` names the paths it matches, its branch prefix and
whether refine admits it, and `shipConfig.<track>.stages.<stage>` writes out the agent, model,
shard shape, budgets and timeouts in full. `scripts/ship-config.mjs` resolves it and is the
only thing that reads the file.

**Nothing is inherited between tracks.** What a person reads under `patch` is what `patch`
runs — no defaults block to cross-reference, no merge order to hold in the head. The cost is
real: renaming an agent means three edits, and missing one is easy. That cost is paid to the
validator rather than to a run.

| Track | Document | Does not run | Refine | Code attempts |
|---|---|---|---|---|
| `spec` | `specs/<area>/NN-name.md` | — | required | 8 |
| `bug` | `specs/bugs/BUG-NNN-*.md` | `pre_implement` | not required | 6 |
| `patch` | `specs/patches/PATCH-NNN-*.md` | `pre_implement`; cheap review | not required | 3 |

Four rules make it hold:

1. **The static gate and QA run on every track.** A lighter document buys speed against the
   stages that read intent. It never buys speed against the stages that check the result, and
   a track that skipped those would be a way of shipping unmeasured work under a shorter name.

2. **A patch's admission is a closed entry condition, not judgement.** It lives in
   `.claude/skills/patch/SKILL.md`: no new route, no schema change, no authorization or
   scoping change, at most two product files, no new design-system component, one screen of
   rule. Every line must hold. This is the load-bearing part — a cheap track stays cheap only
   while the things routed to it are actually small, and "this is basically small" is exactly
   the judgement that erodes.

3. **A patch supersedes by restating.** It names the spec and requirement it replaces and
   states the whole new rule in its own text, writing nothing back into the older document.
   This is the rule CLAUDE.md already gives any newer spec; a patch is not an exception to it.

4. **The config is validated before anything runs.** `ship`, every `wf` command and the first
   row of preflight load it through `loadConfig`, which refuses an unknown key, a stage missing
   from a track, an `agent` with no definition under `.claude/agents/`, a model outside the
   known set, a `script` that does not exist, `static_gate` or `qa` disabled, a replan budget on
   a track with no plan stage, or two tracks claiming one path. `npm run config` runs the same
   check and prints what each track resolves to. Duplication is only safe if drift is loud.

Where a track compiles no plan there is no `handoff.json`, so the implement and review prompts
name the document instead, and a review finding addressed to `handoff` routes to `implement`.

## Consequences

The refine gate no longer blocks bug reports. Small behaviour changes have a route that keeps
the document and the code in agreement without a bundle and a judged loop.

The cost is a third weight to choose between, and one more place where a person can choose
wrongly. The mitigation is that choosing wrongly is visible rather than silent: a patch that
should have been a spec hits the entry condition while it is being written, or the static gate
when it names a testid its own tables do not.

## The hypotheses this rejected

**That tracks should inherit from a `defaults` block.** It removes the duplication and it was
the first shape written. It was rejected because the question a person actually asks of this
file is "what does a patch run" — and under inheritance that question is answered by merging
two blocks in the right order, which is exactly the reading a config exists to spare them. The
duplication is the feature; the validator is what makes it affordable.

**That the existing `--skip` flag was already enough.** `node scripts/ship.mjs <doc> --skip
pre_implement` runs the same stages a `bug` track runs. It was rejected for two reasons found
while wiring it: `wf init` refuses the document before any skip is consulted, so the flag
cannot reach the case it was supposed to solve; and a skip is invisible afterwards — nothing
in `run.json` said which stages a finished run had actually run, so two runs of different
shapes compared as though they were the same run. A track is recorded; a flag was not.
