---
kind: control
title: Time Slot Picker
belongs-to: 02-booking-page.md
routes: ["/book/{slug}"]
api: ["GET /api/book/{slug}/availability"]
entities: []
tags: [control, slots, 24h, 12h-toggle, timezone, single-select]
depends-on: ["00", "01", "02"]
---

# Time Slot Picker

## Summary

Lets a candidate choose a start time on the date selected in the
[Calendar Control](calendar-control.md). The time chosen here, together with that date, is the
exact interview slot that gets booked.

Carried over from `hiring-process/02-booking-page/controls/time-slot-picker-control.md`, with one
change: **times are 24-hour by default with a 12-hour toggle**, where the source spec stated the
12-hour format is not used. See [02 §04](../02-booking-page.md).

## Functional Requirements

### 01. Structure

1. A self-contained component sitting after — or beside — the Calendar Control, driven by the date
   currently selected there.
2. Two regions: a **header** naming the selected date and the active time zone, and a **slot list**
   of selectable start times.
3. Times for **exactly one date at a time**. Never two dates at once.
4. When no date is selected — possible only when the whole window has no availability — the control
   shows its empty state instead of a list.

### 02. Slot Generation

5. Each slot is a bookable interval of the vacancy's fixed duration ([01 §01](../01-vacancies.md)).
6. **Start times are spaced exactly by the duration**, generated on that anchor from the start of
   working hours: a 30-minute interview yields `09:00, 09:30, 10:00…`; a 60-minute interview yields
   `09:00, 10:00…`; a 45-minute interview yields `09:00, 09:45, 10:30…`. The drift a 45-minute
   interview produces is accepted — see [02 §05.17](../02-booking-page.md).
7. Slots are generated only within the interviewer's bookable hours, taken from their mailbox
   settings, never from separate configuration.
8. A slot is offered only when the full duration fits within bookable hours and overlaps no
   blocking event. **No minimum lead time and no buffers** — slots may sit back-to-back with
   adjacent events, and any free slot from the current moment onward is offered.
9. On the current day, start times already past in the active zone are not offered.
10. **Display format:** 24-hour with zero-padded hours and minutes by default — `09:00`, `14:30`,
    `23:45`. A **12-hour toggle** re-renders the same slots as `9:00 AM`, `2:30 PM`. The choice is
    remembered per browser and applies to the public booking page only; it never changes the
    calendar event body or any internal screen.
11. A single flat chronological list, earliest first. Slots are not grouped by part of day.

### 03. Slot States

12. **Available** — free and bookable. Interactive.
13. **Selected** — exactly one at a time.
14. **Hover** and **Focus** are distinct from each other and from Selected.
15. **Unavailable times are not listed at all.** The picker renders only bookable starts, so there
    is no disabled or greyed slot state to represent.

### 04. Selection

16. Activating an available slot — click, tap, `Enter`, or `Space` — selects it and raises a
    time-selected change to the page.
17. The selected slot plus the selected date define the exact interview start, which is what lets
    the page enable **Book** once the form is valid.
18. Selecting a different slot replaces the selection.
19. **No slot is selected by default.** Choosing a date auto-loads its times but never auto-picks
    one; the candidate must always choose a time explicitly.
20. Changing the selected date resets the slot selection and reloads the list.

### 05. Time Zone

21. Times are computed in the active zone, shared with the Calendar Control and defaulting to the
    browser-detected zone.
22. The active zone is named in the header, so the candidate always knows what the listed times
    mean.
23. Changing the zone re-renders the list for the selected date. If the selected slot no longer
    exists, the selection is cleared.
24. The time zone and the time format are independent controls: changing one never changes the
    other.

### 06. Data & Re-validation

25. Availability comes in real time from the vacancy's assigned interviewer's calendar, via
    [00](../00-integrations.md).
26. Selecting a date fetches or derives that date's slots; re-selecting the same date may reuse
    cached availability.
