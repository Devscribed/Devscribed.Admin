---
id: "PATCH-022"
title: The calendar says what the window costs
surface: ui
supersedes: time-off/01
requirement: null
cases: []
files: 3
---

## Why

The Time off calendar draws who is away and when, and answers nothing a manager actually opens
it with: how much of this month is already gone, and how much is left to plan against. The
figures are all on screen — as shaded cells, to be counted by eye, one row at a time, and
recounted every time a filter moves.

Every control on the page already narrows the answer the screen holds. Nothing else has to be
fetched to state it.

## The rule

THE SYSTEM SHALL state, above the grid and for the people the filters left on it, how many
people are shown, how many working days the window holds for them, how many of those are taken
as time off, and how many hours are left to work.

THE SYSTEM SHALL count a working day as a day of the window that is neither a weekend nor a
public holiday reaching that person, and SHALL count each figure per person per day over the
days the window holds — never a request's own total, which counts days outside it.

THE SYSTEM SHALL count a day covered by both an approved and a pending request once, as
approved, and SHALL subtract both approved and pending days from what is available, naming how
much of the subtraction is still only a request.

**What it looks like when it is wrong.** A figure that does not move when a team is ticked, or
that counts a Saturday.

## Contracts

No route and no request: every figure is computed from the answer `GET .../time-off/calendar`
already returns. `timeOffCalendarLoad` and `TIME_OFF_CALENDAR_WORKING_DAY_HOURS` are exported
from `@devscribed/validation`, beside the calendar's other rules, so the arithmetic behind a
number a manager plans against is not held only by a screen.

New: `calendar-metrics`, and `calendar-metric-people`, `-working-days`, `-time-off`,
`-available`.

## Cases

**None written, at the user's direction** — asked for as a patch, code, commit, with the
regression waived.

The rule is a pure function and the cases it wants are unit ones, which are the cheapest this
repository has: a band clipped by the window edge counts only its days inside; a weekend and a
holiday are neither capacity nor time off; a day both approved and pending counts once; an
empty roster is four zeroes rather than a division by none.

## Blast radius

- **The Time off calendar only**, and it makes no request it did not make.
- **A day is eight hours, everywhere in this figure.** The product states the same number for a
  public holiday and this is a second constant rather than a reuse of that one: one is a
  default somebody may edit per holiday, this is arithmetic nobody edits.
- **The strip is drawn from the same payload the grid is**, so it can never disagree with the
  cells under it, and it moves with the scope, the teams, the people and the window.
- **`packages/validation` gains an export**, which the API does not read. It is on the screen's
  side of the same file the endpoint's own rules live in.

## Not in this patch

- **Money.** What the time off costs needs rates, which this payload does not carry; the
  holiday summary's route is where that arithmetic already lives.
- **Per-person rows.** The strip totals the people on screen; who is away is what the grid
  below it is for.
- **A capacity figure that knows about part-time.** Every member is a full working day here,
  because nothing in this payload says otherwise.
