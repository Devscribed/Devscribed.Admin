---
id: "PATCH-024"
title: The key sits under the picture, and the window's name between its arrows
surface: ui
supersedes: time-off/01, PATCH-022
requirement: null
cases: []
files: 2
---

## Why

**The legend.** It sits between the filter bar and the figures, which puts a key to the grid
above the grid and between the two things that answer the reader's question. Nobody reads a key
before they have seen what it explains, and its four swatches push the figures and the grid a
line further apart for the whole time nobody is reading it.

**The header row.** It reads `‹ Today › September 2026`: the label the arrows move sits on the
far side of both of them, and the button that jumps somewhere else entirely sits in the middle
of the pair. Three controls that do two different things, arranged as though they did one.

## The rule

THE SYSTEM SHALL draw the calendar's legend under the grid it is a key to.

THE SYSTEM SHALL draw the window's name between the two arrows that step it, and the **Today**
control after them, set apart from the pair.

THE SYSTEM SHALL keep the name's width reserved, so stepping from one window to a
longer-named one moves nothing beside it.

**What it looks like when it is wrong.** A key is read before the thing it explains; or the
control that moves the window is not next to the name of the window.

## Contracts

No route, no message, no `data-testid`. `calendar-legend`, `calendar-prev`, `calendar-next`,
`calendar-today` and `calendar-range-label` all keep their ids on the same nodes; only their
order and their place on the page change.

## Cases

**None written, at the user's direction** — asked for as a patch, code, commit, with the
regression waived.

`TC-01-E2E` uses `calendar-legend` twice as a neutral place to click a menu shut. It is still
present and still clickable, now below the grid, and the runner scrolls to it as it does to
anything else — checked by hand against the markup rather than run.

## Blast radius

- **The Time off calendar only** — one component and two CSS rules.
- **The figures move up against the filters**, which is the order the reader works in: choose
  who, read how much, then look at when.
- **The legend is below the fold on a tall grid.** That is the trade, and it is the right way
  round: a key is looked for after something in the picture is not understood.
- **Nothing about the grid, the filters or the requests changes.**

## Not in this patch

- **A legend that names only what is on screen.** All four swatches are drawn whether or not
  the window holds a pending request or a holiday. Hiding the ones with nothing behind them
  would make the row a different width every window — the defect four patches on this screen
  have now been about.
- **The `Today` control's own paint.** It is the neutral button it has always been; that it
  reads as the primary action of the header is a question about the header's one real action,
  which this screen does not have.
