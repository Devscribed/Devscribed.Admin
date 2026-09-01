---
id: "02"
title: Booking Page
routes: ["/book/{slug}"]
api: ["GET /api/book/{slug}", "GET /api/book/{slug}/availability", "POST /api/book/{slug}"]
entities: [Vacancy, Candidate, Application]
tags: [public, booking, cv-upload, timezone, availability, atomic, duplicate-block, no-auth]
depends-on: ["00", "01"]
---

# 02 — Booking Page

## Summary

The only public, unauthenticated screen in the product. A candidate opens a vacancy's booking link,
picks a date and a time from the interviewer's real availability, provides their details and a CV,
and books. One Microsoft 365 event is created with the candidate as an attendee — which is what
delivers the invite to both parties — and one application appears on that vacancy's board in
`Scheduled`.

The link carries the vacancy, so the candidate never chooses a position. Duration comes from the
vacancy too ([01 §01](01-vacancies.md)), so the page has no interview-type picker.

Changing or cancelling a booking is **not** this page's job and never was — it belongs to
[07-manage-booking.md](07-manage-booking.md), which owns the manage link this page mints, the
public page it leads to, and the team's equivalent actions. This spec owns one thing: turning a
stranger with a link into a scheduled interview.

## Actors & Preconditions

- **Actors:** an anonymous candidate. No account, no session, no prior relationship.
- **Preconditions:** an `open` vacancy whose interviewer's mailbox resolves.

## Functional Requirements

### 01. Layout

1. Top to bottom: the organization wordmark, the vacancy title, the interview length, the vacancy
   description, then the booking area (Calendar Control, Time Slot Picker, candidate form), then
   the Book action. There is nothing after it: a completed booking leaves this page for the manage
   link (§10).
2. The organization is rendered as a **text wordmark**, not a logo. `Organization.logoKey` is
   reserved by 01's migration but no image is uploaded or displayed in this release — the design
   system has no logo file and its wordmark is plain type.
3. The page renders in neither `AppShell` nor `AuthLayout`. It has its own public shell — see
   [02-booking-page.design.md](02-booking-page.design.md).

### 02. Access & Vacancy State

4. The page requires **no authentication**. Possession of the link is the only precondition.
5. An **unknown slug** shows a friendly not-found state and reveals nothing about whether that
   vacancy ever existed.
6. A **closed** vacancy shows the wordmark, the title, and "This position is no longer accepting
   applications." No calendar, no slot list, no form. It is deliberately not a 404: someone who
   received the link legitimately deserves an explanation rather than something that looks broken,
   and there is nothing to leak to a visitor who already holds the link.
7. A vacancy whose interviewer's mailbox has stopped resolving behaves as an **availability
   failure** (§05.9), not as a closed vacancy — the position is still open, the system simply
   cannot answer.

### 03. Candidate Form

8. The form collects:

   | Field | Required | Rule |
   |---|---|---|
   | First name | yes | 1–50 characters after trimming |
   | Last name | yes | 1–50 characters after trimming |
   | Email | yes | valid address, at most 254 characters, lowercased for storage |
   | CV | yes | `.pdf`, `.doc`, `.docx`, `.rtf`, `.txt`; at most 10 MB; not empty |
   | Note | no | free text, at most 2000 characters |

9. Name is collected as **two fields**, not one. It maps to `Candidate.firstName` / `lastName`
   without guessing where a multi-word surname begins, and it is what goes into the calendar
   invite.
10. Email is normalised to lowercase before any lookup or storage, matching user-management spec
    01's rule, so candidate identity is case-insensitive.

### 04. Time Zone & Time Format

11. A **time zone selector** sits with the booking area, defaulting to the browser-detected zone.
    All dates and times on the page are computed in the selected zone, and the zone travels with
    the booking (`Application.timeZone`) so the invite and every internal screen can say which zone
    the candidate chose.
12. Changing the zone re-evaluates both the date grid and the slot list. If the selected slot no
    longer exists afterwards, the selection is cleared and the candidate is asked to pick again.
13. Times display in a **24-hour clock by default**, with a **12-hour toggle**. The choice is
    remembered per browser and applies to this page only.
14. This overrides `hiring-process/02-booking-page/controls/time-slot-picker-control.md §02.6`,
    which stated the 12-hour format is not used. Admin screens and the calendar event body remain
    24-hour unconditionally.

### 05. Availability

15. Availability is derived from the **assigned interviewer's** Microsoft 365 calendar, in real
    time, via [00](00-integrations.md).
