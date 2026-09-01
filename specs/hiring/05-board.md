---
id: "05"
title: Board
routes: ["/org/{orgId}/hiring/vacancies/{vacancyId}"]
api: ["GET /api/organizations/{orgId}/hiring/vacancies/{vacancyId}/board", "PATCH /api/organizations/{orgId}/hiring/applications/{applicationId}/placement"]
entities: [Application]
tags: [board, kanban, drag-drop, status, position, columns, last-write-wins]
depends-on: ["01", "02", "07"]
---

# 05 — Board

## Summary

One board per vacancy: a five-column kanban of everyone who has applied to it. Everyone who books
lands in `Scheduled` automatically. Cards move freely between columns and are ordered by hand
within one.

The board column **is** the application's status. There is one field, not a column and a mirrored
status that can drift apart.

**The board is not a screen of its own.** It is drawn under the vacancy's header, on the vacancy's
own route ([01 §08.27](01-vacancies.md)) — `…/hiring/vacancies/{vacancyId}` — and
`…/{vacancyId}/board` redirects there. Nothing below changed with the move: the columns, the
ordering, the drag model, the concurrency answer and the permissions are all about the board and
not about the page it was on. What the move settled is the **height**: the screen owns the
viewport, the header stays put, and the columns scroll inside what is left of it — §08.28.

## Actors & Preconditions

- **Actors:** `admin` and `manager`. Interviewers who are only `user` do **not** reach the board —
  they reach their own candidates through the `Assigned to me` scope of the candidate database
  ([03 §08](03-candidate-database.md)) and the card ([04](04-candidate-card.md)).
- **Preconditions:** a vacancy in the caller's organization.

## Functional Requirements

### 01. Columns

1. The columns are fixed and not configurable:

   | Column | `Application.status` | Entered by |
   |---|---|---|
   | Scheduled | `scheduled` | automatically, on booking |
   | Didn't pass | `didnt_pass` | dragging |
   | Maybe | `maybe` | dragging |
   | Passed | `passed` | dragging |
   | Offer | `offer` | dragging |

2. `Application.status` is the column. The card's status shown anywhere else — the candidate
   database, the card itself — reads this same field. There is no second status to keep in sync.
3. Each column shows its name and a count.

### 02. Movement

4. **Any column to any column.** No transition is forbidden and no ordering of columns is enforced.
   Hiring is not a state machine: a candidate parked in `Maybe` moves to `Passed` when a stronger
   candidate declines, and a `Didn't pass` may be revisited. Any guard written here would be fought
   within a month.
5. A card may also be **reordered within its column** by dragging.
6. A drop that lands a card back in its original column and position is a no-op and issues no
   request.

### 03. Ordering

7. Ordering is by `Application.position` ascending, with `id` as a stable tiebreak so a collision
   never causes flicker.
8. `position` is a gap integer scoped to `(vacancyId, status)`. Columns number independently,
   starting at multiples of 1000.
9. A drop between two cards writes **one row**: `position = (above + below) / 2`.
10. When a gap closes to less than 2, that one column is rebalanced back to clean multiples of
    1000. On a board of tens of cards this is a single inexpensive update.
11. A card dropped at the top of a column takes `min(position) - 1000`; at the bottom,
    `max(position) + 1000`. An empty column takes `1000`.
12. **A new booking is inserted at the top of `Scheduled`** ([02 §07.28](02-booking-page.md)).
    Because ordering is manual rather than by interview time, a new applicant interviewing tomorrow
    can otherwise sit below one interviewing next month; top-insertion at least guarantees new
    applicants are visible rather than below the fold.

### 04. Concurrency

13. **Last write wins.** Two people reordering the same column simultaneously may produce an order
    neither intended. This matches user-management spec 04's stated posture — no optimistic
    concurrency and no conflict detection — and no locking scheme is introduced for this screen.
14. The board refetches after every successful move. Moves are applied optimistically in the UI and
    reverted if the request fails.

### 05. Cards

15. A card shows the candidate's name, the interview date and time, a CV affordance, and the
    cancelled mark when set.
