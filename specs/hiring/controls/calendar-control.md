---
kind: control
title: Calendar Control
belongs-to: 02-booking-page.md
routes: ["/book/{slug}"]
api: ["GET /api/book/{slug}/availability"]
entities: []
tags: [control, date-grid, month-nav, availability, timezone, keyboard-grid]
depends-on: ["00", "01", "02"]
---

# Calendar Control

## Summary

Lets a candidate pick a date for the interview. It is the first step of the booking interaction:
the date chosen here drives the list of times shown by the
[Time Slot Picker](time-slot-picker-control.md).

This document describes structure and behaviour only. Visual detail belongs to
[02-booking-page.design.md](../02-booking-page.design.md).

Carried over from `hiring-process/02-booking-page/controls/calendar-control.md`, with two changes:
availability comes from the **assigned interviewer** of the vacancy rather than a single global
hiring manager, and the interview duration comes from the **vacancy** rather than from which of
three links was opened.

## Where it lives

The control is `Calendar` ([§30](../../design-system/decisions.md)), and it is the only month grid
in the system — nothing else in the app books anything, so there was no second grid to match. Its
cell metrics, header, navigation chevrons and its available / selected / disabled treatments are
therefore stated here and in the component, and nowhere else: this document is the grid's spec
rather than a comparison against one.

Two things in this document do **not** follow that grid, and both are deliberate. They are named
here rather than left to be rediscovered:

- **The week runs Monday to Sunday** (§03.12), where react-datepicker's default — and therefore
  the system's measurement — runs Sunday to Saturday. Week start is a locale convention, not design
  language: it is the same class of thing as the month names being English, and the system's own note
  records `week starts Sunday (Su…Sa)` as *the library default, reproduced rather than
  redesigned*. Prod never made this choice; it inherited it. This product did make it, wrote it
  down, and tests it — `monthMatrix` in `@devscribed/validation`, TC-HCAL-UNIT-01.
- **Leading and trailing cells are blank** (§04.15), where react-datepicker renders the adjacent
  months' day numbers greyed. The reason is in the requirement: a day number in the grid looks
  selectable, and every one of these is outside the window.

Both are decisions about what the grid *contains*. Everything about how it is *drawn* is the system's.

Availability, the booking window and the time zone are business rules and stay with whatever
fetched them — the component is handed the weeks to draw, which dates may be chosen, and the bounds
it may navigate between.

## Functional Requirements

### 01. Structure

1. A self-contained component within the booking page's date-and-time step, sitting before — or
   beside — the Time Slot Picker.
2. Three regions, top to bottom: a **header row** (month and year, plus previous/next controls), a
   **weekday header row** of seven single-letter labels, and a **date grid** of seven columns and
   up to six week rows.
3. **One month at a time.** No multi-month view, no infinite scroll.
4. The current month is displayed on first load.
5. On first load the **first available date is selected automatically** — the earliest date from
   today onward, within the window, that has at least one bookable slot. Its month is the one
   shown, and its slots load immediately. When the whole window has no availability, no date is
   selected and the Time Slot Picker shows its empty state.

### 02. Month Navigation

6. The header shows the visible month and full year in English, e.g. `August 2026`.
7. **Previous is disabled** while the current month is displayed — a candidate can never navigate
   into a month wholly in the past. Disabled state is exposed to assistive technology.
8. **Next is disabled** once the month containing the maximum bookable date is in view. The window
   is fixed at one calendar month ahead ([02 §05.21](../02-booking-page.md)); dates beyond the
   maximum are non-selectable even when they fall inside that final visible month.
9. Navigation changes only which month is rendered. It never refetches the vacancy and never
   changes the time zone.
10. A selected date stays selected while the candidate navigates away and back.

### 03. Weekday Row

11. Seven columns, one per weekday, each a single letter.
12. The week **always runs Monday to Sunday** — `M T W T F S S`. This never varies by locale, and
    it does not follow react-datepicker's Sunday-first default — see [Where it lives](#where-it-lives).
13. Labels are static and align with the columns below. They take the system's day-name treatment:
    `--text-primary` at `--font-weight-headline` (450), on the header's own surface above the grid.

### 04. Date Grid

14. Each day of the visible month sits in the column matching its weekday, from `1` through the
    month's last day.
15. **Leading and trailing cells** — those belonging to the adjacent months — are blank and
    non-interactive. No day number is shown.
16. The grid uses four to six week rows as the month requires; the height change between months is
    handled gracefully.

### 05. Date States

Mutually exclusive, except that **Today** may combine with Available or Unavailable, and with
Selected.

*Revised, [§72](../../design-system/decisions.md).* The system draws three of these, and
they were adopted as measured: an ordinary cell untinted with `--text-primary`, a **selected** cell
`--color-blue` filled in white at 13px/600, a **disabled** cell `--color-gray-light` filled at
`opacity: .5`. Every one of those is correct **in a popover attached to a date field**. This
one is the primary control on a public page, and the
three repaint:

