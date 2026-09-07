---
id: "02"
title: Holiday sourcing and what it costs
routes: ["/org/{orgId}/settings/holidays"]
api: ["GET /api/organizations/{orgId}/holidays", "POST /api/organizations/{orgId}/holidays/sync", "GET /api/organizations/{orgId}/holidays/summary", "GET /api/organizations/{orgId}/settings/holiday-sourcing", "PUT /api/organizations/{orgId}/settings/holiday-sourcing"]
entities: [Holiday, HolidayImport, OrganizationHolidaySourcing]
tags: [holidays, import, nager, public-holiday-api, provider-port, sourcing, amounts-owed, cost, country-coverage]
depends-on: ["01"]
bundle:
  - 02-holiday-sourcing.contracts.md
  - 02-holiday-sourcing.cases.md
---

## Summary

The Holidays screen fills itself. Today it opens empty until somebody types every public holiday
of every country their people work in, by hand, every year. This spec sources them from a public
holiday API for **every country its active members resolve to**, plus the organization's own
behind a checkbox, and answers the question an admin actually has: how many paid days is that,
per country, and what does it cost per person.

Beyond the request it adds an **outbound HTTP dependency**, the area's first, behind a provider
port with a local driver; an **additive migration**, in the contracts file's Data Model; the
**routes** in this file's frontmatter, because a read that performs writes and waits on a third
party is not a read; and **money on a screen that reads nothing financial today**, which is why
the per-person figures are gated apart from the day counts. Sourcing happens once per country
per year, never on a timer, so an admin's edits and deletions survive.

Blast radius and backward compatibility for this spec are in [README.md](README.md).

## Actors & Preconditions

| Actor | Precondition |
|---|---|
| `admin` | Holds `view-holidays`, `manage-holidays`, `delete-holidays` and `view-amounts-owed`. Sees every part of the screen |
| `manager` | Holds `view-holidays`, `manage-holidays` and `view-amounts-owed`; not `delete-holidays` |
| `user`, `viewer` | Hold none of them. The screen redirects to Members; every route here answers `404` |
| The holiday provider | A public HTTP service this repository does not own. Needs no credential, and may be unreachable, slow, or missing a country entirely |

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| Open Settings › Holidays (`view-holidays`) | ✅ | ✅ | ❌ | ❌ |
| Trigger a sync (`manage-holidays`) | ✅ | ✅ | ❌ | ❌ |
| Change the include-organization-country setting (`manage-holidays`) | ✅ | ✅ | ❌ | ❌ |
| See the per-country day counts (`view-holidays`) | ✅ | ✅ | ❌ | ❌ |
| See the per-person amounts (`view-amounts-owed`) | ✅ | ✅ | ❌ | ❌ |
| Delete an imported holiday (`delete-holidays`) | ✅ | ❌ | ❌ | ❌ |

Counts and amounts take different capabilities even though the same roles hold both today: money
is never reachable here by a capability granted for something else.

## Functional Requirements

### The country set

#### REQ-02-001 — which countries the screen sources

THE SYSTEM SHALL treat as the organization's **sourced country set** the distinct resolved
holiday country of every active membership — `Membership.countryCode` falling back to
`Organization.countryCode`, first valid alpha-2 wins, the null resolution dropped.

#### REQ-02-002 — the organization's own country is included by choice

WHERE the include-organization-country setting is on, THE SYSTEM SHALL add
`Organization.countryCode` to the sourced country set even when no member resolves to it.

**Decided:** it defaults to **on** — an organization states a country because its holidays are
paid.

### Importing

#### REQ-02-003 — a country and year are sourced once

WHEN a sync runs for a `(organization, country, year)` that has no import record, THE SYSTEM
SHALL fetch that country's holidays for that year from the provider.

#### REQ-02-021 — the import is recorded

WHEN a provider call answers, THE SYSTEM SHALL write an import record naming the provider, the
moment, and **how many entries the provider offered** for that country and year once REQ-02-005
has discarded the regional ones.

**Decided:** what the provider *had*, not what this import *wrote* — the two diverge on every
refresh of a country already stored. The reasoning is in the area README.

#### REQ-02-004 — what an imported holiday becomes

WHEN an import writes a holiday, THE SYSTEM SHALL create a `Holiday` row carrying the provider's
English name, its date, the country's alpha-2 code, `paidHours` of `8.00`, `source` of
`imported`, and the provider's stable key for that holiday.

#### REQ-02-005 — only nationwide public holidays

THE SYSTEM SHALL import a provider entry only where it is nationwide and of type `Public`.

#### REQ-02-006 — an import never overwrites what is already there

IF the date already carries a holiday whose `countryCode` is the imported country's own code or
is null, THEN THE SYSTEM SHALL write nothing and leave the existing row untouched.

**Decided:** a null-country row blocks the date too, because it already reaches that country and
a second row would be paid twice. The reasoning is in the area README.

#### REQ-02-022 — what was not written is counted

