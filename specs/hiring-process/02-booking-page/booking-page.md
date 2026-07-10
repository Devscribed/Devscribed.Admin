# Booking Page

## Summary

Candidates who want to book the interview are using one of our booking links. We have 3 booking links at the moment:

1. 15-minutes interview
2. 30-minutes interview
3. 1 hour interview

When candidates book the interview, we receive an invite in our booking calendar with all necessary for the interview details. The candidate is also added into our database of candidates. 

## Functional Requirements

A candidate clicks on the link and sees publicly available page (no authentication required). The candidate sees calendar with available dates and for each seelcted date they also see the available time. They then provide their first name, last name, email, and upload CV as an attachment, and press the Book button to book the interview. The candidate and the hiring manager receive an email with an invite for their calendar. The email contains the same provided information of the candidate. Hiring Manager's calendar is synced in real time with the booking page, so the calendar on the booking page and available timeslots are only show time based on the availability from the hiring manager calendar. 

### 01. Layout

The page is composed, top to bottom, of the following regions:

1. **Company logo** at the top of the page.
2. **Interview name** right after the logo: `15-minutes interview`, `30-minutes interview`, or `1 hour interview`, matching the booking link that was opened.
3. **Booking area** — the main interactive region, containing:
   1. The **Calendar Control** for choosing a date (see `controls/calendar-control.md`).
   2. The **Time Slot Picker** for choosing a start time on the selected date (see `controls/time-slot-picker-control.md`).
   3. The **candidate details form** (see §03).
4. **Book button** — the primary action that submits the booking (see §04).
5. **Confirmation view** — shown after a successful booking (see §07).

The exact arrangement of these regions (side-by-side vs. stacked at different breakpoints) is left to design; see §08 Responsiveness.

### 02. Interview Types (Booking Links)

1. There are three public booking links, one per interview length: **15 minutes**, **30 minutes**, and **1 hour (60 minutes)**.
2. Each link opens the same booking page with the same layout and behavior; the links differ only by the interview **duration**, which:
   - Sets the interview name shown on the page (§01).
   - Drives slot generation in the Time Slot Picker — start times are spaced by the duration (see `controls/time-slot-picker-control.md`).
   - Is written into the calendar invite and the candidate record.
3. Each link is publicly accessible with **no authentication** required. There is **no rate limiting, CAPTCHA, or other spam/abuse protection** on the page at the moment.
4. All three links share a **single hiring manager** for now. The hiring manager's email address is **not hardcoded**; it is a **setting configured in the Admin Dashboard**. This one address identifies whose MS 365 calendar drives availability (see §06 and `controls/calendar-control.md`), which calendar the invite is created in, and who receives the invite email as the hiring manager (see §04–§05). If the setting is changed, the new address applies to subsequent bookings.

### 03. Candidate Details Form

1. The form collects the following fields. All are **required** except where noted:
   - **First name**
   - **Last name**
   - **Email**
   - **CV** — uploaded as a file attachment. Accepted formats: `.pdf`, `.doc`, `.docx`, `.rtf`, `.txt`; maximum file size **10 MB**.
   - **Note** (optional) — a free-text area where the candidate can add anything they'd like the hiring manager to know. May be left empty.
2. Field validation is described in §06. The **Book** button remains disabled until a date and a time are selected and all required fields are valid (see §04). The optional **Note** never blocks submission.

### 04. Booking Action & Flow

1. The **Book** button is enabled only when all of the following are true:
   - A **date** is selected in the Calendar Control.
   - A **time slot** is selected in the Time Slot Picker.
   - All required candidate form fields are present and valid.
2. On pressing **Book**, the page:
   1. **Re-validates** the selected slot against the hiring manager's calendar in real time to prevent double-booking. If the slot was taken in the meantime, it is removed and the candidate is asked to pick another (see §06 and `controls/time-slot-picker-control.md`).
   2. Creates an **invite in the booking calendar** (MS 365) for the selected date, time, and duration, including the candidate's details.
   3. Sends **calendar invite emails** to both the candidate and the hiring manager (see §05).
   4. **Adds the candidate to the candidate database**, storing their details, the interview type/slot, the Note (if any), and the uploaded CV. The candidate database is described in a separate document (forthcoming); see Summary and the overview in `../01-overview.md`.
   5. Shows the **confirmation view** (see §07).
3. The booking is **atomic**: if any required step fails (calendar invite creation, etc.), no partial booking is recorded and the candidate sees an error (see §06). A single successful booking must not create duplicate calendar invites or duplicate candidate records.

### 05. Email Invitations

1. On a successful booking, both the **candidate** and the **hiring manager** receive an email containing a **calendar invite** for the interview.
2. The invite reflects the selected date, time, and duration and can be added to the recipient's own calendar.
3. The email contains the same candidate information provided on the page (first name, last name, email, and the Note if one was provided) and the interview type. The uploaded **CV is attached to the email**, and is also stored in the candidate database.
   - The candidate's email also includes a **link to the Manage Booking Page** (see `manage-booking-page.md`) so they can reschedule or cancel later.
4. Times in the invite/email are consistent with the time zone the candidate booked in (see `controls/time-slot-picker-control.md` → Time Zone).

### 06. Validation & Errors

1. **Email** must be a valid email address format.
2. **CV upload** must be one of the accepted formats (`.pdf`, `.doc`, `.docx`, `.rtf`, `.txt`) and no larger than **10 MB**; otherwise an inline error is shown and the file is not accepted.
3. Required fields that are empty or invalid block submission and are indicated inline; the **Book** button stays disabled until they are corrected.
4. **Slot race condition** — if the chosen slot is taken between selection and pressing Book, the candidate is told the slot is no longer available and is asked to pick another time.
5. **Booking failure** — if the calendar invite or booking cannot be completed, a friendly error is shown, and no partial booking, invite, or candidate record is created (see §04.3).
6. **Availability failure** — if availability cannot be loaded, the Calendar Control / Time Slot Picker show their own error states and booking cannot proceed until availability is known (see `controls/calendar-control.md` and `controls/time-slot-picker-control.md`).

### 07. Confirmation

1. After a successful booking, the candidate is shown the **Manage Booking Page** (see `manage-booking-page.md`) as the confirmation, summarizing:
   - The interview type and duration.
   - The selected date and time (in the booked time zone).
   - The candidate's provided details.
2. The confirmation makes clear that a calendar invite email has been sent to the candidate, and that the candidate can **reschedule or cancel** the interview from this page (a link to it is also included in the email).

### 08. Responsiveness

1. On wide (desktop) viewports the Calendar Control, Time Slot Picker, and candidate form may be arranged side-by-side; on narrow (mobile) viewports they stack vertically.
2. The page body must not scroll horizontally at any supported width; the calendar grid and slot list manage their own layout/scrolling as described in their specs.

### 09. Accessibility

1. The page is fully operable by keyboard and screen reader; the Calendar Control and Time Slot Picker follow the accessibility requirements in their own specs.
2. Form fields have associated labels, required-state indication, and inline error messages that are announced to assistive technology.
3. Booking success and errors are announced via a polite live region.

## Open Questions

None — the booking page's requirements are resolved. Candidate reschedule/cancel is handled by the Manage Booking Page (see `manage-booking-page.md`), which carries its own open questions.
