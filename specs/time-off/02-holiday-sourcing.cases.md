# Holiday sourcing and what it costs — cases

## DS gaps

| Gap | Impact | What closes it |
|---|---|---|
| None | The screen's mock declares no custom property and writes no colour the design system does not name | — |

The summary is built from components that ship today: `Card`, `ReportTableHead` and
`ReportGroupBody` for the two banded tables, `Checkbox` for the include-organization-country
control, `InfoBanner` for the uncovered-country warning, `Preloader` for the two waits, and
`Button` for Refresh. Every spacing, size and colour is a token. **Nothing is improvised here and
nothing enters `@devscribed/ds`** — which is the answer this table exists to give, stated rather
than left blank.

## Verification Plan

**This plan has not been walked**, and that is recorded as a Known Gap in
[02-holiday-sourcing.md](02-holiday-sourcing.md). What *was* established live is the provider's
behaviour: four probes against `date.nager.at`, recorded row by row in the Observations table of
[02-holiday-sourcing.contracts.md](02-holiday-sourcing.contracts.md). The rig itself was not
brought up.

**Bringing it up**

| Step | Command | Observed |
|---|---|---|
| Install | `npm install` from the repository root | not run |
| Database | `docker compose up -d` | not run |
| Migration | `npx prisma migrate dev` from `apps/api` | not run |
| Unit | `npm run test:unit` | not run |
| Integration, this area only | `npm test -- test/holiday-sourcing.spec.ts` from `apps/api` | not run |
| E2E, this area only | `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/holidays.spec.ts tests/regressions.spec.ts` from `e2e` | not run |

`prisma generate` and `prisma migrate` run **from `apps/api`**; run from the repository root they
produce a client that cannot find `apps/api/.env`. The suite claims its own ports under `CI`, so
the pair above is a request rather than a fact about where it will answer.

**Reaching the states the cases need**

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| An admin session, and a manager session | `signInAsAdmin` / the manager helper in `e2e/tests/helpers.ts`, already used by `holidays.spec.ts` | yes | not run |
| Members with stated countries | `PUT /api/organizations/{orgId}/members/{memberId}`, the route `time-off/01` put the member country on | yes | not run |
| An organization country | `PUT /api/organizations/{orgId}/settings/country` | yes | not run |
| A provider answering Poland's shape — all nationwide | The `fake` driver, seeded per test | **no** | not run |
| A provider answering Germany's shape — 10 of 20 regional | The same `fake` driver | **no** | not run |
| A provider answering empty, failing, and never answering | The same `fake` driver | **no** | not run |
| Member financial settings and a mid-year rate change | The `MemberFinancials` and snapshot helpers `vacation-financials.spec.ts` uses | yes | not run |
| Two members on different currencies | The same helpers, with two `currency` values | yes | not run |
| A caller with `view-holidays` and without `view-amounts-owed` | **No role holds this combination today** — both are admin-and-manager | **no** | not run |

Three rows are `no` and each is a task this spec owes.

The `fake` driver is the largest: it must reproduce all six behaviours the contracts file's
*What the double must reproduce* table names, and it is what keeps every test off the network.

The last row is the sharpest. REQ-02-017 withholds money from a caller holding `view-holidays`
and not `view-amounts-owed`, and **no role in the shipped matrix is in that state**, so the rule
cannot be observed through a session. TC-02-INT-11 therefore drives the service's capability
check directly rather than through a signed-in role, and the Known Gap below says so.

**Access this needs**

| What | Name | Where the value lives | How the next agent gets it | Proven against |
|---|---|---|---|---|
| Provider selection | `HOLIDAY_PROVIDER` | `apps/api/.env` locally; Terraform in a deployed environment | Unset locally — it defaults to `fake` outside production | not run |
| Provider endpoint | `HOLIDAY_PROVIDER_BASE_URL` | as above | Unset locally; the `nager` driver carries the public base URL as its default | not run |
| Call bound | `HOLIDAY_PROVIDER_TIMEOUT_MS` | as above | Unset locally; the driver carries a default | not run |

**No credential exists for this provider**, so there is no secret to place, rotate or leak. No
value above is secret and none is written into a tracked file.

