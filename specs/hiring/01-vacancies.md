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

    **Every application counts, including one whose candidate has been deleted**
    ([03 §11](03-candidate-database.md)). Removing a person hides their record; it does not destroy
    it, and a cascade that took their notes and assessments away because nobody could see them any
    more would be a hard delete arrived at sideways. So a vacancy can show **no candidates** and
    still refuse to be deleted, which is the one case where the two numbers on this screen disagree.
    The list is told which it is by `deletable` rather than inferring it from the count beside it:
    the rule is the server's, and a screen that re-derived it would offer a button the API refuses.

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

### 07. List Controls & Row Actions

18. **The status filter is a tab strip**, not a `Select`: `All` · `Open` · `Closed`, the same
    three choices in one press instead of two. It sits on the left of the list toolbar, with the
    search and `New vacancy` on the right.
19. **Each tab carries its own count** — `All (12)`, `Open (9)`, `Closed (3)`. The number is what
    the tab strip buys: how a library divides into live and finished is the first thing somebody
    arriving here wants, and a `Select` could not say it without being opened three times.
20. **The counts follow the search and ignore the tab.** A count narrowed by the tab it labels
    would read `Closed (0)` while standing on `Open`, and pressing it would then produce rows. A
    count that ignored the search would promise nine open vacancies over a search that matched
    one. So every label is true of its own tab, under whatever search is applied.
21. **The empty state is driven by the organization's whole library, never by a count.** "No
    vacancies yet." is a fact about the organization; "No vacancies match these filters." is a
    fact about the search. Telling somebody who has twelve vacancies that they have none would
    read as data loss — the same rule the candidate database follows with `total`
    ([03 §05.20](03-candidate-database.md)).
22. **Every row carries an actions menu**, so the common jobs do not require opening the vacancy
    first. Six items, in this order:

    | Item | Goes to | Blocked when |
    |---|---|---|
    | Open board | the vacancy, where the board is (§08.27) | — |
    | Copy booking link | the clipboard | the vacancy is `closed` |
    | Open booking page | `/book/{slug}`, in a new tab | — |
    | Edit vacancy | the create/edit dialog, over the list | — |
    | Close vacancy / Reopen vacancy | `PATCH status` | — |
    | Delete vacancy | `DELETE`, after a confirmation | the vacancy has applications (§03.11) |

    `Open board` was dropped when §08.27 made the board *be* the vacancy, on the argument that the
    row already opens it. **It is back.** That argument is about the destination and a menu is not:
    a kebab is where a row states everything it can do, and a reader who has opened one is asking
    to be told rather than to infer that the whole row is a link. It goes to the same address the
    row does, which is the point — a menu that omits the obvious action reads as a menu that
    cannot perform it.

    `Open booking page` is the one item that leaves the product: the candidate's own view, at the
    address `Copy booking link` copies, opened in a **new tab** so returning costs the list neither
    its filters nor its place. It is **not** blocked on a closed vacancy the way the copy is — the
    page still exists and explains itself ([02 §02.6](02-booking-page.md)), and what a closed
    vacancy cannot do is take a booking, not be looked at.

23. **A blocked item is disabled and drawn, never hidden**, and carries its reason in the row —
    `This link is no longer accepting bookings.` for a closed vacancy's link, and
    `Close this vacancy instead — it has candidates` for a delete. A missing action is
    indistinguishable from a bug, and the row stays focusable so the reason is reachable without
    a pointer.
24. **Closing confirms; reopening does not.** Closing is the action people fear cancels what is
    already booked, so the confirmation says what it leaves alone and names the count:
    *"The booking link stops accepting new candidates. 3 scheduled interviews stand, and the board
    keeps working."* Reopening takes nothing away and its undo is one row up in the same menu.
    Deleting confirms because it is the one irreversible action on this screen.
25. **Copying from a row confirms with a toast.** The detail page can select its own link text
    when the clipboard refuses; a row draws no link, so it says where the link is instead:
    *"The clipboard is unavailable. Open the vacancy to copy its link."* The action never fails
    silently.