WHEN an import leaves an entry unwritten, THE SYSTEM SHALL count it as skipped where a row
already held its date, and as discarded where REQ-02-005 refused it.

#### REQ-02-007 — a sourced year is never sourced again on its own

WHILE an import record exists for a `(organization, country, year)`, THE SYSTEM SHALL NOT fetch
that country and year again except under an explicit refresh.

**Decided:** this is what makes an edit or a deletion permanent.

#### REQ-02-008 — refreshing a year

WHEN a caller holding `manage-holidays` requests a sync for a year with the refresh flag set,
THE SYSTEM SHALL fetch every country in the sourced country set for that year again, writing
only the holidays REQ-02-006 does not skip.

#### REQ-02-009 — the provider never breaks the screen

IF the provider answers with an error, answers unparseably, or does not answer within the call
bound, THEN THE SYSTEM SHALL answer `200`, write no import record for that country and year, and
report that country as unsourced.

#### REQ-02-010 — a country the provider does not cover

IF the provider offers no nationwide entry for a country and year, THEN THE SYSTEM SHALL write
an import record for it carrying a count of zero.

**Decided:** recorded rather than retried, so the provider is not re-asked forever.

#### REQ-02-023 — an empty country is reported as covered

WHILE an import record carrying a count of zero exists for a country and year, THE SYSTEM SHALL
report that country as covered-but-empty. A refresh that writes nothing because every date is
already stored does not reach this rule: REQ-02-021 records what the provider offered, so such
a record carries the offered count and the country stays `sourced`.

#### REQ-02-011 — the call is bounded

THE SYSTEM SHALL abandon a provider call that has not answered within the configured call bound.

#### REQ-02-012 — the screen syncs without being asked

WHEN Settings › Holidays loads a year for which `GET .../holidays` reports at least one
unsourced country, THE SYSTEM SHALL issue one sync for that year and re-read the list when it
answers.

### The numbers

#### REQ-02-013 — days by country

THE SYSTEM SHALL report, for a year, one row per country in the sourced country set carrying the
country's code, the number of holidays stored whose `countryCode` is that code, and how many
active members resolve to it; and, where any holiday of that year has a null `countryCode`, one
further row keyed `null` carrying their number and the count of every active member.

**Decided:** a global holiday is its own row rather than added into every country. The
reasoning is in the area README.

#### REQ-02-014 — days by person

THE SYSTEM SHALL report, for a year, one row per active membership carrying the member's
resolved country, the number of holidays that reach them, and the sum of those holidays'
`paidHours`.

#### REQ-02-015 — what a person's holidays cost

WHERE the caller holds `view-amounts-owed`, THE SYSTEM SHALL add to each member's row one
amount **per currency**, each the sum — over the holidays reaching them that were valued in that
currency — of `paidHours` multiplied by the billable rate in force on the holiday's own date.

**Decided:** the Amounts Owed rate resolution, and a list rather than one amount, because a
snapshot carries its own currency. The reasoning is in the area README.

#### REQ-02-016 — totals are grouped by currency

THE SYSTEM SHALL report a total amount per currency, never one total across currencies.

#### REQ-02-017 — money is withheld, not zeroed

IF the caller does not hold `view-amounts-owed`, THEN THE SYSTEM SHALL omit every amount and
every currency from the response body.

#### REQ-02-018 — a member with no financials

IF a member has no financial settings, THEN THE SYSTEM SHALL omit their amounts entirely.

#### REQ-02-024 — a member with no financials still has days

IF a member has no financial settings, THEN THE SYSTEM SHALL report their day count and their
paid hours as it does for any other member.

### Authorization

#### REQ-02-025 — the sourcing block is gated with the day counts

IF a caller without `view-holidays` reads `GET /api/organizations/{orgId}/holidays`, THEN THE
SYSTEM SHALL omit the `sourcing` block from the response.

**Decided:** `scope=mine` is open to every active member, so an unconditional block would hand a
`user` a roster of where the staff are. The reasoning is in the area README.

#### REQ-02-019 — the sourcing routes are gated

IF a caller without `view-holidays` requests the summary or the sourcing setting, THEN THE
SYSTEM SHALL answer `404`.

#### REQ-02-020 — writes need the manage capability

IF a caller without `manage-holidays` requests a sync or writes the sourcing setting, THEN THE
SYSTEM SHALL answer `404`.

## State Machine

A `(organization, country, year)` pair. `sourced` and `empty` are the two shapes an import
record takes; `unsourced` is the absence of one.

`decision-table: keys=(state, event) domains=(state: unsourced|sourced|empty, event: sync|refresh|providerFails)`