**Rehearsal**

The provider itself was rehearsed, and this is the part of the plan that *was* run: four live
`GET`s against `date.nager.at` — `2026/PL`, `2026/DE`, `AvailableCountries` and `2026/IN`. What
came back is in the Observations table, including the two findings that changed the spec: ten of
Germany's twenty 2026 entries are regional, which is what REQ-02-005 exists for, and the
enumeration does not contain `IN` or `AE`, which is what REQ-02-009 and the uncovered-country
warning exist for. No file was written and none needed deleting.

## Test Cases

### TC-02-UNIT-01

- **Level:** Unit
- **Covers:** REQ-02-001
- **Steps:** Build the set from four memberships — one stating `PL`, one stating `US`, one
  stating `PL` again, one stating nothing — against an organization stating `US`, with the
  include flag off.
- **Expected Result:** `["PL", "US"]`, distinct and order-stable. The member stating nothing
  contributes `US` through the fallback chain, not a null and not a fourth entry.

### TC-02-UNIT-02

- **Level:** Unit
- **Covers:** REQ-02-002
- **Steps:** Build the set from one membership stating `PL`, against an organization stating
  `GB`, with the flag off and then on. Then build it with the flag off from a membership stating
  `GB` against the same organization.
- **Expected Result:** `["PL"]`, then `["PL", "GB"]`, then `["GB"]` — Edge case 4: a country a
  member resolves to stays in the set whatever the flag says.

### TC-02-INT-01

- **Level:** Integration
- **Covers:** REQ-02-003, REQ-02-004, REQ-02-005, REQ-02-021, REQ-02-022
- **Asserts:** `POST /api/organizations/{orgId}/holidays/sync` → 200
- **Steps:** Seed one active member stating `DE`. Point the fake driver at Germany's shape — 20
  entries, 10 of them `global: false`. Sync the current year as an admin.
- **Expected Result:** `200`. The `DE` row reports `written: 10`, `discarded: 10`, `skipped: 0`.
  Ten `Holiday` rows exist, each with `source: "imported"`, `paidHours` of `8.00`, `countryCode`
  of `DE`, an `externalKey` of `nager:DE:{date}` and a non-null `importedAt`. No row exists for
  any of the ten regional dates. One `HolidayImport` row exists with `holidayCount: 10`.

### TC-02-INT-02

- **Level:** Integration
- **Covers:** REQ-02-007
- **Asserts:** `POST /api/organizations/{orgId}/holidays/sync` → 200
- **Steps:** Run TC-02-INT-01's sync, record how many times the fake driver was called, then sync
  the same year again with no refresh flag.
- **Expected Result:** `200`. The driver's call count is unchanged — the second sync called it
  zero times. The `DE` row reports `written: 0` and state `sourced`. The `HolidayImport` row's
  `importedAt` is unchanged.

### TC-02-INT-03

- **Level:** Integration
- **Covers:** REQ-02-007
- **Asserts:** `DELETE /api/organizations/{orgId}/holidays/{holidayId}` → 204; `POST /api/organizations/{orgId}/holidays/sync` → 200
- **Steps:** After TC-02-INT-01, delete one imported holiday as an admin. Sync the year again
  with no refresh flag.
- **Expected Result:** The deleted holiday does not come back. Nine `Holiday` rows remain and the
  driver was not called.

### TC-02-INT-04

- **Level:** Integration
- **Covers:** REQ-02-006
- **Asserts:** `POST /api/organizations/{orgId}/holidays` → 201; `POST /api/organizations/{orgId}/holidays/sync` → 200
- **Steps:** Create a manual holiday on a date the fake driver will also return for `DE`, with
  `paidHours` of `4.00` and a name of the admin's own. Sync.
- **Expected Result:** `200`. That date carries exactly one `Holiday` row, still
  `source: "manual"`, still `4.00`, still the admin's name. The sync counts it in `skipped`.

### TC-02-INT-05

