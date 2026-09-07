# What the gates do not look at

**Question.** The product accumulated a long run of UI patches. Are they independent defects, or
one thing? And which stage should have caught them?

**Ground truth.** Two corpora on disk, counted rather than sampled:

- every document in `specs/patches/` and `specs/bugs/`, read in full — 28 patch notes, 14 bug
  reports;
- every stage verdict under `.workflow/runs/*/stages/*.json` for runs at or after
  `bf6d5ca` (2026-09-04), and every `.workflow/refine/time-off-*.verdict*.json` — 8 runs.

Findings were counted by script over the artefacts, not read out of any agent's summary.

---

## 1. What the written record says

| | |
|---|---|
| Patch notes | 28 |
| …that change something drawn (`surface: ui` or `api+ui`) | **24** |
| …carrying no test case at all (`cases: []`) | **24** |
| …exceeding the track's own two-product-file bound | 6 (9, 7, 6, 3, 3, 3 files) |
| Bug reports | 14 |
| …with `surface: ui` | 9 |
| …with verdict `SPEC-GAP` — the spec was silent, not wrong | **10** |

Twenty-four patches arrived at QA with nothing to run. Every one of those defects was found by a
person looking at the running app.

## 2. What the pipeline's own gates found

17 blocking findings across the 8 runs, plus 7 from refine on `time-off-01`.

```
by stage:      review 13 | static_gate 3 | pre_implement 1
by criterion:  CR-30 ×3 | REQ-01-034 ×2 | CR-29 ×2 | CR-11, CR-26, CR-32 ×1
refine:        S-05 ×2 | S-36, S-08, S-12, S-26, S-17
```

Thirteen of the seventeen are **agreement between two written things**: a caller against its
port, a message against `packages/validation`, a picker's option list against the rule that
validates it, an export named in a table against the tree. The gates are good at this.

**Two concern geometry** — `min-width: max-content` against a column floor, and an
`overflow: hidden` against a requirement making horizontal scroll unconditional. Both were found
by a reviewer who happened to read a stylesheet. Neither was found *by a criterion*, because no
criterion for either existed.

Two of the seven refine blockers (`S-26`, `S-17`) were **created by the repair of the round
before**.

## 3. The classification

Root-caused, the 41 documents collapse to six mechanisms:

| Mechanism | Documents | Gate that held it before this change |
|---|---|---|
| a box sized by its own content | **10** | none |
| the wait drawn over something worth keeping | 4 | partial — `S-62`, `CR-33` |
| a box outside its flow, still in the layout | 3 (+1 blocker) | none |
| one message drawn twice | 2 | none |
| a list with no way through it | 3 | partial — `S-61` |
| an asset a token names and nothing loads | 2 | none |

One mechanism accounts for ten documents on ten different controls.

---

## Hypothesis that died: "these are many small unrelated UI bugs, and the answer is more care"

Care was already being applied, and it produced the rework.

**9 of 28 patches exist only because an earlier patch closed the control instead of the
mechanism.** The chains are in the documents' own cross-references:

```
004 ──► 005                 "this picker keeps what it has"
009 ──► 016                 reserved with min-height, which reserves nothing
   └──► 021                 same mechanism, new screen
010 ──► 019 ──► 020         "not in this patch" → shipped → still moves on the third chip
012 ──┐
013 ──┴► 017                one created the orphans, the other did not clear them
015 ──► 025                 the same rule derived a second time, on another screen
022 ──► 024 ──► 028         the legend moved three times
025 ──► 026                 the note "got exactly backwards" its own mechanism
```

Two notes say it outright: one records that its predecessor had the reason for its own fix
backwards; another that the rule was *"arrived at here the hard way"* after being derived once
already elsewhere.

The failure is not attention. It is that a rule written about the control in front of you closes
one control, and the next screen re-opens it.

## Hypothesis that died: "a spec naming a property no stylesheet declares is a mechanical check"

It reads like a clean analogue of the message-table check. It is not.

Run across all 83 spec bundles, the naive form — *every backticked `--property` the bundle names
must be declared somewhere* — produced:

```
specs scanned: 83 | property findings: 175
```

Almost all of them are frozen specs written against an older token vocabulary (`--fs-11`,
`--bg-panel`, `--sp-4`), and many sit in `## DS gaps` rows whose entire content is that the
property does not exist yet. Scoping to `## DS gaps` alone still gave 28 across 9 specs, for the
same reason: that table is a list of things deliberately absent.

**Two narrower questions do have one right answer**, and those are what shipped:

- a property named in `## Geometry & motion` — a section that never describes what is missing;
- a property the spec names that is declared under a **different spelling**, firing only when a
  sibling name exists.

The second measured at:

```
near-miss findings: 9 across 83 specs   — every one genuine
  --range-label-col   vs declared --range-col
  --font-mono         vs declared --font-family-mono        (×4 specs)
  --shadow-card       vs declared --shadow-card-hover/-soft (×3 specs)
  --shadow-toggle     vs declared --shadow-toggle-active
```

The first of those had already been raised by a review pass — as a note, and left open.

Verified end-to-end against the run that produced it:

```
$ node scripts/static-gate.mjs --base HEAD --json     # .workflow/current → time-off-03
spec/property-spelt-differently | --range-label-col |
  the spec names `--range-label-col`, which is declared nowhere, while `--range-col` is declared
```

**The general lesson.** A gate whose question is slightly too broad produces a finding rate that
teaches everyone to ignore it. 175 findings and 9 findings are not the same check with different
tuning; they are a check that works and a check that gets turned off.

## Hypothesis that died: "the font check would have caught the typeface defect"

It would not, and the check says so in its own comment.

The defect was a product drawn in a typeface nobody chose. The check asks whether anything in
the tree names the family in a font-loading rule. Measured at the commit before the fix:

```
at 6de3329^:  Poppins -> loaded? true
```

An `@import` for the family existed the whole time, in `packages/ds/src/tokens/fonts.css`,
reached from `styles.css`. Whether that rule is *reached at runtime* — past a CSP, past a
bundler that hoists remote `@import`s, past an entry point that never imports the file — is not
a question a grep can answer, and neither is whether the face covers the scripts the data
carries or carries the weights the tokens ask for.

What the check does answer is total absence, which is a real and unambiguous defect. It is
scoped to the **first** family of each stack, because everything after the first is a fallback
the repository deliberately does not ship: without that scoping it demands somebody fetch
`'SF Mono'`.

The rest of `UI-06` is the reviewer's and QA's, and the ADR records that it is not claimed.