| state | event | Outcome |
|---|---|---|
| unsourced | sync | The provider is called. Nationwide entries offered → written per the entry table, record carries the offered count, `sourced`. None offered → record with a count of zero, `empty`. |
| unsourced | refresh | Identical to `sync` — there is no record to preserve. |
| unsourced | providerFails | Stays `unsourced`. No record, no holiday, no refusal, `200` overall. |
| sourced | sync | No call is made (REQ-02-007). Stays `sourced`. |
| sourced | refresh | The provider is called; new dates are written, existing ones skipped; the record's moment is updated and its count is set to what the provider offered (REQ-02-021). Stays `sourced` — a refresh that writes nothing is not an empty country. |
| sourced | providerFails | Reachable only under refresh. The record stands; the country is reported `unsourced` for that attempt and the state stays `sourced`. |
| empty | sync | No call is made (REQ-02-007). Stays `empty`. |
| empty | refresh | The provider is called. → `sourced` if it now answers with holidays, else stays `empty`. |
| empty | providerFails | Reachable only under refresh. The record stands. Stays `empty`. |

**Invariants**

1. A `Holiday` row is never deleted by a sync, under any state or event.
2. A `Holiday` row whose `source` is `manual` is never modified by a sync.
3. At most one import record exists per `(organization, country, year)`.
4. A failed provider call writes nothing — no holiday and no record.
5. Provider calls per page load are bounded by the country set, and are zero once all are recorded.

## Out of Scope

- **A scheduler.** This repository runs no cron; adding one is infrastructure with its own spec.
- **Regional holidays.** They need a subdivision on the membership — a spec of its own.
- **New controls for editing an imported holiday.** The holiday form already governs it.
- **Localised holiday names.** The provider's English name is stored; the screen is English.
- **Backfilling years the year tabs do not offer**, a second provider, failover between two, or
  changing how a holiday reaches a member.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| The provider's coverage is narrower than this product's country list — India and the UAE among the missing | The screen names every country it could not source, so the absence is visible, and a holiday can still be typed by hand | A second provider behind the same port, or a bundled dataset for the remainder |
| The first admin to open a year pays the provider latency for the whole country set, and a holiday the provider later corrects is not corrected here | The sync is a separate request, so the list paints first; and REQ-02-007 is what makes an admin's edits survive | A scheduler, named Out of Scope above, and the refresh control REQ-02-008 already provides |
| Two provider entries on one date in one country cannot both be stored | The unique index predates this spec, and neither probed country produced such a pair | Relaxing that index, which changes what every reader of `Holiday` may assume |
| The verification plan was not walked | The bundle was written from the code, from screenshots of the running app, and from live probes of the provider recorded in the contracts file | Bringing the rig up and re-recording the plan |
| REQ-02-017 cannot be observed through a signed-in session — no shipped role holds `view-holidays` without `view-amounts-owed` | The rule keeps the capabilities genuinely separate, and has to exist *before* a role splits them | A role that holds one and not the other. Until then TC-02-INT-11 drives the capability check directly |
| The status code an uncovered country answers with was not captured | REQ-02-009 treats every non-conforming answer alike, so no rule depends on it | Capturing it during implementation and moving that Observations row to `Observed` |

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| 1 | The sourced country set is every active member's resolved country | TC-02-UNIT-01 |
| 2 | The organization's country joins the set only while the setting is on | TC-02-UNIT-02 |
| 3 | A sync writes a country's nationwide holidays and discards its regional ones | TC-02-INT-01 |
| 4 | A second sync for a sourced year calls the provider zero times | TC-02-INT-02 |
| 5 | A holiday an admin edited or deleted is not restored by a later sync | TC-02-INT-03 |
| 6 | A manual holiday on an imported holiday's date survives the import | TC-02-INT-04 |
| 7 | A provider failure answers `200` and reports the country unsourced | TC-02-INT-05 |
| 8 | A country the provider does not cover is recorded, not re-asked | TC-02-INT-06 |
| 9 | The refresh flag re-asks a sourced year | TC-02-INT-07 |
| 10 | The summary's day counts are right per country and per person | TC-02-INT-08 |
| 11 | A person's amount matches the Amounts Owed report's holiday rows for the same year | TC-02-INT-09 |
| 12 | Totals are grouped by currency, never summed across them | TC-02-INT-10 |
| 13 | A caller without `view-amounts-owed` receives no amount and no currency | TC-02-INT-11 |
| 14 | A member with no financials has a day count and no amount | TC-02-INT-12 |
| 15 | Every route here answers `404` without its capability, and across organizations | TC-02-INT-13 |
| 16 | A provider that never answers is abandoned at the call bound, and the request still returns | TC-02-INT-14 |
| 16a | A `scope=mine` read carries `source` on each row and no `sourcing` block | TC-02-INT-15 |
| 16b | A refresh that writes nothing leaves the country `sourced`, not `empty` | TC-02-INT-07 |
| 16c | An import writes nothing onto a date already carrying a global holiday | TC-02-INT-16 |
| 17 | Opening a year with unsourced countries fills the list without anybody clicking | TC-02-E2E-01 |
| 18 | The checkbox changes the set, and the change survives a reload | TC-02-E2E-02 |
| 19 | The screen names the countries it could not source | TC-02-E2E-03 |
| 20 | The per-country and per-person figures are on the screen and readable | TC-02-E2E-04 |