26. **Clicking a row opens the vacancy; clicking inside the menu never does.** The menu is
    rendered inside the row's link, so a press on it is a press on the link unless the row is
    told otherwise.

### 08. The Vacancy Screen

27. **The vacancy and its board are one screen, at `/hiring/vacancies/{vacancyId}`.** They were
    two routes with a button pointing each way, and the split cost a navigation to answer *who
    has applied?* — which is the first question anybody opening a vacancy has, and the only
    question the four cards on the old detail page could not answer. `…/{vacancyId}/board`
    **redirects** here rather than 404-ing: it travelled, in bookmarks and in whatever anybody
    pasted into a chat while the two were separate.

    Nothing about the board itself changes. Every rule in [05](05-board.md) — the five columns,
    the ordering, the drag model, the concurrency answer, the permissions — is about the board
    and not about the page it was on.

28. **The four cards become a header.** The booking link stops being selectable text with a
    `Copy` beside it and becomes the button alone; the categories, the interviewer and the length
    become one meta line under the title; the status becomes a badge beside the title; and the
    candidate counts are dropped, because the board's own columns carry them one line further
    down and two numbers for one fact will disagree. `Edit vacancy` leaves the header for the
    kebab, which leaves exactly one button: the link, because copying it is the reason to visit.

    Dropping the link *text* costs the one fallback a refused clipboard had — there is nothing
    left on the page to select — so the message carries the link itself instead of pointing at a
    page the reader is already on (§07.25).

29. **The description is clamped to three lines, and expands to no more than a fifth of the
    screen.** `View more` is drawn **only when the clamp actually cuts something**, which is a
    fact about the width the header ended up with and not about the text, so it is measured from
    the laid-out element rather than guessed at from a length. Expanded, the block scrolls inside
    its share; it never grows. The board keeps the rest of the height, and a description that
    could push it out of view would undo the reason the two are on one route.
30. **A vacancy with no description offers `Add a description`** in its place, opening the same
    edit dialog. An empty prose slot on the screen that owns the prose is a dead end.
31. **A closed vacancy states what closing did**, directly above the board it did not touch:
    *"This link is no longer accepting bookings. Scheduled interviews stand and the board keeps
    working."* The `Copy booking link` button is **disabled**, the same rule the row menu follows
    (§07.23) — and this note is the reason it can be, because the reason is on the page rather
    than inside a menu nobody has opened.
32. **The screen owns the viewport height.** The header does not scroll; the board's columns
    scroll inside what is left of it. This is what makes §08.29's clamp load-bearing rather than
    cosmetic.

## Screens

### Vacancies list — admin/manager