16. **Bookable hours** are the mailbox's configured working hours. There is no separate
    working-hours configuration anywhere in the product.
17. **Slot start times are anchored to the interview duration**, beginning at the working-hours
    start: a 60-minute interview yields `09:00, 10:00, 11:00…`; a 45-minute interview yields
    `09:00, 09:45, 10:30…`. The drifting start times a 45-minute interview produces are an accepted
    consequence — anchoring keeps bookings tiling perfectly and never strands a gap too small to
    reuse.
18. A slot is offered only when the full duration fits inside working hours and overlaps no
    blocking event. Overlap is **half-open**, so a slot may begin exactly when an event ends.
19. **No minimum lead time and no buffers.** Any otherwise-free slot from the current moment onward
    is bookable, back-to-back with adjacent events. A slot starting minutes from now is offered.
20. Events marked `free` or `workingElsewhere` do not block a slot; they also do **not** create one
    outside working hours ([00 §02.9](00-integrations.md)).
21. The **booking window** runs from today through the same day-of-month one calendar month ahead,
    in the display zone. When that day does not exist in the following month, it clamps to that
    month's last day.
22. Start times earlier than "now" in the display zone are never offered.
23. If availability cannot be loaded, the controls show their own error state with a retry. Booking
    cannot proceed while availability is unknown — an availability failure must never be rendered
    as "no times available".

### 06. Booking Action

24. **Book** is enabled only when a date is selected, a slot is selected, and every required field
    is valid. The optional Note never blocks submission.
25. On submit the server, in order:
    1. Re-checks that the vacancy is `open`.
    2. Runs the duplicate check (§09).
    3. **Re-validates the slot** against the live calendar, to prevent double-booking between
       selection and submission.
    4. Stores the CV.
    5. Creates the calendar event with the candidate as attendee and the CV attached.
    6. Upserts the candidate and creates the application.
26. **Booking is atomic.** If any step fails, previously completed steps are compensated: no
    orphaned event, no orphaned stored CV, no half-written application. A single successful booking
    never produces two events or two applications.

### 07. What a Booking Creates

27. **Candidate** is upserted on `(organizationId, email)`.
    - A new email creates a candidate.
    - An existing email reuses the candidate and **overwrites `firstName` / `lastName` with the
      values just submitted**. Candidates never sign in and the internal screens treat their fields
      as read-only, so first-write-wins would make a typo in the first booking permanently
      uncorrectable — by them and by the team.
    - An existing email whose candidate the team has **deleted** revives them: the upsert clears
      `deletedAt`, and every application, assessment, note and CV version they had comes back with
      them ([03 §11.61](03-candidate-database.md)). The pair stays unique over live and deleted rows
      alike, which is what makes the returning person the same person rather than a stranger wearing
      a familiar name — and is the whole reason deleting a candidate is a flag.
28. **Application** is created for `(candidate, vacancy)` with:
    - `status = "scheduled"` — the board column ([05](05-board.md)).
    - `position` at the **top** of the Scheduled column, so a new applicant is never buried.
    - `submittedName` — the name exactly as submitted, frozen. The candidate's display name may
      move on; this keeps an accurate record of what went into the invite.
    - `start`, `end`, `timeZone`, `graphEventId`, `cv`, `note`.
    - `interviewerAccountId` — the interviewer this booking was actually made with, stamped here
      rather than resolved later through the vacancy, so a reassignment cannot retroactively rewrite
      who held an interview that already happened ([07 §13.63](07-manage-booking.md)).
    - `manageToken` — `randomBytes(16).base64url`, unique, frozen. It is what
      [07](07-manage-booking.md) addresses this booking by.
29. **One `ApplicationCv` row** records the CV as submitted, and **one `ApplicationScheduleEvent` of
    type `booked`** opens the scheduling history, so that history is the whole story rather than
    only its later deviations.
30. Categories, interview notes, conclusions, and criteria are **not** touched by a booking; they
    belong to the internal screens and survive repeat bookings.

### 08. The Invite

31. Exactly **one** calendar event is created, in the interviewer's mailbox, with the candidate as
    an attendee. Microsoft delivers the invite to both.
32. **Both parties receive identical content.** The body carries the vacancy title, the interview
    length, the date and time in the candidate's booked zone, the candidate's name, email, and Note
    if any, and a **link to that candidate's card** ([04](04-candidate-card.md)).
33. The candidate therefore sees the internal link. It is authenticated, and ids are UUIDs, so it
    reveals the existence of an admin tool and nothing else — no count, no ordering, no other
    candidate. This is accepted deliberately.
