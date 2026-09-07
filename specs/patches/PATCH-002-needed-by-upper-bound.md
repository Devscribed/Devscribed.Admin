---
id: "PATCH-002"
title: A needed-by date more than five years out is refused
surface: validation
supersedes: requests/01
requirement: 8
cases: [TC-01-UNIT-07, TC-01-INT-23]
files: 2
---

## Why

`neededBy` is bounded below and not above: requirement 8 refuses a date before today at
creation and accepts everything after it. The needed-by control in the New request modal is a
native `<input type="date">`, whose year segment accepts six digits, so a slipped keystroke
produces a request needed in the year 232131 and the form takes it as far as a message that
says only "Enter a valid date". A deadline is a working date, not an astronomical one; this
note puts a ceiling on it and gives the refusal its own words.

## The rule

`neededBy` on a request is an optional ISO `YYYY-MM-DD` date. At creation it may be no earlier
than today in the caller's timezone and no later than **five years after that day**. On edit
it may be any date up to the same ceiling — the lower bound stays absent on edit, because a
date already set may pass while the request is open and that is what makes a request overdue.

Stated as the rules the validator holds, replacing requirement 8 of `specs/requests/01-requests`
in full:

> WHERE `neededBy` is absent, empty or `null`, THE SYSTEM SHALL accept the body and store no
> date.
>
> IF `neededBy` is not a string in strict `YYYY-MM-DD` form naming a real calendar day, THEN
> THE SYSTEM SHALL refuse it with `REQUEST_MESSAGES.neededByInvalid`.
>
> IF `neededBy` is earlier than today in the caller's timezone **and the call is a creation**,
> THEN THE SYSTEM SHALL refuse it with `REQUEST_MESSAGES.neededByPast`.
>
> IF `neededBy` is later than five years after today in the caller's timezone, THEN THE SYSTEM
> SHALL refuse it with `REQUEST_MESSAGES.neededByTooFar`, on creation and on edit alike.

The ceiling is computed from the same `today` the lower bound already uses — the caller's
timezone, passed in, so the validator stays pure — by adding five to its year and keeping the
month and day. A 29 February ceiling therefore lands on 1 March of a non-leap year, which is
the ordinary consequence of adding a year to that date and needs no rule of its own; it moves
the ceiling by one day and refuses nothing a person would type.

**Order of refusals.** Shape first, then the lower bound, then the ceiling — so a six-digit
year, which is not strict `YYYY-MM-DD`, is still `neededByInvalid` and never
`neededByTooFar`. Only a well-formed date past the ceiling reads the new message.

**What it looks like when it is wrong.** `400` with the field error under `neededBy` and the
message "The date needed cannot be more than five years away". On the New request modal that is
the line under the Needed by control, and the modal stays open with every typed value intact.

**What stays untouched.** The lower bound and its message. The absence of the lower bound on
edit. Every stored `neededBy` — no row is re-validated on read, so a request already holding a
date beyond the ceiling stays readable, stays listable and stays overdue-computable exactly as
it does today; only a call that *writes* such a date is refused. `isRequestOverdue` is not
touched.

## Contracts

| Message | Route | Where |
|---|---|---|
| `REQUEST_MESSAGES.neededByTooFar` — "The date needed cannot be more than five years away" | `POST …/requests`, `PATCH …/requests/{requestId}` | `packages/validation/src/index.ts`, on the existing `REQUEST_MESSAGES` const |

| Export | Where | Notes |
|---|---|---|
| `REQUEST_NEEDED_BY_MAX_YEARS = 5` | `packages/validation/src/requests.ts` | The ceiling's span, named once so the validator and any control that bounds itself read the same number |
| `requestNeededByMax(today: string): string` | `packages/validation/src/requests.ts` | The ceiling as `YYYY-MM-DD`, from a `today` in the caller's timezone. Pure, like every other function in that file |

No `data-testid` is added, removed or altered by this note. The field the error is reported
under is `neededBy`, which is what the New request modal already reads.

## Cases

### TC-01-UNIT-07

- **Level:** Unit — a bound on a pure function is free here, and every other level pays to
  reach the same assertion. `packages/validation/src/requests.test.ts`.