```
┌──────────────────────────────────────────────────────────────────────┐
│  Vacancies                                                           │
│                                                                      │
│  ALL (12)  OPEN (9)  CLOSED (3)   [🔍 Search…]    [ New vacancy ]    │
│  ══════════                                                          │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Title              │ Interviewer │ Length │ Candidates │Status│⋮│  │
│  ├────────────────────┼─────────────┼────────┼────────────┼──────┼─┤  │
│  │ Senior React Eng.  │ Pat Owner   │ 60 min │     12     │ Open │⋮│  │
│  │ ▌React ▌Senior     │             │        │            │      │ │  │
│  ├────────────────────┼─────────────┼────────┼────────────┼──────┼─┤  │
│  │ .NET Engineer      │ Sam Manager │ 45 min │      3     │Closed│⋮│  │
│  │ ▌Asp.Net ▌Middle   │             │        │            │      │ │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

- Page title "Vacancies". Everything that acts on the whole list — the status tabs, the search
  and "New vacancy" — sits in the toolbar beneath it (§07.18).
- Each tab carries its own count, computed under the search and not under the tab (§07.20).
- Category chips sit under the title, in the same cell.
- Rows link to the vacancy detail page; the trailing "⋮" holds the row's six actions (§07.22)
  and never navigates.
- Empty state: "No vacancies yet." when the organization has none, "No vacancies match these
  filters." when a search emptied the list (§07.21).

### Vacancy — the header and its board

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ‹ Vacancies                                                                 │
│  Senior React Engineer  [Open]            [ Copy booking link ]        [⋮]   │
│  ▌React ▌Senior · Pat Owner · 60 min · times in Europe/Minsk                  │
│  We're looking for an engineer who…                                          │
│  View more                                                                   │
│ ┌─Scheduled 4─┐ ┌─Didn't pass 7┐ ┌─Maybe 2─────┐ ┌─Passed 3────┐ ┌─Offer 1──┐│
│ │┌───────────┐│ │┌────────────┐│ │┌───────────┐│ │┌───────────┐│ │┌────────┐││
│ ││Jane Doe   ││ ││Ann Lee   ⚑ ││ ││Ivan Petrov││ ││Mia Chen   ││ ││Lev Orlov││
│ │└───────────┘│ │└────────────┘│ │└───────────┘│ │└───────────┘│ │└────────┘││
│ └─────────────┘ └──────────────┘ └─────────────┘ └─────────────┘ └──────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

- One route, one screen (§08.27). The header is fixed; the columns scroll inside what is left.
- `‹ Vacancies` is a real link to the list, not a button that navigates.
- The booking link is the **button**, not text on the page (§08.28). It is disabled on a closed
  vacancy, with the note that says why directly beneath the meta line (§08.31).
- The meta line is `categories · interviewer · length · times in {zone}`. The zone is the board's
  ([05 §05](05-board.md)) and is named here, once, rather than on every card.
- The description is clamped to three lines; `View more` appears only when the clamp cuts
  (§08.29). A vacancy without one offers `Add a description` in its place (§08.30).
- "⋮" holds "Open booking page", "Edit vacancy", "Close vacancy" / "Reopen vacancy", and "Delete vacancy" (disabled
  when the vacancy has applications, with the reason drawn in the row itself — §07.23).

### New / Edit vacancy dialog

```
┌──────────────────────────────────────────────┐
│  New vacancy                                 │
│                                              │
│  Title                                       │
│  [__________________________________]        │
│  Categories                                  │
│  [ React ×] [ Senior ×] [type to add…    ]   │
│  Interviewer                                 │
│  [ Pat Owner                        ▾]       │
│    Sam Manager                               │
│    Alex Kaminski — No Microsoft 365 mailbox  │  ← disabled
│  Interview length                            │
│  ( )15  ( )30  ( )45  (•)60  minutes         │
│  Description                                 │
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
5. On success the dialog closes, the browser navigates to the new vacancy's screen, and a toast
   there reads "Vacancy created" once. Nothing on the screen prints the link; the header's button
   copies it (§08.28).

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
      "applicationCount": 12, "scheduledCount": 4, "deletable": false,
      "createdAt": "2026-08-01T09:12:00.000Z" }
  ],
  "statusCounts": { "all": 12, "open": 9, "closed": 3 },
  "total": 12
}
```

- `applicationCount` and `scheduledCount` count **people a member can still open**: an application
  whose candidate has been deleted is in neither ([03 §11.63](03-candidate-database.md)).
- `deletable` is whether `DELETE` will accept this vacancy (§03.11) — the server's own rule rather
  than a number to re-derive it from. It is `false` whenever *any* application exists, deleted
  candidates included, so a vacancy can read `0 candidates` and still not be deletable.
- **Three numbers, three questions** (§07.19–21). `vacancies` is what the tab *and* the search
  select. `statusCounts` is what each tab would select **under the same search**, so a label never
  promises rows its own tab would not show — it is narrowed by `search` and never by `status`.
  `total` is the organization's whole library, narrowed by nothing, because it is the only thing
  that separates "no vacancies yet" from "this search found none".
- `statusCounts.all` is `open + closed`; there is no third status, and no vacancy is excluded
  from it.

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
  Raised by any application at all, including one whose candidate has been deleted — which is what
  `deletable` reports, and why the screen reads that rather than `applicationCount` (§03.11).

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
| Toast — created | "Vacancy created" |
| Toast — updated | "Vacancy updated" |
| Toast — closed | "Vacancy closed" |
| Toast — reopened | "Vacancy reopened" |
| Toast — link copied | "Booking link copied" |
| Empty list | "No vacancies yet." |
| Load failed | "We couldn't load vacancies. Try again." |
| Network error | "Something went wrong. Please try again." |

## UI Notes

- Page header title "Vacancies", with no action of its own — the status tabs, the search and
  "New vacancy" all live in the toolbar beneath it (§07.18). The vacancy screen has no page header
  at all: a back link, the title with its status badge, the booking-link button and the kebab
  (§08.28).
- Category chips are read-only on the list and in the vacancy's meta line, editable only in the
  dialog.
- The booking link is a **button** on the vacancy screen, disabled for a closed vacancy and
  explained by the note beneath the meta line (§08.31).
- Data refresh: refetch after every mutation. No optimistic updates. A refetch over rows already
  on screen dims them rather than replacing them with a loader. The board is the one exception,
  and it is [05](05-board.md)'s: a drag is applied optimistically and reverted on failure.
- Both screens announce with **toasts**. The vacancy screen's banner slot went with the fold-in:
  the header is fixed and the board owns the height beneath it, so an announcement in the flow
  would take a row of cards to say "Vacancy closed". The board's own load failure is a toast as
  well, and because it is a state rather than an event the region it stands in for shows an empty
  state carrying the retry, so the way back does not leave with the toast ([05 §UI Notes](05-board.md)).
- The list's first load, its empty state and its failed load stand on the page's own ground; the
  list's card is drawn only around rows, as the candidate database's is
  ([03 §05.23](03-candidate-database.md)). The vacancy screen's own first load and failed load
  take the same shape: no header is drawn until the record arrives, and a load that fails is
  announced by a toast with the retry left standing where the screen would be.
- `?created=1` is consumed on arrival — the toast is raised once and the query is stripped, so a
  reload of a kept address does not re-announce a create that happened yesterday.
- Required `data-testid` attributes:
  - `vacancies-list`, `vacancies-search-input`, `vacancies-status-tabs`,
    `vacancies-status-{all|open|closed}`, `vacancy-new-button`
  - `vacancy-row-{id}`, `vacancy-title-{id}`, `vacancy-interviewer-{id}`, `vacancy-duration-{id}`,
    `vacancy-count-{id}`, `vacancy-status-{id}`, `vacancy-category-chip-{id}`
  - `vacancy-actions-menu-{id}` and its rows
    `vacancy-action-{board|copy-link|open-booking|edit|close|reopen|delete}-{id}`,
    with `vacancy-copy-guard-message-{id}` and `vacancy-delete-guard-message-{id}` for the two
    blocked reasons
  - `vacancy-close-confirm`, `vacancy-close-confirm-button`
  - `vacancy-dialog`, `vacancy-title-input`, `vacancy-interviewer-select`,
    `vacancy-interviewer-option-{accountId}`, `vacancy-duration-{minutes}`,
    `vacancy-categories-input`, `vacancy-description-input`, `vacancy-submit-button`,
    `vacancy-cancel-button`
  - `vacancy-detail`, `vacancy-back-link`, `vacancy-copy-link-button`, `vacancy-detail-categories`,
    `vacancy-description`, `vacancy-description-toggle`, `vacancy-add-description`,
    `vacancy-closed-link-note`,
    `vacancy-actions-menu`, `vacancy-action-open-booking`, `vacancy-action-edit`,
    `vacancy-action-close`, `vacancy-action-reopen`, `vacancy-action-delete`
  - `vacancy-reassign-confirm`, `vacancy-delete-confirm`, `vacancy-delete-confirm-button`,
    `vacancy-delete-guard-message`
  - `toast-vacancy-created`, `toast-vacancy-updated`, `toast-vacancy-closed`,
    `toast-vacancy-reopened`, `toast-vacancy-deleted`, `toast-link-copied`,
    `toast-link-copy-failed`
  - `vacancies-empty-state`, `vacancies-loading`, `vacancies-error`, `vacancies-retry`,
    `toast-vacancies-load-failed`
  - `vacancy-loading`, `vacancy-load-error`, `vacancy-load-retry`, `toast-vacancy-load-failed`
  - `vacancy-dialog-error`
- **Covered elsewhere.** The failed load and the loader standing on the page's own ground are
  the same mechanism every hiring screen draws from the same component, tested once on the
  cheapest page that exercises it: [03 TC-H03-E2E-11](03-candidate-database.md). This spec adds
  no case for them; TC-H01-E2E-01 asserts the empty state's ground.

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
  5. On the vacancy screen, click "Copy booking link".
- **Expected Result:**
  0. On arrival, before step 1's click, the organization has no vacancies: the empty state stands
     on the page's own ground, and no list card is drawn around it.
  1. After step 4 the dialog closes, "Vacancy created" appears **once**, and the vacancy opens —
     header, meta line and its (empty) board on one route.
  2. After step 5, "Booking link copied" appears and the clipboard holds the title's slug plus a
     random suffix. Nothing on the page prints the link (§08.28), so the clipboard is where it is
     read from.
- **Selectors:** `vacancy-new-button`, `vacancy-dialog`, `vacancy-title-input`, `vacancy-interviewer-select`, `vacancy-duration-60`, `vacancy-categories-input`, `vacancy-submit-button`, `toast-vacancy-created`, `vacancy-copy-link-button`, `toast-link-copied`, `vacancies-empty-state`, `vacancies-list` (asserted absent beside it).

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
  1. Open the vacancy, open the actions menu, choose "Close vacancy", confirm.
  2. Open the booking link in a new context.
  3. Return and reload.
- **Expected Result:**
  1. Status reads Closed; "Vacancy closed" appears; `Copy booking link` is disabled and the note
     beneath the meta line says what closing did and did not do (§08.31).
  2. The public page shows the wordmark, the title, and the not-accepting message — no calendar, no form.
  3. The scheduled candidate is still in Scheduled — on the same screen, which is what the third
     step used to have to navigate to (§08.27).
- **Selectors:** `vacancy-actions-menu`, `vacancy-action-close`, `vacancy-close-confirm-button`, `vacancy-status-{id}`, `vacancy-copy-link-button`, `vacancy-closed-link-note`, `booking-closed-message`, `board-column-count-scheduled`.

### TC-H01-E2E-04: Delete is disabled once a vacancy has candidates
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a vacancy with at least one application.
- **Steps:**
  1. Open the vacancy and open the actions menu.
- **Expected Result:**
  1. "Delete vacancy" is present but disabled and still focusable, describing itself with "Close this vacancy instead — it has candidates" drawn in the row.
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

### TC-H01-E2E-08: The vacancy is one screen — a header, a clamped description, and the board
- **Level:** E2E
- **Preconditions:** logged in as `admin`; one vacancy with a long description and a scheduled
  candidate, and one with no description at all.
- **Steps:**
  1. Open the wordy vacancy.
  2. Activate "View more", then measure the description.
  3. Open the vacancy with no description and activate "Add a description".
  4. Save a one-line description.
  5. Activate the back link.
- **Expected Result:**
  1. The board is on this route, under the header, holding the candidate.
  2. The description is cut at three lines and says so; expanded, it is no taller than a fifth of
     the viewport and the board is still visible (§08.29).
  3. Step 3 opens the edit dialog (§08.30).
  4. After step 4 the description is drawn and **no** toggle is: one line is not three, so nothing
     was cut and there is nothing to expand.
  5. The back link carries a real `href` to the list and lands on it (decisions §56).
- **Selectors:** `vacancy-description`, `vacancy-description-toggle`, `vacancy-add-description`, `vacancy-back-link`, `board`, `board-column-count-scheduled`.

### TC-H01-E2E-09: The old board address forwards to the vacancy
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a vacancy with one card on its board.
- **Steps:**
  1. Navigate directly to `/org/{orgId}/hiring/vacancies/{vacancyId}/board`.
- **Expected Result:**
  1. The address bar reads the vacancy route — the redirect is the server's, so the route it left
     is never rendered.
  2. The header and the card are both on screen.
- **Selectors:** `vacancy-detail`, `board-card-{applicationId}`.

### TC-H01-INT-09: The tab counts follow the search and ignore the tab
- **Level:** Integration
- **Preconditions:** an organization with two open vacancies and one closed one; two of the three
  titles contain "React".
- **Steps:**
  1. `GET …/hiring/vacancies` with no query.
  2. `GET …/hiring/vacancies?status=open`.
  3. `GET …/hiring/vacancies?search=react`.
  4. `GET …/hiring/vacancies?search=nothing here`.
- **Expected Result:**
  1. `statusCounts` is `{ all: 3, open: 2, closed: 1 }` and `total` is `3`.
  2. The rows narrow to two; `statusCounts` is unchanged — the applied tab never narrows its own
     label or its siblings'.
  3. `statusCounts` is `{ all: 2, open: 1, closed: 1 }` — the search applies to every tab — while
     `total` stays `3`.
  4. The rows are empty and every count is `0`, and `total` is still `3`, so the screen says "no
     match" rather than "no vacancies".
  5. An organization with nothing in it reads `0` in all four numbers, and one organization's
     counts never include another's.

### TC-H01-E2E-06: Status is a tab strip that says how many each tab holds
- **Level:** E2E
- **Preconditions:** logged in as `admin`; two open vacancies and one closed one, two titles
  containing "React".
- **Steps:**
  1. Open the vacancies list and read the three tabs.
  2. Search "react".
  3. Press `Open`.
  4. Search something that matches nothing.
- **Expected Result:**
  1. `All (3)`, `Open (2)`, `Closed (1)`.
  2. The list shows both React vacancies and the labels become `All (2)`, `Open (1)`, `Closed (1)`.
  3. Only the open React vacancy is listed, and `Closed (1)` is unchanged.
  4. The empty state reads "No vacancies match these filters." — not "No vacancies yet."
- **Selectors:** `vacancies-status-{all|open|closed}`, `vacancies-search-input`, `vacancies-list`,
  `vacancies-empty-state`.

### TC-H01-E2E-07: A row acts without being opened
- **Level:** E2E
- **Preconditions:** logged in as `admin`; one open vacancy with no applications and one with a
  scheduled interview.
- **Steps:**
  1. Open the first row's actions menu.
  2. Copy the booking link.
  3. Open the second row's menu and inspect "Delete vacancy".
  4. Close the second vacancy from its row.
  5. Reopen its menu and inspect "Copy booking link".
  6. Edit the first vacancy from its row and save.
  7. Delete the first vacancy from its row.
- **Expected Result:**
  1. The menu opens and the browser stays on the list — pressing the menu is not pressing the row.
  2. "Booking link copied" is raised as a toast and the absolute URL is on the clipboard.
  3. "Delete vacancy" is present, `aria-disabled`, focusable, and describes itself with "Close
     this vacancy instead — it has candidates".
  4. The confirmation names what closing leaves alone — "1 scheduled interview stands, and the
     board keeps working." — the status badge becomes Closed, and `Closed (1)` follows it.
  5. "Copy booking link" is present and disabled, describing itself with "This link is no longer
     accepting bookings."
  6. The create/edit dialog opens over the list, "Vacancy updated" is raised, and the list
     refetches without navigating.
  7. The confirmation names the vacancy, "Vacancy deleted" is raised, the row leaves the list and
     `All (n)` drops by one.
- **Selectors:** `vacancy-actions-menu-{id}`, `vacancy-action-{board|copy-link|edit|close|delete}-{id}`,
  `vacancy-copy-guard-message-{id}`, `vacancy-delete-guard-message-{id}`, `vacancy-close-confirm`,
  `vacancy-delete-confirm`, `toast-link-copied`, `toast-vacancy-closed`, `toast-vacancy-deleted`.