34. The CV is attached to the event ([00 §02.11](00-integrations.md)).
35. Times in the body use the 24-hour clock regardless of the page toggle. The invite *itself* is
    rendered by each recipient's own calendar client in whatever format they have configured; that
    is not ours to control.

### 09. Repeat Bookings

36. A booking is rejected when the same email already has a **future** application for the **same
    vacancy**. The candidate is told plainly, with the existing date and time.
37. The check is scoped deliberately:
    - **Same vacancy only.** One person applying to a React role and a .NET role is normal, and the
      candidate database is built on filtering one person's applications by position.
    - **Future only.** Someone who interviewed three months ago is not a duplicate; they are a
      re-interview, and their history is visible on their card regardless.
    - **A deleted candidate's application still counts.** This is the one hiring read that does not
      exclude them ([03 §11.64](03-candidate-database.md)). Deleting somebody removes them from the
      team's screens; it does not cancel the interview sitting in two calendars, and letting the
      booking through would put a second live application on that vacancy the moment the delete was
      reversed by this very upsert. What the candidate is told is true either way — they do already
      have an interview on that date.
38. The check runs **server-side, at submit only** — never live on email blur. A live check would
    hand out the answer for the price of typing an address.
39. This departs from user-management spec 02's enumeration-safe posture (`TC-02-INT-05`), which
    answers forgot-password neutrally regardless of whether the account exists. The departure is
    deliberate: reaching this check costs an unguessable link, a name, a valid slot selection, and
    a CV upload, which is not the cheap oracle a single-field form is — and a neutral response
    would cost every honest candidate the confirmation of their time, wherever it is rendered.
40. A candidate who books by mistake corrects it themselves, through the manage link in their
    invite — see [07 §01](07-manage-booking.md). Earlier revisions of this spec said they must
    contact the organization; that was true only while reschedule and cancel were deferred.
    Cancelling does **not** consume their one future booking: the duplicate check above already
    excludes cancelled applications, so a candidate who cancels can book this vacancy again.

### 10. Confirmation

41. On success the page **navigates to the manage link for the booking it just made** —
    `/manage/{slug}/{token}`. There is no confirmation view of its own; that page is the
    confirmation ([07 §04](07-manage-booking.md)), and the `201` carries `manageToken` so the
    redirect can be built from it.
42. This is a correction, not a preference. A confirmation rendered from component state was
    thrown away by the first refresh, which put an **empty booking form** in front of somebody who
    had already booked — the one reading of that screen the product must never offer. A URL
    survives a refresh, a bookmark, and a return three weeks later.
43. It also removes a duplicate. The manage page's live state already states the vacancy title, the
    length, and the date and time in the booked zone with the zone named — and unlike the
    confirmation it can **act** on them, offering Reschedule and Cancel where the confirmation
    offered a link to a page that does. It deliberately does **not** restate the candidate's own
    name, address or CV filename: that page's link is forwardable, so it names nobody
    ([07 §04.21](07-manage-booking.md)). The confirmation did name them, and losing that costs the
    candidate their one chance to catch a mistyped address — a cost weighed and accepted in §04.21
    rather than here. What does travel is the fact that an invite is coming, as a notice specified
    in [07 §04.16a](07-manage-booking.md): this release sends no mail of its own, so Microsoft's
    invite is the only thing the candidate ever receives, and somebody who does not know to expect
    it reads its absence as a failed booking.

### 11. Abuse Exposure

44. **There is no rate limiting, CAPTCHA, or other spam or abuse protection on this endpoint**,
    and this is a deliberate decision rather than an omission. The exposure it leaves open:
    - the endpoint is unauthenticated and accepts a **10 MB** upload;
    - there is **no minimum lead time**, so every slot from now to the window's end is bookable;
    - the email is **unverified**, so the one-booking-per-email rule (§09) constrains a person, not
      a script.
    Anyone holding the link can therefore walk a month of slots with throwaway addresses, filling
    the interviewer's calendar and uploading 10 MB per request. The unguessable slug protects
    against *finding* the page, but the link exists to be shared.
45. The mitigation, when it is wanted, is a per-IP limit on this POST — see the README's Future
    Improvements. Nothing in this spec should be read as claiming the endpoint is protected.
46. [07 §15](07-manage-booking.md) extends this exposure rather than narrowing it: the manage
    routes are unauthenticated on the same terms, and CV replacement is unlimited with nothing ever
    deleted, so storage per booking is unbounded. The posture there is this one.

