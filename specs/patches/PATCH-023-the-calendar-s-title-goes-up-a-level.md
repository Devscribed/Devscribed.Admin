---
id: "PATCH-023"
title: The calendar's title goes up a level
surface: ui
supersedes: design-system
requirement: null
cases: []
files: 2
---

## Why

The date picker moves a month at a time and offers nothing else. A range in the same month is
two clicks; a range a year out is twelve presses of the next-month arrow before the first of
them, and the reader has to count the months as they go because only the one they are on is
named.

The month and the year are already written at the top of the panel. They read as a label, and
every date picker a person has used makes them the way up.

## The rule

THE SYSTEM SHALL make the calendar's title a control where the consumer asks for it: pressing
it at the day grid shows the twelve months of the year on display, and pressing it again shows
a block of twelve years.

THE SYSTEM SHALL come back down one level when a cell is picked — a month opens that month's
days, a year opens that year's months — and SHALL report the month it lands on the same way
the arrows report theirs.

THE SYSTEM SHALL step the previous and next controls by what the level shows: a month, a year,
or a block of twelve years, refusing at whatever bound the picker was given.

THE SYSTEM SHALL keep the panel the same size at every level.

**What it looks like when it is wrong.** Reaching a month a year away means pressing an arrow
twelve times.

## Contracts

No route, no message. `Calendar` gains `zoomable`, **off by default**, so every grid that has
one today keeps a plain title and one view; `DateRangePicker` turns it on. The month a level
lands on is reported through the existing `onMonthChange`, so a consumer holds the month at
every level and nothing new has to be stored.

New: `calendar-zoom-{YYYY-MM}` per month cell and `calendar-zoom-{YYYY}` per year cell.
`calendar-month-label` keeps its id and is a `<button>` where the levels are on.

## Cases

**None written, at the user's direction** — asked for as a patch, code, commit, with the
regression waived.

The case this would carry is an E2E one: open the picker, press the title twice, pick a year,
pick a month, and land on that month's days — and one asserting the panel's height is the same
at all three levels.

## Blast radius

- **`DateRangePicker` gains two views.** Its month grid, its keyboard and its two-click range
  are untouched; the levels sit above them.
- **Every other `Calendar`** — the booking grid, the vacation picker — is unchanged, because
  the prop is off by default.
- **A year block is aligned to a multiple of twelve**, so paging never renumbers the block
  under the reader; the year on display is highlighted inside it.
- **The weekday initials stay in place at the upper levels**, hidden rather than removed, so
  the panel does not change height between levels.

## Not in this patch

- **Arrow-key navigation inside the month and year grids.** Their cells are real buttons and
  Tab walks them; the day grid's roving-focus grid is a bigger keyboard model and putting three
  of them in one component is a decision about the whole control.
- **A fourth level of decades.** Twelve years to a block and an arrow that pages them is the
  distance this control is used over.
- **`maxSpanDays` at the upper levels.** It bounds what a second click may commit, which is
  still the day grid's business.
