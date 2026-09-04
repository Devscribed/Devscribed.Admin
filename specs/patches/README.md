# Patch Notes

One file per patch: `PATCH-NNN-slug.md`. A patch is a change of agreed behaviour small enough
to state and check in one file — a field moves, a control is disabled until another is chosen,
an input gains a bound.

Write one with the [`patch`](../../.claude/skills/patch/SKILL.md) skill (`/patch`), then ship
it on the light track:

```bash
node scripts/ship.mjs specs/patches/PATCH-NNN-slug.md --branch fix/<slug>
```

## The three weights

| Document | Answers | Admitted by | Pipeline |
|---|---|---|---|
| `specs/<area>/NN-name.md` + bundle | What should this area do? | a judged refine loop | every stage |
| `specs/bugs/BUG-NNN.md` | Why is this wrong, and whose fault? | its own verdict | no plan stage |
| `specs/patches/PATCH-NNN.md` | This rule changes — here is the new one | the skill's entry condition | no plan stage, cheap review |

The static gate and QA run on all three. They are what a lighter document buys speed against,
and they are never what it skips.

## The newest document governs

A patch supersedes what an older spec said about the behaviour it names, and it states the
whole new rule in its own text — the same rule [`CLAUDE.md`](../../CLAUDE.md) gives any newer
document. Nothing is written back into the spec it supersedes: specs are frozen once refined,
and the record of what was decided then is worth more than a document edited to look
prescient. The `supersedes` field is how the two are found together.

## When it is not a patch

The entry condition is in the skill and it is closed. A change that adds a route, touches the
schema, moves authorization, needs a third product file or a new design-system component is a
spec, and writing it as a patch only moves where the run stops.

## Index

| Patch | Title | Supersedes | Cases |
|---|---|---|---|
| — | none yet | | |
