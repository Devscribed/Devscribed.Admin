# Agent variants — what runs, what it replaced, and how to switch

Every agent that has been replaced is still here, unchanged, and still selectable. A variant is
chosen by a **profile** in `.claude/ai-workflow.config.json`, or overridden for one run on the
command line. Nothing is deleted, so a comparison is one flag apart.

| Stage | Profile | Agents | Shape |
|---|---|---|---|
| refine (T2/fix) | `solo` | `spec-refiner`, `spec-fixer` | one opus judge over the whole bundle, synchronous |
| refine (T2/fix) | `sharded` **(default)** | `spec-review` + `spec-review-shard`, `spec-fixer-minimal` | opus judge splits the criteria families to sonnet shards, then decides what is worth returning |
| pre_implement | `classic` | `pre-implementer` | the original prompt |
| pre_implement | `strict` **(default)** | `pre-implementer-strict` | answers a closed compile checklist by id, and writes `shippingSurfaces` |
| implement | `solo` **(default)** | `implementer` | one opus implementer, synchronous |
| implement | `orchestrated` | `implement-lead` + `implement-shard` | opus lead splits the handoff into disjoint file sets, sonnet shards build them in parallel waves |
| review | `open` **(default)** | `code-reviewer` + `review-shard-open` | shards judge open-ended, no checklist |
| review | `sweeps` | `code-reviewer` + `review-shard` | shards run the enumerate-then-judge sweeps |

## Switching

**For every run**, edit the `profile` key of that stage in `.claude/ai-workflow.config.json`.

**For one run**, pass the flag — the choice is recorded in the ledger or in `run.json`, so a
result can always be attributed to the shape that produced it:

```bash
node scripts/refine-loop.mjs <spec> --profile solo          # one opus judge, synchronous
node scripts/refine-loop.mjs <spec> --profile sharded       # sonnet shards, opus judge

node scripts/ship.mjs <spec> --implement-profile orchestrated   # parallel sonnet shards
node scripts/ship.mjs <spec> --implement-profile solo           # one opus implementer
node scripts/ship.mjs <spec> --review-profile sweeps
```

`node scripts/spec-slice.mjs <spec> --profile <name>` prints what that profile would do without
running anything.

## Why the new ones exist

**`spec-review` replaces `spec-refiner` as the default, and the name changed with it.** The old
name says the agent improves a document; the work is to decide whether it may enter development.
That is a gate with a closed list, not an editing pass, and a gate is what the register describes.

Three defects of the old shape drove it, each visible in the record of
`specs/requests/03-client-participants.md`:

- **The criteria were reported and not applied.** Three passes answered every id in the register
  and cleared `S-12`, while both halves of the contradiction it names sat in the bundle. One judge
  reading a 1,700-line bundle samples; five shards enumerating one family each do not.
- **A pass with no criteria map was recorded as a pass**, and it was the last word on that spec
  before the pipeline ran. The map is now required, and a verdict without one is a judge error.
- **Nothing decided what an already-shipping route does with a row of a kind the spec invents.**
  Every enumeration ran from the document's own tables, so a path the document never names was
  invisible to all of them. `S-58` asks for that decision, and `pre-implementer-strict`'s `H-07`
  asks again with the code in view.

**`spec-fixer-minimal` replaces `spec-fixer` under the sharded profile.** Same decision rules,
narrower mandate: one repair clears one named criterion by the shortest edit, every repair records
which criterion it clears and its net line change, and a repair that cannot fit the growth budget
goes to a person instead of into the document.

**`pre-implementer-strict` replaces `pre-implementer` as the default.** Same job, answered by id:
seventeen compile questions, each `ok`, `finding` or `n/a`, so a plan that skipped one is
visible in the verdict rather than in the diff three stages later.

**`implement-lead` + `implement-shard` are for speed and nothing else.** The lead owns the plan,
the migration, the test runs and the commit; shards get small isolated tasks inside disjoint file
sets. It is sound only when the handoff's `files` globs are disjoint, which is why `solo` remains
the default and the lead merges any two tasks that share a file.

## What stays true in every variant

The registers, the witness rule, the closed rule lists and the routing in `scripts/wf.mjs` are
unchanged. A shard never blocks; the judge that dispatched it decides. No agent edits a spec
except the fixer, and no agent edits a spec other than the one it was given.
