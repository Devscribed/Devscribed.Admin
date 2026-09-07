# 0021 — A screen defect is a mechanism with an id, and it is held by a measurement

**Status:** current
**Date:** 2026-09-07

## The decision

Defects on drawn screens are governed by a closed register of **eight mechanisms**,
`.claude/skills/ui-invariants/`, on the same terms as the two registers that already exist:
every blocking finding about a screen names a `UI-nn`, and a finding that names none is a note.

Three consequences:

1. **A rule is written about the mechanism, never about the control it was found on.** A
   document that says *this picker holds its width* closes one control. One that says *no box
   has a size its own content decides* closes every control, including the ones not yet built.
2. **A spec that draws a screen carries `## Geometry & motion`** — one row per element whose
   content varies in length, in count, or in presence, naming what holds it and what moves if
   nothing does. An empty table is a finding.
3. **A screen defect is held by a measurement, not by a screenshot.** A box that did not move,
   a scroll box that did not grow, a message counted once. The probes are
   `e2e/tests/ui-invariants.ts`.

## What it replaces

Nothing was in force. Layout, overflow, loading states and duplicate nodes were governed by no
criterion in either closed register, so no gate could block on them and every one of these
defects reached a person looking at the running app.

`S-63` existed and had no home in the template: the author had nowhere to write the answer and
the judge had to invent the finding, so it fired unevenly and never reached the patch track,
which does not run refine.

## The evidence

Two corpora were read: every patch and bug report in `specs/`, and every blocking finding from
the pipeline runs since `bf6d5ca`.

**The written record.** Of 28 patch notes, 24 change something drawn and 24 carry no test at
all. Of 14 bug reports, 9 are `surface: ui` and 10 carry the verdict `SPEC-GAP` — the spec was
silent, not wrong. Six patches exceeded the track's own two-file bound.

**The pipeline's own findings.** 17 blocking findings across 8 runs, plus 7 from refine. Thirteen
of the seventeen are agreement between two written things — `CR-30`, `CR-29`, `S-05`, `S-08`,
a message table against `packages/validation`. **Two** concern geometry, and both were found by
a reviewer happening to read a stylesheet rather than by any criterion.

**The conclusion the two corpora agree on.** The gates read text against text and are good at
it. Nothing in the pipeline looks at a rectangle, so every defect that is only visible as a
rectangle passes every gate.

## The hypothesis this killed

**"These are many small unrelated UI bugs, and the answer is more care."**

They are not many and they are not unrelated. Classified by root cause, the 41 documents
collapse to six recurring mechanisms, one of which — *a box sized by its content* — accounts for
ten of them on ten different controls.

Worse, care was already being applied and produced the rework: **9 of 28 patches exist only
because an earlier patch closed the control instead of the mechanism.** The chains are in the
documents' own cross-references — `004→005`, `009→016`, `010→019→020`, `012→017`, `013→017`,
`015→025`, `022→024→028`, `025→026`. Two of them say so outright: one patch note records that
its predecessor "got exactly backwards" the reason for its own fix, and another that the rule
was "arrived at here the hard way" after being derived once already on another screen.

A register of mechanisms is the answer that more care is not.

## The hypothesis this also killed

**"A spec naming a custom property that no stylesheet declares is a mechanical check."**

It is not, and implementing it that way was wrong. Run across all 83 spec bundles the naive
form produced **175 findings**, almost all of them legacy specs written against an older token
vocabulary — where a `## DS gaps` row exists precisely to say a property does not yet exist.

Two narrower questions do have one right answer, and both are implemented instead:

- a property named in `## Geometry & motion`, which never describes what is missing;
- a property the spec names that is declared under a **different spelling**, which fires only
  when a sibling name exists. Across all 83 bundles that yields **9 findings, all genuine** —
  `--range-label-col` against a declared `--range-col`, `--font-mono` against
  `--font-family-mono`, `--shadow-card` against `--shadow-card-soft`. The first of those had
  been raised by a review pass as a note and left open.

The lesson is general: a gate whose question is slightly too broad produces a finding rate that
teaches everyone to ignore it.

## What it costs

Three checks in `scripts/static-gate.mjs` — deterministic, no model, no measurable time. A
mandatory table in two templates. Five criteria in the two registers, and one sweep. The
measurement obligation on the implementer and on QA costs a browser run on any diff that draws,
which is the only part of this record with a real price.

## What is not claimed

The font check answers total absence — no rule anywhere names the family. It does **not**
answer whether a stylesheet that names the family is reached at runtime: a rule behind a CSP,
an `@import` a bundler hoists somewhere it is refused, a file no entry point imports all leave
the family named and unfetched, and none of them is visible to a grep. A typeface defect of
that shape has already occurred in this repository and this check would not have caught it. The
weights and the script coverage are likewise out of reach statically, and are the reviewer's
and QA's under `UI-06`.
