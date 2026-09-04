# implement — attempt 2

Spec: `specs/time-off/01-vacation-calendar.md` (+ contracts, cases, mock) — **re-read at
`40eedaa`**, the commit in which a person settled the contradiction review 1 halted on.
Branch: `spec/time-off-vacation-calendar` · base `0d986a1`
Commits this attempt: `implement 4` (the three blockers and eight notes), `implement 5` (static gate S1).

## The three blockers

### F1 — `spec` · the country write, settled in the document at `40eedaa`

**Fixed.** The contradiction was real and was not mine to settle; a person settled it while this
attempt was queued, and the document now says one thing: Validation Rule 9 is **two tests** — the
uppercase shape *and* membership of the assigned alpha-2 list — so `pl` and `XX` are both refused,
and the message on both routes is `PROFILE_MESSAGES.country.invalid`, which is true of everything
the rule refuses (`HOLIDAY_MESSAGES.countryCodeInvalid`, "must be 2 uppercase letters", is false of
`XX`).

- `packages/validation/src/time-off-calendar.ts` — new `validateStatedCountryCode`, composing the
  two shipped validators: `validateHolidayCountryCode` for the shape (so `pl` is refused rather
  than upcased) and `validateCountryCode` for the assigned list (so `XX` is refused). Empty, `null`
  and `undefined` still clear. The stored value is the submitted one, never a normalized one.
- `apps/api/src/organizations/organization-country.service.ts` — uses it; **422**
  `{ error: 'validation_error', fields: { countryCode } }`.
- `apps/api/src/members/members.service.ts` — uses it; **400** `{ errors: { countryCode } }`,
  presence still decides whether the column is touched.
- Cases moved with the rule: **TC-01-INT-21** now sends `POL`, `1`, `pl`, `XX`, `PL` and reads the
  country back after the `XX` attempt to prove nothing was stored; **TC-01-INT-25** refuses `pl`
  **and** `XX` at 400 and re-reads the row after each. The message-pinning case now pins
  `PROFILE_MESSAGES.country.invalid`. New unit case: every branch of `validateStatedCountryCode`,
  `XX`/`YY`/`ZZ` included.

### F2 — `code` · today came from the browser clock

**Fixed.** The screen resolved today from `new Date()` while the marker beside it came from the
server's `Account.timezone` answer, so for a caller whose browser is not in their own zone the two
were a day apart and `Today` could land on a window holding no marker at all.

- `packages/validation/src/time-off-calendar.ts` — `resolveTimeOffCalendarTimezone()` and
  `timeOffCalendarToday()`, one implementation of REQ-01-018 for both surfaces.
- `apps/api/src/time-off/time-off-calendar.service.ts` — its two private copies deleted; it calls
  the shared pair.
- `CalendarScreen.tsx` — `todayISO()` deleted; the initial anchor and `calendar-today` both call
  `timeOffCalendarToday(session.account.timezone)`, the same field the endpoint reads.
- Unit case: at `2026-09-30T23:00Z`, `Pacific/Kiritimati` answers `2026-10-01` and `Pacific/Niue`
  `2026-09-30` — the two zones the integration case uses — plus the UTC fallback for `null`, `''`
  and an unrecognized zone.

### F3 — `code` · a failed read reported as a fact about the data

**Fixed.** The `catch` drew `emptyStateBody` — the answer to a *successful* read of nothing — so a
transport failure told an admin whose organization is full of active members that none of them
matched. It now draws `HOLIDAY_MESSAGES.toastServerError`, a shipped generic failure line that
claims nothing about the rows, and a refusal that carries no message of its own (a 404 after a
capability is revoked mid-session) falls back to it too rather than to an empty banner.
`emptyStateBody` is now referenced exactly once, in the empty state.

## The ten notes

| Note | What was done |
|---|---|
| N1 — the two writes disagree on an absent key, undocumented | **Fixed.** The organization PUT keeps clearing on an absent key and now says why: that body *is* the resource, one field replaced whole, while the member update carries three fields and must save a role without stating a country. |
| N2 / N4 — the moved fixtures could not fail | **Fixed, and proved.** All three now seed a **different** phone country from the membership country. Proof, run and reverted: pointing `ReportsService.loadCaller` back at `Account.phoneCountryCode` turns exactly the three named cases red (`3 failed` in `reports-amounts-owed` + `reports-time-off`), and pointing `HolidaysService` back turns TC-03-INT-14 and TC-01-INT-29 red (`2 failed`). |
| N3 — no case for a malformed date | **Fixed.** `2026-13-01`, `2026-02-30`, `2026-9-1`, `not-a-date`, an ISO instant and a number, on both ends; plus `2028-02-29` valid and `2027-02-29` not. |
| N5 — the week preset's first day asserted nowhere | **Fixed.** TC-01-E2E-03 now asserts the first day header of the `Week` window is the Monday of the week holding today. |
| N6 — the loading state was a bare `Preloader` | **Fixed.** `GridSkeleton` draws the two header rows plus six member rows in the grid's own geometry, inside a `role="status"` with an accessible name. No new `data-testid`. |
| N7 — a message assertion hardcoded while another used the constant | **Fixed, in the direction my definition requires**: *every* message assertion in the E2E file now compares the document's literal text, and the two that read the constant were changed, not the one that read the literal. Asserting the constant certifies whatever the code happens to say. |
| N8 — `minWidth: 220` is a size literal | **Fixed as far as it can be**: it is the value the shipped country filter directly below it carries, and the comment says so. No token names a control width — `MultiFilter`'s own `200` is the same literal. |
| N9 — the pickers read "All" in the state REQ-01-009 refuses | **Not done, deliberately.** The placeholder belongs to `MultiFilter` in `apps/web/src/reports/ReportFilters.tsx`, which is outside this handoff's file set and is shared by three shipped report screens; widening it is a change those screens' specs should see. Recorded here rather than taken. |
| N10 — the 2px today inset was in no DS-gaps row | **Closed by `40eedaa`**, which added it; the CSS now carries the `@literal` comment and its reason, beside the two 3px values. |

## Commands run

| Command | Result |
|---|---|
| `npm run test:unit` | 35 files, **1427 passed** |
| `apps/api` · `npm test -- test/time-off-calendar.spec.ts` | **30 passed** |
| `apps/api` · `npm test -- test/holidays.spec.ts test/reports-amounts-owed.spec.ts test/reports-time-off.spec.ts` | **61 passed**, 4 pre-existing `.skip` |
| `apps/api` · the phone-country regression probe (twice, reverted both times) | **3 failed** then **2 failed** — the fixtures discriminate |
| `apps/api` / `apps/web` · `npx tsc --noEmit` | clean |
| `e2e` · `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/time-off-calendar.spec.ts tests/regressions.spec.ts` | **17 passed** |
| `e2e` · `… tests/holidays.spec.ts tests/reports-time-off.spec.ts tests/member-detail.spec.ts tests/app-shell.spec.ts` | **13 passed** |
| `node scripts/static-gate.mjs --base 0d986a1` | **pass** (after S1 below) |

One E2E run reported TC-01-E2E-06 flaky: `apiRequestContext.post: read ECONNRESET` on the
`/api/signup` precondition while the server was still warming. It passed on retry and passed twice
since, isolated and with the other suites.

## Static gate S1, fixed in `implement 5`

The gate reads `git grep -lF` over `apps/`, so the F3 comment — which quoted the empty-state line
to explain why it must not be drawn there — read as a second copy of a `packages/validation`
message. The comment names the export now instead of quoting it.
