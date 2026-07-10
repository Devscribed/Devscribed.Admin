# The Candidate Detail Page

## Summary

The Candidate Detail Page shows a single candidate's full record inside the Devscribed Admin Dashboard. It is opened from the Candidates Database list (see `candidates-database-page.md`) or from the candidate deep link in the hiring manager's calendar invite email. It is the page the team uses **during the interview** to review the candidate's information and CV and to record internal **Interview Notes**, manage the candidate's **categories**, and set their **status**.

Access is the same as the Candidates Database — `Admin`-only (see `candidates-database-page.md` → Access & Permissions). Category definitions, management, and list filtering live on the Candidates Database page; this page is where categories are **assigned** to an individual candidate.

This document describes the **structure and behavior** of the page only. It is intentionally style-agnostic: colors, spacing, sizing, typography, iconography, and other visual details are out of scope and will be provided separately by design. All text is in English; all times use a 24-hour clock (e.g. `14:30`).

## Functional Requirements

### 01. Access & Entry

1. The page is **`Admin`-only**, with the same access rules as the Candidates Database (see `candidates-database-page.md` → Access & Permissions). Authenticated users without the `Admin` role are denied access, and a direct URL returns a not-authorized state rather than any candidate data.
2. It is reached two ways:
   1. From the **Candidates Database list** — selecting a candidate entry (see `candidates-database-page.md` → Candidates List).
   2. From a **direct deep link** in the hiring manager's calendar invite email (see §07 and `../02-booking-page/booking-page.md` → Email Invitations).
3. Opening the deep link while signed out routes the user through sign-in first, then lands them here (provided the signed-in user has the `Admin` role).
4. If the link does not correspond to a known candidate record, a friendly **not-found** state is shown.

### 02. Candidate Information

1. The page shows the **information the candidate provided** (as captured at booking / last reschedule):
   - First name, last name, email.
   - The optional **Note** the candidate left.
   - Interview type and duration.
   - Interview date and time (in a labeled time zone).
   - Current **status** (see §06).
2. All candidate-provided fields (name, email, the provided Note, interview type/time) are **read-only** here for now — only Interview Notes (§04), Categories (§05), and Status (§06) are editable by `Admin`.

### 03. CV

1. The candidate's uploaded **CV** is shown with the ability to **view and download** it.
2. Internal users **cannot replace or delete** the CV here (candidates can replace it themselves via the Reschedule Booking Page — see `../02-booking-page/reschedule-booking-page.md`).
3. The CV file lives in a file storage system whose specifics are abstracted and out of scope for this document.

### 04. Interview Notes

1. Interview Notes are **internal only** and are **never shown to the candidate** or included in any candidate-facing page or email.
2. The team can **add and edit** notes on this page, typically while the interview is happening.
3. Interview Notes are a **single free-text field** saved to the candidate record. Edits are **auto-saved** as the user types, and an **explicit Save** action is also available; notes persist across sessions.
4. It is a single shared field: all `Admin` users see and edit the same notes, and the most recent save wins. Per-author, timestamped entries are not used for now.

### 05. Categories

1. The candidate's assigned **categories** are shown here, and an `Admin` user can **assign or unassign** categories on this page.
2. A candidate may have **zero or more** categories (many-to-many). Category creation, renaming, deletion, and list filtering are defined on the Candidates Database page (see `candidates-database-page.md` → Categories).
3. Categories are internal organizational metadata: they are **never shown to the candidate** or included in any candidate-facing page or email.

### 06. Status

1. The candidate has a **status** representing their current stage in the process, one of: `booked`, `canceled`, `not eligible`, `eligible`, `passed`, `hired`.
2. `booked` and `canceled` reflect the booking's state from the booking flow (see `../02-booking-page/manage-booking-page.md` → States); `not eligible`, `eligible`, `passed`, and `hired` are set by an `Admin` as the candidate progresses.
3. An `Admin` can **update the status** on this page.

### 07. Deep Link from the Calendar Invite

1. The hiring manager's calendar invite email (see `../02-booking-page/booking-page.md` → Email Invitations) includes a **link to this Candidate Detail Page**.
2. Following the link opens the candidate's page (after authentication and the `Admin`-role check per §01), so the interviewer can review the CV and take Interview Notes directly from the calendar event.
3. The link remains valid for the candidate record; if the record is not found, the not-found state (see §01.4) is shown.

### 08. States (Loading, Error, Not found)

1. **Loading** — the record shows a non-interactive loading treatment while data is fetched.
2. **Error** — if data cannot be loaded or a save fails, a friendly error with a retry affordance is shown; unsaved Interview Notes are not silently lost.
3. **Not found** — an unknown candidate link shows a friendly not-found state and reveals no candidate data.

### 09. Responsiveness & Accessibility

1. The page is usable across desktop and smaller viewports; the page body must not scroll horizontally at any supported width (wide content scrolls within its own container).
2. The page is fully operable by keyboard and screen reader: the CV view/download, Interview Notes editor, category assignment, and status control are properly labeled, and save/error outcomes are announced via a polite live region.

## Open Questions

None.
