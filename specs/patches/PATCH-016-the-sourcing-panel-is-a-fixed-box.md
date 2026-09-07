---
id: "PATCH-016"
title: The sourcing panel is a fixed box
surface: ui
supersedes: time-off/02, PATCH-009
requirement: null
cases: []
files: 1
---

## Why

[PATCH-009](PATCH-009-the-holidays-control-row-holds-still.md) reserved the sourcing panel's
status line so the panel's **height** would not change when a sync started. It left two ways for
the panel to move anyway, and pressing Refresh still jumped:

- the panel is `min-width: 220` at the end of a row with `margin-left: auto`, and the status
  line is wider than 220 — `Fetching public holidays…` beside its preloader is about 230, and
  `Some countries could not be sourced.` is about 240. So the panel grows leftwards when the
  line appears and shrinks back when it goes, carrying the Refresh button sideways with it;
- the reserved slot is a `min-height`, which holds only until the content exceeds it. A line
  that wrapped — which is exactly what a line too wide for its box does — took the panel's
  height with it, which is the thing the reservation existed to prevent.

Both are the same mistake as the one PATCH-009 fixed on the selects beside it, in the other
axis: a box sized by its content.

## The rule

THE SYSTEM SHALL draw the sourcing panel at one fixed width, wide enough for the longer of the
two lines its status slot can hold, and SHALL keep the status slot at one fixed height with its
line drawn on a single line.

**What it looks like when it is wrong.** Starting or finishing a sync moves the Refresh button.

## Contracts

No route, no message, no `data-testid`. `holiday-sourcing-status` is still present exactly while
a sync is in flight — the slot is fixed, the node is not.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: nothing holds either dimension, which is how PATCH-009 came to fix half of this and
believe it had fixed all of it. The case this would carry records
`holiday-sourcing-refresh-btn`'s bounding box, starts a sync, and asserts the box never moved in
either axis.

## Blast radius

- **The panel is 300 wide rather than at least 220**, so the row's right-hand block is wider by
  up to 80px. It is alone in that row and the row has room.
- **A status line longer than the box is clipped rather than wrapped.** Both lines it can hold
  fit, and a longer one added later would have to be sized for — which is the trade a fixed box
  makes and the reason the width is written where the two messages can be read beside it.
- **Settings › Holidays only.** One component, used on one screen.

## Not in this patch

- **A design-system token for a panel width.** None names a control width; `MultiFilter` and the
  country filter beside this both carry their own literal for the same reason.
- **The row wrapping on a narrow viewport.** Unchanged: what wraps, wraps, and nothing moves
  while it does not.
