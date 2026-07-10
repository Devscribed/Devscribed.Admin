# The Time Slot Picker

## Summary

The Time Slot Picker lets a candidate choose a specific start time for the interview on the date they selected in the Calendar Control (see `calendar-control.md`). It is the second step of the booking interaction: once a date is chosen, this control lists the available start times for that date, and the time the candidate picks — together with the date — determines the exact interview slot that gets booked.

## Functional Requirements

### 01. Layout & Structure

1. The Time Slot Picker is a self-contained component within the booking page's date-and-time step. It sits after — or beside — the Calendar Control and is driven by the date currently selected there.
2. The control is composed, top to bottom, of two regions:
   1. **Header** — a label identifying the selected date the times belong to (e.g. `Tuesday, July 14, 2026`) and the active time zone (see **Time Zone**).
   2. **Slot list** — a vertically ordered, scrollable list of selectable start-time entries for that date.
3. The control shows the times for **exactly one date at a time** — the date currently selected in the Calendar Control. It never shows times for multiple dates at once.
4. When no date is selected (only possible when the whole booking window has no availability), the control shows its empty state instead of a slot list (see **Empty, Loading & Error States**).

### 02. Slot Generation

1. Slots are discrete interview **start times** for the selected date. Each slot represents a bookable interval of the interview's fixed **duration** for this booking link (15, 30, or 60 minutes — see `../booking-page.md`).
2. Start times are spaced **exactly by the interview duration** and generated on that boundary — the interval between consecutive slots always equals the duration. For example, a 30-minute interview produces `09:00`, `09:30`, `10:00`, …; a 60-minute interview produces `09:00`, `10:00`, …
3. Slots are generated only within the hiring manager's **bookable hours**, which are derived from the hiring manager's MS 365 calendar (the calendar's configured working hours for that weekday) — not from any separate configuration.
4. A slot is offered only if the full interview duration fits within bookable hours and does not overlap any existing busy event on the calendar. There is **no minimum lead time** and **no buffer** before or after events: slots may be back-to-back with adjacent events, and any otherwise-free slot from the current time onward is offered.
5. On the current day, start times that have already passed (earlier than "now" in the active time zone) are not offered.
6. Times are displayed using a **24-hour clock** with zero-padded hours and minutes, e.g. `09:00`, `14:30`, `23:49`. The 12-hour `AM`/`PM` format is not used.
7. Slots are listed in a single **flat, chronological list**, earliest first. Slots are not grouped or sub-labeled by part of day (morning/afternoon/evening).

### 03. Slot States

Each slot entry is in exactly one of the following states. Each state must be perceptibly distinguishable, but the visual treatment is left to design.

1. **Available** — the slot is free and bookable. The entry is interactive: clickable, keyboard-focusable, and selectable.
2. **Selected** — the single slot the candidate has chosen. Selecting a new slot clears the previous selection. Only one slot can be selected at a time.
3. **Hover** — a transient affordance while the pointer is over an available entry.
4. **Focus** (keyboard) — a visible focus indicator on the currently focused entry, independent of selection.

Unavailable times are simply **not listed** — the picker only renders bookable start times, so there is no disabled/greyed slot state to represent.

### 04. Selection Behavior

1. Clicking/tapping (or pressing Enter/Space on) an **Available** slot selects it and raises a "time selected" change to the booking page.
2. Selecting a slot, together with the already-selected date, defines the exact interview start; the booking page uses this to enable the **Book** action once the rest of the candidate form is valid (see `../booking-page.md`).
3. Selecting a different slot replaces the previous selection.
4. There is at most one selected slot at any time.
5. **No slot is selected by default.** When a date's times load, the list is shown with nothing pre-selected; the candidate must always pick a time explicitly before booking. Selecting a date auto-loads its times but never auto-picks a time.
6. Changing the selected date in the Calendar Control resets the slot selection and reloads the list for the new date.

### 05. Time Zone

1. The times shown are computed relative to the **active time zone**, which is shared with the Calendar Control (see `calendar-control.md` → Time Zone). It defaults to the candidate's browser-detected time zone.
2. The active time zone is displayed in the picker's header so the candidate always knows which zone the listed times are in.
3. Changing the time zone re-evaluates and re-renders the slot list for the selected date (start times shift to the new zone, and the set of slots may change near day boundaries). If the selected slot no longer exists after the change, the selection is cleared.

### 06. Availability & Data Source

1. Slot availability is driven in **real time** by the hiring manager's MS 365 calendar, using the same sync described in `../booking-page.md` and `calendar-control.md`. The picker reflects the current free/busy state each time a date is selected.
2. Availability of a slot depends on the interview **duration**, the hiring manager's **bookable hours** (from the MS 365 calendar), and **existing calendar events** (busy blocks) that remove overlapping slots. No minimum lead time and no buffers apply (see §02).
3. When a date is selected in the Calendar Control, the picker fetches/derives that date's slots. Re-selecting the same date may reuse cached availability; selecting a new date fetches for that date.
4. On pressing **Book**, the chosen slot is **re-validated** against the calendar to prevent double-booking. If it was taken between selection and booking, the slot is removed from the list and the candidate is asked to pick another (see `../booking-page.md`).

### 07. Empty, Loading & Error States

1. **Loading** — while a date's slots are being fetched/derived, the list shows a non-interactive loading treatment rather than implying there are or aren't any times.
2. **Empty (no times on this date)** — if the selected date has no bookable slots, the picker shows an empty message (e.g. "No times available on this date — please pick another date") instead of a slot list. In normal operation this is rare, because the Calendar Control only allows selecting dates that have availability.
3. **Empty (no date selected)** — when the entire booking window has no availability and no date is selected, the picker shows a corresponding empty message.
4. **Error** — if slots cannot be retrieved, the picker shows a friendly error with a retry affordance and allows no selection until availability is known. No booking can proceed without a confirmed slot.

### 08. Responsiveness

1. On wide (desktop) viewports the picker may sit side-by-side with the Calendar Control; on narrow (mobile) viewports it stacks below the calendar.
2. The slot list scrolls within its own region when the number of times exceeds the available height, without forcing the whole page to grow unbounded.
3. Slot entries maintain adequate touch targets on touch devices.

### 09. Accessibility

1. The slot list is exposed with appropriate semantics (a list of selectable options) so assistive technology can navigate it and understand the single-selection model.
2. **Keyboard support:**
   - Arrow keys (Up/Down) move focus between slot entries.
   - Enter/Space selects the focused slot.
   - Home/End move to the first/last slot.
3. Each slot entry has an accessible name conveying its start time (24-hour) and the active time zone, e.g. "09:30 Eastern Time".
4. The header's selected-date and time-zone labels are available to assistive technology, so the times' context is clear.
5. Selecting a slot, and any resulting change (selection cleared after a date or time-zone change), is announced via a polite live region.
6. State (selected, focus) must not be conveyed by color alone.