### 12. Responsiveness & Accessibility

47. On wide viewports the calendar, slot picker, and form may sit side by side; on narrow ones they
    stack. The page body never scrolls horizontally at any supported width.
48. Fully operable by keyboard and screen reader. Form fields have real labels, required-state
    indication, and inline errors announced to assistive technology. Booking **failure** is
    announced via a polite live region. Booking **success** navigates, and a navigation announces
    nothing on its own — both routes render the same `<h1>` — so the destination announces instead,
    through the notice in [07 §04.16a](07-manage-booking.md). The requirement is unchanged; only
    the page that satisfies it has moved.
49. The controls carry their own accessibility requirements — see
    [controls/calendar-control.md](controls/calendar-control.md) and
    [controls/time-slot-picker-control.md](controls/time-slot-picker-control.md).

## Screens

### Booking page — open vacancy

```
┌─────────────────────────────────────────────────────────────────┐
│                        Teammerly●                               │
│                                                                 │
│                  Senior React Engineer                          │
│                       60 minutes                                │
│         We're looking for an engineer who…                      │
│                                                                 │
│  ┌── DATE ──────────────┐   ┌── TIME ──────────────────────┐   │
│  │   ‹  August 2026  ›  │   │ Tuesday, 25 August 2026      │   │
│  │   M  T  W  T  F  S  S│   │ ┌──────┐ ┌──────┐ ┌──────┐   │   │
│  │                  1  2│   │ │ 09:00│ │ 10:00│ │ 11:00│   │   │
│  │   3  4  5  6  7  8  9│   │ └──────┘ └──────┘ └──────┘   │   │
│  │  10 11 12 13 14 15 16│   │ ┌──────┐ ┌──────┐            │   │
│  │  17 18 19 20 21 22 23│   │ │ 14:00│ │ 15:00│            │   │
│  │  24[25]26 27 28 29 30│   │ └──────┘ └──────┘            │   │
│  │  31                  │   │                              │   │
│  └──────────────────────┘   └──────────────────────────────┘   │
│    🌐 (UTC+03:00) Minsk  ▾          24h ●━━ 12h                │
│                                                                 │
│  YOUR DETAILS                                                   │
│  FIRST NAME              LAST NAME                              │
│  [__________________]    [__________________]                   │
│  EMAIL                                                          │
│  [_________________________________________]                    │
│  CV                                                             │
│  [ Choose file ]  jane-doe-cv.pdf                               │
│  ANYTHING WE SHOULD KNOW?                                       │
│  [_________________________________________]                    │
│                                                                 │
│                    [        Book        ]                       │
└─────────────────────────────────────────────────────────────────┘
```

### Confirmation

There is no confirmation screen. A successful booking navigates to
[`/manage/{slug}/{token}`](07-manage-booking.md), whose live state is the confirmation — see 07's
*Manage page — live booking*.

### Closed vacancy

```
┌─────────────────────────────────────────────────────────────────┐
│                        Teammerly●                               │
│                                                                 │
│                  Senior React Engineer                          │
│                                                                 │
│    This position is no longer accepting applications.           │
└─────────────────────────────────────────────────────────────────┘
```

## Flows

### Main flow: book an interview

1. Candidate opens `/book/{slug}`.
2. System fetches the vacancy and the month's availability; the first available date is selected
   automatically and its slots load. No slot is pre-selected.
3. Candidate picks a time, fills the form, attaches a CV.
4. Candidate presses Book.
5. System re-checks the vacancy state, the duplicate rule, and the slot, then stores the CV,
   creates the event, and writes the candidate and application.
6. System shows the confirmation. Both parties receive the invite from Microsoft.

### Alt flow: the slot was taken between selection and submission

- Step 5 fails at the re-validation. The slot is removed from the list, the selection is cleared,
  and the candidate is asked to pick another time. Nothing is written and no event is created.

### Alt flow: the candidate already has a future interview for this vacancy

- Step 5 fails the duplicate check. The page states the existing date and time and does not book
  again. No second event, no second application.

### Alt flow: the vacancy was closed while the page was open

- Step 5 fails the state check. The page replaces itself with the closed state.

### Alt flow: availability cannot be loaded

- At step 2, the controls show their error state with a retry. Book stays disabled — availability
  being unknown is never rendered as availability being empty.

### Alt flow: booking fails part-way

- The stored CV is deleted and any created event is cancelled before the error is shown. The
  candidate sees a friendly failure and may retry; no partial record exists.

## API Contracts