- **Preconditions:** `today` = `2026-09-04`.
- **Steps:** Call `validateRequestNeededBy` with `enforceNotPast: true` for each of:
  `2031-09-04` (the ceiling itself), `2031-09-05` (one day past it), `2026-09-04` (today),
  `232131-10-21` (the six-digit year the control can produce), and `2026-09-03` (yesterday).
  Then call it with `enforceNotPast: false` for `2031-09-05` and for `2020-01-01`.
- **Expected Result:** valid; `neededByTooFar`; valid; `neededByInvalid` — the shape check runs
  first, so a six-digit year never reaches the ceiling; `neededByPast`. With
  `enforceNotPast: false`: `neededByTooFar` — the ceiling holds on edit; valid — the lower
  bound does not.
- **Fails against the current code:** yes. `2031-09-05` and `2031-09-05` on edit both return
  `{ valid: true }` today, because no upper bound exists.

### TC-01-INT-23

- **Level:** Integration — that the server re-runs the rule is the whole point of the bound;
  `packages/validation` alone cannot show that the route reads it. `apps/api/test/requests.spec.ts`.
- **Preconditions:** An organization with an admin and one `user`, and one request already
  raised by the `user` (the existing fixture of that file).
- **Steps:** `POST …/requests` with a valid body and `neededBy` six years after today. Then
  `PATCH …/requests/{requestId}` with the same date.
- **Expected Result:** `400` from both, each with `fields.neededBy` equal to
  `REQUEST_MESSAGES.neededByTooFar`, and no row written or changed.
- **Fails against the current code:** yes. Both answer `201` and `200` today and store the
  date.

## Blast radius

Every place that validates or renders `neededBy`, established by
`grep -rn "neededBy" apps packages e2e`:

- **`validateRequestNeededBy`** (`packages/validation/src/requests.ts:193-207`) — the one
  function that decides this field. Both callers below reach the rule through it, so neither
  is edited.
- **`validateNewRequest`** (`:377`) — passes `enforceNotPast: true`. Gains the ceiling with no
  change of its own.
- **`validateRequestEdit`** (`:488-491`) — passes `enforceNotPast: false`. Gains the ceiling
  with no change of its own, which is deliberate and stated in the rule above.
- **`apps/api/src/requests/requests.service.ts`** — calls the two validators and does not
  read `neededBy` for any other purpose. No edit.
- **`apps/web/app/org/[orgId]/requests/NewRequestModal.tsx:322`** — calls
  `validateNewRequest` for immediate feedback and renders `fieldErrors.neededBy` under the
  control. It gains the new message without an edit; putting the matching `max` on the control
  itself is PATCH-003, not this note.
- **`isRequestOverdue`** (`:638-643`) — reads a stored `neededBy` and is not a validator. Not
  touched, so no stored row changes how it reads.
- **Vacation dates** — `RequestVacationModal` and `HolidayModal` hold their own date fields and
  their own validators in `packages/validation/src/holidays.ts` and the vacation rules. They
  do not call `validateRequestNeededBy`; `grep -rn "validateRequestNeededBy" apps packages`
  returns the three call sites named above and nothing else.
- **Existing rows and in-flight sessions** — nothing re-validates a stored date. A request
  already holding a date past the ceiling keeps it until somebody edits that field.

## Not in this patch

- **The `max` attribute on the needed-by control.** A bound the browser enforces belongs with
  the other changes to that modal and is PATCH-003. This note is the rule; that one is the
  screen. Shipping this one first is deliberate — a control bound with no server counterpart is
  a gate only the client holds, which is the thing `CLAUDE.md` forbids.
- **A backfill or a migration for rows already past the ceiling.** None is written. The rule is
  a gate on writes, and rewriting somebody's stored deadline to satisfy a rule invented after
  they set it would be a worse outcome than leaving it.
- **The lower bound on edit.** Requirement 8 scopes `neededByPast` to creation and this note
  keeps that scope exactly; a date that passes while the request is open is what makes it
  overdue.
- **`Request.neededBy` on any other route.** The vacation feed, the list and the detail
  serializer read the stored value and validate nothing.
- **Why five and not three or ten.** It is a judgement, not a measurement: long enough that no
  real deadline is refused, short enough that a slipped year is. Nothing in the code depends on
  the number beyond `REQUEST_NEEDED_BY_MAX_YEARS`, which is where it is changed.
