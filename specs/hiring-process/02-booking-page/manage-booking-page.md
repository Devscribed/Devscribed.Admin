# The Manage Booking Page

## Summary

The Manage Booking Page lets a candidate view their booked interview and **reschedule** or **cancel** it. It is the page shown immediately after a successful booking (serving as the booking confirmation), and the same link is included in the confirmation email so the candidate can return to it later.

Each Manage Booking Page is tied to one specific booking. It reuses the Calendar Control (`controls/calendar-control.md`) and the Time Slot Picker (`controls/time-slot-picker-control.md`) for the reschedule flow, and it keeps the hiring manager's MS 365 calendar and the candidate database in sync when a booking changes.

This document describes the **structure and behavior** of the page only. It is intentionally style-agnostic: colors, spacing, sizing, typography, iconography, and other visual details are out of scope and will be provided separately by design. All text is in English; all times use a 24-hour clock (e.g. `14:30`).

## Functional Requirements

### 01. Access & Entry Points

1. The page is reached in two ways:
   1. **Immediately after booking** — on a successful booking, the candidate is taken to (or shown) this page as the confirmation of their interview (see `booking-page.md` → Confirmation).
   2. **From the confirmation email** — the email sent to the candidate contains a link to this page so they can return to manage the booking later.
2. The page is addressed by a **unique, unguessable link** tied to the specific booking (a per-booking token in the URL). No account or password is required — possession of the link is what grants access, and this token alone is considered sufficient (no additional email confirmation is required to manage the booking).
3. The link remains valid for the lifetime of the booking. Its behavior once the booking is past, cancelled, or the link is invalid is described in **States** and **Validation & Errors**.

### 02. Layout

The page is composed, top to bottom, of the following regions:

1. **Company logo** at the top of the page.
2. **Status heading** — a clear statement of the current booking state (e.g. confirmed/upcoming, rescheduled, cancelled, or past — see **States**).
3. **Booking summary** — the details of the interview (see §03).
4. **Actions** — the **Reschedule** and **Cancel** controls (see §04 and §05), shown only when the booking is in a state that allows them.
5. Contextual messaging as needed (e.g. confirmation that an email was sent, or why an action is unavailable).

The exact arrangement of these regions across breakpoints is left to design; see §08 Responsiveness.

### 03. Booking Summary

1. The summary shows:
   - The **interview type and duration** (15, 30, or 60 minutes).
   - The **date and time** of the interview, in the candidate's booked **time zone** (the time zone is shown explicitly).
   - The candidate's provided details: **first name, last name, email**, and the **Note** if one was provided.
2. The summary reflects the **current** booking — after a successful reschedule it shows the new date and time.
3. The uploaded CV is not re-displayed or re-downloadable on this page; the summary is informational. (The candidate can view, download, or replace their CV on the Reschedule Booking Page — see `reschedule-booking-page.md`.)

### 04. Reschedule

1. The **Reschedule** action lets the candidate move the existing interview to a different date and/or time — and, on that page, also update their **Note** and **CV** — **without changing the interview type/duration** and without creating a second booking.
2. Choosing **Reschedule** opens the separate **Reschedule Booking Page** (see `reschedule-booking-page.md`), carrying the booking's identity via its link. That page — almost identical to the Booking Page — is where the candidate picks the new date/time and confirms.
3. The **Reschedule** action is offered only when the booking is in a reschedulable state (Confirmed/upcoming or Rescheduled — see **States**) — that is, at any time **up until the interview's start time**. There is **no limit** on how many times a booking may be rescheduled.
4. On a successful reschedule, the existing MS 365 calendar invite is updated, updated invite emails are sent to both parties, and the candidate database record is updated **in place** — only the current date/time is stored; previous times are **not** retained as history. The candidate is returned to this Manage Booking Page showing the new date/time. The full flow, re-validation, and error handling are specified in `reschedule-booking-page.md`.

### 05. Cancel

1. The **Cancel** action lets the candidate cancel the interview entirely.
2. Choosing **Cancel** requires an explicit **confirmation step** (the candidate must confirm they want to cancel) to prevent accidental cancellation.
3. On confirming a cancel, the page:
   1. **Cancels the MS 365 calendar invite**, freeing the slot so it becomes available to other candidates.
   2. Sends a **cancellation email** to both the candidate and the hiring manager.
   3. **Updates the candidate database** record's status to cancelled.
   4. Shows the **cancelled** state (see **States**) and a confirmation message.
4. Cancelling is **atomic**: if any step fails, the booking remains active and the candidate sees an error.
5. The candidate is **not** asked for a cancellation reason.
6. **Cancel** is offered at any time **up until the interview's start time** (the same window as Reschedule).
7. After a successful cancellation, the candidate is **returned to the Booking Page** (see `booking-page.md`) so they can book a new interview if they wish.

### 06. States

The page reflects the current state of the booking; available actions depend on the state.

1. **Confirmed / upcoming** — the interview is booked and its start time is still in the future. Both **Reschedule** and **Cancel** are available (right up until the start time).
2. **Rescheduled** — same as Confirmed but after at least one reschedule; the summary shows the latest date/time. Actions remain available (there is no limit on reschedules).
3. **Cancelled** — the interview has been cancelled. The page shows the cancelled status and offers no Reschedule/Cancel actions; the candidate is returned to the Booking Page (see `booking-page.md`) so they can book a new interview if they wish.
4. **Past** — the interview's start time has already passed. The page shows the details as historical; Reschedule and Cancel are no longer available.
5. **Invalid / not found** — the link does not correspond to a known booking (or has otherwise expired); the page shows a friendly not-found message and no booking details (see **Validation & Errors**).

### 07. Validation & Errors

1. **Invalid or expired link** — an unrecognized booking link shows a friendly not-found state and reveals no candidate data.
2. **Reschedule errors** (invalid slot, race conditions, update failures) are handled on the Reschedule Booking Page; see `reschedule-booking-page.md` → Validation & Errors. The original booking is left unchanged until a reschedule succeeds.
3. **Already cancelled / already past** — attempting to reschedule or cancel a booking that is already cancelled or already in the past is not allowed; the page reflects the actual current state rather than performing the action.
4. **Update failure** — if the calendar or database update fails during reschedule or cancel, the operation is rolled back (booking left in its prior state) and a friendly error with a retry affordance is shown.
5. **Availability failure** — during reschedule, if availability cannot be loaded, the Calendar Control / Time Slot Picker show their own error states and the reschedule cannot proceed until availability is known.

### 08. Responsiveness

1. On wide (desktop) viewports the summary and actions (and, during reschedule, the Calendar Control and Time Slot Picker) may be arranged side-by-side; on narrow (mobile) viewports they stack vertically.
2. The page body must not scroll horizontally at any supported width; the calendar grid and slot list manage their own layout/scrolling as described in their specs.

### 09. Accessibility

1. The page is fully operable by keyboard and screen reader; the Calendar Control and Time Slot Picker follow the accessibility requirements in their own specs.
2. The Reschedule and Cancel actions, and the cancel confirmation step, are properly labeled and operable by keyboard; destructive intent (Cancel) is clearly conveyed.
3. State changes (reschedule confirmed, booking cancelled, errors) are announced via a polite live region.
