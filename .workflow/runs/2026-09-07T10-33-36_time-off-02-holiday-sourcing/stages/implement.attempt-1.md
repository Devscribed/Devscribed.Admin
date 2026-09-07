# implement — attempt 1

Spec: `specs/time-off/02-holiday-sourcing.md` (+ `.contracts.md`, `.cases.md`)
Branch: `spec/holiday-sourcing` · commits `2fbace6`, `11930bf`

## Tasks and the files they touched

### T1 — the shared rules, the messages, currency-at-a-date

- `packages/validation/src/holiday-sourcing.ts` (new) — `HOLIDAY_SOURCING_MESSAGES` (the six
  rows of the Error Messages table, verbatim, ellipsis included), `validateSyncYear`,
  `validateIncludeOrgCountry`, `validateRefreshFlag`, `buildSourcedCountrySet`,
  `acceptProviderEntries`, `holidayExternalKey`, `HOLIDAY_IMPORT_PAID_HOURS`,
  `HOLIDAY_SOURCE_MANUAL` / `HOLIDAY_SOURCE_IMPORTED`, `HolidaySourcingState`.
- `packages/validation/src/holiday-sourcing.test.ts` (new).
- `packages/validation/src/reports.ts` — the snapshot selection `resolveRateAtDate` performed
  is extracted into `newestSnapshotOnOrBefore`, and `resolveCurrencyAtDate` is added on top of
  it. No existing export changed signature or behaviour.
- `packages/validation/src/reports.test.ts` — `resolveCurrencyAtDate`, including one case that
  asserts it selects the *same* snapshot the rate does on both sides of a mid-year change.
- `packages/validation/src/index.ts` — `export * from './holiday-sourcing'`.

### T2 — the port, two drivers, and how one is chosen

- `apps/api/src/holidays/provider/holiday-provider.ts` (new) — the abstract class as its own DI
  token, `name`, `callBoundMs`, `holidays(countryCode, year)`.
- `apps/api/src/holidays/provider/nager-holiday.provider.ts` (new) — `GET
  {base}/api/v3/PublicHolidays/{year}/{code}`, no credential, `AbortController` wired to
  `setTimeout`. Any non-2xx, any non-array body and any abort throws.
- `apps/api/src/holidays/provider/fake-holiday.provider.ts` (new) — the deterministic table:
  `PL` 14 nationwide, `DE` 20 of which 10 regional, `US` 11, `MT` a 200-character name and an
  entry outside the year, `VA` empty, `IN`/`AE` refused, `AQ` never answers, anything else
  empty. Seeding hooks (`setCountry`, `reset`, `calls`). Both drivers report `name: 'nager'`
  — the double is a double *of* Nager.Date and `HOLIDAY_PROVIDER` selects the driver, which
  is the reading pre-implement finding P2 planned and the only one under which TC-02-INT-01's
  `nager:DE:{date}` passes.
- `apps/api/src/holidays/provider/holiday-provider.config.ts` (new) — `HOLIDAY_PROVIDER`,
  `HOLIDAY_PROVIDER_BASE_URL`, `HOLIDAY_PROVIDER_TIMEOUT_MS`; explicit wins, local driver
  whenever `NODE_ENV` is not `production`, an unknown name throws at boot.
- `apps/api/src/holidays/provider/holiday.provider.ts` (new) — the Nest provider.
- `apps/api/src/core.module.ts` — registered in `providers` and `exports`.
- `apps/api/.env.example` — the three variables, with the note that none is a secret.

### T3 — the migration

- `apps/api/prisma/schema.prisma` — `HolidayImport`, `OrganizationHolidaySourcing`, and
  `Holiday.source` / `.externalKey` / `.importedAt`, plus the two back-relations.
- `apps/api/prisma/migrations/20260907120000_time_off_02_holiday_sourcing/migration.sql` (new)
  — hand-written beside the schema edit; two tables, three columns, no rename, no drop, no new
  NOT NULL on an existing table, no backfill. Applied with `npx prisma migrate dev` from
  `apps/api`.

### T4 — the country set, the sync, the import writer, the list route

- `apps/api/src/holidays/holiday-sourcing.service.ts` (new) — `sourcedCountrySet`,
  `sourcingBlock`, `sync`, the call race against `provider.callBoundMs`, the entry decision
  table, the import upsert, and the `view-holidays`/`manage-holidays` gate (404, via
  `can(normalizeRole(role), …)`).
- `apps/api/src/holidays/holiday-sourcing.controller.ts` (new) — `POST holidays/sync`,
  `GET holidays/summary` on `api/organizations/:orgId` behind `SessionGuard` + `OrgScopeGuard`.
- `apps/api/src/holidays/holidays.service.ts` — `source` on every row of `toSummary`, and the
  `sourcing` block on `scope=all` only. `paidHours` stays a JSON number (pre-implement P3).
- `apps/api/src/app.module.ts` — the controller and both services.

### T5 — the numbers

- `apps/api/src/holidays/holiday-summary.service.ts` (new) — `summary(session, …)` resolves the
  capability set and delegates to `buildSummary(organizationId, year, { includeAmounts })`.
  Each holiday is valued at the rate in force on its own date and rounded with `toMoney` first,
  the rounded values then summed; the currency comes from `resolveCurrencyAtDate`, the same
  snapshot selection. Amounts and currencies are **omitted** without `view-amounts-owed`, and
  omitted for a member with no financials.

### T6 — the include-organization-country setting

