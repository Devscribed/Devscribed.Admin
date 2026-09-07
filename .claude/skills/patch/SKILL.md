---
name: patch
description: Write a patch note to specs/patches/PATCH-NNN-slug.md — a change of agreed behaviour small enough to state and check in one file, then ship it on the light track. Use when asked to adjust field order, enablement, wording, validation bounds or another small UI or API rule that an existing spec already speaks about, and a full three-file spec is not earned.
---

# Writing a patch

A patch is the third weight of document, between a spec and a bug report. It exists for the
change that is genuinely two lines of code and still changes what the product promises: a
field moves, a control is disabled until another is chosen, a bound is added to an input.

**It is not a lighter bug report.** A bug is behaviour that disagrees with a document. A patch
is a document that disagrees with what you now want. The bug skill hunts a cause; here there
is no cause — there is a decision, and this file is where it is made.

**And it is not a smaller spec.** A spec opens a design space. A patch closes one rule.

## The entry condition

Check it before writing a word. Every line must hold. One that does not is a `/spec`, and
saying so costs a sentence — discovering it at review costs the run.

- **No new route, and no change to an existing one's shape.** Status codes and response bodies
  are contracts other things read.
- **No Prisma schema change and no migration.** Migrations are permanent and additive; that
  reasoning is a spec's to carry.
- **No change to authorization, org scoping, or the session.** These fail silently and are
  blockers by default.
- **At most two product files, tests aside.** Not a promise to be tidy — a bound. Work that
  needs a third file needs a plan, and this track compiles none.
- **No new design-system component.** A DS gap is a spec's DS-gaps table, never an improvisation.
- **The rule fits in one screen of text.** If stating it needs a table of interactions, the
  interactions are the spec.

Batch what belongs together. Four adjustments to one form are one patch, one run, one branch —
three separate runs review the same diff three times.

## What it must carry

`specs/patches/PATCH-NNN-slug.md`, numbered sequentially, one file, no bundle. Follow
[references/patch-template.md](references/patch-template.md).

Four things earn their place, and nothing else does:

1. **What is being superseded.** Name the owning spec and the requirement whose behaviour this
   replaces, or say plainly that none covers it.
2. **The whole new rule, in this file's own text.** Written so a reader of this patch never
   opens the spec it supersedes — who sees it, what it does, what it looks like when it is
   wrong. This is the rule CLAUDE.md states for any newer document: the cross-reference sends
   the reader away instead of answering them.
3. **The contracts you touch** — the `data-testid` values and any user-facing message, in the
   same table shape a spec uses. The static gate reads these tables out of this file, so a
   testid that is not in the table is a testid the gate reports as unnamed.
4. **The cases**, numbered into the owning spec's scheme (`TC-03-E2E-07`, never `TC-PATCH-01`).
   One or two. Choose the cheapest level that can fail: a bound belongs in
   `packages/validation` as a unit case; field order and enablement are DOM state and belong
   in E2E.

Everything a spec carries that a patch does not — blast radius across areas, backward
compatibility of stored data, a verification route, DS gaps — is absent because the entry
condition already ruled it out. If you find yourself wanting one of those sections, that is
the condition failing, not the template being short.

## Then ship it

```bash
node scripts/ship.mjs specs/patches/PATCH-NNN-slug.md --branch fix/<slug>
```

The track is read off the path: no refine ledger is required, no plan is compiled, the
implementer works from this document, and review runs its cheap profile. The static gate and
QA are unchanged — they are what keeps a patch honest, and neither is ever skipped.

## Anti-patterns

- A patch that points at the spec instead of restating the rule.
- A patch whose entry condition failed on one line and was written anyway.
- Several patches for one form.
- A case that would pass before the change.
- A patch used to skip refine on work that is a spec.
