# The Reschedule Booking Page

## Summary

The Reschedule Booking Page lets a candidate move an already-booked interview to a different date and time (and update their Note and CV). It is reached from the Manage Booking Page (see `manage-booking-page.md`) via the **Reschedule** action and is tied to one specific existing booking.

**This page is the Booking Page (see `booking-page.md`) with the modifications listed below.** Everything not called out here — the Calendar Control (`controls/calendar-control.md`), the Time Slot Picker (`controls/time-slot-picker-control.md`), time-zone handling, the candidate form fields and their validation, responsiveness, accessibility, style-agnosticism, English text, and 24-hour times — behaves exactly as specified in `booking-page.md`. This document only describes the differences.

## Differences from the Booking Page

### 01. Access & Entry (added)

1. The page is reached from the **Manage Booking Page's Reschedule action** (see `manage-booking-page.md`), addressed by the same **unique, unguessable per-booking link**; no account or password is required.
2. It is available only while the booking is **reschedulable** — Confirmed/upcoming or already Rescheduled, i.e. any time **up until the interview's start time**, with **no limit** on the number of reschedules (see `manage-booking-page.md` → States). For a cancelled, past, or invalid booking the page is not available and the candidate is shown the corresponding state on the Manage Booking Page.
3. Opening the page does **not** change the booking; the existing interview stays in place until a reschedule is explicitly confirmed.

### 02. Interview Type & Duration (changed)

- Instead of the booking link determining the interview type (`booking-page.md` §02), the **interview type and duration are inherited from the existing booking and cannot be changed**. The duration still drives slot generation exactly as on the Booking Page.

### 03. Layout (changed vs. `booking-page.md` §01)

- **Adds** a **current booking reminder** — a short summary of the interview's current date and time (in the booked time zone) that the candidate is about to change.
- The **candidate details form** is pre-filled and partially read-only (see §04): name and email are read-only; the Note is editable; the CV is shown with view/download/replace.
- The primary action is **Confirm reschedule** instead of **Book**.
- **Adds** a **Back / keep current time** control to return to the Manage Booking Page without changes.
- On success the candidate is **returned to the Manage Booking Page** showing the updated booking (rather than the standard post-booking confirmation).

### 04. Candidate Details (changed vs. `booking-page.md` §03)

- **First name, last name, email** — carried over from the original booking and shown **read-only**; not changed here.
- **Note** — editable; pre-filled with the existing Note (if any) and may be changed, cleared, or added. Remains optional.
- **CV** — the current CV is shown with the ability to **view/download** it, and the candidate may **reattach a new CV** to replace it. A replacement is validated exactly as on the Booking Page (accepted formats `.pdf`, `.doc`, `.docx`, `.rtf`, `.txt`; maximum 10 MB); if it fails validation the existing CV is kept. If no replacement is uploaded, the existing CV is unchanged.

### 05. Selection Initialization (changed)

- On opening, the date/time selection is **initialized to the booking's current date and time** (rather than the first available date), and the Note and CV are pre-filled.
- Availability **excludes the booking's own current slot as a conflict**, so the candidate can freely pick other times; the current slot is only released once a reschedule to a different time is confirmed.
- **Confirm reschedule** is enabled whenever a valid date and time are selected (the current slot counts as valid) and any replacement CV passes validation. **Re-selecting the current date and time is allowed** — Confirm is not disabled — so the candidate may confirm a Note/CV-only change, or change nothing at all.

### 06. On Confirm (changed vs. `booking-page.md` §04)

Instead of creating a new booking, confirming **updates the existing booking in place**:

1. **Re-validates** the selected slot against the hiring manager's calendar to prevent double-booking (the booking's own current slot always counts as available to it); if a newly chosen slot was taken meanwhile, the candidate picks another.
2. **Updates the existing MS 365 calendar invite** — to the new date/time if changed (updating the same event, freeing the previously held slot) and refreshing it to reflect any updated Note and CV. No new event is created.
3. Sends an **updated** invite email to both the candidate and the hiring manager (see §07), rather than a first-time invite.
4. **Updates the candidate database record in place** with the current date/time, Note, and CV; the booking keeps its identity, only current values are stored (no history), and **no duplicate record is created**.
5. Returns the candidate to the **Manage Booking Page** showing the updated booking.

Rescheduling is **atomic**: if any step fails, the booking remains unchanged (its previous date/time, Note, and CV) and the candidate sees an error.

### 07. Emails (changed vs. `booking-page.md` §05)

- Both parties receive an **updated calendar invite** email reflecting the new date/time, Note, and CV — an update to the existing invite rather than a new booking confirmation. The current CV is attached. Everything else (recipients, content, time zone) is as in `booking-page.md` §05.

### 08. Everything Else (unchanged)

- Non-reschedulable states, invalid/expired links, slot race conditions, update failures, and availability failures are handled as described in `booking-page.md` §06 and `manage-booking-page.md` → Validation & Errors, adapted to "update the existing booking" rather than "create a new one".
- Responsiveness and accessibility are as in `booking-page.md` §08–§09 (with the Confirm reschedule and Back actions in place of Book).