16. Times render in the **viewing member's** time zone (`Account.timezone`), falling back to the
    interviewer's mailbox zone when it is null. The zone is named on the board once, not on every
    card.
17. Criteria are deliberately **not** on the card — they are the wrong grain for it, and
    [03](03-candidate-database.md) is the screen for comparing across them.
18. An interview whose start time has passed stays in whatever column it is in. There is no
    automatic movement, and no separate "past" treatment beyond the date reading as past.
19. Opening a card navigates to [04](04-candidate-card.md). It is a real page, not a modal over the
    board — it must be linkable from a calendar invite, and an intercepting-route modal is a lot of
    machinery for one screen. The card it opens carries a back link reading **`Board`**, returning
    to this vacancy ([04 §01.8](04-candidate-card.md)); the screen records that while it is on
    display, so every column and every card share one way back rather than each carrying its own.
20. A **deleted candidate** ([03 §11](03-candidate-database.md)) has no card here, and their
    application is not counted in its column's header. The application itself is untouched and
    keeps its `status` and its `position`, so it reappears exactly where it was if the same address
    books again — nothing is renumbered while it is away, and nothing has to be put back. Gap
    integers make that free: the neighbours' positions never depended on it being there.

### 06. Conclusion Prompt

20. Dropping a card into **Didn't pass** or **Offer** completes the move immediately and then opens
    that card with the Conclusion field focused.
21. The drag is **never blocked** and the conclusion is **never required**. Requiring it would turn
    a drag into a modal, and the point of the board is that dragging is instant. The prompt is
    dismissible; the move stands either way.
22. Cards in `Didn't pass` or `Offer` with an empty conclusion carry a small marker, so the gaps
    can be found later.

### 07. Cancellation

23. `Application.isCancelled` is a **flag**, not a sixth column. A cancelled card keeps its column
    and its recorded assessment and is visibly marked.
24. **The flag is set by [07-manage-booking.md](07-manage-booking.md)**, from either side: the
    candidate cancels from their manage page, the team from the candidate card or the candidate
    database's row menu.
    Earlier revisions of this spec said nothing set it — that was true only while both flows were
    deferred, and the field was specified in advance precisely so their arrival could not invent a
    sixth column and strand the assessment already recorded.
25. **Cancellation is still never a substitute for a verdict.** It means the interview did not take
    place and says nothing about the candidate's standing; a cancelled candidate remains a live
    applicant and may book again. A **no-show remains a drag to `Didn't pass`** — the flag cannot be
    set retroactively, because both surfaces withdraw their actions once `start` has passed.
26. The card's cancelled mark **names who cancelled** — see
    [05-board.design.md](05-board.design.md). "The candidate withdrew" and "we called it off" are
    different facts to a hiring manager scanning a column, and the record now distinguishes them.

### 08. Volume

27. No archiving, filtering, or date-bounding of the board ships in this release. Columns scroll
    independently. After several hiring rounds `Didn't pass` will hold dozens of cards; the fix is
    in the README's Future Improvements, deliberately, rather than a "hide old cards" checkbox
    bolted on here.
28. **The columns' height is the screen's, not a subtraction.** The board fills the region the
    vacancy's header leaves it, and every column fills the board — so a long column scrolls
    against the bottom of the window rather than against a number.

    While the board was a page of its own it had no such region to fill, and the columns were
    capped by `100vh` minus the navbar, minus the shell's padding, minus a hand-counted allowance
    for the page header. That arithmetic was correct and had to be re-counted every time anything
    above it changed. The fold-in ([01 §08.27](01-vacancies.md)) replaced it with a fact the
    layout already knows.

## Screens

### Board

