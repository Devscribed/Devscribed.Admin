---
id: "PATCH-010"
title: A searchable single select is one line tall
surface: ui
supersedes: design-system
requirement: null
cases: []
files: 1
---

## Why

A searchable single `Select` is as tall as its own value is long. Pick `Algeria` and the control
is `--control-height`; pick `No country — global holidays only` and it grows a second line, the
value moves up against the top edge, and the row it sits in reflows. Changing the selection
moves everything beside it.

Two things cause it, and both are inside the control's value area:

- the area is `flex-wrap: wrap`, which the multi-select needs for its chips and a single select
  has no use for;
- the search `<input>` beside the value has an `<input>`'s own intrinsic width — 20 characters —
  as its flex basis, and a flex line is broken on the basis **before** anything is allowed to
  shrink. A long value plus 20 characters overruns the control, so the input wraps to a line of
  its own and takes the control's height with it.

The pair also fights over the room: the input's basis competed with the value for width, so a
label that had space to be drawn whole was ellipsised anyway.

## The rule

THE SYSTEM SHALL draw a searchable single `Select` at one line, whatever is selected in it, with
the value and the search input sharing that line.

THE SYSTEM SHALL give the search input the room the value leaves and no share of the room the
value needs.

The multi-select is unchanged: it keeps its wrapping and it keeps an input that starts a fresh
line under the chips.

**What it looks like when it is wrong.** Selecting a longer option makes the control taller, or
pushes its value against the top edge.

## Contracts

No `data-testid`, no message, no route, no prop. §21's placement of the control's attributes on
the inner `<input>` is untouched, so every selector that PATCH-004 moved still reads the same
node.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: nothing holds the height. The case this would carry is the E2E geometry shape
[PATCH-009](PATCH-009-the-holidays-control-row-holds-still.md) named — record the control's
bounding box, select the longest option in the list, and assert the box did not grow.

## Blast radius

- **Every searchable single select in the product** loses a wrap it should never have had:
  the two on Settings › Holidays, the member country picker (PATCH-005), and any other. Each is
  drawn shorter than it was whenever its value was long.
- **A long value is now ellipsised only when the control is genuinely too narrow for it**, since
  the input no longer claims a share of the width. That is more text drawn, never less.
- **The multi-select is untouched.** Both changes are conditioned on `isMulti`, so the chips
  keep wrapping and the input keeps its own basis there.
- **`packages/ds` only.** One file, one component.

## Not in this patch

- **The multi-select's own early wrap.** The input carries the same 20-character basis there and
  starts a new line sooner than the chips require. It is not a defect on any screen today, and
  changing where chips wrap is a question about the chip layout rather than about this one.
- **The control's height under a value too long for any width.** It ellipsises, as it did.
