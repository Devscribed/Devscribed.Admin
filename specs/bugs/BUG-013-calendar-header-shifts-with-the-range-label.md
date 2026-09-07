---
id: "BUG-013"
title: The calendar's back, Today and forward controls move every time the range label changes width
severity: minor
surface: ui
verdict: SPEC-GAP
owning-spec: time-off/01
violates: null
regression-test: TC-01-E2E-12
introduced-in: the commit that shipped the calendar screen
affects: [admin, manager, user]
tags: [vacation-calendar, navigation, layout, jump, page-header]
---

## Symptom

"Когда кликаешь по стрелочкам — вёрстка прыгает." On the Time off calendar, clicking `‹` or `›`
makes the three controls beside the range slide sideways. `March 2027` is a short label and
`28 Sep – 11 Oct 2026` is a long one, so stepping between them shifts `‹`, **Today** and `›` by
roughly the difference — far enough that the arrow is no longer under the pointer that just
clicked it, and a second click lands on **Today** or on nothing.

## Reproduction

1. Sign in as an admin and open `/org/{orgId}/time-off/calendar`.
2. Click `calendar-window-month`.
3. Click `›` repeatedly without moving the mouse.

The controls step left and right as the month names change length — `March 2027` against
`September 2026` is the widest swing under Month. Under **Week** and **2 weeks** the same thing
happens whenever a step crosses a month or year boundary, because the label's shape changes
from `28 Sep – 11 Oct 2026` to `5 – 11 Oct 2026`.

Deterministic, needs no data, and is most visible at a wide viewport where the header has room
to move in.

## Evidence

- The three controls and the label are one flex row: `.time-off-calendar-nav`,
  `apps/web/app/globals.css:875-879` — `display: flex; align-items: center; gap: var(--space-3)`.
- The label is the **last** child of that row and has no width of its own:
  `.time-off-calendar-range`, `apps/web/app/globals.css:881-885`.
- That row is handed to `PageHeader` as its `action`, and the header is
  `justify-content: space-between` (`apps/web/src/layout/PageHeader.tsx:29`, action rendered at
  `:49`), so the whole block is pinned to the **right** edge and grows leftwards.
- Measured across the three labels the screen produces — `March 2027`, `September 2026`,
  `28 Sep – 11 Oct 2026` — the row's left edge lands in three different places while its right
  edge never moves.

## Root Cause

Nothing is wrong with any single rule; the two of them compose badly.

`.time-off-calendar-range` (`apps/web/app/globals.css:881`) declares weight, colour and a left
margin and **no width**, so the label is exactly as wide as its text. Because it is the last
child of a row that `PageHeader` pins to the right edge
(`apps/web/src/layout/PageHeader.tsx:29`), every character the label gains or loses is taken
from or given back to the space on its left — which is where `‹`, **Today** and `›` are
standing. The controls are therefore positioned by the length of a string that the controls
themselves change.

This is a layout composition, not a state defect: the label is correct, the controls work, and
the window that is drawn is the right one. What is wrong is that a control moves as a
consequence of being used.

## Spec Verdict

`SPEC-GAP`. `specs/time-off/01-vacation-calendar.contracts.md` places `calendar-prev`,
`calendar-today`, `calendar-next` and `calendar-range-label` in the header and names each id;
`specs/time-off/01-vacation-calendar.md` REQ-01-049 says where a step lands. Neither says
anything about the controls holding still while they are used, and no requirement is violated —
the spec is silent on the situation.

The gap the owning spec should own:

> **Edge case to add to `time-off/01`:** the range label is variable-width by nature — a month
> name, a same-month day range, a range crossing a month or a year all differ in length. A
> control whose position depends on that width moves when it is clicked. The navigation controls
> therefore keep a fixed position across every label the window presets can produce, and the
> label absorbs the variation itself.

## Fix Approach

`apps/web/app/globals.css`, one file, the `.time-off-calendar` block.

Give `.time-off-calendar-range` a fixed inline size wide enough for the longest label the three
presets produce — a Week or 2 weeks range crossing both a month and a year boundary, which is
the widest string `rangeLabel` can return
(`apps/web/app/org/[orgId]/time-off/calendar/CalendarScreen.tsx:41-50`) — and let the text sit
inside it. The label's box then never changes size, so nothing left of it moves. The value is a
declared custom property in the same block that already declares the spec's three DS gaps, and
it is recorded as a fourth.

**Rejected:** putting the label first in the row, left of the arrows. It stops the arrows moving
and makes the label itself move instead, which is worse: the label is the thing a reader's eye
returns to after every click.

**Rejected:** `min-width` on the label. It fixes the short labels and leaves the long ones
overflowing it, so the jump survives on exactly the steps that cross a year.

**Rejected:** changing `PageHeader` to left-align the action. It is the header every screen in
the shell uses and the calendar is the only one with this problem.

## Blast Radius

| What the fix touches | Effect | Mitigation |
|---|---|---|
| The calendar header's width | The block reserves the widest label's width at all times, so it starts further left than a short label needs | It is inside `PageHeader`'s own `flex-wrap: wrap`, so a narrow viewport still wraps the action under the title |
| `apps/web/src/layout/PageHeader.tsx` | Not edited | |
| Every other screen using `PageHeader` | None — the change is inside the `.time-off-calendar` block | `grep -n "time-off-calendar-range" apps/web` returns the CSS rule and one JSX class name |
| The design system | Nothing enters or leaves `packages/ds` | The reserved width is a DS gap recorded beside the three the spec already declares |

## Backward Compatibility

Not applicable. CSS only — no stored data, no API response, no URL.

## Regression Test

### TC-01-E2E-12

- **Level:** E2E
- **Covers:** the edge case proposed above
- **Steps:** Sign in as an admin and open the calendar. Click `calendar-window-month`. Record
  the bounding box of `calendar-today`. Click `calendar-next` eleven times, recording the box
  after each click, and confirm the recorded labels include both the longest and the shortest
  month name.
- **Expected Result:** Every recorded `x` for `calendar-today` is the same value. The label text
  changed at least four times across the run.
- **Selectors:** `calendar-window-month`, `calendar-today`, `calendar-next`,
  `calendar-range-label`.
- **Fails today:** the `x` of `calendar-today` differs between the `March` window and the
  `September` window, and the assertion reports the two values.

E2E and not integration: the assertion is a rendered box position under a real font, which is
out of reach of an API test and of a unit test over the label builder — `rangeLabel` returns the
right string today and is not what is wrong.

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| 1 | `calendar-prev`, `calendar-today` and `calendar-next` hold one position across every window a preset can reach | TC-01-E2E-12 |
| 2 | The range label still shows the same text it shows today, for all three presets | TC-01-E2E-12 |
| 3 | The reserved width is declared as a custom property in the `.time-off-calendar` block and recorded in the spec's DS gaps | the diff |
| 4 | No file under `packages/ds` and no shared layout file is changed | the diff |

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| The reserved width is measured against the labels the three current presets produce | A fourth preset is the only thing that could exceed it, and adding one is a spec that would revisit the header anyway | [`time-off/03`](../time-off/03-calendar-range-and-scope.md), which adds a custom range whose label is the widest the screen will carry, sets the value it needs |
| The width is a literal in CSS rather than a token | No design-system token names a control-row reservation | The DS gaining one, at which point this block loses its fourth custom property with the other three |
