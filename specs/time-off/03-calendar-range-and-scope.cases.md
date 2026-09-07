# Calendar range and scope defaults — cases

## DS gaps

| Gap | Impact | What closes it |
|---|---|---|
| `--name-col` — no token carries a pinned first column's width | Declared in the `.time-off-calendar` block, inherited from `time-off/01` and unchanged here | The width entering `@devscribed/ds` and the block losing the property |
| `--day-col-min` — no token carries a minimum data-column width | REQ-03-014 needs one, and a 92-column grid without it draws 8px columns. Declared in the same block beside the three `time-off/01` already declares | The same design-system change |
| `--range-label-col` — no token carries a reserved width for a variable-width label in a control row | REQ-03-015 needs one. Its value is measured from the widest label the four windows produce | The design system gaining a reservation token, at which point all four properties leave this block together |
| `--surface-timeoff-band`, `--border-timeoff-band`, `--text-timeoff-band` | Inherited from `time-off/01`, unchanged, listed so this bundle's block is complete | The three colours entering `@devscribed/ds` |

No colour is written that the design system does not name, and this spec declares no `@literal`
value: every new number is one of the three custom properties above.

## Verification Plan

**This plan has not been walked.** The bundle was written from the code and from a person's
screenshots of the running app, not from a rig brought up for it. Every row below therefore
says `not run`, and that is recorded as a Known Gap in
[03-calendar-range-and-scope.md](03-calendar-range-and-scope.md). What the rows still carry is
the route to each state, which is what the next agent needs and which was established by
reading the helpers rather than by running them.

**Bringing it up**

| Step | Command | Observed |
|---|---|---|
| Install | `npm install` from the repository root | not run |
| Database | `docker compose up -d` | not run |
| Unit | `npm run test:unit` | not run |
| Integration, this area only | `npm test -- test/time-off-calendar.spec.ts` from `apps/api` | not run |
| E2E, this area only | `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/time-off-calendar.spec.ts tests/regressions.spec.ts` from `e2e` | not run |

The suite claims its own ports under `CI`; the pair above is a request, not a fact about where
it will answer, and the database follows whatever pair it settles on.

**Reaching the states the cases need**

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| An admin session in an organization with active members | `signInAsAdmin` in `e2e/tests/helpers.ts`, the same one `time-off-calendar.spec.ts` opens with | yes | not run |
| A project with members, for the Teams picker | The projects helpers `time-off-calendar.spec.ts` already uses for its `scope=teams` cases | yes | not run |
| More than 100 active memberships, for Edge case 1 | A fixture under `apps/api/src/test-support/` that seeds N memberships in one call | **no** | not run |
| An approved absence inside an arbitrary custom range | The vacation-request helpers `time-off-calendar.spec.ts` uses, given dates bound to the run's own today | yes | not run |
| A viewport narrow enough to force the horizontal scroll | Playwright's `page.setViewportSize` | yes | not run |

The one `no` is a task this spec owes: a seeding fixture for the over-100 case. Edge case 1 is
the refusal that *replaces* the one being withdrawn, so it is the row this spec most needs and
the row nothing can reach today.

**Access this needs**

| What | Name | Where the value lives | How the next agent gets it | Proven against |
|---|---|---|---|---|
| — | — | — | This spec adds no external dependency, no credential and no key | — |

**Rehearsal**

Not run. No throwaway probe was written, because no probe was executed.

## Test Cases

### TC-03-UNIT-11

- **Level:** Unit
- **Covers:** REQ-03-011
- **Steps:** Call the range stepper with a start and an end 9 days apart — a 10-day span — and
  direction `-1`, then with the same span and direction `1`.
- **Expected Result:** Each call returns a range whose start is 10 days from the input's start in
  the given direction, and whose span is still 10 days. A one-day range steps by one day.

### TC-03-UNIT-12

- **Level:** Unit
- **Covers:** REQ-03-012
- **Steps:** Call the Today reducer with a 10-day range that does not contain the supplied today,
  and with a one-day range.
- **Expected Result:** The returned start equals the supplied today in both calls; the returned
  spans are 10 and 1.

### TC-03-UNIT-13

- **Level:** Unit
- **Covers:** REQ-03-013, REQ-03-017
- **Steps:** Convert a custom range whose start falls mid-month to the `month` preset, then
  convert a `month` window back to a custom range.
- **Expected Result:** The month returned is the one containing the range's start. The range
  returned is that month's first and last day.

### TC-03-INT-21

- **Level:** Integration
- **Covers:** REQ-03-001, REQ-03-003
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Seed an organization with three active memberships, two of them on a project. As an
  admin, request the calendar with `scope=teams` and no `projectIds`, over a two-week span bound
  to the run's own today.
