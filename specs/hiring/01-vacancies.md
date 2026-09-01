---
id: "01"
title: Vacancies
routes: ["/org/{orgId}/hiring/vacancies", "/org/{orgId}/hiring/vacancies/{vacancyId}"]
api: ["GET /api/organizations/{orgId}/hiring/vacancies", "POST /api/organizations/{orgId}/hiring/vacancies", "GET /api/organizations/{orgId}/hiring/vacancies/{vacancyId}", "PATCH /api/organizations/{orgId}/hiring/vacancies/{vacancyId}", "DELETE /api/organizations/{orgId}/hiring/vacancies/{vacancyId}", "GET /api/organizations/{orgId}/hiring/interviewers"]
entities: [Vacancy, Category, VacancyCategory]
tags: [vacancy, interviewer, duration, slug, open-closed, categories, eligibility, reassignment]
depends-on: ["00"]
---

# 01 — Vacancies

## Summary

A vacancy is one open position with one interviewer, one interview length, and one public booking
link. `admin` and `manager` create and manage them. Assigning an interviewer requires a resolvable
Microsoft 365 mailbox — verified against the tenant, not inferred from an email address — because
that mailbox is what the booking page reads availability from and writes the interview into.

Vacancies carry **categories**: reusable labels (`Engineer`, `React`, `Middle`) drawn from an
org-wide library, and the basis of every "find everyone who interviewed for a React position" query
in [03-candidate-database.md](03-candidate-database.md).

A vacancy is `open` or `closed`. There is no `draft`: the public slug is unguessable, so a vacancy
whose link has not been shared is already private.

## Actors & Preconditions

- **Actors:** `admin` and `manager` (full management); `user` and `viewer` cannot reach this screen.
- **Preconditions:** a signed-in member of the organization; at least one account with a resolvable
  tenant mailbox for a vacancy to be assignable.

## Functional Requirements

### 01. Fields

1. A vacancy has:

   | Field | Required | Rule |
   |---|---|---|
   | `title` | yes | 1–100 characters after trimming |
   | `description` | no | up to 5000 characters, plain text, shown on the public page |
   | `interviewerAccountId` | yes | an `active` member of this organization with a resolvable mailbox |
   | `durationMinutes` | yes | one of `15`, `30`, `45`, `60` |
   | `categories` | no | zero or more, from the org's library ([06](06-libraries.md)) |
   | `status` | yes | `open` \| `closed`, defaults to `open` |
   | `publicSlug` | generated | see requirement 2 |
   | `organizationId` | generated | from the session, never from the request body |

2. **The public slug** is generated once at creation as `slugify(title) + "-" +
   randomBytes(9).base64url`, giving 72 bits of entropy — for example
   `senior-react-engineer-Kj8mQ2nP4xTw`. It is:
   - **globally unique**, enforced by a unique index, so two vacancies with the same title never
     collide, in the same organization or across organizations;
   - **frozen at creation** — renaming a vacancy never changes it, so links already sent keep
     working;
   - **stored in plaintext**, unlike the hashed reset tokens of user-management spec 02, because
     the manager must be able to copy it again from the vacancy page. It is an obscure identifier,
     not a bearer secret.
   - If `slugify(title)` yields an empty string (a title with no slug-safe characters), the base
     is `vacancy`.
3. Because the slug carries its own entropy, the public URL needs no organization segment: it is
   `/book/{slug}` and stays correct when a second organization exists.

### 02. Interviewer Assignment

4. A vacancy has exactly **one** interviewer. Multiple interviewers per vacancy are out of scope.
5. **Eligibility is a verified fact.** An account may be assigned only when the calendar provider
   resolves its email to a tenant mailbox ([00 §02.12](00-integrations.md)). Eligibility is never
   inferred from the email's domain and is never a flag set by hand.
