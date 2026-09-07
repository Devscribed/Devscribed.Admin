---
id: "PATCH-020"
title: A filter states its selection on one line
surface: ui
supersedes: design-system, PATCH-019
requirement: null
cases: []
files: 2
---

## Why

A multi-select draws one chip per chosen thing, so the control is as tall as the selection.
Two teams fit a line; the third starts a second line, the control grows, and the summary and
the table under it move down the page. [PATCH-019](PATCH-019-a-button-holds-its-label-and-projects-opens.md)
stopped the chips stacking one-per-line, which bought two chips to a line and moved the jump
from the second tick to the third. It did not remove it, because the geometry is the problem:
**a control whose height is a function of its value cannot hold still.**

The chip list has a second failure, visible in the same screenshot. A multi-select hides what
is already chosen, so ticking every option empties the menu — the control offers `No options`
and the only way to untick anything is to find its chip's cross. The list of what you can
choose and the list of what you have chosen are the same list, and it was showing neither
whole.

Both are answered by moving the selection off the control and into the menu.

## The rule

THE SYSTEM SHALL draw a filter's chosen set as one line inside the control — the first
option's label, then `+n` for the rest, and the placeholder when nothing is chosen — at a
height that does not change with the number chosen.

THE SYSTEM SHALL keep every option in such a control's menu whether or not it is chosen, mark
the chosen ones, and toggle one when its row is pressed.

THE SYSTEM SHALL keep drawing removable chips for a multi-select that is not a filter — one
whose selection is the thing being edited rather than a question being asked of a table.

**What it looks like when it is wrong.** Choosing one more thing moves the page; or a control
with everything chosen has an empty menu.

## Contracts

No route, no message. `Select` gains `summariseSelection`, off by default, so every existing
multi-select is unchanged. `MultiFilter` sets it, which is what puts the rule on the reports
filters and the Holidays Teams filter.

Test ids are unchanged and the menu's are now always present: `{testId}-item-{id}` was removed
from the DOM once its option was chosen and now stays, which is what makes untick reachable by
the same selector as tick. `chipTestId` still tags chips wherever chips are still drawn.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cases this would carry: an E2E one ticking three options and asserting the control's
bounding box never changed, and one ticking then unticking the same menu row. Any existing test
that clicks a chip's cross to remove a **filter** selection now has to click the row again;
none was found in `e2e/tests`, and the suites were not run.

## Blast radius

- **Every `MultiFilter` in the product changes shape** — the four report screens' Members /
  Projects / Clients pickers, and the Holidays Teams filter. Each one becomes a fixed-height
  control whose menu keeps its rows.
- **A selection is no longer readable at a glance past the first item.** That is the trade:
  `Marketing +2` says how many without saying which, and the menu says which. For a filter
  over a catalogue this is the right way round; for a roster it is not, which is why the mode
  is a prop rather than the behaviour.
- **The other multi-selects are untouched** — the candidate filters, the board and list
  screens, the vacancy dialog. They build `Select isMulti` directly and keep their chips.
- **`packages/ds` and one app file.** No API, no state, no request.

## Not in this patch

- **Adopting the mode on the board, list and candidate filters.** They have the same problem
  and the same answer; each is a screen with its own tests, and this patch changes the two
  places the defect was reported on.
- **A count-only summary (`3 teams`).** Naming the first choice keeps the common case — one
  thing chosen — readable as itself, which a count does not.
- **Chips that overflow into a `+n` pill.** It would keep every label visible until the line
  fills, and it needs measurement at render: a `ResizeObserver` on a control the whole product
  draws. The trade is not worth the machinery here.