### GET /api/book/{slug}

Public. Response `200`:
```json
{
  "organizationName": "Devscribed",
  "vacancy": { "title": "Senior React Engineer", "description": "…",
               "durationMinutes": 60, "status": "open" }
}
```

- `404` for an unknown slug. The body carries no hint that the slug ever existed.
- A `closed` vacancy returns `200` with `status: "closed"` and **no** availability — the client
  renders the closed state. Interviewer name, email, and every other internal field are absent from
  this response.

### GET /api/book/{slug}/availability

Public. Query params: `timeZone` (IANA, required), `month` (`YYYY-MM`, optional — defaults to the
current month).

Response `200`:
```json
{
  "timeZone": "Europe/Minsk",
  "window": { "from": "2026-08-25", "to": "2026-09-25" },
  "dates": {
    "2026-08-25": ["2026-08-25T06:00:00.000Z", "2026-08-25T07:00:00.000Z"],
    "2026-08-26": []
  }
}
```

- Slot starts are absolute UTC instants; the client renders them in `timeZone`.
- A date present with an empty array is unavailable; a date absent from `dates` is outside the
  window.
- `503` `{ error: "availability_unavailable" }` when the calendar cannot be reached. Never an empty
  result.

### POST /api/book/{slug}

Public. `multipart/form-data`: `firstName`, `lastName`, `email`, `note`, `startUtc`, `timeZone`,
`cv`.

Success `201`:
```json
{
  "vacancyTitle": "Senior React Engineer", "durationMinutes": 60,
  "startUtc": "2026-08-25T11:00:00.000Z", "timeZone": "Europe/Minsk",
  "firstName": "Jane", "lastName": "Doe", "email": "jane@example.com",
  "cvFileName": "jane-doe-cv.pdf",
  "manageToken": "9f2Kd1x0QpR7mVzA3bYt5w"
}
```

The response carries no application id, no candidate id, and no internal link. `manageToken` is the
one identifier that crosses, and it is not internal: it is the candidate's own handle on their own
booking, and it is what the page builds its redirect from (§10.41). Every other field is echoed
back for that redirect's sake alone — the destination re-reads all of them from the record.

Errors:
- `404` — unknown slug.
- `409` `{ error: "vacancy_closed", message: "This position is no longer accepting applications" }`.
- `409` `{ error: "slot_taken", message: "That time was just booked. Please choose another." }`.
- `409` `{ error: "already_booked", message: "You already have an interview for this position on {date} at {time} ({zone})." }`.
- `422` `{ error: "validation", fields: { email: "…", cv: "…" } }`.
- `503` `{ error: "booking_failed", message: "We couldn't complete your booking. Please try again." }` — after compensation.

## Validation Rules

1. **First / last name** — trimmed, 1–50 characters each.
2. **Email** — valid format, at most 254 characters, lowercased before lookup and storage.
3. **CV** — extension in `.pdf`, `.doc`, `.docx`, `.rtf`, `.txt`; size greater than zero and at most
   10 MB. Enforced on the client for feedback and re-enforced on the server, which is the gate.
4. **Note** — optional, at most 2000 characters.
5. **`startUtc`** — must be one of the currently generated slots for this vacancy: on a working day,
   inside working hours, on the duration anchor, within the window, and not in the past. A start
   time that was never offered is rejected as `slot_taken` rather than being accommodated.
6. **`timeZone`** — a valid IANA identifier.
7. Vacancy `status` must be `open` at the moment of submission.

## Error Messages

| Context | Message |
|---|---|
| First name empty | "First name is required" |
| Last name empty | "Last name is required" |
| Name too long | "Must be at most 50 characters" |
| Email empty | "Email is required" |
| Email invalid | "Enter a valid email address" |
| CV missing | "Please attach your CV" |
| CV wrong type | "Unsupported file type. Accepted: .pdf, .doc, .docx, .rtf, .txt" |
| CV too large | "File is too large (max 10 MB)" |
| CV empty | "The attached file is empty" |
| Note too long | "Please keep this under 2000 characters" |
| No time selected | "Choose a time" |
| Slot taken | "That time was just booked. Please choose another." |
| Already booked | "You already have an interview for this position on {date} at {time} ({zone})." |
| Vacancy closed | "This position is no longer accepting applications" |
| Booking failed | "We couldn't complete your booking. Please try again." |
| Availability failed | "We couldn't load available times. Try again." |
| Unknown link | "This link doesn't lead anywhere." |

## UI Notes