- **Expected Result:** `200`. `members` has three entries — the member on no project included.
  `meta.scope` is `"teams"`. The body carries no `fields` and no message.

### TC-03-INT-22

- **Level:** Integration
- **Covers:** REQ-03-002, REQ-03-003
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** The same organization. Request with `scope=people` and no `memberIds`.
- **Expected Result:** `200` with all three members. `meta.scope` is `"people"`.

### TC-03-INT-23

- **Level:** Integration
- **Covers:** REQ-03-006
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Request with `scope=teams` and the one project's id; then with `scope=people` and
  one membership id.
- **Expected Result:** The first answers with the two members on that project; the second with
  the one member named. Neither answers with three — removing the refusal did not remove the
  narrowing.

### TC-03-INT-24

- **Level:** Integration
- **Covers:** REQ-03-010
- **Asserts:** `GET /api/organizations/{orgId}/time-off/calendar` → 422 TIME_OFF_CALENDAR_MESSAGES.rangeTooWide; `GET /api/organizations/{orgId}/time-off/calendar` → 200
- **Steps:** Let `D` be the run's own today. Request `scope=all` over `D` through `D + 92 days`,
  then over `D` through `D + 91 days`.
- **Expected Result:** The first is `422` carrying `rangeTooWide` under `fields.range`. The
  second is `200` — the 92-day bound is inclusive and a 92-day span is 91 days after its start.

### TC-03-E2E-11

- **Level:** E2E
- **Covers:** REQ-03-001, REQ-03-002, REQ-03-004, REQ-03-005, REQ-03-016
- **Steps:** Sign in as an admin in an organization with at least two active members. Open the
  calendar. Click `calendar-scope-teams` and tick nothing. Then click `calendar-scope-people`
  and tick nothing.
- **Expected Result:** After each click, `calendar-error-banner` is absent, `calendar-grid` is
  present, `calendar-teams-picker` (then `calendar-people-picker`) reads `All`, and every
  member's `calendar-member-row-{membershipId}` is on screen.
- **Selectors:** `calendar-scope-teams`, `calendar-teams-picker`, `calendar-scope-people`,
  `calendar-people-picker`, `calendar-grid`, `calendar-member-row-{membershipId}`,
  `calendar-error-banner` (absent).
- **Fails today:** the banner is present with "Choose at least one team." and the grid holds the
  previous window's columns.

E2E rather than integration because the assertion is about a control that must *not* be drawn and
a request the screen must spend — neither is reachable from the API.

### TC-03-E2E-12

- **Level:** E2E
- **Covers:** REQ-03-007, REQ-03-008, REQ-03-009
- **Steps:** Sign in as an admin and open the calendar. Click `calendar-window-range`, then
  `calendar-range-picker-trigger`. Click a day in the panel to arm the start, and read which
  later days the panel offers. Click a day 20 days after the start.
- **Expected Result:** `calendar-range-picker` is present only while the Range window is active.
  With the start armed, no day more than 91 days after it is selectable. After the second click,
  `calendar-range-label` names the two days chosen and the grid holds 21
  `calendar-day-header-{date}` cells, the first being the armed start.
- **Selectors:** `calendar-window-range`, `calendar-range-picker`,
  `calendar-range-picker-trigger`, `calendar-range-label`, `calendar-day-header-{date}`.
- **Fails today:** `calendar-window-range` does not exist, so the first click times out.

### TC-03-E2E-13

- **Level:** E2E
- **Covers:** REQ-03-014, REQ-03-015, REQ-03-018
- **Steps:** Sign in as an admin and open the calendar. Record the bounding box of
  `calendar-today`. Click through `calendar-window-week`, `calendar-window-2weeks`,
  `calendar-window-month` and `calendar-window-range`, recording the box after each and picking
  a 92-day span in the Range panel. Click `calendar-prev` once and `calendar-next` twice,
  recording the box after each. At a 1280px viewport, read the width of the first and last
  `calendar-day-header-{date}` and the scroll width of the grid's container.
- **Expected Result:** Every recorded `x` for `calendar-today` is the same value — across all four
  windows and across the three steps, which is where the label changes width most. Under the
  92-day range, no day column is narrower than the declared minimum, and the container's scroll
  width exceeds its client width: the grid scrolls rather than compressing.
- **Selectors:** `calendar-today`, `calendar-prev`, `calendar-next`, `calendar-window-week`,
  `calendar-window-2weeks`, `calendar-window-month`, `calendar-window-range`,
  `calendar-day-header-{date}`, `calendar-grid`.
- **Fails today:** `calendar-today` shifts between the Month and 2 weeks labels, and there is no
  Range window to reach the 92-day case at all.

E2E rather than unit because both assertions are rendered geometry under a real font and a real
viewport — a reserved width and a column floor are not values a function returns.
