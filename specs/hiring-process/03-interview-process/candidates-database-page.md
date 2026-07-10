# The Candidates Database Page

## Summary

The Candidates Database is a **private** page inside the Devscribed Admin Dashboard. It lists all candidates who have booked an interview and lets the internal team search and filter them, and open an individual candidate. Each entry opens the **Candidate Detail Page** (see `candidate-detail-page.md`), where the team reviews the candidate's provided information and CV and records internal **Interview Notes**, assigns **categories**, and sets the candidate's **status**.

Candidate records are created and kept up to date by the candidate-facing booking flow: a booking creates a candidate (see `../02-booking-page/booking-page.md`), and rescheduling or cancelling updates it (see `../02-booking-page/manage-booking-page.md` and `../02-booking-page/reschedule-booking-page.md`). This page (and the Candidate Detail Page) is where the team reads and annotates those records. It supports the "interview process" step of the hiring process (see `../01-overview.md`).

Unlike the booking pages, this page is **not public**: it is only available to authenticated Admin Dashboard users.

This document describes the **structure and behavior** of the page only. It is intentionally style-agnostic: colors, spacing, sizing, typography, iconography, and other visual details are out of scope and will be provided separately by design. All text is in English; all times use a 24-hour clock (e.g. `14:30`).

## Functional Requirements

### 01. Access & Permissions

1. The page lives in the **Devscribed Admin Dashboard** and requires an **authenticated internal user with the `Admin` role**. It is never publicly accessible.
2. **Only users with the `Admin` role may access the Candidates Database** — both this list and any Candidate Detail Page. Authenticated users without the `Admin` role are denied access (e.g. the "Candidates" area is not shown to them, and a direct URL returns a not-authorized state rather than any candidate data).
3. It is reached two ways:
   1. From the **Admin Dashboard navigation** (a "Candidates" area), shown only to `Admin` users.
   2. From a **direct link to a specific candidate's page** included in the hiring manager's calendar invite email (see `candidate-detail-page.md` → Deep Link from the Calendar Invite and `../02-booking-page/booking-page.md` → Email Invitations).
4. Opening a candidate deep link while signed out routes the user through sign-in first, then lands them on the requested candidate page (provided the signed-in user has the `Admin` role; otherwise access is denied per §01.2). This assumes the hiring manager who receives the invite holds the `Admin` role.
5. Whether editing (as opposed to viewing) requires any further role distinction is not needed for now — `Admin` covers both view and edit.

### 02. Candidates List

1. The default view is a **list of all candidates**, one entry per candidate record.
2. Each entry shows a concise summary, at minimum:
   - Candidate **name** (first + last).
   - **Email**.
   - **Interview type** and **date/time** of the interview (in a clearly labeled time zone).
   - **Status** — one of `booked`, `canceled`, `not eligible`, `eligible`, `passed`, `hired` (see `candidate-detail-page.md` → Status).
   - The candidate's assigned **categories**, if any (see §04).
3. The list is ordered by **most recently added first** by default (newest candidate records at the top).
4. The list can be **filtered by category** (see §04). Category filtering combines with the search term (see §03) — results match the search and the selected category filter.
5. Selecting an entry opens that candidate's detail page (see `candidate-detail-page.md`).
6. The list uses **infinite scroll** to handle large numbers of candidates, loading more as the user scrolls.
7. Empty, loading, and error states are shown as appropriate (see §06).

### 03. Search

1. A **search field** filters the candidate list **as the user types** (search-as-you-type).
2. Search matches the candidate's **name** and **email**. It does not search interview type or Interview Notes content. Categories are narrowed separately via the multi-select category filter (see §04).
3. When no candidates match, a clear **no-results** state is shown, with a way to clear the search.
4. Search reflects the current data; a candidate created/updated by the booking flow appears in results without a manual refresh where feasible.
5. Search can be combined with **category filtering** (see §02.4 and §04); the two narrow the list together.

### 04. Categories