- **Level:** Integration
- **Covers:** REQ-02-009
- **Asserts:** `POST /api/organizations/{orgId}/holidays/sync` → 200; `GET /api/organizations/{orgId}/holidays` → 200
- **Steps:** Seed members stating `PL` and `DE`. Make the fake driver answer Poland's shape for
  `PL` and refuse the connection for `DE`. Sync.
- **Expected Result:** `200`, not a `5xx`. `PL` reports `sourced` with `written: 14`; `DE`
  reports `unsourced` with `written: 0`. One `HolidayImport` row exists and it is `PL`'s. The
  subsequent list read reports `DE` as `unsourced` in `sourcing.countries`.

### TC-02-INT-06

- **Level:** Integration
- **Covers:** REQ-02-010, REQ-02-023
- **Asserts:** `POST /api/organizations/{orgId}/holidays/sync` → 200
- **Steps:** Seed one member stating a country the fake driver answers with an empty array for.
  Sync, record the driver's call count, and sync again with no refresh flag.
- **Expected Result:** The first sync reports state `empty` and writes a `HolidayImport` with
  `holidayCount: 0`. The second sync does not call the driver — an empty answer is recorded, not
  re-asked.

### TC-02-INT-07

- **Level:** Integration
- **Covers:** REQ-02-008, REQ-02-021, REQ-02-023
- **Asserts:** `POST /api/organizations/{orgId}/holidays/sync` → 200
- **Steps:** After TC-02-INT-03 — nine rows, one deliberately deleted — sync the year with
  `refresh: true`.
- **Expected Result:** `200`. The driver was called. Ten rows exist again: the deleted one is
  written, the nine survivors are counted in `skipped`, and their `paidHours` and names are
  untouched. This is Edge case 9, and it is the one case where a deletion does not survive —
  because the admin asked for it. Then refresh once more, with nothing left to write: the `DE`
  row reports `written: 0, skipped: 10`, the country is still `sourced`, and its `HolidayImport`
  still carries `holidayCount: 10` — the offered count, not the written one (REQ-02-021).

### TC-02-INT-08

- **Level:** Integration
- **Covers:** REQ-02-013, REQ-02-014
- **Asserts:** `GET /api/organizations/{orgId}/holidays/summary` → 200
- **Steps:** Seed two members stating `PL` and one stating `US`, with holidays sourced for both.
  Read the summary for that year as an admin.
- **Expected Result:** `200`. `countries` carries `PL` with `memberCount: 2` and `US` with
  `memberCount: 1`, each with the number of holiday rows carrying that code. Each member's
  `holidayCount` is the number of holidays that reach them through the country chain, and their
  `paidHours` is the sum of those holidays' `paidHours` as a two-decimal string.
  `totals.holidayCount` is the sum over **members**, not over countries. Then add one holiday
  with a null `countryCode` and re-read: `countries` gains a row keyed `null` carrying one day
  and a `memberCount` of three, every member's `holidayCount` rises by one, and the country rows
  no longer sum to the total — which is Edge case 22 and is correct, because the two arrays
  count different things.

### TC-02-INT-09

- **Level:** Integration
- **Covers:** REQ-02-015
- **Asserts:** `GET /api/organizations/{orgId}/holidays/summary` → 200; `GET /api/organizations/{orgId}/reports/amounts-owed` → 200
- **Steps:** Seed a member with financial settings and a snapshot that changes their rate part
  way through the year, and holidays on both sides of the change. Read the summary for the year,
  then read the Amounts Owed report over the same year and sum its holiday rows for that member.
- **Expected Result:** The two figures are equal to the cent. Each holiday was valued at the rate
  in force on its own date — Edge case 15 — so a single-rate calculation fails this case.

### TC-02-INT-10

- **Level:** Integration
- **Covers:** REQ-02-016
- **Asserts:** `GET /api/organizations/{orgId}/holidays/summary` → 200
- **Steps:** Seed two members whose financial settings name different currencies, both with
  holidays.
- **Expected Result:** `totals.byCurrency` has two entries, one per currency, each summing only
  its own members, and each member's own `byCurrency` has one. No field anywhere in the body
  carries a total across the two. Then move one member's currency mid-year through a second
  snapshot and re-read: that member's `byCurrency` now has two entries whose amounts split their
  holidays by the currency in force on each holiday's own date, and nothing is converted between
  them — Edge case 15a.

