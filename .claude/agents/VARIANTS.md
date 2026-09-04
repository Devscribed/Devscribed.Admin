# Agent variants — what runs, and how to switch

Every family here is one **core** agent and, where the work is big enough to split, one
**lead**. The core holds the logic; the lead is a capability over it and holds no rule the core
does not state. Switching between them is configuration, so a comparison is one flag apart.

What the files are and which document owns which rule is in [`.claude/README.md`](../README.md).

| Stage | Shape | Agents | What it is |
|---|---|---|---|
| refine (T2) | `solo` | `spec-reviewer` | one opus judge over the whole bundle, synchronous |
| refine (T2) | `sharded` **(default)** | `spec-reviewer-lead` + `spec-reviewer` | the lead splits the criteria families to children, then decides what is worth returning |
| refine (fix) | `solo` | `spec-fixer` | repairs a verdict's findings in the documents where they live |
| refine (fix) | `sharded` **(default)** | `spec-fixer-minimal` | same decision rules, narrower mandate: one repair clears one named criterion by the shortest edit |
| pre_implement | `default` | `pre-implementer-strict` | answers a closed compile checklist by id, and writes `shippingSurfaces` |
| pre_implement | `classic` | `pre-implementer` | the original open prompt |
| implement | `default` | `implementer` | one opus implementer, synchronous |
| implement | `orchestrated` | `implementer-lead` + `implementer` | the lead splits the handoff into disjoint file sets, children build them in parallel waves |
| review | `default` (spec, bug) | `code-reviewer-lead` + `code-reviewer-open` | children judge open-ended, no checklist |
| review | `default` (patch) | `code-reviewer-lead` + `code-reviewer-sweeps` | children run the enumerate-then-judge sweeps |
| review | `sweeps` / `open` | the lead with the other core | the same lead, the other method |
| review | `solo` | whichever core the track uses | one reviewer, no lead, no split |

`npm run config` prints what each track resolves to and every variant it could run instead. It
is the answer to "what actually runs", not this table.

## Every name that used to exist, and what it is now

No shape was withdrawn. Each row below is a rename or a split, and every method either agent
had is still selectable under the name on the right — which is what the rule in `CLAUDE.md`
asks of this page. The old files are not kept beside the new ones: keeping a second copy of a
definition is the duplication that made the rules drift in the first place, and the text of any
of them is a `git log --diff-filter=D --` away.

| Was | Is now | What changed |
|---|---|---|
| `spec-refiner` | `spec-reviewer` | renamed. The name said the agent improves a document; the work is deciding whether it may enter development. Three defects of the old shape are listed below. |
| `spec-review` | `spec-reviewer` | renamed only, to the one convention. |
| `spec-review-shard` | `spec-reviewer` | the child and the stage agent became one definition — a core runs as either. |
| `code-reviewer` | `code-reviewer-open` + `code-reviewer-sweeps` | split into the two methods it carried at once. Both are selectable; neither lost a rule. |
| `review-shard` | `code-reviewer-sweeps` | the child and the stage agent became one definition. |
| `review-shard-open` | `code-reviewer-open` | the same, for the open method. |
| `implement-lead` | `implementer-lead` | renamed only. |
| `implement-shard` | `implementer` | the child and the stage agent became one definition. |

What every one of them stopped carrying is the same thing: the finding shape, the address
table, the witness rule and the verdict destination, which are now stated once in
`references/verdict-contract.md`, and the lead's own obligations, in `references/lead-contract.md`.

## Switching

**For every run**, edit the stage block under its track in `.claude/ai-workflow.config.json`,
then run `npm run config` — a renamed agent or a mistyped key is refused there rather than by
the stage that would have run it.

**For one run**, pass the flag. The choice is recorded in the ledger or in `run.json`, so a
result can always be attributed to the shape that produced it:

```bash
node scripts/refine-loop.mjs <spec> --profile solo          # one opus judge, synchronous
node scripts/refine-loop.mjs <spec> --profile sharded       # children on sonnet, opus judge

node scripts/ship.mjs <doc> --implement-profile orchestrated
node scripts/ship.mjs <doc> --review-profile solo           # the core agent, no lead
node scripts/ship.mjs <doc> --review-profile sweeps         # the lead, the other method
```

A variant a track does not declare is refused by name rather than silently ignored: `patch` has
no `orchestrated` implement, because the entry condition bounds a patch at two files.

`node scripts/spec-slice.mjs <spec> --profile <name>` prints what a refine profile would do
without running anything.

## Two cores for code review, on purpose

`code-reviewer-open` and `code-reviewer-sweeps` are two **methods**, not one agent twice. Sweeps
enumerate and then judge, which gives a stopping condition; open judgement has none, and finds
the shape of defect nobody wrote down in advance. Both are kept and both are measured — see
[ADR 0004](../../docs/adr/0004-review-is-a-set-of-sweeps.md) and
[the sharding measurement](../../docs/research/2026-08-30-review-sharding.md).

Everything they share — the register, the witness rule, the verdict shape, the coverage
accounting — is in `references/verdict-contract.md` and the register itself, written once.

## Why the current defaults exist

**`spec-reviewer` replaces `spec-refiner` as the judge, and the name changed with it.** The old
name says the agent improves a document; the work is to decide whether it may enter development.
That is a gate with a closed list, not an editing pass.

Three defects of the old shape drove it, each visible in the record of
`specs/requests/03-client-participants.md`:

- **The criteria were reported and not applied.** Three passes answered every id in the register
  and cleared `S-12`, while both halves of the contradiction it names sat in the bundle. One judge
  reading a 1,700-line bundle samples; five children enumerating one family each do not.
- **A pass with no criteria map was recorded as a pass**, and it was the last word on that spec
  before the pipeline ran. The map is now required, and a verdict without one is a judge error.
- **Nothing decided what an already-shipping route does with a row of a kind the spec invents.**
  Every enumeration ran from the document's own tables, so a path the document never names was
  invisible to all of them. `S-58` asks for that decision, and `pre-implementer-strict`'s `H-07`
  asks again with the code in view.

**`spec-fixer-minimal` is the default fixer under the sharded profile.** Same decision rules,
narrower mandate: one repair clears one named criterion by the shortest edit, every repair
records which criterion it clears and its net line change, and a repair that cannot fit the
growth budget goes to a person instead of into the document.

**`pre-implementer-strict` is the default compiler.** Same job, answered by id: seventeen compile
questions, each `ok`, `finding` or `n/a`, so a plan that skipped one is visible in the verdict
rather than in the diff three stages later.

**`implementer-lead` is for speed and nothing else.** The lead owns the plan, the migration, the
test runs and the commit; children get small isolated tasks inside disjoint file sets. It is
sound only when the handoff's `files` globs are disjoint, which is why the synchronous shape
remains the default and the lead merges any two tasks that share a file.

## What stays true in every shape

The registers, the witness rule, the closed rule lists and the routing in `scripts/wf.mjs` are
unchanged. A child never blocks; the lead that dispatched it decides. No agent edits a spec
except the fixer, and no agent edits a spec other than the one it was given.
