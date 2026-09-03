# 13. A spec is admitted by a judge that shards its reading

**Status:** accepted
**Date:** 2026-09-03
**Supersedes nothing.** It changes how [0008](0008-a-spec-is-judged-by-a-stranger.md) and
[0012](0012-a-judge-blocks-only-under-a-criterion-somebody-wrote-down.md) are carried out; both
decisions stand. Those two, and 0009–0011, name the agent `spec-refiner`, which is what it was
called then.

## The rule

**`spec-review` replaces `spec-refiner` as the default judge, and the gate it runs is an
admission decision:** a spec enters development when every criterion the register marks `blocks`
reads `clear` or `n/a`, and on no other ground.

- The register moved to `.claude/skills/spec-review/references/admission-criteria.md` and gained
  the admission rule, a sharpened `S-12` and a new `S-58`. The ids are unchanged.
- The judge **splits the reading**: sonnet shards each sweep one criteria family, enumerate it,
  and return **claims**; the opus judge holds contradiction, scope and the admission decision,
  and **decides what is worth returning**. A shard never blocks.
- `scripts/spec-slice.mjs` derives the split from the register's own section headings and the
  config, so the judge chooses none of it and two passes shard a document the same way.
- **Every agent it replaced is kept and still selectable** by profile — see
  `.claude/agents/VARIANTS.md`. Profiles are per stage, overridable per run, and recorded in the
  ledger and in `run.json`.

Three things are now enforced by script rather than by a prompt:

1. **A judged verdict with no `criteria` map is a judge error**, retried, never a pass.
2. **The model that answered must be the model asked for**, taken from the run's `init` event and
   written into the ledger.
3. **`wf init` refuses a spec whose refine ledger is not a pass**, or whose bundle changed after
   the round that judged it. `--accept-unrefined "<why>"` overrides and records the reason.

## What it replaced

One opus judge read the whole bundle each pass, reported all 57 criteria, and the loop recorded
whatever came back.

## Why

From the record of `specs/requests/03-client-participants.md`, whose review returned five
blockers, two of them defects of the spec:

- **A criterion was reported and not applied.** Three opus passes answered `S-12` `clear` while
  both halves of the contradiction it names sat in the bundle at `2bc8fca` — the matrix granting
  `user` a capability, and the only route that serves it guarded by one `user` does not hold.
  `S-12`'s text compared the matrix with *flows*; the guard lives in the Routes table. One judge
  sampling 1,700 lines cleared it truthfully. The register now names the Routes table, and five
  shards enumerate rather than sample.
- **A pass that ran no criterion counted as a pass.** The last verdict before the pipeline —
  `.workflow/refine/requests-03.probe.2026-09-03T13-53-50-451Z/2/judge.verdict.json` — carries no
  `criteria` map and no `sweeps`, and the loop recorded `pass`. Both governing documents already
  said a criterion absent from the map was not run; nothing acted on it.
- **The judge was not the model that was paid for.** The loop asked for opus
  (`requests-03.log:33`); the `init` events of both passes in that loop read `claude-sonnet-5`,
  while the earlier loop's rounds read `claude-opus-5`. The ledger recorded neither.
- **The pipeline never asked whether the spec had been judged.** That loop ended
  `"status": "error"` at T1, a third loop died at T2 and left the ledger `"running"`, and the ship
  run started ninety minutes later. `scripts/ship.mjs`, `scripts/wf.mjs` and the ship skill
  contained no reference to refine at all.
- **No enumeration reached a shipping route the document never names.** Every criterion's list
  came from the spec's own tables, so the reassign path — which the bundle mentions only in an
  event list, an edge case and a Known Gaps row — was invisible to all of them. The implementer
  extended it to client-addressed rows and the reviewer filed it. `S-58` asks the spec to decide
  what a shipping path does with a row of a kind it invents, and `H-07` in
  `pre-implementer-strict` asks again with the code in view.

## What it costs

- **A second place to be wrong about the split.** `spec-slice.mjs` derives families from the
  register's headings; a section renamed without a matching pattern falls to `unassigned`, which
  the slice prints and the judge must answer itself.
- **Shard claims are not free judgement.** The judge checks each witness before keeping it, and
  checks dismissals as hard as claims. A shard that clears an item on the strength of a code
  comment has cleared nothing, and only the judge can catch that.
- **Two more profiles to keep working.** Every preserved agent is still dispatched by some
  profile, so a change to the register or to the rule list has to hold for both.
- **`--accept-unrefined` is a real hole**, deliberately: a person can still start a run on an
  unjudged spec. It is recorded rather than prevented, because the alternative is a pipeline that
  cannot be run at all while a judge is down.

## The hypothesis this does not test

That sharding finds *more* than one opus pass. Nothing here measures that, and the evidence above
is about criteria that were reported without being applied, not about a judge that was too small.
What it buys with certainty is enumeration: a shard that returns no list has failed visibly,
where a sample that missed something looked exactly like one that did not.