- The Book button is disabled until a date, a time, and all required fields are valid; it never
  submits an invalid form silently.
- Only bookable start times are rendered — there is no greyed-out slot state.
- The first available date is selected on load; no time slot ever is.
- The time-format toggle persists per browser; the time zone selection does not persist and is
  re-detected on each visit.
- Required `data-testid` attributes:
  - `booking-page`, `booking-org-wordmark`, `booking-vacancy-title`, `booking-duration`,
    `booking-description`
  - `booking-closed-message`, `booking-not-found`
  - `booking-timezone-select`, `booking-timeformat-toggle`
  - `booking-first-name-input`, `booking-last-name-input`, `booking-email-input`,
    `booking-cv-input`, `booking-cv-filename`, `booking-note-input`
  - `booking-submit-button`, `booking-error-banner`
  - `field-error-firstName`, `field-error-lastName`, `field-error-email`, `field-error-cv`,
    `field-error-note`
  - control test ids are owned by the control specs.

## Out of Scope

- Reschedule, cancel, and CV replacement — owned by [07](07-manage-booking.md). This page **mints**
  the manage token and renders its link; it does not act on one.
- Rate limiting, CAPTCHA, email verification — see §11.
- The candidate choosing a position: the link carries it.
- The candidate choosing an interview length: the vacancy carries it.
- Multiple interviewers, or letting the candidate choose among them.
- An organization logo image — text wordmark only in this release.
- Rich-text or multi-file uploads; exactly one CV per booking.
- Any candidate-facing view of internal notes, conclusions, categories, or criteria.

## Test Cases

### TC-H02-UNIT-01: Slot generation anchors to the duration inside working hours
- **Level:** Unit
- **Preconditions:** working hours Mon–Fri 09:00–17:00 in one zone; no events; "now" well before the window.
- **Steps:**
  1. Generate slots for a 60-minute interview on a Wednesday.
  2. Generate slots for a 45-minute interview on the same day.
  3. Generate slots for a Saturday.
- **Expected Result:**
  1. `09:00, 10:00, … 16:00` — eight slots, the last ending exactly at 17:00.
  2. `09:00, 09:45, 10:30, …`, the last slot ending at or before 17:00; the drift is expected.
  3. No slots — Saturday is not a working day.

### TC-H02-UNIT-02: Busy events remove slots; adjacency does not
- **Level:** Unit
- **Preconditions:** working hours 09:00–17:00; a 60-minute interview; a busy event 10:00–11:00.
- **Steps:**
  1. Generate slots.
- **Expected Result:**
  1. `10:00` is absent.
  2. `09:00` is present — it ends exactly when the event starts.
  3. `11:00` is present — it starts exactly when the event ends. No buffer is applied.

### TC-H02-UNIT-03: `free` events neither block nor create availability
- **Level:** Unit
- **Preconditions:** working hours 09:00–17:00; a 60-minute interview; an event marked `free` at 10:00–11:00 and another marked `free` at 19:00–20:00.
- **Steps:**
  1. Generate slots.
- **Expected Result:**
  1. `10:00` is present — a `free` event does not block.
  2. No slot exists at 19:00 — a `free` event outside working hours does not create availability.

### TC-H02-UNIT-04: Zero lead time — a slot minutes away is offered
- **Level:** Unit
- **Preconditions:** working hours 09:00–17:00; a 15-minute interview; "now" is 10:58 on a working day.
- **Steps:**
  1. Generate slots for today.
- **Expected Result:**
  1. `11:00` is offered, two minutes out.
  2. `10:45` is not — it has already started.

### TC-H02-UNIT-05: The booking window clamps an overflowing day-of-month
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Compute the window with "today" = 2026-01-31.
  2. Compute the window with "today" = 2026-08-25.
- **Expected Result:**
  1. The last bookable date is 2026-02-28, the last day of the shorter month.
  2. The last bookable date is 2026-09-25.

### TC-H02-UNIT-06: Display-zone bucketing moves a slot across a date boundary
- **Level:** Unit
- **Preconditions:** working hours ending 17:00 in `America/Los_Angeles`; display zone `Europe/Minsk`.
- **Steps:**
  1. Generate slots and bucket them by display-zone date.
- **Expected Result:**
  1. Late-afternoon Pacific slots appear on the **following** calendar date in Minsk.
  2. No slot is lost or duplicated by the bucketing.