### TC-02-INT-11

- **Level:** Integration
- **Covers:** REQ-02-017
- **Asserts:** `GET /api/organizations/{orgId}/holidays/summary` → 200
- **Steps:** Drive the summary for a caller holding `view-holidays` and not `view-amounts-owed`.
  No shipped role is in that state, so the case supplies the capability set directly to the
  service rather than signing a session in.
- **Expected Result:** `200` with every `holidayCount` and every `paidHours` present. No member
  row has a `byCurrency` **key at all**, and neither has `totals` — the field is absent, not
  null, not empty and not zero.

### TC-02-INT-12

- **Level:** Integration
- **Covers:** REQ-02-018, REQ-02-024
- **Asserts:** `GET /api/organizations/{orgId}/holidays/summary` → 200
- **Steps:** Seed two members in one country, one with financial settings and one without.
- **Expected Result:** Both rows carry the same `holidayCount` and `paidHours`. The member
  without settings has no `byCurrency` key, and contributes nothing to `totals.byCurrency`,
  which still carries the other member's currency and amount.

### TC-02-INT-13

- **Level:** Integration
- **Covers:** REQ-02-019, REQ-02-020
- **Asserts:** `GET /api/organizations/{orgId}/holidays/summary` → 404; `POST /api/organizations/{orgId}/holidays/sync` → 404; `GET /api/organizations/{orgId}/settings/holiday-sourcing` → 404; `PUT /api/organizations/{orgId}/settings/holiday-sourcing` → 404
- **Steps:** Call all four routes as a `user`, as a `viewer`, and as an admin of a **different**
  organization using this organization's `orgId` in the path. Then call the two write routes as a
  `manager` and the two read routes as a `manager`.
- **Expected Result:** Every call in the first group answers `404` and no body names a capability
  or confirms the organization exists. The manager's four calls answer `200` — a manager holds
  both capabilities.

### TC-02-INT-14

- **Level:** Integration
- **Covers:** REQ-02-011
- **Asserts:** `POST /api/organizations/{orgId}/holidays/sync` → 200
- **Steps:** Set the call bound to a short interval. Make the fake driver never answer for one of
  two countries. Sync, and record how long the request took.
- **Expected Result:** `200` within the bound plus a small margin — the request does not hang.
  The country that never answered reports `unsourced` and wrote no `HolidayImport`; the other is
  `sourced`.

### TC-02-INT-15

- **Level:** Integration
- **Covers:** REQ-02-025
- **Asserts:** `GET /api/organizations/{orgId}/holidays` → 200
- **Steps:** Seed an organization with holidays sourced for one country. Read
  `GET .../holidays?scope=mine&year={the sourced year}` as a `user`, then as a `viewer`, then
  read the same route with `scope=all` as an admin.
- **Expected Result:** All three answer `200`. The `user`'s and the `viewer`'s bodies carry
  `source` on every holiday row and **no `sourcing` key at all** — absent, not null and not
  empty — so neither learns which countries the organization sources. The admin's body carries
  the `sourcing` block with one entry per country in the set.

### TC-02-INT-16

- **Level:** Integration
- **Covers:** REQ-02-006
- **Asserts:** `POST /api/organizations/{orgId}/holidays` → 201; `POST /api/organizations/{orgId}/holidays/sync` → 200; `GET /api/organizations/{orgId}/reports/amounts-owed` → 200
- **Steps:** Seed one active member resolving to `PL`. Create a holiday by hand on a date the
  fake driver will return for `PL`, with `countryCode` **null** — the form's `All countries`
  option. Create a second by hand, on another date the driver will also return, with
  `countryCode` `FR`. Sync the year, then read Amounts Owed over it.
- **Expected Result:** The null-country date carries exactly one `Holiday` row, still the manual
  one, and the sync counts it in `skipped` — Edge case 7a. The `FR` date carries **two** rows,
  the manual `FR` one and a written `PL` one, and the sync counts the entry in `written` — Edge
  case 7b. Amounts Owed emits exactly one paid `Holiday · …` row for the member on the
  null-country date; two would be the double payment REQ-02-006 exists to prevent.