| State | Now | Why |
|---|---|---|
| Available | untinted, `--text-primary`, hover `--color-row-hover` | unchanged |
| **Selected** | `--color-blue` at 12% behind `--color-blue` ink, with a `--border-width-control` border in the same hue | Solid the system is right for a **range**, where ten days have to read as one block. A single chosen date beside a list of times is one mark, and filled it became the loudest thing on a page whose primary action is a button below it. It is the tint a `pressed` slot chip takes ([§71](../../design-system/decisions.md)), so both halves of the picker agree |
| **Unavailable** | faint ink on the panel's own ground — **no fill** | `--color-gray-light` put a block on every weekend, so a month with four bookable days read as mostly blocks. "Nothing here" is an absence, and absence is what it should look like |
| **Today** | a border at 45% of `--color-blue` | Present, and never mistaken for the selection |

The cell takes `--radius-s` and `--control-height` — 44px at **every** pointer, where the height
was 1.7rem with a `@media (pointer: coarse)` rule conceding the point one query at a time. The
selected day no longer changes size or weight either: a grid of tabular figures where one is
13px/600 is a grid that twitches the instant a date is picked.

Unavailable, Past and Beyond-the-window still share one paint — the system has one treatment for "you
cannot pick this", and the three differ in *why* rather than in what the candidate may do. Their
accessible names still distinguish them (§10.42).

17. **Available** — at least one bookable slot exists on this date. Interactive: clickable,
    focusable, selectable.
18. **Unavailable** — inside the window but with zero bookable slots (fully booked, a non-working
    day, or outside working hours). Non-interactive, announced as disabled.
19. **Past** — before today. Non-interactive. Only ever visible as the elapsed days of the current
    month, since earlier months are unreachable.
20. **Beyond the window** — later than the maximum bookable date. Non-selectable, and in practice
    barely reachable because Next disables first.
21. **Today** — marked so it is distinguishable even when unselected. It takes a `--color-blue`
    outline rather than a fill, so it never reads as the selection.
22. **Selected** — exactly one date at a time across the whole control.
23. **Hover** and **Focus** are distinct from each other and from Selected. Hover takes
    `--color-row-hover`, the system's neutral row tint; focus takes `--shadow-focus-input`, the ring
    every other control in the system uses. A grid whose focused day paints nothing is survivable
    only while nothing can focus it — this grid is a keyboard grid (§10.41), so the ring is not
    optional.

### 06. Selection

24. Activating an Available date — click, tap, `Enter`, or `Space` — selects it and raises a
    date-selected change to the page.
25. On selection the Time Slot Picker loads that date's times. Interacting with an Unavailable,
    Past, or blank cell does nothing at all.
26. Selecting a different date replaces the selection and reloads the slot list.
27. Selecting never changes which month is displayed.

### 07. Time Zone

28. The zone selector is shared with the page and the Time Slot Picker, defaulting to the
    browser-detected zone.
29. All availability is evaluated in the active zone. Changing it re-evaluates which dates qualify
    as Available — a slot can move onto an adjacent calendar date at a different offset.
30. Changing the zone refreshes the grid and the slot list together. If the selected date becomes
    unavailable, the selection is cleared and the candidate is prompted to choose again.
31. The 12-hour/24-hour toggle affects the Time Slot Picker only. It never changes this control,
    which shows no clock times.

### 08. Data & Failure States

32. Availability comes in real time from the vacancy's assigned interviewer's calendar, via
    [00](../00-integrations.md). A date is Available when at least one candidate-selectable slot
    survives every constraint in [02 §05](../02-booking-page.md).
33. The control fetches availability for the visible month plus enough context to render the grid
    correctly, and refetches when navigating to an uncached month.
34. **Loading** — the grid is non-interactive while a month is in flight, rather than implying that
    every date is available or that none is. It dims in place and a `Preloader` sits over it; the
    grid is not replaced, because a month that collapsed and re-expanded on every navigation would
    move the slot list under the candidate.
35. **Error** — a friendly message with a retry, drawn as an `InfoBanner variant="warning"` above a
    `Button`. No date may be selected until availability is known; booking cannot proceed on
    unknown availability.
36. **Empty month** — every cell Unavailable. The candidate may still navigate, within the window
    bounds.

### 09. Responsiveness

37. Side by side with the slot picker on wide viewports; stacked above it on narrow ones.
38. Seven columns at every breakpoint — columns resize, they never reflow.
39. Day cells keep adequate touch targets on touch devices.

### 10. Accessibility