Drawn under the vacancy's header, on the vacancy's own route — see
[01 §Screens](01-vacancies.md) for the header above it.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Senior React Engineer  [Open]   ▌React · Pat Owner · 60 min · Europe/Minsk   │
│                                                                               │
│ ┌─Scheduled 4─┐ ┌─Didn't pass 7┐ ┌─Maybe 2─────┐ ┌─Passed 3────┐ ┌─Offer 1───┐│
│ │┌───────────┐│ │┌────────────┐│ │┌───────────┐│ │┌───────────┐│ │┌─────────┐││
│ ││Jane Doe   ││ ││Ann Lee   ⚑ ││ ││Ivan Petrov││ ││Mia Chen   ││ ││Lev Orlov│││
│ ││26 Aug 14:00│ ││18 Aug 11:00││ ││20 Aug 09:00│ ││21 Aug 15:00│ ││22 Aug   │││
│ ││📄 CV      ││ ││📄 CV       ││ ││📄 CV      ││ ││📄 CV      ││ ││📄 CV    │││
│ │└───────────┘│ │└────────────┘│ │└───────────┘│ │└───────────┘│ │└─────────┘││
│ │┌───────────┐│ │┌────────────┐│ │             │ │             │ │           ││
│ ││Tom Fisher ││ ││Raj Kumar   ││ │             │ │             │ │           ││
│ │└───────────┘│ │└────────────┘│ │             │ │             │ │           ││
│ └─────────────┘ └──────────────┘ └─────────────┘ └─────────────┘ └───────────┘│
└───────────────────────────────────────────────────────────────────────────────┘
```

- `⚑` marks a card in Didn't pass or Offer with no conclusion recorded.
- The time zone is named once, in the vacancy's meta line above the columns — never per card.
- Empty column: "Nothing here yet."
- Empty board: "No candidates yet. Share the booking link to start." The action it names is the
  `Copy booking link` button already in the header, so the empty state says what is missing and
  does not draw a second copy of the button two lines under the first.

## Flows

### Flow: move a card between columns

1. Member drags a card from one column to a position in another.
2. UI applies the move optimistically.
3. System sends `PATCH …/applications/{id}/placement` with the target status and neighbouring
   positions.
4. On success the board refetches. On failure the card returns to its original place and an error
   toast appears.

### Flow: move a card to Didn't pass

1. As above.
2. On success the card's page opens with the Conclusion field focused.
3. Member types a reason and it autosaves ([04 §04](04-candidate-card.md)), or dismisses — the move
   stands either way.

### Flow: reorder within a column

1. Member drags a card to a new position in the same column.
2. System sends the same `PATCH` with an unchanged status and the new neighbours.
3. Exactly one row is written unless a rebalance is triggered.

### Alt flow: two people move the same card

- Both requests succeed; the later one wins. The board refetches after each, so both members
  converge on the same final state — which may not be what either intended. This is accepted.

## API Contracts

### GET /api/organizations/{orgId}/hiring/vacancies/{vacancyId}/board

Response `200`:
```json
{
  "vacancy": { "id": "uuid", "title": "Senior React Engineer", "durationMinutes": 60 },
  "viewerTimeZone": "Europe/Minsk",
  "columns": [
    { "status": "scheduled", "count": 4, "cards": [
      { "applicationId": "uuid", "candidateId": "uuid", "name": "Jane Doe",
        "startUtc": "2026-08-26T11:00:00.000Z", "position": 1000,
        "hasCv": true, "isCancelled": false, "hasConclusion": false }
    ]},
    { "status": "didnt_pass", "count": 7, "cards": [] }
  ]
}
```

- Every column is present, in the documented order, even when empty.
- `hasConclusion` drives the missing-conclusion marker; the conclusion text itself is not sent to
  the board.

Errors: `403` for `user`/`viewer`; `404` when the vacancy is not in this organization.

### PATCH /api/organizations/{orgId}/hiring/applications/{applicationId}/placement

Request:
```json
{ "status": "maybe", "afterApplicationId": "uuid|null", "beforeApplicationId": "uuid|null" }
```

- `afterApplicationId` is the card immediately above the drop point; `beforeApplicationId` the one
  below. Both `null` means an empty column.
- The server computes `position` from the neighbours' current values, rather than trusting a
  position sent by the client — otherwise a stale board could write a position that has since been
  reused.

Success `200`: `{ "applicationId": "uuid", "status": "maybe", "position": 1500 }`

Errors:
- `403` — caller is `user`/`viewer`.
- `404` — application not in this organization.
- `422` — `{ error: "invalid_status" }` for a status outside the five.
- `409` — `{ error: "stale_neighbours" }` when a named neighbour no longer sits in the target
  column; the client refetches and the member retries.

## Validation Rules

1. `status` must be one of `scheduled`, `didnt_pass`, `maybe`, `passed`, `offer`.
2. Neighbour ids, when present, must be applications on the same vacancy and in the target column.
3. `position` is never accepted from the client.
4. Rebalancing is a server-side concern, triggered when the computed gap falls below 2, and is
   applied in the same transaction as the move.

## Error Messages

| Context | Message |
|---|---|
| Move failed | "Couldn't move that card. Please try again." |
| Stale board | "This board changed. Refreshing…" |
| Forbidden | "You do not have permission to manage candidates" |
| Empty column | "Nothing here yet." |
| Empty board | "No candidates yet. Share the booking link to start." |
| Missing conclusion marker (tooltip) | "No conclusion recorded" |

## UI Notes

- Columns are horizontally scrollable as a group on narrow viewports; each column scrolls
  vertically on its own. The page body never scrolls horizontally, and the group's own container
  scrolls only sideways — the columns already scroll down, and two nested vertical scrollbars for
  one list of cards is one too many.
- Drag is pointer and keyboard operable: a card can be picked up with `Space`, moved with arrow
  keys, and dropped with `Space`, with the current target announced.
- Required `data-testid` attributes:
  - `board`, `board-timezone`
  - `board-column-{status}`, `board-column-count-{status}`, `board-column-empty-{status}`
  - `board-card-{applicationId}`, `board-card-name-{applicationId}`,
    `board-card-when-{applicationId}`, `board-card-cv-{applicationId}`,
    `board-card-cancelled-{applicationId}`, `board-card-no-conclusion-{applicationId}`
  - `board-empty-state`, `board-loading`, `board-load-error`, `board-load-retry`,
    `board-live-region`, `toast-move-failed`, `toast-board-stale`
- A failed **move** is a toast; a board that could not be **read** keeps its place in the flow with
  a retry. The first is an event that is over, the second is a state that is still true, and a
  message that timed out over an empty region would leave nothing saying why it is empty.

## Out of Scope

- Configurable, renameable, or reorderable columns.
- Per-column WIP limits.
- Bulk moves or multi-select.
- Archiving, or filtering the board by date — see the README.
- A cancelled column, and any UI that sets `isCancelled` — see requirement 24.
- Automatic movement when an interview's start time passes.
- Comments or activity history on a card.

## Test Cases

### TC-H05-UNIT-01: Position between two neighbours takes the midpoint
- **Level:** Unit
- **Preconditions:** a column with positions 1000, 2000, 3000.
- **Steps:**
  1. Compute a position between 1000 and 2000.
  2. Compute a position at the top.
  3. Compute a position at the bottom.
  4. Compute a position in an empty column.
- **Expected Result:**
  1. `1500`.
  2. `0` — one gap above the minimum.
  3. `4000`.
  4. `1000`.

### TC-H05-UNIT-02: A closed gap triggers a column rebalance
- **Level:** Unit
- **Preconditions:** adjacent positions 1000 and 1001 in one column.
- **Steps:**
  1. Compute a position between them.
- **Expected Result:**
  1. A rebalance is signalled rather than a fractional or duplicate position being returned.
  2. After rebalancing, the column's positions are clean multiples of 1000 in the same relative order.

### TC-H05-UNIT-03: Ordering is stable when positions collide
- **Level:** Unit
- **Preconditions:** two cards in one column that both ended up at position 2000.
- **Steps:**
  1. Sort the column twice.
- **Expected Result:**
  1. Both sorts produce the same order, broken by `id`.
  2. No card changes place between renders.

### TC-H05-INT-01: Every transition between the five columns is permitted
- **Level:** Integration
- **Preconditions:** one application in `scheduled`.
- **Steps:**
  1. Move it through every ordered pair of the five statuses, including backwards.
- **Expected Result:**
  1. Every move succeeds.
  2. `Application.status` matches the target after each, and no transition is rejected.

### TC-H05-INT-02: A move writes one row and leaves other columns untouched
- **Level:** Integration
- **Preconditions:** a board with three cards in `scheduled` and two in `maybe`, positions spread.
- **Steps:**
  1. Move the middle `scheduled` card between the two `maybe` cards.
  2. Inspect every application's position.
- **Expected Result:**
  1. Only the moved application changed, taking the midpoint of its new neighbours.
  2. No rebalance occurred and no other row was rewritten.

### TC-H05-INT-03: Position is never accepted from the client
- **Level:** Integration
- **Preconditions:** a board with several cards.
- **Steps:**
  1. `PATCH` a placement with an extra `position` field set to a value that would jump the card to the top.
- **Expected Result:**
  1. The supplied value is ignored.
  2. The resulting position is derived from the named neighbours.

### TC-H05-INT-04: A stale neighbour is rejected rather than silently mispositioned
- **Level:** Integration
- **Preconditions:** card X sits in `maybe`; another session moves X to `passed`.
- **Steps:**
  1. `PATCH` a placement naming X as the neighbour within `maybe`.
- **Expected Result:**
  1. Rejected `409` `stale_neighbours`; no position is written.

### TC-H05-INT-05: A new booking lands at the top of Scheduled
- **Level:** Integration
- **Preconditions:** a vacancy whose `scheduled` column already holds two cards.
- **Steps:**
  1. Book a new interview through the public endpoint.
  2. Read the `scheduled` column in order.
- **Expected Result:**
  1. The new application is first.
  2. The existing two keep their relative order and their positions.

### TC-H05-INT-06: user and viewer cannot read or move cards
- **Level:** Integration
- **Preconditions:** callers as `viewer`, as an unassigned `user`, and as a `user` who is the interviewer on this vacancy.
- **Steps:**
  1. As each, `GET` the board and `PATCH` a placement.
- **Expected Result:**
  1. All three are rejected — the board is `admin`/`manager` only.
  2. The interviewer's rejection is a `404`, not a `403`, so the board's existence is not confirmed to them.

### TC-H05-E2E-01: Drag a card to another column and back
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a board with a card in `Scheduled`.
- **Steps:**
  1. Drag the card to `Maybe`.
  2. Drag it back to `Scheduled`.
- **Expected Result:**
  1. The card renders in `Maybe`, both column counts update, and the change survives a reload.
  2. The reverse move also succeeds — no transition is blocked.
- **Selectors:** `board-column-scheduled`, `board-column-maybe`, `board-card-{applicationId}`, `board-column-count-maybe`.

### TC-H05-E2E-02: Dropping into Didn't pass opens the card with Conclusion focused
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a card in `Scheduled`.
- **Steps:**
  1. Drag the card into `Didn't pass`.
  2. Dismiss without typing, and return to the board.
- **Expected Result:**
  1. The move completes first, then the card page opens with the Conclusion field focused.
  2. After dismissing, the card is still in `Didn't pass` and carries the missing-conclusion marker.
- **Selectors:** `board-column-didnt_pass`, `card-conclusion-input`, `board-card-no-conclusion-{applicationId}`.

### TC-H05-E2E-03: Reorder within a column and reload
- **Level:** E2E
- **Preconditions:** logged in as `admin`; three cards in one column.
- **Steps:**
  1. Drag the third card above the first.
  2. Reload the board.
- **Expected Result:**
  1. The order changes immediately.
  2. The new order persists across the reload.
- **Selectors:** `board-column-scheduled`, `board-card-{applicationId}`.

### TC-H05-E2E-04: The board is keyboard operable
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a board with cards in two columns.
- **Steps:**
  1. Focus a card and press `Space` to pick it up.
  2. Use arrow keys to move it to the adjacent column.
  3. Press `Space` to drop.
- **Expected Result:**
  1. The pick-up, the current target, and the drop are each announced.
  2. The card lands in the target column and the change persists.
- **Selectors:** `board-card-{applicationId}`, `board-column-maybe`.