### TC-02-E2E-01

- **Level:** E2E
- **Covers:** REQ-02-012
- **Steps:** Sign in as an admin in an organization with two members stating countries and no
  holidays stored. Open Settings › Holidays and click the tab for the current year. Click
  nothing else.
- **Expected Result:** `holiday-sourcing-status` appears carrying
  `HOLIDAY_SOURCING_MESSAGES.syncing`, then goes; `holidays-table` appears with rows for both
  countries and `holidays-empty-state` is absent. No control was clicked to make this happen.
  Switching to the next year tab repeats it for that year.
- **Selectors:** `holidays-year-tab-{year}`, `holiday-sourcing-panel`,
  `holiday-sourcing-status`, `holidays-table`, `holidays-row-{id}`, `holidays-row-{id}-source`,
  `holidays-empty-state` (absent).
- **Fails today:** the screen shows `holidays-empty-state` and no sync exists to issue.

E2E rather than integration because the assertion is that a screen issues a request nobody asked
it to, and then repaints — which is not a call an API test can make.

### TC-02-E2E-02

- **Level:** E2E
- **Covers:** REQ-02-002
- **Steps:** Sign in as an admin in an organization whose stated country no member resolves to.
  Open Settings › Holidays with the year already sourced. Untick
  `holiday-sourcing-include-org-country`, wait for the summary to repaint, then reload the page.
  Tick it again and click `holiday-sourcing-refresh-btn`.
- **Expected Result:** With the box ticked, `holiday-summary-country-{orgCountry}` is present.
  Unticked, it is absent. After the reload the box is still unticked and the country is still
  absent — the setting is stored, not in-page state. After the re-tick and the refresh,
  `holiday-sourcing-status` appears and the country returns to the summary.
- **Selectors:** `holiday-sourcing-panel`, `holiday-sourcing-include-org-country`,
  `holiday-sourcing-refresh-btn`, `holiday-sourcing-status`, `holiday-summary`,
  `holiday-summary-country-{countryCode}`.
- **Fails today:** the control does not exist.

### TC-02-E2E-03

- **Level:** E2E
- **Covers:** REQ-02-009
- **Steps:** Sign in as an admin in an organization with one member stating a country the fake
  driver refuses and one stating a country it answers. Open Settings › Holidays.
- **Expected Result:** `holiday-sourcing-uncovered` is present and
  `holiday-sourcing-uncovered-{code}` names the refused country with
  `HOLIDAY_SOURCING_MESSAGES.countryNotCovered`. The other country's holidays are in the table.
  `holidays-error-banner` is absent — the screen is working, and partial data is not an error.
- **Selectors:** `holiday-sourcing-uncovered`, `holiday-sourcing-uncovered-{countryCode}`,
  `holidays-table`, `holidays-error-banner` (absent).
- **Fails today:** neither id exists.

### TC-02-E2E-04

- **Level:** E2E
- **Covers:** REQ-02-013, REQ-02-014, REQ-02-015
- **Steps:** Sign in as an admin in the organization TC-02-INT-08 seeds. Open Settings ›
  Holidays for that year.
- **Expected Result:** `holiday-summary` sits above `holidays-table` in the document.
  `holiday-summary-country-{code}-days` shows each country's day count,
  `holiday-summary-member-{membershipId}-days` each member's, and
  `holiday-summary-member-{membershipId}-amount` each member's money.
  `holiday-summary-total-{currency}` shows the currency total. Every figure matches what
  TC-02-INT-08 and TC-02-INT-09 assert of the same fixture.
- **Selectors:** `holiday-summary`, `holiday-summary-country-{countryCode}`,
  `holiday-summary-country-{countryCode}-days`, `holiday-summary-member-{membershipId}`,
  `holiday-summary-member-{membershipId}-days`,
  `holiday-summary-member-{membershipId}-amount`, `holiday-summary-total-{currency}`,
  `holidays-table`.
- **Fails today:** no summary is drawn.

E2E rather than integration only for the ordering and presence of the block — the arithmetic is
asserted at integration, where it costs a fraction of a second instead of eight.
