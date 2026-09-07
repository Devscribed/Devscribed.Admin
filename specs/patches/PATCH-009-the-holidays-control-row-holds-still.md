---
id: "PATCH-009"
title: The Holidays control row holds its width and its position
surface: ui
supersedes: time-off/02
requirement: null
cases: []
files: 2
---

## Why

Two things move on Settings › Holidays that should not. The organization country picker is as
wide as whatever is selected in it, so choosing `Algeria` and choosing
`No country — global holidays only` give two differently-sized controls and the Save button
beside it slides. And pressing **Refresh** makes the whole row jump: the status line appears
inside the sourcing panel, the panel grows a line taller, and because the row aligns its
children on their bottom edges, the picker and the button move down and back up again.

Both are the same mistake — a control positioned by its content — and both are fixed by giving
the content a box it cannot resize.

## The rule

THE SYSTEM SHALL draw the organization country picker and the country filter below it at one
fixed width, whatever is selected in either.

THE SYSTEM SHALL reserve the sourcing panel's status line at all times, so that the panel's
height does not change when a sync starts or ends, and SHALL show the line's content only while
there is something to say — `HOLIDAY_SOURCING_MESSAGES.syncing` during a sync, and
`HOLIDAY_SOURCING_MESSAGES.syncFailedSome` when one came back partial.

**What stays.** `holiday-sourcing-status` is still present only while a sync is in flight — the
slot is reserved, the node is not. Every control keeps its test id, its behaviour and its
disabled-while-in-flight guard.

**What it looks like when it is wrong.** Selecting a longer country name resizes the picker, or
pressing Refresh moves the controls beside it.

## Contracts

No route, no message, no new `data-testid`. `holiday-sourcing-status` keeps its meaning exactly:
present while syncing, absent otherwise.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: nothing holds either geometry. The case this would carry is an E2E one on the shape
[BUG-013](../bugs/BUG-013-calendar-header-shifts-with-the-range-label.md)'s `TC-01-E2E-12`
already uses — record `org-country-save`'s bounding box, change the selection and start a sync,
and assert the box never moved.

## Blast radius

- **The two selects widen to one fixed width.** Any screen but this one is unaffected: both
  literals live in `settings/holidays/page.tsx`.
- **The reserved status slot adds one line's height to the sourcing panel, permanently.** The
  panel sits at the end of a `flex-wrap` row with `margin-left: auto`, so the reservation costs
  vertical space in that column and nothing else reflows.
- **`holiday-sourcing-status` assertions are unaffected** — `TC-02-E2E-01` and `TC-02-E2E-02`
  wait for it to appear and then to reach count 0, and it still appears and still goes.
- **`packages/ds` is not touched.** The alignment defect in the same screenshot is
  [PATCH-008](PATCH-008-a-field-label-and-its-message-share-one-left-edge.md), a separate change
  in a separate pair of files.

## Not in this patch

- **The row wrapping on a narrow viewport.** `flex-wrap` is deliberate and this patch does not
  change when it wraps — only that nothing moves while it does not.
- **A width token.** No design-system token names a control width; `MultiFilter` carries its own
  literal for the same reason, and inventing one here would name it on one screen.
- **The preloader boxes that replace the list and the summary during a sync.** They are the
  loading state the spec asks for; they change height because the content they stand in for
  does, and that is a separate question about what a wait should look like.