### TC-H02-UNIT-07: CV validation
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Validate `cv.pdf` at 1 MB; `cv.DOCX` at 9.9 MB; `cv.pages`; `cv.pdf` at 10.1 MB; a 0-byte `cv.txt`; no file.
- **Expected Result:**
  1. The first two pass — the extension check is case-insensitive.
  2. The rest fail with, respectively, the unsupported-type, too-large, empty-file, and missing-CV messages.

### TC-H02-INT-01: A booking creates exactly one event and one application
- **Level:** Integration
- **Preconditions:** an open vacancy; a stub calendar provider; an empty candidate table.
- **Steps:**
  1. `POST` a valid booking.
  2. Inspect the provider's created events, the candidate table, and the application table.
- **Expected Result:**
  1. `201`.
  2. Exactly one event exists, in the interviewer's mailbox, with the candidate as attendee and the CV attached.
  3. Exactly one candidate and one application exist; the application is `scheduled`, carries the `graphEventId`, the booked `timeZone`, and `submittedName`.

### TC-H02-INT-02: A second booking by the same email reuses the candidate and overwrites the name
- **Level:** Integration
- **Preconditions:** candidate `jane@example.com` booked vacancy A as "Jon Smith"; vacancy B is open.
- **Steps:**
  1. `POST` a booking to vacancy B as "Jonathan Smith", same email.
  2. Read the candidate and both applications.
- **Expected Result:**
  1. One candidate row, now named "Jonathan Smith".
  2. Two applications, one per vacancy.
  3. Vacancy A's application still carries `submittedName` "Jon Smith" — history is intact.

### TC-H02-INT-03: A repeat future booking for the same vacancy is blocked, with the existing time
- **Level:** Integration
- **Preconditions:** `jane@example.com` has a future scheduled application for vacancy A.
- **Steps:**
  1. `POST` another booking to vacancy A with the same email.
  2. `POST` a booking to vacancy B with the same email.
- **Expected Result:**
  1. Rejected `409` `already_booked`; the message names the existing date, time, and zone; no second event and no second application.
  2. Vacancy B succeeds — the check is scoped to one vacancy.

### TC-H02-INT-04: A past application does not block a new booking
- **Level:** Integration
- **Preconditions:** `jane@example.com` has an application for vacancy A whose start is in the past.
- **Steps:**
  1. `POST` a new booking to vacancy A.
- **Expected Result:**
  1. `201` — a re-interview is not a duplicate.
  2. Two applications now exist for that candidate and vacancy.

### TC-H02-INT-05: The duplicate check is not reachable without a full submission
- **Level:** Integration
- **Preconditions:** an open vacancy.
- **Steps:**
  1. Inspect the public route table for any endpoint that accepts an email alone.
  2. `POST` a booking missing the CV, with an email that already has a future application.
- **Expected Result:**
  1. No such endpoint exists — the check has no live/blur variant.
  2. The response is a `422` validation error naming the CV. It does **not** reveal the duplicate, so an incomplete probe learns nothing.

### TC-H02-INT-06: A stale slot is rejected rather than accommodated
- **Level:** Integration
- **Preconditions:** an open vacancy; the provider reports the chosen slot as busy at submit time.
- **Steps:**
  1. `POST` a booking for that slot.
  2. `POST` a booking for a start time that is inside working hours but off the duration anchor.
- **Expected Result:**
  1. Rejected `409` `slot_taken`; nothing is written.
  2. Also rejected `409` `slot_taken` — a start time that was never offered is not honoured.

### TC-H02-INT-07: A failure part-way leaves nothing behind
- **Level:** Integration
- **Preconditions:** a provider stubbed to fail on event creation.
- **Steps:**
  1. `POST` a valid booking.
  2. Inspect storage, the provider's events, and both tables.
- **Expected Result:**
  1. Rejected `503` `booking_failed`.
  2. No stored CV, no event, no candidate created for this booking, no application.

### TC-H02-INT-08: A closed vacancy exposes no availability and accepts no booking
- **Level:** Integration
- **Preconditions:** a closed vacancy.
- **Steps:**
  1. `GET /api/book/{slug}`.
  2. `GET /api/book/{slug}/availability`.
  3. `POST` a valid booking.
- **Expected Result:**
  1. `200` with `status: "closed"`, and no interviewer name or email anywhere in the body.
  2. No slots are returned.
  3. Rejected `409` `vacancy_closed`.

### TC-H02-INT-09: An unreachable calendar fails loudly, never as emptiness
- **Level:** Integration
- **Preconditions:** a provider stubbed to throw on free/busy reads.
- **Steps:**
  1. `GET /api/book/{slug}/availability`.