- `apps/api/src/organizations/holiday-sourcing-settings.service.ts` (new),
  `apps/api/src/organizations/holiday-sourcing-settings.controller.ts` (new) — `GET`/`PUT
  .../settings/holiday-sourcing`, both capability checks in the service (404), upsert on the
  unique `organizationId`, a missing row reading `true`.

### T7 — the screen

- `apps/web/app/org/[orgId]/settings/holidays/types.ts` — `source`, the sourcing block, the
  sync response, the summary and the setting.
- `apps/web/app/org/[orgId]/settings/holidays/HolidaySourcingPanel.tsx` (new) — the checkbox,
  Refresh, the syncing line, and `syncFailedSome` when a sync answered with a country still
  unsourced.
- `apps/web/app/org/[orgId]/settings/holidays/HolidaySummary.tsx` (new) — the two banded tables
  above the list, its own `Preloader`, and `summaryUnavailable` in its place when the read
  fails. The money column is drawn only where the response carries `byCurrency`.
- `apps/web/app/org/[orgId]/settings/holidays/page.tsx` — the summary read, the one automatic
  sync per year, the uncovered warning, the `source` column, and the empty state gated on
  every country being settled.

### T8 — the cases

- `apps/api/test/stub-holiday.provider.ts` (new), `apps/api/test/holiday-sourcing.spec.ts`
  (new), `e2e/tests/holidays.spec.ts` (a second `describe`).

## Test cases written

| Case | Where |
|---|---|
| TC-02-UNIT-01, TC-02-UNIT-02 | `packages/validation/src/holiday-sourcing.test.ts` |
| TC-02-INT-01 … TC-02-INT-16 | `apps/api/test/holiday-sourcing.spec.ts`, each named by its id |
| TC-02-E2E-01 … TC-02-E2E-04 | `e2e/tests/holidays.spec.ts`, `describe('time-off/02 — Holiday sourcing')` |

Three unnumbered integration cases carry rules the numbered ones do not reach on their own:
Validation Rule 1 on both routes that take a year (Edge case 17), Validation Rule 2 and the
setting's stored default (REQ-02-002), and the checkbox removing the organization's country
from the set while a member who resolves to it keeps it (Edge case 4).

## Commands run

| Command | Result |
|---|---|
| `npm run test:unit` (root) | `Test Files 36 passed (36) · Tests 1453 passed (1453)` |
| `npx tsc --noEmit -p tsconfig.json` from `apps/api` | no output |
| `npx tsc --noEmit -p tsconfig.json` from `apps/web` | no output |
| `npm test -- test/holiday-sourcing.spec.ts` from `apps/api` | `Tests: 19 passed, 19 total` |
| `npm test -- test/holidays.spec.ts test/time-off-calendar.spec.ts` | `Tests: 54 passed, 54 total` |
| `npm test -- test/reports-amounts-owed.spec.ts test/reports-time-off.spec.ts test/time-tracking.spec.ts` | `Tests: 5 skipped, 116 passed, 121 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/holidays.spec.ts tests/regressions.spec.ts` from `e2e` | `20 passed (59.1s)` (run three times; the first two exposed the two defects below) |
| `npm run ds:check` | no finding on any file in this diff |
| `node scripts/static-gate.mjs --run …` | one finding, below |

## Two defects the E2E run found, and what fixed them

1. **The checkbox did not move when clicked.** It was controlled by state that only changed
   when the `PUT` answered, so `uncheck()` failed with "clicking the checkbox did not change
   its state". The write is now optimistic and a refusal puts the box back.
2. **The syncing line never went away after a year switch.** `runSync` cleared the flag only
   when its signal had not been aborted, and the auto-sync effect aborted its own request
   whenever `sourcing` was replaced by a re-read. The effect now turns on one boolean rather
   than on the block's identity, and the newest run owns the status line through a token.

Both are the kind of defect only an execution finds; neither was visible to a type check.

## The static gate's one finding

`static-gate: blocked` with exactly one finding, and it is pre-implement's note **P1**:

```
[code] spec/message-not-implemented
  specs/time-off/02-holiday-sourcing.md
  the Error Messages row "`HOLIDAY_MESSAGES.toastServerError`" names a string that
  exists nowhere in packages/validation
```

That row's Message cell reads `(shipped, unchanged)` — a note about the export, not a
message. The export ships at `packages/validation/src/holiday-messages.ts:29` and its text is
`Something went wrong. Please try again.`, which the page emits today and this change does not
touch. **Nothing was added to `packages/validation` to satisfy the grep**: writing text to
pass a checker is the failure P1 exists to prevent. If the finding is routed back to code, it
is contested with that counter-witness.

Every other Error Messages row now resolves: the six new ones are in
`packages/validation/src/holiday-sourcing.ts` and `HOLIDAY_MESSAGES.deleteForbidden` ships.

## Notes for the reviewer

- `syncFailedSome` is the one Error Messages row whose renderer the handoff's T7 detail did not
  name. It is drawn in the sourcing panel — the surface the `messages` block assigns it — when
  the sync for the year on screen answered with a country still unsourced. Commit `11930bf`.
- The global row of the summary's `countries` array is keyed `null` by the API and takes
  `holiday-summary-country-all` on screen, the same word the list's own country filter uses
  for "applies everywhere". It is an instantiation of the named pattern, not a new id.
- No `data-testid` outside the spec's roster was added.
- `HolidayImport.provider` records `nager` under both drivers, per P2 and the risk the handoff
  recorded. No case observes the column's value; `externalKey` is what TC-02-INT-01 pins.
