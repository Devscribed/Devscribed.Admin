---
id: "PATCH-021"
title: A holiday's name does not set the calendar header's height
surface: ui
supersedes: time-off/01
requirement: null
cases: []
files: 2
---

## Why

A holiday that reaches every row in view names itself in the day's column header. A day column
is about 40px wide, so `October Revolution Day` sets three lines deep — and the header row is
shared by every column, so those three lines are added to the header of the whole grid. Move to
a month without such a holiday and the row shrinks again.

That is the jump: the grid's header is a different height depending on which holidays the
window happens to contain, and every row below it moves with it. It is also the shape of the
defect PATCH-009, 016 and 020 each hit on a different control — a box sized by its content,
where the content is data.

The name is worth keeping. What is not worth keeping is the name deciding the geometry of a
grid it appears in one column of.

## The rule

THE SYSTEM SHALL mark a whole-column holiday in the day's header with a marker of fixed size,
drawn out of the header's flow so that the header row's height is the same whatever holidays
the window contains.

THE SYSTEM SHALL give that holiday's name on hover, and keep the name readable by a screen
reader and findable in the header's text.

Unchanged: the column's shading, the legend, and the rule that a **partial** holiday names
nothing in the header and marks only the cells of the members it reached.

**What it looks like when it is wrong.** Paging from one month to another changes the height of
the grid's header.

## Contracts

No route, no message, no new `data-testid`. `calendar-day-holiday-{date}` stays on the marker
and is still absent for a partial holiday; the name stays inside it, clipped rather than
removed, so `calendar-day-header-{date}` still contains the holiday's name and every existing
assertion reads what it read.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

`TC-01-E2E`'s three holiday assertions were checked by hand against the new markup rather than
run: `toBeVisible` on the marker (a 14×3 bar, visible), `toContainText` on the header (the name
is clipped, not removed) and `toHaveCount(0)` for the partial one (unchanged). The case this
patch would add records the header row's height in a month with a named holiday and in one
without, and asserts they are equal.

## Blast radius

- **The Time off calendar only.** One component and one CSS block, both this screen's own.
- **The name is no longer readable without a pointer or a screen reader.** That is the trade,
  and it is why the marker is drawn in the emphasis colour rather than as a faint dot: the
  column already shades, and the marker says there is something named here.
- **The tooltip opens downwards.** The scroller clips both axes — `overflow-x: auto` computes
  `overflow-y` to `auto` — and the header is its top edge, so a bubble drawn upwards is cut in
  half. Downwards it lands over the member rows, above the sticky name column's stacking order.
- **The header row is now a constant height**, so the grid's own height changes only with the
  number of members.

## Not in this patch

- **The same treatment for a partial holiday.** It marks its members' cells with a native
  `title`, which is a different control with a different rule; unifying the two is worth doing
  and is a decision about both.
- **A tooltip on the whole column.** The marker is the trigger, which is a small target. Making
  the header cell the trigger means the cell owning a hover state it currently has no use for.