6. The interviewer picker lists **every** `active` member with role `admin`, `manager`, or `user`,
   including ineligible ones. Ineligible entries are **disabled with the reason shown** ("No
   Microsoft 365 mailbox"), rather than hidden — a missing name is indistinguishable from a bug.
   `viewer` members are not listed at all.
7. Eligibility is re-checked server-side when a vacancy is created or its interviewer changed. A
   stale cached result never authorises an assignment.

### 03. Lifecycle

8. A vacancy is `open` or `closed`, and may be moved between them freely and repeatedly.
9. **Closing stops new bookings and nothing else.** Scheduled interviews stand, their calendar
   events stand, and the board keeps working.
10. A **closed** booking link is not a 404: it shows the organization wordmark, the vacancy title,
    and a message that the position is no longer accepting applications, with no form and no
    calendar. See [02-booking-page.md](02-booking-page.md) §02.
11. A vacancy with **zero applications** may be deleted outright. A vacancy with one or more
    applications **cannot be deleted** — it is closed instead. Deleting it would take its
    applications, interview notes, conclusions, and criteria assessments with it, and
    [04-candidate-card.md](04-candidate-card.md) treats that record as permanent.

### 04. Editing

12. `title`, `description`, and `categories` are editable at any time, with no restriction.
13. **`interviewerAccountId` and `durationMinutes` are editable, and affect future bookings only.**
    - Availability and new bookings immediately follow the new interviewer or the new length.
    - Interviews **already scheduled keep their time, their length, and their original calendar
      event**, which stays in the original interviewer's mailbox. A Graph event cannot be moved
      between mailboxes; moving it would mean cancelling, recreating, and re-inviting, which is a
      distinct operation (see the README's Future Improvements) and not a side effect of a
      dropdown.
14. Changing either field requires a confirmation naming what is affected — for example
    "3 scheduled interviews keep their current time and interviewer."
15. Locking these fields after the first booking was considered and rejected: requirement 17 makes
    an interviewer unremovable while they hold open vacancies, so the assignment must stay
    changeable.

### 05. Listing

16. The list shows every vacancy in the organization. Each row carries the title, the interviewer's
    name, the duration, the category chips, the application count, and the status. Default order is
    `open` first, then by creation date descending. A status filter narrows to open or closed; a
    search box filters by title, debounced 300 ms, server-side — the same shape as the member search
    in user-management spec 04.

### 06. Cross-Spec Guard

17. **Removing a member who is the assigned interviewer on one or more `open` vacancies is
    blocked.** The `DELETE` member endpoint of user-management spec 04 rejects with a message
    naming the count, and the member's row action carries the same explanation. This mirrors that
    spec's zero-admin guard; without it, soft-deleting a member silently breaks every public
    booking link pointing at their calendar. Closed vacancies do not block removal.

## Screens

### Vacancies list — admin/manager

```
┌──────────────────────────────────────────────────────────────────────┐
│  Vacancies                                          [ New vacancy ]  │
│                                                                      │
│  [🔍 Search vacancies...]                     Status: [ Open   ▾ ]   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Title              │ Interviewer │ Length │ Candidates │ Status │  │
│  ├────────────────────┼─────────────┼────────┼────────────┼────────┤  │
│  │ Senior React Eng.  │ Pat Owner   │ 60 min │     12     │  Open  │  │
│  │ React · Senior     │             │        │            │        │  │
│  ├────────────────────┼─────────────┼────────┼────────────┼────────┤  │
│  │ .NET Engineer      │ Sam Manager │ 45 min │      3     │ Closed │  │
│  │ Asp.Net · Middle   │             │        │            │        │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

- Page title "Vacancies", trailing action "New vacancy".
- Category chips sit under the title, in the same cell.
- Rows link to the vacancy detail page.
- Empty state: "No vacancies yet."

### Vacancy detail

```
┌──────────────────────────────────────────────────────────────────────┐
│  Senior React Engineer                     [ Board ]  [ Edit ]  [⋮]  │
│  Open · 60 minutes · Pat Owner                                       │
│                                                                      │
│  BOOKING LINK                                                        │
│  https://…/book/senior-react-engineer-Kj8mQ2nP4xTw        [ Copy ]   │
│                                                                      │
│  CATEGORIES     React · Senior · Full Stack                          │
│                                                                      │
│  DESCRIPTION                                                         │
│  We're looking for…                                                  │
│                                                                      │
│  12 candidates · 4 scheduled                                         │
└──────────────────────────────────────────────────────────────────────┘
```

- The booking link is selectable text with a Copy action; it is shown for closed vacancies too,
  marked as no longer accepting bookings.
- "⋮" holds "Close vacancy" / "Reopen vacancy", and "Delete vacancy" (disabled with a tooltip when
  the vacancy has applications).

### New / Edit vacancy dialog

```
┌──────────────────────────────────────────────┐
│  New vacancy                                 │
│                                              │
│  TITLE                                       │
│  [__________________________________]        │
│  INTERVIEWER                                 │
│  [ Pat Owner                        ▾]       │
│    Sam Manager                               │
│    Alex Kaminski — No Microsoft 365 mailbox  │  ← disabled
│  INTERVIEW LENGTH                            │
│  ( )15  ( )30  ( )45  (•)60  minutes         │
│  CATEGORIES                                  │
│  [ React ×] [ Senior ×] [type to add…    ]   │
│  DESCRIPTION                                 │
│  [__________________________________]        │
│                                              │
│              [ Cancel ]  [ Create vacancy ]  │
└──────────────────────────────────────────────┘
```

## Flows

### Main flow: create a vacancy

1. `admin`/`manager` opens the Vacancies list and activates "New vacancy".
2. System fetches `GET /api/organizations/{orgId}/hiring/interviewers` and renders the picker with
   ineligible members disabled and annotated.
3. User fills title, picks an interviewer and a length, optionally adds categories and a
   description.
4. User submits. System sends `POST …/hiring/vacancies`.
5. On success the dialog closes, the banner reads "Vacancy created", and the browser navigates to the
   new vacancy's detail page with the booking link visible.

### Flow: add a category that does not exist yet

1. User types a name into the categories field.
2. System offers matching existing categories, and — when nothing matches case-insensitively — a
   `Create "…"` option.
3. Choosing it creates the category in the org library ([06](06-libraries.md)) and assigns it to
   the vacancy being edited in the same submit.

### Flow: change the interviewer on a vacancy with scheduled interviews

1. User opens Edit and picks a different eligible interviewer.
2. System shows a confirmation naming the count: "3 scheduled interviews keep their current time
   and interviewer."
3. On confirm, `PATCH` succeeds; availability and subsequent bookings use the new mailbox; existing
   applications keep their `graphEventId` and their original interviewer.

### Alt flow: assignment rejected — mailbox no longer resolves

- At create or edit, the server re-resolves the chosen account's mailbox. If it no longer resolves,
  the request is rejected with `422` and the picker marks that entry ineligible on the next fetch.

### Alt flow: delete blocked — the vacancy has applications

- "Delete vacancy" is disabled with the tooltip "Close this vacancy instead — it has candidates".
- The API rejects a direct call with `409`.

## API Contracts

### GET /api/organizations/{orgId}/hiring/interviewers

Response `200`:
```json
{
  "interviewers": [
    { "accountId": "uuid", "fullName": "Pat Owner", "email": "pat@devscribed.com",
      "eligible": true, "reason": null },
    { "accountId": "uuid", "fullName": "Alex Kaminski", "email": "alex@devscribed.com",
      "eligible": false, "reason": "no_mailbox" }
  ]
}
```

`reason` is `null` or `"no_mailbox"`. Copy for the reason lives in the design spec.

### GET /api/organizations/{orgId}/hiring/vacancies

Query params: `search` (optional), `status` (optional, `open` | `closed`).

Response `200`:
```json
{
  "vacancies": [
    { "id": "uuid", "title": "Senior React Engineer", "status": "open",
      "durationMinutes": 60, "publicSlug": "senior-react-engineer-Kj8mQ2nP4xTw",
      "interviewer": { "accountId": "uuid", "fullName": "Pat Owner" },
      "categories": [ { "id": "uuid", "name": "React" } ],
      "applicationCount": 12, "scheduledCount": 4,
      "createdAt": "2026-08-01T09:12:00.000Z" }
  ]
}
```

### POST /api/organizations/{orgId}/hiring/vacancies

Request:
```json
{ "title": "Senior React Engineer", "description": "…", "interviewerAccountId": "uuid",
  "durationMinutes": 60, "categoryIds": ["uuid"], "newCategoryNames": ["Full Stack"] }
```

Success `201`: the vacancy object above.

Errors:
- `403` — caller is `user`/`viewer`: `{ error: "forbidden", message: "You do not have permission to manage vacancies" }`.
- `422` — field validation: `{ error: "validation", fields: { title: "…" } }`.
- `422` — ineligible interviewer: `{ error: "interviewer_ineligible", message: "This member has no Microsoft 365 mailbox" }`.

### PATCH /api/organizations/{orgId}/hiring/vacancies/{vacancyId}

Request: any subset of `title`, `description`, `interviewerAccountId`, `durationMinutes`,
`categoryIds`, `newCategoryNames`, `status`.

Success `200`: the updated vacancy.

Errors: as `POST`, plus `404` when the vacancy is not in this organization.

Side effects: none on existing applications — requirement 13.

### DELETE /api/organizations/{orgId}/hiring/vacancies/{vacancyId}

Success `200`: `{ "success": true }`

Errors:
- `403` — `user`/`viewer`.
- `404` — not in this organization.
- `409` — `{ error: "has_applications", message: "Close this vacancy instead — it has candidates" }`.

## Validation Rules

1. `title` — trimmed, 1–100 characters. Empty after trimming is a required error.
2. `description` — optional, at most 5000 characters, stored as plain text.
3. `durationMinutes` — must be exactly one of `15`, `30`, `45`, `60`. Any other value is rejected
   server-side even if the UI cannot produce it.
4. `interviewerAccountId` — must be an `active` membership of this organization, role `admin`,
   `manager`, or `user`, with a mailbox that resolves at the moment of the request.
5. `categoryIds` — every id must belong to this organization. `newCategoryNames` are subject to
   [06](06-libraries.md)'s case-insensitive uniqueness; a name that already exists resolves to the
   existing category rather than erroring.
6. `status` — `open` or `closed` only.
7. `organizationId` is taken from the session. A body that carries one is ignored, never trusted.

## Error Messages

| Context | Message |
|---|---|
| Title empty | "Title is required" |
| Title too long | "Title must be at most 100 characters" |
| Description too long | "Description must be at most 5000 characters" |
| Interviewer missing | "Choose an interviewer" |
| Interviewer ineligible (picker) | "No Microsoft 365 mailbox" |
| Interviewer ineligible (server) | "This member has no Microsoft 365 mailbox" |
| Duration missing | "Choose an interview length" |
| Delete blocked | "Close this vacancy instead — it has candidates" |
| Forbidden | "You do not have permission to manage vacancies" |
| Member removal blocked (user-management 04) | "Reassign or close this member's open vacancies first" |
| Banner — created | "Vacancy created" |
| Banner — updated | "Vacancy updated" |
| Banner — closed | "Vacancy closed" |
| Banner — reopened | "Vacancy reopened" |
| Banner — link copied | "Booking link copied" |
| Empty list | "No vacancies yet." |
| Network error | "Something went wrong. Please try again." |

## UI Notes

- Page header title "Vacancies" with a trailing "New vacancy" button; the detail page's header
  carries the vacancy title with "Board" and "Edit" actions.
- Category chips are read-only on the list, editable only in the dialog.
- The booking link is always visible on the detail page, including for closed vacancies, where it
  carries a "not accepting bookings" note.
- Data refresh: refetch after every mutation. No optimistic updates.
- Required `data-testid` attributes:
  - `vacancies-list`, `vacancies-search-input`, `vacancies-status-filter`, `vacancy-new-button`
  - `vacancy-row-{id}`, `vacancy-title-{id}`, `vacancy-interviewer-{id}`, `vacancy-duration-{id}`,
    `vacancy-count-{id}`, `vacancy-status-{id}`, `vacancy-category-chip-{id}`
  - `vacancy-dialog`, `vacancy-title-input`, `vacancy-interviewer-select`,
    `vacancy-interviewer-option-{accountId}`, `vacancy-duration-{minutes}`,
    `vacancy-categories-input`, `vacancy-description-input`, `vacancy-submit-button`,
    `vacancy-cancel-button`
  - `vacancy-detail`, `vacancy-booking-link`, `vacancy-copy-link-button`, `vacancy-board-link`,
    `vacancy-edit-button`, `vacancy-actions-menu`, `vacancy-action-close`, `vacancy-action-reopen`,
    `vacancy-action-delete`
  - `vacancy-reassign-confirm`, `vacancy-delete-guard-message`
  - `toast-vacancy-created`, `toast-vacancy-updated`, `toast-link-copied`
  - `vacancies-empty-state`, `vacancies-loading-skeleton`

## Out of Scope

- Multiple interviewers per vacancy.
- Multiple booking links or interview rounds per vacancy — see the README's Future Improvements.
- A `draft` status (requirement: the unguessable slug already provides privacy).
- Rich-text descriptions, attachments on a vacancy, salary or location fields.
- Automatic closing on a date.
- Publishing to external job boards.
- Rotating a vacancy's slug after a leak.

## Test Cases

### TC-H01-UNIT-01: Slug generation is unique, frozen, and slug-safe
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Generate slugs for the title `"Senior React Engineer"` twice.
  2. Generate a slug for `"  Ведущий инженер  "` (no slug-safe characters).
  3. Generate a slug for a 200-character title.
- **Expected Result:**
  1. Both begin `senior-react-engineer-` and differ in the suffix — the same title never collides.
  2. The base falls back to `vacancy`, and the suffix is still present.
  3. The base is truncated; the total length stays within the documented cap and the suffix is intact.

### TC-H01-UNIT-02: Duration accepts only the four documented lengths
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `15`, `30`, `45`, `60`.
  2. Validate `0`, `20`, `90`, `"60"`, `null`.
- **Expected Result:**
  1. All four pass.
  2. All five fail with the "Choose an interview length" error — including the string `"60"`.

### TC-H01-UNIT-03: Title and description length rules
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate a title of `"   "`, of 100 characters, of 101 characters.
  2. Validate a description of 5000 and of 5001 characters.
- **Expected Result:**
  1. Whitespace-only fails as required; 100 passes; 101 fails as too long.
  2. 5000 passes; 5001 fails as too long.

### TC-H01-INT-01: Creating a vacancy stores the org from the session, not the body
- **Level:** Integration
- **Preconditions:** signed in as `admin` of org A.
- **Steps:**
  1. `POST` a vacancy whose body also carries `organizationId` for org B.
- **Expected Result:**
  1. The vacancy is created in org A.
  2. Org B is unaffected, and no error leaks that org B exists.

### TC-H01-INT-02: An ineligible interviewer is rejected at create and at edit
- **Level:** Integration
- **Preconditions:** member M whose email does not resolve to a tenant mailbox.
- **Steps:**
  1. `POST` a vacancy assigning M.
  2. Create a valid vacancy, then `PATCH` it to assign M.
- **Expected Result:**
  1. Rejected `422` with `{ error: "interviewer_ineligible" }`; no vacancy is created.
  2. Rejected `422`; the vacancy keeps its previous interviewer.

### TC-H01-INT-03: Reassigning an interviewer leaves scheduled interviews untouched
- **Level:** Integration
- **Preconditions:** vacancy V assigned to interviewer P, with two scheduled applications carrying `graphEventId`s.
- **Steps:**
  1. `PATCH` V to interviewer S.
  2. Read both applications.
  3. Read availability for V.
- **Expected Result:**
  1. Success.
  2. Both applications keep their original `graphEventId`, start time, and duration; neither event is cancelled.
  3. Both applications still name **P** in `interviewerAccountId` — the reassignment does not rewrite who held an interview that was already booked, and a reschedule of either will therefore still read P's mailbox ([07 §13.62](07-manage-booking.md)).
  4. Availability for **new** bookings is computed from S's mailbox.

### TC-H01-INT-04: Changing duration affects future bookings only
- **Level:** Integration
- **Preconditions:** vacancy V at 30 minutes with one scheduled application.
- **Steps:**
  1. `PATCH` V to 60 minutes.
  2. Read the existing application.
  3. Read the generated slots.
- **Expected Result:**
  1. Success.
  2. The existing application still spans 30 minutes.
  3. New slots are generated at 60-minute spacing.

### TC-H01-INT-05: A vacancy with applications cannot be deleted
- **Level:** Integration
- **Preconditions:** vacancy V with one application; vacancy W with none.
- **Steps:**
  1. `DELETE` V.
  2. `DELETE` W.
- **Expected Result:**
  1. Rejected `409` with `{ error: "has_applications" }`; V, its application, notes, and criteria survive.
  2. W is deleted.

### TC-H01-INT-06: Removing a member with open vacancies is blocked
- **Level:** Integration
- **Preconditions:** member P is the interviewer on one `open` vacancy and one `closed` vacancy.
- **Steps:**
  1. Call the user-management member `DELETE` endpoint for P.
  2. Close P's open vacancy, then repeat step 1.
- **Expected Result:**
  1. Rejected; P remains `active`; the message names the open-vacancy count.
  2. Succeeds — a closed vacancy does not block removal.

### TC-H01-INT-07: user/viewer cannot read or manage vacancies
- **Level:** Integration
- **Preconditions:** callers as `user` and `viewer`; one vacancy exists.
- **Steps:**
  1. As each, call list, create, patch, and delete.
- **Expected Result:**
  1. Every call is rejected `403`, and no vacancy data appears in any response body.

### TC-H01-INT-08: Slug uniqueness holds across identical titles and organizations
- **Level:** Integration
- **Preconditions:** two organizations, A and B.
- **Steps:**
  1. Create "Senior React Engineer" twice in A and once in B.
- **Expected Result:**
  1. Three distinct slugs; the unique index is never violated.
  2. Renaming one of them afterwards leaves its slug unchanged.

### TC-H01-E2E-01: Create a vacancy and copy its booking link
- **Level:** E2E
- **Preconditions:** logged in as `admin`; at least one eligible member exists.
- **Steps:**
  1. Open Vacancies and click "New vacancy".
  2. Enter a title, choose an interviewer, choose 60 minutes.
  3. Type "React" into categories and create it.
  4. Submit.
  5. On the detail page, click Copy.
- **Expected Result:**
  1. After step 4 the dialog closes, "Vacancy created" appears, and the detail page opens.
  2. The booking link is visible and contains the title's slug plus a random suffix.
  3. After step 5, "Booking link copied" appears.
- **Selectors:** `vacancy-new-button`, `vacancy-dialog`, `vacancy-title-input`, `vacancy-interviewer-select`, `vacancy-duration-60`, `vacancy-categories-input`, `vacancy-submit-button`, `toast-vacancy-created`, `vacancy-booking-link`, `vacancy-copy-link-button`, `toast-link-copied`.

### TC-H01-E2E-02: Ineligible members are visible but disabled, with a reason
- **Level:** E2E
- **Preconditions:** logged in as `admin`; at least one member with a mailbox and one without.
- **Steps:**
  1. Open the New vacancy dialog and open the interviewer picker.
- **Expected Result:**
  1. Both members are listed.
  2. The member without a mailbox is disabled and shows "No Microsoft 365 mailbox"; it cannot be selected.
- **Selectors:** `vacancy-interviewer-select`, `vacancy-interviewer-option-{accountId}`.

### TC-H01-E2E-03: Closing a vacancy takes its link out of service without touching the board
- **Level:** E2E
- **Preconditions:** logged in as `admin`; an open vacancy with one scheduled candidate.
- **Steps:**
  1. Open the vacancy, open the actions menu, choose "Close vacancy".
  2. Open the booking link in a new context.
  3. Return and open the board.
- **Expected Result:**
  1. Status reads Closed; "Vacancy closed" appears.
  2. The public page shows the wordmark, the title, and the not-accepting message — no calendar, no form.
  3. The scheduled candidate is still on the board, in Scheduled.
- **Selectors:** `vacancy-actions-menu`, `vacancy-action-close`, `vacancy-status-{id}`, `booking-closed-message`, `board-column-scheduled`.

### TC-H01-E2E-04: Delete is disabled once a vacancy has candidates
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a vacancy with at least one application.
- **Steps:**
  1. Open the vacancy and open the actions menu.
- **Expected Result:**
  1. "Delete vacancy" is present but disabled, with the tooltip "Close this vacancy instead — it has candidates".
- **Selectors:** `vacancy-actions-menu`, `vacancy-action-delete`, `vacancy-delete-guard-message`.

### TC-H01-E2E-05: user and viewer never see the Hiring section
- **Level:** E2E
- **Preconditions:** logged in as `viewer`, repeated as a `user` who is not an interviewer.
- **Steps:**
  1. Inspect the sidebar.
  2. Navigate directly to `/org/{orgId}/hiring/vacancies`.
- **Expected Result:**
  1. There is no Hiring group at all — no title to open and no Vacancies row inside it — and neither flashes into view during load. A titled section that opens onto nothing reads as a permission error; an absent one reads as a product they are not part of.
  2. The direct navigation renders the not-found state, not a permission error and not any vacancy data.
- **Selectors:** the `Hiring` group title by accessible name (asserted absent), `nav-vacancies` (asserted absent), `vacancies-list` (asserted absent).