- **Expected Result:**
  1. `503` `availability_unavailable`.
  2. The response is not `200` with an empty `dates` map — the two cases stay distinguishable.

### TC-H02-E2E-01: A candidate books an interview end to end
- **Level:** E2E
- **Preconditions:** an open vacancy with availability; no session.
- **Steps:**
  1. Open the booking link.
  2. Observe the pre-selected date and the slot list.
  3. Pick a time; fill first name, last name, email; attach a `.pdf`.
  4. Press Book.
- **Expected Result:**
  1. The page renders with no sign-in prompt; the wordmark, title, and length are visible.
  2. The first available date is selected; no slot is selected.
  3. Book is disabled until the time and all required fields are present.
  4. The browser lands on `/manage/{slug}/{token}` for the interview just booked, showing its live state — the title, the date and time, the named zone, the email and the CV — with Reschedule and Cancel available on it.
  5. A notice states that a calendar invite is on its way to the address given.
  6. The address bar holds the bare manage link, with no query string on it: what the candidate is left holding is the link their invite carries.
  7. **Reloading that URL shows the interview again, never the booking form.** This is the whole reason the page navigates rather than rendering a confirmation.
- **Selectors:** `booking-page`, `booking-vacancy-title`, `booking-submit-button`, `manage-page`, `manage-booked`, `manage-booking-when`, `manage-booking-zone`, `manage-reschedule-button`, `manage-cancel-button`.

### TC-H02-E2E-02: Times default to 24-hour and the toggle is remembered
- **Level:** E2E
- **Preconditions:** an open vacancy with availability; a fresh browser context.
- **Steps:**
  1. Open the booking link and read the slot labels.
  2. Switch the toggle to 12-hour.
  3. Reload the page.
- **Expected Result:**
  1. Slots read as `14:00`, not `2:00 PM`.
  2. Slots re-render in 12-hour form.
  3. After the reload the 12-hour choice is still in effect.
- **Selectors:** `booking-timeformat-toggle`, `slot-option-{startUtc}`.

### TC-H02-E2E-03: Changing the time zone re-renders both controls and clears a stale selection
- **Level:** E2E
- **Preconditions:** an open vacancy with availability.
- **Steps:**
  1. Select a date and a time.
  2. Change the time zone to one many hours away.
- **Expected Result:**
  1. The date grid and slot list both re-render for the new zone.
  2. If the chosen slot no longer exists there, the selection clears and Book returns to disabled.
- **Selectors:** `booking-timezone-select`, `slot-option-{startUtc}`, `booking-submit-button`.

### TC-H02-E2E-04: CV validation is shown inline before submission
- **Level:** E2E
- **Preconditions:** an open vacancy.
- **Steps:**
  1. Attach a `.pages` file.
  2. Attach an 11 MB `.pdf`.
  3. Attach a valid `.pdf`.
- **Expected Result:**
  1. The unsupported-type message appears and the file is not accepted.
  2. The too-large message appears.
  3. The error clears and the filename is displayed.
- **Selectors:** `booking-cv-input`, `field-error-cv`, `booking-cv-filename`.

### TC-H02-E2E-05: Booking twice for the same vacancy is refused with the existing time
- **Level:** E2E
- **Preconditions:** a candidate has already booked this vacancy for a future slot.
- **Steps:**
  1. Open the same link and complete the form with the same email.
  2. Press Book.
- **Expected Result:**
  1. An error states the existing date, time, and zone.
  2. **The browser does not navigate** — a refused booking stays on the form, which retains its values. Only a `201` leaves this page.
- **Selectors:** `booking-submit-button`, `booking-error-banner`.

### TC-H02-E2E-06: A closed vacancy explains itself instead of 404-ing
- **Level:** E2E
- **Preconditions:** a closed vacancy.
- **Steps:**
  1. Open its booking link.
- **Expected Result:**
  1. The wordmark and the vacancy title are shown, with "This position is no longer accepting applications."
  2. No calendar, no slot list, no form, no Book button.
- **Selectors:** `booking-closed-message`, `booking-vacancy-title`, `booking-submit-button` (asserted absent).

### TC-H02-E2E-07: An unknown link reveals nothing
- **Level:** E2E
- **Preconditions:** none.
- **Steps:**
  1. Open `/book/does-not-exist-AAAAAAAAAAAA`.
- **Expected Result:**
  1. The not-found state is shown.
  2. No vacancy title, organization name, or interviewer detail appears anywhere in the page.
- **Selectors:** `booking-not-found`, `booking-vacancy-title` (asserted absent).