27. On **Book**, the chosen slot is re-validated against the live calendar
    ([02 §06.25](../02-booking-page.md)). If it was taken in the meantime, it is removed from the
    list and the candidate is asked to choose again.

### 07. Empty, Loading & Error

28. **Loading** — a non-interactive treatment, rather than implying there are or are not times.
29. **Empty (this date)** — a message that no times are available on this date and to pick another.
    Rare in normal operation, because the Calendar Control only lets an available date be selected.
30. **Empty (no date)** — the corresponding message when the whole window has no availability.
31. **Error** — a friendly message with a retry, and no selection until availability is known.

### 08. Responsiveness

32. Beside the calendar on wide viewports, below it on narrow ones.
33. The list scrolls within its own region when the times exceed the available height; the page
    itself does not grow unbounded.
34. Entries keep adequate touch targets.

### 09. Accessibility

35. The list carries semantics for a single-selection set of options.
36. Keyboard support: `Up`/`Down` move focus, `Enter`/`Space` select, `Home`/`End` jump to the
    first and last slot.
37. Each entry's accessible name conveys the start time **in the currently displayed format** and
    the active zone — "09:30, Europe/Minsk" or "9:30 AM, Europe/Minsk".
38. The header's date and zone labels are available to assistive technology.
39. Selection, and any clearing caused by a date or zone change, is announced via a polite live
    region.
40. State is never conveyed by colour alone.

## UI Notes

Required `data-testid` attributes:

- `slot-list`, `slot-list-header`, `slot-list-date`, `slot-list-timezone`
- `slot-option-{startUtc}` — keyed by the absolute instant, so the identifier is stable across
  zone and format changes
- `slot-list-loading`, `slot-list-empty`, `slot-list-error`, `slot-list-retry`

## Test Cases

### TC-HSLOT-UNIT-01: Formatting follows the toggle, not the data
- **Level:** Unit
- **Preconditions:** a slot starting at 14:30 in the active zone.
- **Steps:**
  1. Format in 24-hour mode.
  2. Format in 12-hour mode.
  3. Format a 09:00 start in both.
- **Expected Result:**
  1. `14:30`.
  2. `2:30 PM`.
  3. `09:00` and `9:00 AM` — 24-hour zero-pads, 12-hour does not.

### TC-HSLOT-UNIT-02: The list is flat, chronological, and free of unavailable entries
- **Level:** Unit
- **Preconditions:** a day whose middle hours are busy.
- **Steps:**
  1. Build the list for that date.
- **Expected Result:**
  1. Entries ascend by start time with no grouping or sub-headers.
  2. The busy interval produces no entry at all — not a disabled one.

### TC-HSLOT-UNIT-03: Nothing is pre-selected when a date's slots load
- **Level:** Unit
- **Preconditions:** a date with several available slots.
- **Steps:**
  1. Load the list.
  2. Select a slot, then change the date.
- **Expected Result:**
  1. No slot is selected on load.
  2. Changing the date clears the selection and the new list again has none selected.

### TC-HSLOT-E2E-01: Selecting a time enables Book only once the form is valid
- **Level:** E2E
- **Preconditions:** an open vacancy with availability.
- **Steps:**
  1. Select a time before filling the form.
  2. Complete every required field.
- **Expected Result:**
  1. Book stays disabled — a time alone is not enough.
  2. Book becomes enabled once the time and all required fields are present.
- **Selectors:** `slot-option-{startUtc}`, `booking-submit-button`.

### TC-HSLOT-E2E-02: Format and zone controls are independent
- **Level:** E2E
- **Preconditions:** an open vacancy with availability.
- **Steps:**
  1. Switch to 12-hour.
  2. Change the time zone.
- **Expected Result:**
  1. Slots re-render as 12-hour; the zone label is unchanged.
  2. Slots shift to the new zone and stay in 12-hour form; the header names the new zone.
- **Selectors:** `booking-timeformat-toggle`, `booking-timezone-select`, `slot-list-timezone`, `slot-option-{startUtc}`.
