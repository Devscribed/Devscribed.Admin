---
id: "PATCH-008"
title: A field's label and its message share one left edge
surface: ui
supersedes: design-system
requirement: null
cases: []
files: 2
---

## Why

A field's label is inset 10px from the control's left edge; the hint or error under it is pinned
at 0. Two lines that describe one control do not share an edge, so they read as two unrelated
pieces of text — most visibly under the organization country picker on Settings › Holidays,
where the hint starts left of the label above it. Both field components have it and neither
meant to: `TextInput`'s own docstring describes "a 12px label inset 10px above a 44px box … over
a message slot pinned below", and the slot was never given the inset the sentence implies.

## The rule

THE SYSTEM SHALL inset a field's message slot — the hint and the error that share it — from the
control's left edge by the same amount as that field's label, in `TextInput` and in `Select`,
in both the `dropdown` and the `formik` variant.

Nothing else about the slot changes: it stays absolutely positioned so a hint being replaced by
an error still cannot move the field, it keeps its vertical offsets, it keeps `white-space:
nowrap`, and the error still wins when both are given.

**What it looks like when it is wrong.** A hint or an error begins further left than the label
of the field it belongs to.

## Contracts

No `data-testid`, no message, no route. `errorId` still tags the error node and `hintId` still
tags the hint, unchanged, so every assertion that reads one keeps reading it.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: no test holds this edge, so it can drift back silently. The case it would carry is an
E2E geometry check — the label's and the hint's left edges are equal on a `TextInput` and on a
`Select` — the shape [BUG-011](../bugs/BUG-011-holidays-org-country-hint-is-overlapped.md)'s
`TC-01-E2E-10` already uses for the overlap on the same control.

## Blast radius

- **Every field in the product moves its hint and its error 10px right.** That is the change;
  there is no screen where the old edge was correct, because no screen chose it.
- **Nothing moves vertically and nothing changes height.** The slot is out of flow, so no layout
  reflows and no control shifts.
- **A long message still overflows to the right**, as it does today, and now starts 10px later.
  `nowrap` is unchanged and this patch does not touch it.
- **`packages/ds` only.** No screen file is edited; `grep -rn "messageSlot" packages/ds/src`
  finds both definitions and nothing outside.

## Not in this patch

- **The size difference between a label and its message.** A label is 12px and a message is 8px
  in `formik` or 10px in `dropdown`, and that step is deliberate: the design system records 8px
  as "the smallest text in the product and the only thing set at this size", off the type scale
  on purpose so nothing else reaches for it. Making them equal removes a hierarchy the system
  chose, and it is a decision about the whole type scale rather than about this edge.
- **`Select`'s message being 10px where `TextInput`'s is 8px** for the same role. Two components
  disagreeing about one size is worth settling, and settling it is the same type-scale decision.
- **The overlap under the organization country picker.** Already closed by BUG-011, which gave
  that row the clearance the slot needs.
