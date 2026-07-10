# The Calendar Control

## Summary

The Calendar Control allows candidates to pick a specific date for the interview. It is the first step of the booking interaction on the booking page: the candidate selects an available date here, and the date they pick drives the list of times shown by the Time Slot Picker (see `time-slot-picker-control.md`).

This document describes the **structure and behavior** of the control only. It is intentionally style-agnostic: colors, spacing, sizing, typography, iconography, and other visual details are out of scope and will be provided separately by design. Where a state needs to be distinguishable, this spec says so without prescribing how it looks.

## Functional Requirements

### 01. Layout & Structure

1. The Calendar Control is a self-contained component within the booking page's date-and-time step. It sits after the service header (logo, interview name, duration) and before — or beside — the Time Slot Picker.
2. The control is composed, top to bottom, of three regions:
   1. **Header row** — the current month and year label plus the previous/next navigation controls.
   2. **Weekday header row** — seven single-letter column labels.
   3. **Date grid** — a 7-column grid of day cells, with up to 6 week rows.
3. The control shows exactly **one month at a time**. There is no multi-month or infinite-scroll view.
4. By default, the **current month** (the month containing today's date) is displayed when the page first loads.
5. On initial load, the **first available date is selected by default** — the earliest date (from today onward, within the booking window) that has at least one bookable slot. Its month is the one shown, and its time slots are loaded immediately in the Time Slot Picker. If no date within the booking window is available, no date is selected and the Time Slot Picker shows its empty state.

### 02. Month & Year Header

1. The header displays the visible month and full year in English, e.g. `July 2026`.
2. A **previous month** control and a **next month** control let the candidate move between months.
3. Activating the previous control moves the view back by one calendar month; activating the next control moves it forward by one calendar month. The selected date (if any) is preserved and remains highlighted only while its month is in view.
4. The **previous control is disabled** when the current month is displayed — candidates can never navigate to a month entirely in the past. When disabled it is non-interactive and exposes a disabled state to assistive technology.
5. The **next control is disabled** once the view reaches the month that contains the maximum bookable date. The booking window is fixed at **one month ahead of the current date**: the latest date a candidate may book is the same day-of-month one calendar month after today (e.g. if today is July 9, 2026, the last bookable date is August 9, 2026). The candidate can navigate forward far enough to see that date's month, but the next control is disabled once that month is in view; they cannot page beyond it. Any dates after the maximum bookable date (including later days within that final month) are non-selectable (see **Date States** and **Availability & Data Source**).
6. Navigation only changes which month is rendered; it does not fetch a different candidate, service, or time zone.

### 03. Weekday Header Row

1. The row shows **seven columns**, one per day of the week, each labeled with a single letter.
2. The week **always starts on Monday and ends on Sunday**, giving the fixed columns `M  T  W  T  F  S  S` (Monday → Sunday). This never changes.
3. Weekday labels are static; they do not change as the candidate navigates between months.
4. The letters align with the day columns in the grid below.

### 04. Date Grid

1. The grid places each day of the visible month into the column matching its weekday, starting the month's `1` under the correct weekday and continuing sequentially to the last day of the month (28, 29, 30, or 31 depending on the month and leap year).
2. **Leading cells** — the cells before the 1st of the month (belonging to the previous month) are left blank and non-interactive; no day number is shown.
3. **Trailing cells** — the cells after the last day of the month are likewise left blank and non-interactive; no day number is shown.
4. The grid uses as many week rows as needed to contain the month (4 to 6 rows). The row count adjusts per month; height changes between months should be handled gracefully.
5. Each day cell contains the day number and carries a single interaction state (see **Date States**).

### 05. Date States

Every day cell is in exactly one of the following states. States are mutually exclusive except where noted (e.g. Today can combine with Available or Selected). Each state must be perceptibly distinguishable, but the visual treatment is left to design.

1. **Available** — the date has at least one bookable time slot on the hiring manager's calendar within the booking window. The cell is interactive: clickable, keyboard-focusable, and selectable.
2. **Unavailable (no availability)** — the date is within the bookable range but has zero free slots (fully booked, a non-working day, or otherwise blocked). The cell is non-interactive and is announced as disabled to assistive technology.
3. **Past date** — any date before today. Past dates are not selectable; because navigation to prior months is blocked, past dates only appear as the already-elapsed days of the current month, rendered as non-interactive.
4. **Beyond the booking window** — dates later than the maximum lead time are non-selectable and, in practice, are not reachable because the next control is disabled before they come into view.
5. **Today** — today's date is marked so it is distinguishable even when not selected. Today can simultaneously be Available (selectable) or Unavailable (disabled).
6. **Selected** — the single date the candidate has chosen. Selecting a new date clears the previous selection. Only one date can be selected at a time.
7. **Hover** (available dates only) — a transient affordance while the pointer is over an interactive cell.
8. **Focus** (keyboard) — a visible focus indicator on the currently focused cell, independent of selection.

### 06. Selection Behavior

1. Clicking/tapping (or pressing Enter/Space on) an **Available** date selects it and raises a "date selected" change to the booking page.
2. On selection, the booking page loads and displays the Time Slot Picker for that date (see `time-slot-picker-control.md`). Interacting with Unavailable, Past, or empty cells does nothing.
3. Selecting a different available date replaces the previous selection and reloads the time slots for the new date.
4. Selecting a date does not change the visible month; the grid stays on the month containing the selected date.
5. If the candidate navigates to another month and back, a previously selected date remains selected when its month is shown again (until they choose a different date).
6. There is at most one selected date across the entire control at any time.
7. On initial load the first available date is selected automatically (see §01.5); the candidate can then choose a different date at any time.

### 07. Time Zone

1. A **time zone indicator/selector** is shown adjacent to the calendar. It defaults to the candidate's browser-detected time zone.
2. All availability and all displayed times are computed relative to the selected time zone. Changing the time zone re-evaluates times and may change which dates qualify as Available near day boundaries (a slot can shift onto the previous/next calendar day in a different offset).
3. Changing the time zone must refresh both the date availability states in the grid and the currently shown time slots. If the currently selected date becomes unavailable after a time zone change, the selection is cleared and the candidate is prompted to pick again.
4. The time zone label should be explicit and human-readable (e.g. include the region/city and current UTC offset).

### 08. Availability & Data Source

1. Date availability is driven in **real time** by the hiring manager's MS 365 calendar, using the same sync described in `../booking-page.md`. A date is **Available** when at least one candidate-selectable slot exists on it after applying all of the constraints below.
2. Availability of a date depends on:
   - The interview **duration** for this booking link (15, 30, or 60 minutes).
   - The hiring manager's **working hours / bookable hours**, which are **derived from the hiring manager's MS 365 calendar** (the calendar's configured working hours for that weekday), not from any separate configuration.
   - **Existing calendar events** (busy blocks) that remove overlapping slots.
   - **Maximum lead time / booking window** — fixed at **one month ahead of the current date**. The furthest-out bookable date is the same day-of-month one calendar month after today; dates beyond it are non-bookable and bound the next-month navigation. If the target day-of-month does not exist in the following month (e.g. today is the 31st and the next month is shorter), the maximum bookable date is the last day of that following month.
3. There is **no minimum lead time** and **no buffer** before or after events: any free slot from the current time onward is bookable, back-to-back with adjacent events.
4. The control fetches availability for the visible month (and enough context around its edges to render the grid correctly). Navigating to a new month triggers a fetch for that month if not already cached.
5. **Loading state** — while availability for a month is being fetched, the grid is non-interactive rather than incorrectly implying all dates are available or unavailable.
6. **Error state** — if availability cannot be retrieved, the control shows a friendly error with a retry affordance and does not allow selection until availability is known. No booking can proceed without confirmed availability.
7. **Empty month** — if the entire visible month has no available dates, all cells are Unavailable; the candidate can still navigate to other months (subject to the window bounds).

### 09. Responsiveness

1. On wide (desktop) viewports the calendar may sit side-by-side with the Time Slot Picker; on narrow (mobile) viewports it stacks above the time slots.
2. Day cells maintain adequate touch targets on touch devices; the grid remains a 7-column layout at all breakpoints (columns resize rather than reflow).
3. The header, weekday row, and grid stay aligned across breakpoints.

### 10. Accessibility

1. The date grid is exposed with appropriate semantics (a grid/table structure) so assistive technology can navigate it by row and column.
2. **Keyboard support:**
   - Arrow keys move focus between day cells (left/right by day, up/down by week), including crossing week-row boundaries.
   - Enter/Space selects the focused available date.
   - Home/End move to the first/last day of the week (or month — to be finalized).
   - PageUp/PageDown (and/or the header controls via keyboard) move between months; focus lands on a sensible day in the new month.
   - Disabled dates (unavailable, past, or beyond the booking window) are **skipped entirely** by keyboard navigation and are not focusable; arrow-key movement lands only on available dates.
3. Each day cell has an accessible name conveying its full date and state, e.g. "Tuesday, July 14, 2026, available" / "…, unavailable" / "…, selected" / "…, today".
4. The navigation controls have accessible labels ("Previous month", "Next month") and expose their disabled state.
5. Selecting a date and any resulting change (time slots loaded, selection cleared after a time zone change) is announced via a polite live region.
6. State (focus, selected, today, availability) must not be conveyed by color alone.