1. **Categories** are labels the team defines to organize candidates (for example: "Frontend", "Senior", "Strong hire", "Rejected" — names are up to the team).
2. **Managing categories** — `Admin` users can **create**, **rename**, and **delete** categories:
   - Creating a category makes it available to assign to any candidate.
   - Renaming updates it everywhere it is assigned.
   - Deleting a category removes it from all candidates it was assigned to; it does not delete the candidates themselves.
   - Category names must be unique.
3. **Assigning categories** — categories are assigned to and unassigned from individual candidates on the **Candidate Detail Page** (see `candidate-detail-page.md` → Categories). A candidate may have **zero or more** categories, and a category may be assigned to **any number** of candidates (many-to-many).
4. **Filtering by category** — the Candidates List can be filtered by category via a **multi-select**. Selecting multiple categories matches candidates having **any** of the selected categories (OR). Filtering combines with the search term (see §03).
5. A category has only a **name** for now — no color, description, or other attributes. All categories are **team-created**; there are no predefined/system categories.
6. Category management, assignment, and filtering are all **`Admin`-only**, consistent with §01.
7. Categories are internal organizational metadata: they are **never shown to the candidate** or included in any candidate-facing page or email.

### 05. Relationship to Bookings

1. Each candidate record originates from a booking (see `../02-booking-page/booking-page.md`). The record's provided details, interview slot, and status stay in sync as the candidate reschedules or cancels (see `../02-booking-page/reschedule-booking-page.md` and `../02-booking-page/manage-booking-page.md`).
2. Interview Notes (recorded on the Candidate Detail Page, see `candidate-detail-page.md`) and categories are internal, separate from the candidate-provided data that the booking flow writes; reschedules/cancellations do not erase them.
3. A person who books more than once (e.g. after cancelling) is **merged into a single candidate record by email** — repeat bookings for the same email update the same candidate rather than creating a duplicate. Interview Notes and Categories persist across their bookings; the record reflects their latest booking.
4. Candidate records and their CVs **cannot be deleted** at the moment — there is no delete action for candidates or CVs.

### 06. States (Empty, Loading, Error)

1. **Empty database** — when there are no candidates yet, a friendly empty state explains that candidates appear here once interviews are booked.
2. **Loading** — the list shows a non-interactive loading treatment while data is fetched.
3. **Error** — if data cannot be loaded, a friendly error with a retry affordance is shown.

### 07. Responsiveness & Accessibility

1. The list is usable across desktop and smaller viewports; the page body must not scroll horizontally at any supported width (wide tables/content scroll within their own container).
2. The page is fully operable by keyboard and screen reader: the search field, category filter, and list entries are properly labeled, and outcomes are announced via a polite live region.

## Open Questions

None — all previously open questions have been resolved:

- **Roles & permissions** — only users with the `Admin` role can access the Candidates Database and Candidate Detail Page (view and edit); see §01.
- **Candidate identity / dedup** — repeat bookings are merged into one candidate record by email (see §05.3).
- **Interview Notes structure** — a single free-text field with both auto-save and an explicit Save; no per-author entries (see `candidate-detail-page.md` → Interview Notes).
- **Search scope** — search-as-you-type over name and email; categories via a separate multi-select filter; interview type and notes are not searched (see §03).
- **Editing provided details** — candidate-provided fields and the CV are read-only; only Interview Notes, Categories, and Status are editable (see `candidate-detail-page.md`).
- **List ordering & paging** — infinite scroll, ordered by most recently added first (see §02.3, §02.6).
- **Category filter logic** — multi-select matching **any** of the selected categories (OR) (see §04.4).
- **Category attributes** — name only; all team-created, no predefined/system categories (see §04.5).
- **Statuses shown** — `booked`, `canceled`, `not eligible`, `eligible`, `passed`, `hired` (see `candidate-detail-page.md` → Status).
- **Data retention** — candidate records and CVs cannot be deleted at the moment (see §05.4).
- **CV storage** — the CV is held in an abstract file storage system whose specifics are out of scope (see `candidate-detail-page.md` → CV).
