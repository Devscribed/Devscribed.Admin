# implement — attempt 1

Spec: `specs/time-off/01-vacation-calendar.md` (+ contracts, cases, mock)
Branch: `spec/time-off-vacation-calendar` · base `0d986a1`
Commits: `69d44f7` (the work), `8e71d4a` (static-gate S1/S2), `4b23387` (an unnamed testid removed)

## What was built, per task

### T1 — schema and the one migration
- `apps/api/prisma/schema.prisma` — `Membership.countryCode String? @db.Char(2)` and
  `Organization.countryCode String? @db.Char(2)`, each doc-commented as its link of the chain.
- `apps/api/prisma/migrations/20260904120000_time_off_01_vacation_calendar/migration.sql` — two
  `ALTER TABLE ... ADD COLUMN "countryCode" CHAR(2)`, nullable, no default, no backfill, with the
  header saying why that makes the deploy order and a code rollback safe. One migration this run.

### T2 — packages/validation
- `packages/validation/src/time-off-calendar.ts` (new) — `TIME_OFF_CALENDAR_MESSAGES` (the eleven
  rows verbatim), `TIME_OFF_CALENDAR_MAX_RANGE_DAYS = 92`, `TIME_OFF_CALENDAR_MAX_MEMBERS = 100`,
  the `TimeOffCalendarScope` union and its validator, `validateTimeOffCalendarRange` (rules 1–4 in
  the table's order, first failure only, raw ISO comparison and no timezone-shifted instant), the
  three presets (`timeOffCalendarWindowRange`), the step (`stepTimeOffCalendarAnchor`, a whole
  calendar month under Month), `timeOffBandAccessibleName`, plus the calendar-day helpers the
  endpoint needs (`calendarDaysBetween`, `isCalendarWeekend`, `isoWeekOf`).
- `packages/validation/src/roles.ts` — `ViewTimeOffCalendar` in `Capability` and in
  `ROLE_CAPABILITIES` for admin, manager and user; not viewer.
- `packages/validation/src/index.ts` — `view-time-off-calendar` in `MemberCapability` and in all
  four `CAPABILITY_MATRIX` rows (true/true/true/false); the new module re-exported.
- `packages/validation/src/reports.ts` — `resolveMemberHolidayCountry(membershipCountry,
  organizationCountry)`, both arguments required, normalizing through `validateCountryCode`
  (upcases, tests the assigned alpha-2 list) and returning `null` when neither link is usable.
  `HolidayMemberInput.countryCode`'s doc comment no longer names the phone country.

### T3 — `GET /api/organizations/{orgId}/time-off/calendar`
- `apps/api/src/time-off/time-off-calendar.controller.ts` — `SessionGuard` + `OrgScopeGuard` only;
  no `RequireCapability`, because the refusal must be a bare 404. Takes the whole query object, so
  a repeated `projectIds` / `memberIds` arrives as an array.
- `apps/api/src/time-off/time-off-calendar.service.ts` — the gate
  (`can(normalizeRole(role), 'view-time-off-calendar')` → `NotFoundException`), validation in the
  table's order with the first failure as the whole 422 body, the three scopes (including the
  `none` sentinel over non-archived projects, duplicates collapsed by a `Set`), case-insensitive
  name order, the row cap checked last, `days[]` with `isWeekend`/`isoWeek`, bands clipped by two
  edge flags carrying the frozen `workingDays` and `kind: 'vacation'`, holidays in the window with
  `appliesToAllInView`, per-member `holidayIds` and the resolved `countryCode`, and
  `range.today` from `Account.timezone` with a UTC fallback. Every query filters by
  `session.organizationId`; the organization's country is loaded once per request.
