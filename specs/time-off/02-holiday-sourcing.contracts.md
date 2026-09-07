# Holiday sourcing and what it costs — contracts

Rules live in [02-holiday-sourcing.md](02-holiday-sourcing.md) and are referenced here by id.

## Routes

| Route | Guards | Success | Errors |
|---|---|---|---|
| `GET /api/organizations/{orgId}/holidays` | `SessionGuard`, `OrgScopeGuard`; `scope=mine` answers every active member, any other scope needs `view-holidays`, checked in the service | `200` | `404` (no `view-holidays` on a scope other than `mine`; wrong organization) |
| `POST /api/organizations/{orgId}/holidays/sync` | `SessionGuard`, `OrgScopeGuard`; `manage-holidays` checked in the service | `200` | `404` (no `manage-holidays`, REQ-02-020; wrong organization) · `422` `HOLIDAY_SOURCING_MESSAGES.yearInvalid` |
| `GET /api/organizations/{orgId}/holidays/summary` | `SessionGuard`, `OrgScopeGuard`; `view-holidays` checked in the service | `200` | `404` (no `view-holidays`, REQ-02-019; wrong organization) · `422` `HOLIDAY_SOURCING_MESSAGES.yearInvalid` |
| `GET /api/organizations/{orgId}/settings/holiday-sourcing` | `SessionGuard`, `OrgScopeGuard`; `view-holidays` checked in the service | `200` | `404` (no `view-holidays`, REQ-02-019; wrong organization) |
| `PUT /api/organizations/{orgId}/settings/holiday-sourcing` | `SessionGuard`, `OrgScopeGuard`; `manage-holidays` checked in the service | `200` | `404` (no `manage-holidays`, REQ-02-020; wrong organization) · `422` `HOLIDAY_SOURCING_MESSAGES.includeOrgCountryInvalid` |
| `POST /api/organizations/{orgId}/holidays` | `SessionGuard`, `OrgScopeGuard`; `manage-holidays` checked in the service | `201` | `404` (no `manage-holidays`; wrong organization) · `422` (the holiday form's own field messages) |
| `DELETE /api/organizations/{orgId}/holidays/{holidayId}` | `SessionGuard`, `OrgScopeGuard`; `delete-holidays` checked in the service | `204` | `403` `HOLIDAY_MESSAGES.deleteForbidden` · `404` (holiday not found; wrong organization) |
| `GET /api/organizations/{orgId}/reports/amounts-owed` | `SessionGuard`, `OrgScopeGuard`; `view-amounts-owed` checked in the service | `200` | `404` (no capability; wrong organization) · `422` (its own range messages) |

**Every row marked `no` in the New column below ships today and this spec changes none of them.**
They are carried here because this bundle's cases call them — TC-02-INT-03 deletes a holiday,
TC-02-INT-04 creates one, and TC-02-INT-09 reads the report to prove the two screens agree about
money — and a case that calls a route the bundle does not declare is a case whose expected status
nothing checks.

| Route | New |
|---|---|
| `POST /api/organizations/{orgId}/holidays/sync` | yes |
| `GET /api/organizations/{orgId}/holidays/summary` | yes |
| `GET /api/organizations/{orgId}/settings/holiday-sourcing` | yes |
| `PUT /api/organizations/{orgId}/settings/holiday-sourcing` | yes |
| `GET /api/organizations/{orgId}/holidays` | no — it gains one response field |
| `POST /api/organizations/{orgId}/holidays` | no |
| `DELETE /api/organizations/{orgId}/holidays/{holidayId}` | no |
| `GET /api/organizations/{orgId}/reports/amounts-owed` | no |

`GET .../holidays` keeps every guard, status and query parameter it ships with — `year`,
`country`, `scope` — and its `holidays` array is unchanged in shape. It **gains one field**,
`sourcing`, described below. Nothing is removed from it.

**A provider failure is never a status.** REQ-02-009 makes it a `200` carrying an unsourced
country, so no row of this table names one.

### `GET /api/organizations/{orgId}/holidays`

```json
{
  "holidays": [
    { "id": "…", "name": "Independence Day", "date": "2026-11-11", "paidHours": "8.00", "countryCode": "PL", "source": "imported" }
  ],
  "sourcing": {
    "year": 2026,
    "countries": [
      { "countryCode": "PL", "state": "sourced", "holidayCount": 13, "lastImportedAt": "2026-09-07T09:12:44.000Z" },
      { "countryCode": "US", "state": "sourced", "holidayCount": 11, "lastImportedAt": "2026-09-07T09:12:45.000Z" },
      { "countryCode": "IN", "state": "unsourced", "holidayCount": 0, "lastImportedAt": null }
    ]
  }
}
```

`state` is one of `sourced`, `empty`, `unsourced`. `sourcing.countries` is the sourced country
set of REQ-02-001 and REQ-02-002 — a country with no import record appears here as `unsourced`,
which is what REQ-02-012 reads to decide whether to sync.

### `POST /api/organizations/{orgId}/holidays/sync`

Body: `{ "year": 2026, "refresh": false }`. `refresh` is optional and defaults to `false`.

```json
{
  "year": 2026,
  "countries": [
    { "countryCode": "PL", "state": "sourced", "written": 13, "skipped": 0, "discarded": 0 },
    { "countryCode": "DE", "state": "sourced", "written": 10, "skipped": 0, "discarded": 10 },
    { "countryCode": "IN", "state": "unsourced", "written": 0, "skipped": 0, "discarded": 0 }
  ]
}
```

`written`, `skipped` and `discarded` are the three outcomes of the entry decision table.
`discarded` is the count of regional entries REQ-02-005 refused.

### `GET /api/organizations/{orgId}/holidays/summary`

```json
{
  "year": 2026,
  "countries": [
    { "countryCode": "PL", "holidayCount": 13, "memberCount": 2 },
    { "countryCode": "US", "holidayCount": 11, "memberCount": 1 }
  ],
  "members": [
    { "membershipId": "…", "displayName": "Alex Kaminski", "countryCode": "PL", "holidayCount": 13, "paidHours": "104.00", "amount": "5200.00", "currency": "USD" },
    { "membershipId": "…", "displayName": "Sam Reed", "countryCode": null, "holidayCount": 0, "paidHours": "0.00" }
  ],
  "totals": {
    "holidayCount": 24,
    "paidHours": "192.00",
    "byCurrency": [{ "currency": "USD", "amount": "9600.00" }]
  }
}
```

`amount` and `currency` are **absent** — not null — on every member row and `byCurrency` is
absent from `totals` when the caller does not hold `view-amounts-owed` (REQ-02-017), and absent
on the individual row of a member with no financial settings (REQ-02-018). Every money value and
every hours value is a two-decimal string, the shape the reports already send.

### `GET` / `PUT /api/organizations/{orgId}/settings/holiday-sourcing`

Both bodies: `{ "includeOrgCountry": true }`. `PUT` accepts that one field and nothing else.

## Error Messages

| Export | Route | Message | New |
|---|---|---|---|
| `HOLIDAY_SOURCING_MESSAGES.yearInvalid` | `POST /api/organizations/{orgId}/holidays/sync`, `GET /api/organizations/{orgId}/holidays/summary` | Choose a year between 2000 and 2100. | yes |
| `HOLIDAY_SOURCING_MESSAGES.includeOrgCountryInvalid` | `PUT /api/organizations/{orgId}/settings/holiday-sourcing` | Choose whether to include the organization's country. | yes |
| `HOLIDAY_SOURCING_MESSAGES.syncFailedSome` | — | Some countries could not be sourced. | yes |
| `HOLIDAY_SOURCING_MESSAGES.countryNotCovered` | — | The holiday service does not cover this country. Add its holidays by hand. | yes |
| `HOLIDAY_SOURCING_MESSAGES.syncing` | — | Fetching public holidays… | yes |
| `HOLIDAY_SOURCING_MESSAGES.summaryUnavailable` | — | The day and cost totals could not be loaded. | yes |
| `HOLIDAY_MESSAGES.deleteForbidden` | `DELETE /api/organizations/{orgId}/holidays/{holidayId}` | You don't have permission to delete holidays. | no |
| `HOLIDAY_MESSAGES.toastServerError` | every route above | (shipped, unchanged) | no |

The four `—` rows are screen text, emitted by no route. They are tabulated here because a screen
that invents a sentence is a screen whose wording nothing governs — the rule
`packages/validation` exists for.

## Data Model

### `HolidayImport` (new)

| Field | Type | Description |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `organizationId` | `String` | FK → `Organization.id`, `onDelete: Cascade` |
| `countryCode` | `String @db.Char(2)` | ISO 3166-1 alpha-2, uppercase. Never null — a global holiday is not sourced |
| `year` | `Int` | The calendar year sourced |
| `provider` | `String` | The driver that answered, e.g. `nager` |
| `holidayCount` | `Int` | How many rows this import wrote. `0` is the covered-but-empty state (REQ-02-010) |
| `importedAt` | `DateTime @default(now())` | Updated on a refresh |

`@@unique([organizationId, countryCode, year])` — invariant 3, enforced by the index rather than
by the service.

### `OrganizationHolidaySourcing` (new)

| Field | Type | Description |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `organizationId` | `String @unique` | FK → `Organization.id`, `onDelete: Cascade`. One row per organization |
| `includeOrgCountry` | `Boolean @default(true)` | REQ-02-002. The default is what an organization with no row reads as |
| `updatedAt` | `DateTime @updatedAt` | |
| `updatedByAccountId` | `String` | FK → `Account.id` |

A missing row reads as `includeOrgCountry: true`, so no backfill is needed and no organization
changes behaviour before somebody touches the checkbox.

### Columns added to `Holiday`

| Field | Type | Description |
|---|---|---|
| `source` | `String @default("manual")` | `manual` or `imported`. A documented string column, matching the role/status convention — not a Prisma enum |
| `externalKey` | `String?` | The provider's stable key, `{provider}:{countryCode}:{date}`. Null on a manual row |
| `importedAt` | `DateTime?` | When an import wrote this row. Null on a manual row |

**Additive.** Every existing row reads `source: "manual"` from the default and both nullable
columns as null, which is exactly what those rows are. No existing query changes meaning, and old
code deployed against the new schema selects none of the columns in the table above.

## Validation Rules

| # | Field | Constraint | Message | Server-only |
|---|---|---|---|---|
| 1 | `year` | An integer from 2000 to 2100 inclusive | `yearInvalid` | no |
| 2 | `includeOrgCountry` | A boolean; absent or non-boolean is refused, never coerced | `includeOrgCountryInvalid` | no |
| 3 | `refresh` | A boolean; absent means `false` | — | no |
| 4 | A provider entry's `date` | `YYYY-MM-DD` and inside the requested year | discarded silently, counted | yes |
| 5 | A provider entry's `countryCode` | Equals the country requested | discarded silently, counted | yes |
| 6 | A provider entry's name | 1–120 characters after trimming, passing `validateHolidayName` | discarded silently, counted | yes |
| 7 | The sourced country set | Each code passes `validateCountryCode` | a code that fails is dropped from the set | yes |

Rules 4 to 7 are server-only because they judge a third party's payload, which no client sees. A
provider entry that fails any of them is discarded and counted in `discarded`; it never becomes a
`422`, because the caller did not send it and cannot fix it.

The client re-runs rules 1 to 3 before spending a request. The server re-validates all seven.

## Required data-testid Attributes

| id | Screen | Asserted |
|---|---|---|
| `holiday-sourcing-panel` | Settings › Holidays | present for admin and manager |
| `holiday-sourcing-include-org-country` | Settings › Holidays | present for admin and manager |
| `holiday-sourcing-refresh-btn` | Settings › Holidays | present for admin and manager |
| `holiday-sourcing-status` | Settings › Holidays | present while a sync is in flight |
| `holiday-sourcing-uncovered` | Settings › Holidays | present when at least one country is `unsourced` or `empty`, `absent` otherwise |
| `holiday-sourcing-uncovered-{countryCode}` | Settings › Holidays | present per uncovered country |
| `holiday-summary` | Settings › Holidays | present for `view-holidays` |
| `holiday-summary-country-{countryCode}` | Settings › Holidays | present per country in the sourced set |
| `holiday-summary-country-{countryCode}-days` | Settings › Holidays | present per country |
| `holiday-summary-member-{membershipId}` | Settings › Holidays | present per active member |
| `holiday-summary-member-{membershipId}-days` | Settings › Holidays | present per active member |
| `holiday-summary-member-{membershipId}-amount` | Settings › Holidays | present for `view-amounts-owed`, `absent` otherwise |
| `holiday-summary-total-{currency}` | Settings › Holidays | present per currency, for `view-amounts-owed` |
| `holidays-row-{id}-source` | Settings › Holidays | present per row |
| `holidays-year-tab-{year}` | Settings › Holidays | present per year tab |
| `holidays-table` | Settings › Holidays | present when the year has at least one holiday |
| `holidays-row-{id}` | Settings › Holidays | present per holiday |
| `holidays-empty-state` | Settings › Holidays | `absent` once a year has been sourced with holidays |
| `holidays-error-banner` | Settings › Holidays | `absent` when only some countries are uncovered |

Each row above through `holidays-row-{id}-source` is new. Each row below it ships today, is
asserted by this bundle's cases, and keeps the meaning it has.

`holidays-page`, `holidays-table`, `holidays-row-{id}`, `holidays-country-filter`,
`org-country-select`, `holidays-empty-state` and the rest of the shipped roster keep their
meanings.

## Screens

### `/org/{orgId}/settings/holidays`

```
Holidays                                                    [ + Add holiday ]
Paid public days for your organization.

 2025   [2026]   2027

 Organization country                                    Sourcing
 [ United States        ▾]  [ Save country ]             [x] Include organization country
 Members without a country of their own get this               [ Refresh 2026 ]
 country's holidays.
 [ All countries        ▾]

 ⚠ The holiday service does not cover India. Add its holidays by hand.

 ┌── Paid public days, 2026 ──────────────────────────────────────────────┐
 │ Poland          13 days   2 people      United States   11 days  1 person│
 ├────────────────────────────────────────────────────────────────────────┤
 │ Alex Kaminski   PL   13 days   104.00 h   $5,200.00                     │
 │ Ivan Demchenko  PL   13 days   104.00 h   $5,200.00                     │
 │ Sam Reed        US   11 days    88.00 h   $4,400.00                     │
 ├────────────────────────────────────────────────────────────────────────┤
 │ Total                37 days   296.00 h   $14,800.00                    │
 └────────────────────────────────────────────────────────────────────────┘

 ┌ January 2026 ──────────────────────────────────────────────────────────┐
 │ Thu 1 Jan   New Year's Day        8h   PL  Poland          imported  ✎ │
```

The summary sits **above** the holiday list: it is the answer to the question the year tab asked,
and the list is the evidence for it. The list itself is unchanged but for one column — where each
row came from.

## UI Description

| Surface | Behaviour |
|---|---|
| Loading | The shipped `Preloader` for the list. The summary block draws its own, and neither blocks the other |
| Syncing | `holiday-sourcing-status` carries `syncing`. The year tabs and the list stay interactive; the summary shows its preloader until the re-read lands |
| Empty | The shipped empty state, only when the year genuinely has no holiday **and** every country in the set is `sourced` or `empty` — an unsourced country shows the warning instead, because "no holidays" would be a claim the product cannot make |
| Some countries uncovered | `holiday-sourcing-uncovered` above the summary, naming each country with `countryNotCovered`. Not an error banner: the screen is working and the data is partial |
| Summary unavailable | `summaryUnavailable` in the summary's place. The list is unaffected |
| Read-only | No role reaches this screen without `manage-holidays`, so there is no read-only rendering. `user` and `viewer` are redirected to Members |
| Permission-limited | A caller with `view-holidays` and without `view-amounts-owed` sees every day count and no money column, no totals row and no currency |
| Error | The shipped `holidays-error-banner` with its Retry, unchanged |

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | Every active member has a country and the organization has none | The set is the members' countries. The checkbox adds nothing and stays enabled |
| 2 | No member has a country and the organization has one, checkbox on | The set is that one country. Every member resolves to it through the fallback chain |
| 3 | No member has a country and the organization has none | The set is empty. No sync is issued, the summary reports zero days for every member, and the list shows only global holidays |
| 4 | Checkbox turned off while the organization's country is also a member's | The country stays in the set — a member resolves to it (REQ-02-001), and the checkbox only governs REQ-02-002's addition |
| 5 | A member's country is set to India | `IN` joins the set, the sync reports it `unsourced`, `holiday-sourcing-uncovered-IN` appears, and the member's summary row reads 0 days |
| 6 | A provider entry is regional | Discarded and counted in `discarded`. For Germany 2026 this is 10 of 20 entries |
| 7 | A manual holiday already exists on an imported holiday's date and country | The manual row stands; the entry is counted as `skipped` and the list shows one row, `manual` |
| 8 | An admin deletes an imported holiday, then reloads the year | It stays deleted. The import record exists, so no call is made (REQ-02-007) |
| 9 | An admin deletes an imported holiday, then clicks Refresh | It is written again. Refresh is the explicit instruction to re-ask, and this is what it means |
| 10 | An admin edits an imported holiday's `paidHours` to 4, then clicks Refresh | The edit stands — the date and country already carry a row, so the entry is `skipped` (REQ-02-006) |
| 11 | The provider times out for one country in a set of three | The other two are written and recorded; the third is reported `unsourced`. `200` |
| 12 | Two admins open the same unsourced year at the same instant | Both issue a sync; the unique index makes the second's writes collide and be counted as `skipped`. One import record exists |
| 13 | A member is deactivated between the sync and the summary | They leave the summary's `members` array and their country leaves `countries` if nobody else resolves to it. No holiday row is deleted |
| 14 | Two members on different currencies | `byCurrency` carries two rows. No total spans them (REQ-02-016) |
| 15 | A member's rate changed mid-year | Each holiday is valued at the rate in force on its own date, from the snapshot history |
| 16 | A member with no financial settings | Day count and paid hours present, `amount` and `currency` absent from their row and excluded from `byCurrency` |
| 17 | `year` of `1999` | `422` `yearInvalid`, on both routes that take it |
| 18 | The year tab is switched while a sync for the previous year is in flight | The in-flight request is abandoned; its answer never repaints a year nobody is looking at |
| 19 | An organization whose country code is not one the provider covers, checkbox on | The country joins the set and is reported `unsourced`. The organization-country picker is unaffected |
| 20 | A caller holding `view-holidays` but not `view-amounts-owed` reads the summary | `200` with every day count and no `amount`, no `currency`, no `byCurrency` |

## Security

- Organization scope comes from the session, never from the path. `OrgScopeGuard` answers `404`
  — not `403` — on a mismatch, and every query and every write scopes by
  `session.organizationId`. An import writes `Holiday` rows for the caller's organization only.
- **A capability per question.** `view-holidays` gates the day counts and `view-amounts-owed`
  gates the money. REQ-02-017 omits the withheld fields rather than zeroing them, so a body
  cannot be read for the shape of what it did not say.
- **The provider is never told who we are.** The request carries a year and a country code and no
  header identifying the organization, the account or the deployment. Nothing about the member
  set leaves this system — the country codes sent are a set, not a per-person list, and the
  provider cannot tell one organization's request from another's.
- **The provider's payload is untrusted input.** Rules 4 to 6 re-validate every field of every
  entry against the same functions a typed holiday passes, and a failing entry is discarded. A
  name is stored, never rendered as markup.
- The call is bounded in time (REQ-02-011) and the number of calls per page load is bounded by
  the country set and falls to zero once sourced (invariant 5), so a slow or hostile provider
  cannot hold a request open indefinitely or be amplified by reloading.
- No credential is introduced. The provider needs none, so none is stored, none reaches
  Terraform, and none can leak.

## External Contracts

The provider is [Nager.Date](https://date.nager.at), reached over HTTPS with no credential.

### Observations

| Claim | How established | Ran against | State the probe was in | Observed / Assumed |
|---|---|---|---|---|
| `GET /api/v3/PublicHolidays/{year}/{code}` answers a JSON array of holiday objects | Live request | `date.nager.at`, `2026/PL` | Public endpoint, no auth, no fixture | Observed |
| Each object carries `date`, `localName`, `name`, `countryCode`, `fixed`, `global`, `counties`, `launchYear`, `types` | Live request | `date.nager.at`, `2026/PL` | as above | Observed |
| `date` is `YYYY-MM-DD` | Live request | `date.nager.at`, `2026/PL` and `2026/DE` | as above | Observed |
| Poland 2026 answers 14 entries, all `global: true`, all `types: ["Public"]`, all `counties: null`, no two on one date | Live request | `date.nager.at`, `2026/PL` | as above | Observed |
| Germany 2026 answers 20 entries, of which 10 carry `global: false` and a non-null `counties` array of `DE-XX` codes | Live request | `date.nager.at`, `2026/DE` | as above | Observed |
| Germany 2026 has no two entries on one date, and every entry is `types: ["Public"]` | Live request | `date.nager.at`, `2026/DE` | as above | Observed |
| `GET /api/v3/AvailableCountries` answers objects of `countryCode` and `name` | Live request | `date.nager.at` | as above | Observed |
| That enumeration contains `US`, `GB`, `PL`, `UA` and does **not** contain `IN` or `AE` | Live request | `date.nager.at` | as above | Observed |
| That enumeration listed 204 country codes | Live request, codes counted from the enumeration itself | `date.nager.at` | as above | Observed |
| A request for an uncovered country (`2026/IN`) returns no holiday data | Live request | `date.nager.at`, `2026/IN` | as above | Observed |
| The **status code** an uncovered country answers with | — | — | The probe returned an empty body and the status was not captured | Assumed |
| No country and year answers two entries on one date | — | Two countries probed, neither did. Not established for the other 202 | Assumed |
| The service is available without a rate limit at the volume one organization's page loads produce | — | Not measured | Assumed |
| Response time under the call bound | — | Not measured | Assumed |

**No requirement rests on an `Assumed` row.** REQ-02-009 covers every one of them by treating
any non-conforming answer — a status we did not expect, an unparseable body, a timeout — as a
failure that writes nothing and reports the country unsourced. The duplicate-date assumption is
covered by REQ-02-006, which skips a date that already carries a row whatever put it there.

### Boundary values

| Value | Our unit or vocabulary | Theirs | Converted where | What detects a mismatch |
|---|---|---|---|---|
| Calendar day | `Holiday.date`, a `@db.Date`, no time component ever stored | `date`, a `YYYY-MM-DD` string | The driver, parsing as a date-only value and never through a zone-bearing `Date` | Rule 4 — an entry outside the requested year is discarded and counted |
| Country | `String @db.Char(2)`, uppercase alpha-2, validated by `validateCountryCode` | `countryCode`, alpha-2 | The driver, uppercasing before comparison | Rule 5 — an entry whose code is not the one requested is discarded |
| Holiday name | 1–120 trimmed characters, `validateHolidayName` | `name` (English) and `localName` | The driver takes `name` | Rule 6 — a name that fails is discarded and counted |
| Nationwide vs regional | Not modelled; every stored holiday applies to its whole country | `global: boolean` and `counties: string[] \| null` | The driver, keeping `global === true` only | REQ-02-005; the `discarded` count is the observable |
| Holiday type | Not modelled | `types: string[]` | The driver, requiring `types` to contain `Public` | The `discarded` count |
| Paid hours | `Decimal(4,2)`, `8.00` for an import | Not supplied | Defaulted in the driver | An admin's edit, which REQ-02-006 then protects |
| Identity | `externalKey`, `{provider}:{countryCode}:{date}` | No id of any kind is supplied | Composed in the driver | The unique index on `(organizationId, date, countryCode)` |

### What the double must reproduce

| Provider behaviour | Why a double without it certifies nothing |
|---|---|
| A country whose entries are all `global: true` (Poland's shape) | The happy path. A double that returns only this proves the writer and nothing else |
| A country mixing `global: true` and `global: false` (Germany's shape, 10 of 20) | REQ-02-005 is the rule most likely to be silently dropped, and its failure overpays every German member for ten days a year |
| An empty answer for a covered country | Separates REQ-02-010's covered-but-empty from REQ-02-009's failure. A double that cannot answer empty makes the two states one, and the service then re-asks forever |
| A failure — a refused connection, a 5xx, an unparseable body | REQ-02-009's whole surface. A double that always succeeds certifies that the screen never breaks, which is the claim being tested |
| A call that never answers | REQ-02-011. Without it the call bound is untested code and the first slow day is the first time it runs |
| An entry with a name of 200 characters, and one dated outside the requested year | Rules 4 and 6. Without them the driver is trusted to be handed clean data, which is the assumption this table exists to refuse |

The local driver is selected by `HOLIDAY_PROVIDER`, which takes `nager` or `fake` and follows the
house pattern: `fake` whenever `NODE_ENV` is not `production` and the variable is unset, so a
fresh clone needs no configuration and no test touches the network. `HOLIDAY_PROVIDER_BASE_URL`
and `HOLIDAY_PROVIDER_TIMEOUT_MS` carry the endpoint and the call bound of REQ-02-011.
