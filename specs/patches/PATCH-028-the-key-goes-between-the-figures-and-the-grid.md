---
id: "PATCH-028"
title: The key goes between the figures and the grid, in a box of its own
surface: ui
supersedes: time-off/01, PATCH-024
requirement: null
cases: []
files: 2
---

## Why

[PATCH-024](PATCH-024-the-key-sits-under-the-picture.md) moved the legend under the grid, on
the reasoning that a key is read after the picture rather than before it. The reasoning is
sound and the placement is not: the grid is as tall as the window is long, so on a full month
the key lands against the bottom of the viewport — one line of loose text, pinned to the edge,
where a browser's own furniture lives. It reads as something that fell off the screen.

It has no box either, which is why its first swatch begins outside the edge every card on the
screen keeps. A line of text has nothing to align with.

## The rule

THE SYSTEM SHALL draw the calendar's legend between the figures and the grid, in a block of its
own — the grid's width, its radius, its inset — so that it keeps the edges everything else on
the screen keeps and is never the last line above the window's bottom.

**What it looks like when it is wrong.** The key is a bare line of text, or it is the thing
nearest the bottom of the window.

## Contracts

No route, no message, no `data-testid`. `calendar-legend` keeps its id on the same node; only
its place and its box change.

## Cases

**None written, at the user's direction** — asked for as a patch, code, commit, with the
regression waived.

`TC-01-E2E` clicks `calendar-legend` twice as a neutral place to shut a menu. It is present,
visible and clickable in its new place, and no longer requires the runner to scroll past a
month of rows to reach it.

## Blast radius

- **The Time off calendar only** — one component and one CSS rule.
- **The grid starts one block lower.** The key is four swatches on one line at every width the
  screen supports, and wraps rather than growing when it runs out.
- **PATCH-024's other half stands.** The window's name still sits between its arrows, and Today
  is still set apart from them.

## Not in this patch

- **A legend that names only what is on screen.** All four swatches are drawn whether or not
  the window holds a pending request or a holiday, for the reason PATCH-024 gave: hiding the
  empty ones makes the row a different width every window, which is the defect this screen has
  now spent five patches removing.
- **Making it collapsible.** One line that never changes is not worth a control.