- `apps/api/src/app.module.ts` — both new controller/service pairs registered (T3 took T4's edit).

### T4 — `GET`/`PUT /api/organizations/{orgId}/settings/country`
- `apps/api/src/organizations/organization-country.controller.ts` and `.service.ts` (new) —
  `view-holidays` on the read and `manage-holidays` on the write, both checked in the service and
  both answering a bare 404; the write validates with `validateHolidayCountryCode` (`pl` refused,
  not upcased) and answers 422 `{ error: 'validation_error', fields: { countryCode } }`; `null`
  and `''` clear. No lock, per REQ-01-033.

### T5 — the member country on the shipped read and write
- `apps/api/src/members/members.service.ts` — `countryCode` added to `MemberDetail` and to
  `getDetail`'s explicit projection (the stored value, unconditional); added to
  `MemberDetailUpdateInput` and written inside the existing transaction and organization-row lock.
  **Presence decides** (`'countryCode' in input`), so a body without the key changes nothing; an
  invalid value is 400 `{ errors: { countryCode } }`. `list` deliberately unchanged; the two
  restore paths deliberately untouched (REQ-01-048 needs no code).

### T6 — every call site adopts the chain
- `apps/api/src/holidays/holidays.service.ts` — `scope=mine` resolves through
  `resolveMemberHolidayCountry(caller.countryCode, organization.countryCode)`;
  `normalizeResolvedCountry` deleted; the doc comment updated.
- `apps/api/src/reports/reports.service.ts` — `loadCaller`, `resolveSubjectMemberships` and
  `buildTimeOffResponse`'s organization-wide union all resolve through the chain; `Caller` gained
  `organizationCountryCode`. `grep phoneCountryCode apps/api/src` now matches only
  `account.service.ts` and one comment.

### T7 — the screen and the navigation row
- `apps/web/app/org/[orgId]/time-off/calendar/{page.tsx,CalendarScreen.tsx,types.ts}` (new) —
  `'use client'`, `notFound()` on the normalized role, fetches with `credentials: 'same-origin'`;
  `PageHeader` with the range navigation in its action slot, `ReportControls` holding two
  `ToggleButton`s in their `options` form, `MultiFilter` for the two pickers (Unassigned above the
  projects), the legend, and the grid: week bands, day headers, sticky member column, per-day
  cells, and one band element per absence carrying `timeOffBandAccessibleName`.
- `apps/web/src/layout/Sidebar.tsx` — the `Calendar` row above `Holidays`, gated on
  `hasCapability(role, 'ViewTimeOffCalendar')` and omitted otherwise.
- `apps/web/app/globals.css` — the `.time-off-calendar` block declaring the three DS-gap colours
  and `--name-col: 264px` once, plus what an inline style cannot express (the sticky column, the
  scroll container below the desktop breakpoint, the pending hatch). The only literals are the two
  3px values the DS gaps table records, each with an `@literal` comment and its reason.

### T8 — the two pickers
- `apps/web/app/org/[orgId]/settings/holidays/page.tsx` — `org-country-select` (labelled
  "Organization country", hinted from `orgCountryHint`) above the existing country filter, with
  `org-country-save` beside it; the value is read from `GET .../settings/country` on load.
- `apps/web/app/org/[orgId]/members/[memberId]/MemberDetailScreen.tsx` — `member-country-select`
  in the block with the role and the job title, first option from `memberCountryDefaultOption`,
  drawn only when `canEditJobTitle`, saved through the existing PUT and added to the `dirty`
  computation so a country-only change is saveable.

### T9 — the cases
Unit (`packages/validation`): TC-01-UNIT-01 (`reports.test.ts`, all ten pairs), TC-01-UNIT-02
(`time-off-calendar.test.ts`), TC-01-UNIT-03 (`reports.test.ts`), TC-01-UNIT-04
(`roles.test.ts`, both unions plus the unnormalized `can('member', …)` probe).
Integration: `apps/api/test/time-off-calendar.spec.ts` — TC-01-INT-01 … TC-01-INT-29, all 29,
plus one case pinning the tabulated refusal text.
E2E: `e2e/tests/time-off-calendar.spec.ts` — TC-01-E2E-01 … TC-01-E2E-08.
Helpers: `createHolidayViaApi` promoted into `e2e/tests/helpers.ts` (its private copy in
`reports-time-off.spec.ts` deleted, that suite now imports the shared one), plus
`setMemberCountryViaApi` and `setOrganizationCountryViaApi`.

### T10 — the four shipped suites whose fixture moved column
Fixtures only; no assertion changed or removed.
- `apps/api/test/holidays.spec.ts` — `createMember` takes a membership country; TC-03-INT-14's BY
  member states it, and keeps its phone country, so the case now also witnesses that the phone
  reaches nothing.
- `apps/api/test/reports-amounts-owed.spec.ts` — the same for TC-01-INT-12's BY member and
  TC-01-INT-13's US member.
- `apps/api/test/reports-time-off.spec.ts` — the same for the BY viewer.
- `e2e/tests/holidays.spec.ts` — TC-03-E2E-04 states the country through
  `setMemberCountryViaApi` as the admin; the now-unused `setOwnCountryViaApi` removed (no other
  case in that file needs a phone country).
Also updated by the same rule: `packages/validation/src/roles.test.ts`'s three exhaustive
capability lists, which enumerate the matrix and gain the new capability.

## Commands run

| Command | Result |
|---|---|
| `npm run test:unit` | 35 files, **1421 passed** |
| `apps/api` · `npm test -- test/time-off-calendar.spec.ts` | **30 passed** (1 suite) |
| `apps/api` · `npm test -- test/reports-time-off.spec.ts test/reports-amounts-owed.spec.ts test/holidays.spec.ts` | **61 passed**, 4 pre-existing `.skip` |
| `apps/api` · `npm test -- test/member-detail.spec.ts test/members.spec.ts test/reports-time-and-activity.spec.ts test/capability.spec.ts` | **48 passed**, 2 pre-existing `.skip` |
| `apps/api` · `npx tsc -p tsconfig.json --noEmit` | clean |
| `apps/web` · `npx tsc -p tsconfig.json --noEmit` | clean |
| `e2e` · `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/time-off-calendar.spec.ts tests/regressions.spec.ts` | **17 passed** |
| `e2e` · the same, plus `tests/holidays.spec.ts tests/reports-time-off.spec.ts tests/member-detail.spec.ts tests/app-shell.spec.ts` | **21 passed** |
| `npm run ds:check` | no finding in any file this diff touches |
| `node scripts/static-gate.mjs --base 0d986a1` | **pass**, 0 findings (after the two fixes below) |

## Two things fixed after the first commit

- **Static gate S1/S2** — the integration suite read a holiday out of a `Map` through `as any`.
  Replaced with a `find` over `response.body.holidays`; no cast, same assertions (`8e71d4a`).
- **A `data-testid` this spec does not name** — the organization-country save showed a toast
  under `toast-org-country-saved`, an id no table in the bundle carries, and it would have
  carried a line of copy nothing governs. The save now confirms by repainting the picker from
  the value the server stored, and the E2E asserts that instead (`4b23387`). The error path
  still uses the page's shipped `toast-server-error`.

## Decisions worth a reviewer's eye

- **A per-cell holiday marker is drawn for every holiday that reached a member**, whole-column or
  not; the column shading is what a whole-column holiday *adds*, not what it replaces. REQ-01-031
  ("marks only the cells of the members it applies to") is satisfied either way, and TC-01-E2E-07
  reaches a state where the holiday applies to everybody in view — a rule that suppressed the cell
  marker on a whole-column holiday would make that case unobservable.
- **`appliesToAllInView` is false when the response carries no rows.** "Every member in the
  current view" has nobody to be true of, and the screen draws the empty state there anyway.
- **The screen re-runs Validation Rules 6 and 7 client-side** and shows the same message the
  endpoint would, so unticking the last team does not spend a request; every other rule is the
  server's answer, drawn from the first (and only) entry of the 422's `fields`.