40. The grid carries grid semantics so assistive technology can navigate it by row and column.
41. Keyboard support:
    - Arrow keys move focus by day (left/right) and by week (up/down), crossing row boundaries.
    - `Enter` / `Space` select the focused date.
    - `Home` / `End` move to the first and last day of the focused week.
    - `PageUp` / `PageDown` move between months; focus lands on a sensible day in the new month.
    - **Disabled dates are skipped entirely** and are not focusable — arrow movement lands only on
      Available dates.
42. Each cell's accessible name conveys the full date and its state: "Tuesday, 25 August 2026,
    available" / "…, unavailable" / "…, selected" / "…, today".
43. Navigation controls are labelled "Previous month" and "Next month" and expose their disabled
    state.
44. Selection, and any resulting change, is announced via a polite live region.
45. State is never conveyed by colour alone.

## UI Notes

Required `data-testid` attributes:

- `calendar-control`, `calendar-month-label`, `calendar-prev-month`, `calendar-next-month`
- `calendar-grid`, `calendar-day-{isoDate}`
- `calendar-loading`, `calendar-error`, `calendar-retry`

Each day cell is a real `<button>`, and an unpickable one carries the **`disabled` attribute**,
not `aria-disabled` alone. This is the opposite of the call made for a blocked menu row
([§22](../../design-system/decisions.md)), and for the opposite reason: there, the point was that a
blocked action stays readable, so it kept its place in the keyboard walk. Here §10.41 requires the
walk to *skip* unavailable days, and 30 cells of which four are pickable is a grid nobody should
have to arrow through. Tests select on it directly — `[data-testid^="calendar-day-"]:not([disabled])`.

State is also exposed on `calendar-day-{isoDate}` via `aria-selected` and `aria-current="date"`
for today.

The month controls are `IconButton label="Previous month"` / `"Next month"`, which carries the system's
own disabled treatment and hit area. The chevron is drawn as react-datepicker draws it: a 9px box
with two 3px borders, rotated.

Two screens host this control — the public booking page (02) and the team's reschedule dialog
(07) — through the shared `SlotPicker`. There is no second date control with different rules.

## Test Cases

### TC-HCAL-UNIT-01: Month grid places days under the correct weekday, Monday first
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Build the grid for August 2026 (the 1st is a Saturday).
  2. Build the grid for February 2028 (a leap February beginning on a Tuesday).
- **Expected Result:**
  1. `1` sits in the sixth column; the five cells before it are blank and non-interactive.
  2. The grid contains 29 numbered cells and no `30`.
  3. Neither grid shows a day number in a leading or trailing cell.

### TC-HCAL-UNIT-02: Navigation bounds
- **Level:** Unit
- **Preconditions:** today is 2026-08-25, so the window ends 2026-09-25.
- **Steps:**
  1. Evaluate the previous control while August is displayed.
  2. Navigate to September and evaluate the next control.
- **Expected Result:**
  1. Previous is disabled — the current month is the earliest reachable.
  2. Next is disabled once September is in view, and 2026-09-26 onward are non-selectable within it.

### TC-HCAL-UNIT-03: First available date is auto-selected, skipping unavailable ones
- **Level:** Unit
- **Preconditions:** today is a Saturday; the following Monday is fully booked; the Tuesday has slots.
- **Steps:**
  1. Resolve the initial selection.
- **Expected Result:**
  1. The Tuesday is selected — not today, and not the fully booked Monday.
  2. Its month is the month displayed.

### TC-HCAL-UNIT-04: No availability anywhere in the window leaves nothing selected
- **Level:** Unit
- **Preconditions:** the interviewer has no working days configured.
- **Steps:**
  1. Resolve the initial selection.
- **Expected Result:**
  1. No date is selected, and the control reports the empty condition rather than selecting an unavailable date.

### TC-HCAL-E2E-01: Keyboard navigation lands only on available dates
- **Level:** E2E
- **Preconditions:** an open vacancy where some dates in the visible month are unavailable.
- **Steps:**
  1. Focus the date grid.
  2. Press the right arrow repeatedly across a run containing unavailable dates.
  3. Press `Enter`.
- **Expected Result:**
  1. Focus never rests on an unavailable, past, or blank cell.
  2. `Enter` selects the focused date and the slot list loads for it.
- **Selectors:** `calendar-grid`, `calendar-day-{isoDate}`, `slot-list`.

### TC-HCAL-E2E-02: An availability failure is distinguishable from an empty month
- **Level:** E2E
- **Preconditions:** the availability endpoint is made to fail.
- **Steps:**
  1. Open the booking link.
  2. Retry after restoring the endpoint.
- **Expected Result:**
  1. The error state and a retry are shown; no date is selectable and Book stays disabled.
  2. The grid is not rendered as a month of unavailable dates.
  3. After the retry the grid populates and the first available date is selected.
- **Selectors:** `calendar-error`, `calendar-retry`, `calendar-day-{isoDate}`, `booking-submit-button`.
