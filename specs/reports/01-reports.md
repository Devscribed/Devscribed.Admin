---
id: "01"
title: Reports
routes:
  - "/org/{orgId}/reports"
  - "/org/{orgId}/reports/amounts-owed"
  - "/org/{orgId}/reports/time-and-activity"
  - "/org/{orgId}/reports/time-off"
api:
  - "GET /api/organizations/{orgId}/reports/amounts-owed"
  - "GET /api/organizations/{orgId}/reports/amounts-owed/my"
  - "GET /api/organizations/{orgId}/reports/amounts-owed/pdf"
  - "GET /api/organizations/{orgId}/reports/amounts-owed/pdf/my"
  - "GET /api/organizations/{orgId}/reports/time-and-activity"
  - "GET /api/organizations/{orgId}/reports/time-and-activity/my"
  - "GET /api/organizations/{orgId}/reports/time-and-activity/pdf"
  - "GET /api/organizations/{orgId}/reports/time-and-activity/pdf/my"
  - "GET /api/organizations/{orgId}/reports/time-off"
  - "GET /api/organizations/{orgId}/reports/time-off/my"
  - "GET /api/organizations/{orgId}/reports/time-off/pdf"
  - "GET /api/organizations/{orgId}/reports/time-off/pdf/my"
entities: [TimeEntry, VacationRequest, MemberFinancials, MemberFinancialsSnapshot, Project, Client, Holiday]
tags: [reports, amounts-owed, time-and-activity, time-off, pdf, filters, capabilities, aggregation]
depends-on:
  - "organization/01"   # Clients
  - "organization/03"   # Holidays
  - "user-management/16" # Billable flag
  - "user-management/12" # Time Tracking
  - "user-management/07" # Vacation Accrual Management (MemberFinancials)
  - "user-management/08" # Vacation Reserve Auto-Accrual (snapshots)
  - "user-management/09" # Vacation Requests
  - "user-management/11" # Projects
---

# 01 — Reports

## Summary

The **Reports** area exposes three finance-facing rollups over the data collected by Time Tracking (spec 12), Vacation (specs 07–09), Projects (spec 11), and their supporting primitives (Clients — org/01, Holidays — org/03, Billable flag — user-management/16). Each report has two owner-scope variants (**All** and **My**) and two output formats (**JSON** for the on-screen table and **PDF** for finance handoff) — twelve endpoints total. **All amounts render in USD** — the product is single-currency in v1; `MemberFinancials.currency` is on the row but ignored (see §Currency). All date-range math uses the caller's `Account.timezone`. Rate lookup is `MemberFinancialsSnapshot` in effect on `TimeEntry.date`, live `MemberFinancials` as fallback. The aggregation logic mirrors Teammerly's four `(sumDateRanges, detailedReports)` branches so the outputs match parity expectations from finance. Reports never write; they never re-compute frozen vacation fields.

## Actors & Preconditions

- **Actors:**
  - `admin` and `manager` see **All** variants — the entire organization's payables, hours, and time-off.
  - `user` sees the **My** variant of every report (their own payable, own hours, own time-off).
  - `viewer` sees only **My Time Off** — the calendar of holidays and vacation days that affect their schedule.
- **Preconditions:** the caller is an `active` member of the organization; at least one of `MemberFinancials`, `TimeEntry`, or `VacationRequest` exists for a meaningful report (empty inputs return empty rollups).

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| `ViewAmountsOwed` — see everyone's payable | ✅ | ✅ | ❌ | ❌ |
| `ViewMyAmountsOwed` — see own payable | ✅ | ✅ | ✅ | ❌ |
| `ViewTimeAndActivity` — see everyone's hours | ✅ | ✅ | ❌ | ❌ |
| `ViewMyTimeAndActivity` — see own hours | ✅ | ✅ | ✅ | ❌ |
| `ViewTimeOff` — see everyone's time-off | ✅ | ✅ | ❌ | ❌ |
| `ViewMyTimeOff` — see own time-off | ✅ | ✅ | ✅ | ✅ |
| `ViewTimeAndActivityBilled` — see the "Billed Amount" column | ✅ | ✅ | ❌ | ❌ |
| `ViewTimeAndActivitySpent` — see the "Spent" column (pay-rate × hours) | ✅ | ❌ | ❌ | ❌ |
| `ExportReports` — hit any PDF endpoint | ✅ | ✅ | ✅ | ❌ |

The **Reports** sidebar group renders when the caller holds any of the eight `View*` capabilities. Each sub-nav row is gated on its specific capability.

## Functional Requirements

### Query shape (shared)

1. Every report endpoint accepts the same query envelope. Common params: `startDate` (ISO date, required), `endDate` (ISO date, required, ≥ `startDate`), `memberIds[]` (optional; only accepted on All variants), `projectIds[]` (optional), `clientIds[]` (optional), `sumDateRanges` (boolean, default `false`), `detailedReports` (boolean, default `false`). Per-report additional params:
    - **Time & Activity** accepts `columns[]` (see §Column permission filter) and `billable` — one of `all` (default), `billable`, `non-billable` — a row-level filter that drops entries not matching the flag before aggregation.
    - **Time Off** accepts `type` — one of `all` (default), `vacation`, `holiday` — filters which synthetic-row kinds appear; and `status` — one of `all` (default), `approved`, `pending`, `rejected`, `cancelled` — filters `VacationRequest` rows by lifecycle state (holidays are unaffected by `status`).
2. `startDate` and `endDate` are interpreted in the caller's `Account.timezone`. `endDate` is inclusive. **v1 filter shape:** every time-carrying column reports reads today (`TimeEntry.date`, `VacationRequest.startDate`/`endDate`, `Holiday.date`, `MemberFinancialsSnapshot.effectiveFrom`) is Postgres `DATE` — a calendar day with no time-of-day component. The service therefore filters directly by the calendar day in the caller's timezone: `date >= startDate AND date <= endDate` (raw ISO date), never by a tz-shifted UTC-instant boundary. A `DATE` column compared against a `TIMESTAMPTZ` is silently cast to `DATE` by Postgres and truncates the time, which turns a Warsaw "end of `2026-08-31`" (`2026-08-31T22:00Z`) into `2026-08-31` and excludes entries dated that day — so the tz-shifted boundary is not just unnecessary here, it is wrong. When a future spec introduces a timestamp-typed column (e.g. real per-minute entries), the range validator's `startUtc` / `endUtcExclusive` helpers already return the tz-shifted UTC boundaries; the shifted form is used *then*, on those columns.
3. The range cannot exceed **370 days** (roughly one year plus a week for cross-year queries). Longer ranges return 422 `range_too_wide`.
4. On My variants, `memberIds[]` is ignored and forcibly overwritten with `[session.membershipId]`.

### Owner scope (All vs My)

5. **All** endpoints require the paired `View*` (non-My) capability. Server queries scope to `session.organizationId` and to the requested `memberIds[]` intersected with the org's active membership set. Absence of `memberIds[]` means "every active + removed member with data in the range".
6. **My** endpoints require the `ViewMy*` capability. Server ignores `memberIds[]` in the query and treats the caller as the sole subject.
7. Callers with only the `ViewMy*` capability calling the All endpoint get **404** (org-scope-style hiding, per `CLAUDE.md`).

### Column permission filter (Time & Activity only)

8. Time & Activity supports these columns, emitted in this order in the response `headers`: `Project`, `Member`, `Time`, `Client`, `Billable Time`, `Non-Billable Time`, `Billed Amount`, `Spent`, `Notes`.
9. `Project`, `Member`, and `Time` are **always-shown defaults** (spec parity with Teammerly's Permissions 516-524 model — the caller cannot deselect them from the request and cannot filter them out from the response). Rendered order is Project → Member → Time so the "who did what on which project, and how much" reads left-to-right without jumping; the group band already carries the project name, and repeating it on every row keeps the response usable as a flat CSV export where the group structure is lost.
10. `Billed Amount` requires `ViewTimeAndActivityBilled`. `Spent` requires `ViewTimeAndActivitySpent`. Other optional columns require only the base `View*` capability.
11. The server takes the caller's requested `columns[]`, intersects with the caller's granted column capabilities, unions with the always-shown defaults, and returns exactly that projection. Denied columns are dropped from the response — they are never `null`-blanked, they simply do not appear on the payload.

### Rate lookup

12. For each `TimeEntry` in the range, the effective **bill rate** is the `MemberFinancialsSnapshot.clientHourlyRate` whose `effectiveFrom <= TimeEntry.date`, most recent first. If no snapshot precedes the date, use `MemberFinancials.clientHourlyRate` (live).
13. The **pay rate** is derived from `monthlySalary` on the same lookup key: `payRate = monthlySalary / hoursPerMonth` with `hoursPerMonth = 168` (Teammerly's constant, encoded in `packages/validation/src/index.ts` as `HOURS_PER_MONTH_FOR_PAY_RATE`). If a member's `monthlySalary` is `0` (or missing), `payRate = 0`; that member's `Spent` column reads `€0.00` for their rows.
14. A rate change **inside the range** produces two rate snapshots for the same member on different days. The report correctly assigns each entry the rate in effect on its `date`. When aggregation collapses a range (`sumDateRanges = true`), the row's "rate" is displayed as the **weighted average** across the entries in the group; the row's `amount` is the sum of per-entry `hours * rate`, not `sumHours * displayRate`.
15. Rates and every emitted amount are in **USD**. `MemberFinancials.currency` is not read by any report. When multi-currency becomes real, a future spec introduces `Organization.currencyCode` and the FX rules; until then, all rate arithmetic is a pure `Decimal` in one currency.

### Range interpretation & entry overlap

16. For Time & Activity in per-day mode (`sumDateRanges = false`), an entry that crosses UTC midnight (rare, since entries are `date`-only in v1, but future-proofed) is credited to the day it starts. In v1 with `TimeEntry.date`, this reduces to "one entry per row = one day".
17. Entries with `billable = false` are excluded from **Amounts Owed**. In **Time & Activity**, they populate the `Non-Billable Time` column and do not contribute to `Billed Amount`. See spec `user-management/16` for the flag semantics.

### Holidays (Amounts Owed only)

18. For each member and each `Holiday` in the range whose `countryCode` matches the member's country (per spec org/03, §14–15) or is `null` (global), a synthetic "Activity" row is added with `hours = holiday.paidHours`, `rate = member's bill rate on that date`, `amount = hours * rate`. The row is labelled `"Holiday · {name}"`.
19. Holidays are added to Amounts Owed **on top of** logged billable time; they are not deducted or shifted.
20. **Time & Activity does not include Holiday rows** — it reports what members actually logged; holidays are a rate concern, not a project-time concern.
21. **Time Off shows Holidays as an "Organization-wide" group** at the bottom of the report — a read-only informational block, not an amount.

### Vacation (Amounts Owed & Time Off)

22. For each **approved** `VacationRequest` overlapping the range, Amounts Owed adds a synthetic row with `hours = workingDays × 8` (a spec-declared constant; the request's frozen `workingDays` is the source of truth per spec 09), `rate = member's bill rate on the request's start date`, `amount = frozen deductionAmount from VacationRequest` (never recomputed). Row labelled `"Vacation (approved)"`.
23. Cancelled and pending vacation requests do **not** appear on Amounts Owed. Rejected requests do not appear either.
24. Time Off report groups vacation entries by member: rows include type ("Vacation"), period ("15 Feb – 28 Feb 2026"), status (Approved / Pending / Rejected / Cancelled), calendar days (`endDate − startDate + 1`), working days (frozen from the request), deduction (frozen).
25. Pending vacation requests **do** appear on Time Off (with status "Pending") — a manager needs to see them in the same report.

### Aggregation branches — Amounts Owed & Time & Activity

The `(sumDateRanges, detailedReports)` matrix produces four output shapes. Groups are keyed by **date** in both reports (Amounts Owed rows are `(member, activity)`; T&A rows are `(project, member)`) — the day is the primary axis a finance reader scans down, and putting date in the group band lets the same visual pattern (a date-labelled band + a table of rows underneath it) serve both reports. Reproduces Teammerly's four branches:

26. `sumDateRanges = false, detailedReports = false` — **default**. Groups are per-day; totals only per row.
27. `sumDateRanges = false, detailedReports = true` — Groups are per-day; each row carries a `details` array bucketed by activity (Amounts Owed: `"Holiday · X"`/`"Vacation (approved)"`/project name; T&A: task name from the entry).
28. `sumDateRanges = true, detailedReports = false` — One group covering the whole range; totals only per row.
29. `sumDateRanges = true, detailedReports = true` — One group covering the whole range; each row carries a `details` array with per-day breakdown.

### Empty-row filtering

30. After aggregation, groups whose members all sum to `0h / €0.00` are dropped from the response. Members whose rows all sum to `0` inside a group are dropped from that group. This mirrors Teammerly's `ResponseAmountOwedModel` filter.

### Response shape (JSON)

31. Every JSON response is `{ headers: [...], groups: [...], summary: [...] }`.
    - `headers` is an ordered list of `{ title, value }` describing the columns; `value` is the JSON key each row uses. Column-permission-denied columns are absent from this list.
    - `groups` is an ordered list of `{ id, title, rows: [...], total: {...} }`. `title` is the date-range label (`"Aug 1 – Aug 15, 2026"`) or the day label (`"Aug 3, 2026"`) or the project name; `total` aggregates the group.
    - `summary` is `[{ label, value }, …]` for the top strip: Hours, Amount, Non-Billable, Billed Amount as applicable, per report.
32. Every amount is emitted as a positive `Decimal` string with two decimal places (`"2100.00"`, `"12125.00"`). Formatting to a currency symbol happens in the UI (client) or in the PDF renderer (server).

### PDF generation

33. PDF endpoints render the same aggregation output through an HTML template (server-side React → static markup in `apps/api/src/reports/pdf/`) that calls the existing `PdfRenderer.render(html)` port (`apps/api/src/pdf/`).
34. Page format: A4 landscape, margins `20mm` top/bottom, `15mm` sides. The template repeats the header on every page and shows a footer with `"Page {n} of {m}"` and the generated-at timestamp in the caller's tz.
35. Filename shape, driven by the range:
    - **Multi-day range:** `{Report Display Name} {startYYYY-MM-DD}_to_{endYYYY-MM-DD}.pdf` — e.g. `Amounts Owed 2026-08-01_to_2026-08-31.pdf`.
    - **Single-day range (`startDate == endDate`):** `{Report Display Name} {YYYY-MM-DD}.pdf` — e.g. `Amounts Owed 2026-09-02.pdf`.
    `Report Display Name` is the human-facing report name (`Amounts Owed`, `Time & Activity`, `Time Off`), not a CamelCase code. Filesystem-hostile characters (`/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`, control chars) in the display name are replaced by `-`; runs of whitespace collapse to one space; length is clamped to 200 characters (dates always survive; the name is truncated if needed). **The organization name is NOT in the filename** — the person saving is already inside their organization; adding the org to every file is noise. If a future spec introduces cross-org sharing, the PDF's *header* (not filename) is where the org gets named.
36. `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="…"`, `Cache-Control: private, no-store`.
37. PDFs run synchronously inside the request. Ranges producing more than **3,000 rows** return 422 `range_too_large_for_pdf` and prompt the user to narrow the filters or the range. This is a v1 backpressure; a future spec (§Known Gaps) adds async queueing.

## Data Model

**No new tables or columns.** Reports read exclusively from data introduced by other specs: `TimeEntry` (spec 12 + 16), `VacationRequest` (spec 09), `MemberFinancials` (spec 07), `MemberFinancialsSnapshot` (spec 08), `Project` (spec 11), `Client` (spec org/01), `Holiday` (spec org/03).

### New Capabilities

Added to the `Capability` union in `packages/validation/src/roles.ts` and the lowercase-dashed `MemberCapability` in `packages/validation/src/index.ts`:

- `ViewAmountsOwed` / `view-amounts-owed`
- `ViewMyAmountsOwed` / `view-my-amounts-owed`
- `ViewTimeAndActivity` / `view-time-and-activity`
- `ViewMyTimeAndActivity` / `view-my-time-and-activity`
- `ViewTimeOff` / `view-time-off`
- `ViewMyTimeOff` / `view-my-time-off`
- `ViewTimeAndActivityBilled` / `view-time-and-activity-billed`
- `ViewTimeAndActivitySpent` / `view-time-and-activity-spent`
- `ExportReports` / `export-reports`

## API Contracts

### Common query envelope

Each endpoint accepts:

```
?startDate=2026-08-01
&endDate=2026-08-31
&memberIds=cly1&memberIds=cly2   (repeated, All-only)
&projectIds=cly3&projectIds=cly4
&clientIds=cly5
&sumDateRanges=false
&detailedReports=false
&columns=Client&columns=Billable+Time  (Time & Activity only)
&billable=billable                     (Time & Activity only; all|billable|non-billable, default all)
&type=vacation                         (Time Off only; all|vacation|holiday, default all)
&status=approved                       (Time Off only; all|approved|pending|rejected|cancelled, default all)
```

### `GET /api/organizations/{orgId}/reports/amounts-owed`

**Capability:** `ViewAmountsOwed`. **200 Response:**

```json
{
  "headers": [
    { "title": "Member",   "value": "member" },
    { "title": "Activity", "value": "activity" },
    { "title": "Hours",    "value": "hours" },
    { "title": "Rate",     "value": "rate" },
    { "title": "Amount",   "value": "amount" }
  ],
  "groups": [
    {
      "id": "2026-08-01_2026-08-15",
      "title": "Aug 1 – Aug 15, 2026",
      "rows": [
        { "member": "Alex Kaminski", "activity": "Website Redesign", "hours": "42.00", "rate": "50.00", "amount": "2100.00", "kind": "project" },
        { "member": "Alex Kaminski", "activity": "Holiday · Independence Day", "hours": "8.00", "rate": "50.00", "amount": "400.00", "kind": "holiday" },
        { "member": "Jane Smith",    "activity": "Vacation (approved)", "hours": "40.00", "rate": "55.00", "amount": "2200.00", "kind": "vacation" }
      ],
      "total": { "hours": "90.00", "amount": "4700.00" }
    }
  ],
  "summary": [
    { "label": "Total hours",  "value": "896.50" },
    { "label": "Total amount", "value": "44825.00" }
  ],
  "meta": { "currencyCode": "USD", "timezone": "Europe/Warsaw", "startDate": "2026-08-01", "endDate": "2026-08-31" }
}
```

### `GET /api/organizations/{orgId}/reports/amounts-owed/my`

Same shape, filtered to the caller. **Capability:** `ViewMyAmountsOwed`.

### `GET /api/organizations/{orgId}/reports/amounts-owed/pdf` / `/my`

Same query envelope. Response is `application/pdf`. **Capability:** `ViewAmountsOwed` + `ExportReports`, or `ViewMyAmountsOwed` + `ExportReports`.

### `GET /api/organizations/{orgId}/reports/time-and-activity` / `/my` / `/pdf` / `/pdf/my`

**Capability chain:** base `View(My)TimeAndActivity`, plus column-permission gates. **200 JSON:**

```json
{
  "headers": [
    { "title": "Project",        "value": "project" },
    { "title": "Member",         "value": "member" },
    { "title": "Time",           "value": "time" },
    { "title": "Client",         "value": "client" },
    { "title": "Billable Time",  "value": "billableTime" },
    { "title": "Non-Billable",   "value": "nonBillableTime" },
    { "title": "Billed Amount",  "value": "billedAmount" },
    { "title": "Notes",          "value": "notes" }
  ],
  "groups": [
    {
      "id": "2026-08-03",
      "title": "Aug 3, 2026",
      "rows": [
        { "project": "Website Redesign", "member": "Alex Kaminski", "time": "8.00", "client": "Acme Corp", "billableTime": "8.00", "nonBillableTime": "0.00", "billedAmount": "400.00", "notes": "Design review" }
      ],
      "total": { "time": "8.00", "billableTime": "8.00", "nonBillableTime": "0.00", "billedAmount": "400.00" }
    }
  ],
  "summary": [
    { "label": "Total time",         "value": "648.50" },
    { "label": "Billable time",      "value": "571.25" },
    { "label": "Non-billable time",  "value": "77.25" },
    { "label": "Billed amount",      "value": "28562.50" }
  ],
  "meta": { "currencyCode": "USD", "timezone": "Europe/Warsaw", "startDate": "2026-08-01", "endDate": "2026-08-31" }
}
```

`Spent` column is added when `ViewTimeAndActivitySpent` is granted; it is omitted from `headers` and every `row` and `total` when not.

**Row filter — `billable`:** default `all` returns every entry (subject to other filters). `billable` drops rows sourced from `TimeEntry.billable = false`; the `Non-Billable Time` column then reads `0` for every row. `non-billable` drops rows sourced from `TimeEntry.billable = true`; the `Billed Amount` and `Billable Time` columns then read `0`. In every mode, both columns still appear in `headers` — the filter narrows the data, not the schema.

### `GET /api/organizations/{orgId}/reports/time-off` / `/my` / `/pdf` / `/pdf/my`

**Capability:** `ViewTimeOff` / `ViewMyTimeOff`. **200 JSON:**

```json
{
  "headers": [
    { "title": "Type",          "value": "type" },
    { "title": "Period",        "value": "period" },
    { "title": "Days",          "value": "days" },
    { "title": "Working days",  "value": "workingDays" },
    { "title": "Deduction",     "value": "deduction" }
  ],
  "groups": [
    {
      "id": "membership_ak",
      "title": "Alex Kaminski",
      "rows": [
        { "type": "Vacation",  "period": "15 Feb – 28 Feb 2026", "status": "approved", "days": "14", "workingDays": "10", "deduction": "2307.69", "kind": "vacation" }
      ],
      "total": { "days": "14", "workingDays": "10", "deduction": "2307.69" }
    },
    {
      "id": "organization_wide",
      "title": "Organization-wide",
      "rows": [
        { "type": "Holiday", "period": "1 Jan 2026 · New Year's Day", "days": "1", "workingDays": "1", "deduction": null, "kind": "holiday" }
      ],
      "total": { "days": "1", "workingDays": "1", "deduction": null }
    }
  ],
  "summary": [
    { "label": "Vacation days", "value": "86" },
    { "label": "Deduction",     "value": "38420.00" },
    { "label": "Public holidays", "value": "12" }
  ],
  "meta": { "currencyCode": "USD", "timezone": "Europe/Warsaw", "startDate": "2026-01-01", "endDate": "2026-08-31" }
}
```

**Row filter — `type`:** default `all` includes both vacation groups (per-member) and the `organization_wide` holiday group. `vacation` drops the `organization_wide` group and every holiday-kind row. `holiday` drops every vacation-kind row and returns only the `organization_wide` group.

**Row filter — `status`:** default `all` includes every `VacationRequest` in the range regardless of lifecycle. Setting it to `approved` (finance's default), `pending`, `rejected`, or `cancelled` narrows vacation rows to that status; the `organization_wide` holiday group is unaffected. On the `/my` variant, `pending` still shows the caller's own pending requests. On `/pdf`, the filter is stored in the response's meta and rendered in the PDF header (`"Status: Approved only"`).

## Validation Rules

1. `startDate` required and a valid ISO date — "Start date is required." / "Invalid start date."
2. `endDate` required and a valid ISO date — same messages.
3. `endDate < startDate` — "End date must be on or after start date."
4. Range wider than 370 days — "Range too wide. Pick a range of at most one year."
5. `memberIds[]` items must be valid cuids — "Invalid member reference." (422)
6. `projectIds[]` / `clientIds[]` — same.
7. `columns[]` items must be from the supported set — silently dropped if unknown (not an error, since the client and server versions of the column list may drift on the always-shown defaults).
8. `sumDateRanges` and `detailedReports` must be booleans (`"true"`/`"false"` also accepted).
9. PDF row-count budget exceeded — 422 "This report is too large to export as PDF. Please narrow the range or filters." (`range_too_large_for_pdf`)
10. `billable` must be one of `all`, `billable`, `non-billable` — "Invalid billable filter." (422; Time & Activity only). Unknown values return 422; missing defaults to `all`.
11. `type` must be one of `all`, `vacation`, `holiday` — "Invalid type filter." (422; Time Off only). Defaults to `all`.
12. `status` must be one of `all`, `approved`, `pending`, `rejected`, `cancelled` — "Invalid status filter." (422; Time Off only). Defaults to `all`.

## Error Messages

| Context | Message |
|---|---|
| Toast — report loaded | *silent* (no toast on success) |
| Toast — server error | "Couldn't load the report. Retry?" |
| Toast — PDF too large | "This report is too large to export as PDF. Please narrow the range or filters." |
| Toast — PDF exported | "PDF ready — check your downloads." |
| Toast — permission denied | "You don't have permission to see this report." (only appears if the user opens a shareable URL for a report they don't have; sidebar hides the row) |
| Empty state — no rows | "No data for this range. Try widening it or clearing filters." |
| Empty state — no filter selection allowed | "Pick a start and end date to run the report." |
| PDF filename fallback | "Report_{ReportType}_{startYYYY-MM-DD}_to_{endYYYY-MM-DD}.pdf" — used if `OrgName` collapses to empty after sanitizing |

## Screens

Rendered inside the existing app shell (sidebar + top bar) with a new **Reports** group in the sidebar. See [`01-reports.mock.html`](01-reports.mock.html) for the visual target.

### Reports landing (`/org/{orgId}/reports`)

Card grid of three tiles — Amounts Owed, Time & Activity, Time Off — each with an icon, name, one-line description, and a small caption stating who sees it. Clicking a card navigates to the report screen. Cards for reports the caller can't see are omitted.

### Report screen shell (`/org/{orgId}/reports/{report}`)

Layout:

- **Page header.** Report title, subtitle showing the current range and the org currency (`"Aug 1 – Aug 31, 2026 · EUR"`), a right-side action group.
- **Right actions.** All/My segmented control (visible only when the caller has **both** capabilities for the report); **Export PDF** button (visible when `ExportReports` is held).
- **Filter bar.** Range picker, Members multi-select (All variant only; hidden on My), Projects multi-select, Clients multi-select (visible when the caller holds `view-clients` from spec org/01), Time & Activity: **Columns** picker with locked defaults, **Sum date ranges** chip, **Detailed** chip.
- **Summary strip.** Four DS stat tiles reading from `summary`.
- **Report table.** Grouped rows per §Aggregation branches. Group bands are sticky; rows have a hover treatment; totals in a bold footer row.

### Report screen — My variant

- No All/My segmented control (or it shows a disabled "My" only when the caller lacks the All capability).
- Members filter hidden.
- Everything else identical, but the title reads "My time & activity", "My amounts owed", "My time off".

### PDF preview (out-of-band)

The rendered PDF opens in a new tab (attachment download in most browsers). The mockup includes a preview of the first page.

## Flows

### Main Flow: Manager runs Time & Activity for August, exports PDF

1. Manager clicks **Reports** in the sidebar; then the **Time & Activity** card.
2. System renders the report at the default range (last 30 days) with default filters.
3. Manager changes the range to Aug 1 – Aug 31, 2026 via the picker.
4. System re-fetches JSON, renders the new grouping and summary.
5. Manager clicks the **Columns** picker, unchecks *Notes* and checks *Non-Billable Time*, closes the picker.
6. System re-fetches with the new `columns[]`.
7. Manager clicks **Export PDF**.
8. System sends a GET to `/reports/time-and-activity/pdf?...`.
9. Browser saves the file as `Devscribed_TimeAndActivity_2026-08-01_to_2026-08-31.pdf`. Toast **"PDF ready — check your downloads."**

### Alt Flow A: User opens My Amounts Owed

1. User clicks **Reports** in the sidebar (visible because they have `ViewMyAmountsOwed`).
2. System shows the landing with a single card (Amounts Owed) since the user has only one `View*` capability for reports.
3. User picks the card; report renders in My mode with no All/My toggle. The Members filter is absent. Only their own rows are shown.

### Alt Flow B: Manager tries the `/pdf/my` endpoint for another member

Manager crafts the URL. Server returns **404** — the `/my` endpoint scopes to the caller. Toast the "no permission" copy on the client.

### Alt Flow C: Column permission — Spent

1. Manager (without `ViewTimeAndActivitySpent`) opens Time & Activity.
2. The Columns picker lists Spent grayed out with a small **admin-only** tag beside it; the checkbox is disabled.
3. If the manager forces the query with `?columns=Spent`, server drops it from the response and the front-end never surfaces the column.

### Alt Flow D: Range too wide

User picks Jan 1, 2025 – Aug 31, 2026 (> 370 days). Server returns 422 `range_too_wide`. UI shows an inline error on the range picker: **"Pick a range of at most one year."** Report stops rendering; last successful data stays on screen.

### Alt Flow E: PDF too large

Range and filters produce > 3000 rows. Server returns 422 `range_too_large_for_pdf`. UI shows toast (§Error Messages), no PDF is generated. The on-screen JSON view still renders.

## UI Description

### Routes

- `/org/{orgId}/reports` — landing.
- `/org/{orgId}/reports/amounts-owed` — Amounts Owed.
- `/org/{orgId}/reports/time-and-activity` — Time & Activity.
- `/org/{orgId}/reports/time-off` — Time Off.

The report's owner scope is chosen via the segmented control on the page. The URL does not encode All vs My — the segmented control changes an in-page state and re-fetches the JSON. Filter state (range, member/project/client selections, sumDateRanges, detailedReports, columns) is URL-persisted via query params so a link is shareable.

### Sidebar integration

New **REPORTS** section with **one entry only** — a top-level **Reports** row that leads to `/org/{orgId}/reports`. The three reports (Amounts Owed, Time & Activity, Time Off) are not sub-rows on the sidebar; they are **cards on the landing page** — templates the caller picks from once they are already in the Reports area. The sidebar entry appears when the caller holds any of the eight `View*` capabilities; when they hold none, the whole group drops out. The row is `active` when the current path is `/org/{orgId}/reports` or any of its children.

**Position:** the REPORTS group sits **between PROJECTS and DOCUMENTS**. Reports read the work Projects produce, and are checked more often than either Documents or Settings; keeping them one click from the daily project surface matches how finance uses them.

Rationale: three sibling report screens are a small enough set to render on one page, and once on that landing the cards give more context (icon, description, "who sees it") than a nav row ever could — the two-tier "parent + three subs" that spec parity products use is repetition of information the landing already carries. A future spec can revisit this if the reports area grows past a single screen's worth of templates.

### States

| State | Trigger | Rendered |
|---|---|---|
| Loading | Initial fetch or filter change | Skeleton: 4 stat tiles + 6 shimmering table rows |
| Empty | Zero rows after aggregation | Centered empty card with **"No data for this range."** and a hint to widen the range |
| Populated | 1+ groups | Header + filter bar + summary strip + grouped table |
| Error — validation | 422 (range, filter) | Inline error near the offending filter; last-good data stays on screen |
| Error — permission | 404 | Redirect to the landing; toast the "no permission" copy |
| Error — server | 5xx | Toast; **Retry** button re-runs the last request |
| PDF rendering | User clicks Export | Button label reads **"Rendering PDF…"** with a spinner; button disabled until the response streams |
| PDF ready | 200 | Toast + browser download prompt |
| PDF too large | 422 | Toast (§Error Messages); button re-enables at "Export PDF" |

### Responsive Behavior

**Desktop (>1024px):** as above.
**Tablet (768–1024px):** Filter bar wraps; Columns picker becomes a modal on tap; Summary strip drops from four to two tiles per row.
**Mobile (<768px):** The report table converts to per-group cards; each row becomes a two-column key/value card; Sum date ranges + Detailed chips move into an overflow menu; Export PDF becomes an icon button.

### Accessibility

- Filter bar controls are grouped in a `<fieldset>` with an invisible `<legend>` **"Filters"**; screen readers announce the group.
- Sticky group bands are `role="rowheader"`.
- The Columns picker's locked defaults expose `aria-disabled="true"` with a title **"Always shown"**.
- The stat tiles use `role="status"` for the live-updating amount so JAWS/NVDA announce changes after a filter tweak.
- PDF-download button announces "PDF exported — {filename}" to a live region on success.

## Required `data-testid` Attributes

### Sidebar

- `nav-reports` — the sole Reports entry in the sidebar (§Sidebar integration).

### Landing

- `reports-landing`, `reports-landing-title`
- `reports-card-amounts-owed`, `reports-card-time-and-activity`, `reports-card-time-off`

### Report shell (all three)

- `reports-page`, `reports-page-title`, `reports-page-sub`
- `reports-owner-toggle` (segmented All/My), `reports-owner-toggle-all`, `reports-owner-toggle-my`
- `reports-export-pdf-btn`

### Filter bar

- `reports-filter-range`, `reports-filter-range-input`
- `reports-filter-members`, `reports-filter-projects`, `reports-filter-clients`
- `reports-filter-columns`, `reports-filter-columns-item-{key}` — where `{key}` is the header value
- `reports-filter-billable` (Time & Activity only) — dropdown, values `all` / `billable` / `non-billable`
- `reports-filter-type` (Time Off only) — dropdown, values `all` / `vacation` / `holiday`
- `reports-filter-status` (Time Off only) — dropdown, values `all` / `approved` / `pending` / `rejected` / `cancelled`
- `reports-filter-sum-toggle`, `reports-filter-detailed-toggle`
- `reports-filter-range-error`, `reports-filter-generic-error`

### Summary strip

- `reports-summary-strip`
- `reports-summary-tile-{key}` — one per summary item

### Table

- `reports-table`
- `reports-group-{id}`
- `reports-group-{id}-band` — sticky group header
- `reports-group-{id}-row-{index}` — each row inside a group
- `reports-group-{id}-total` — group total row
- `reports-table-footer` — grand total footer
- `reports-empty-state`
- `reports-loading-skeleton`
- `reports-error-banner`, `reports-error-retry-btn`

### Amounts Owed specifics

- `reports-amounts-owed-total-{membershipId}` — used by TC-16-E2E-05 to assert the flag effect on the payable.

### Toasts

- `toast-report-error`
- `toast-report-pdf-ready`
- `toast-report-pdf-too-large`
- `toast-report-forbidden`

## Security

### Authentication & Authorization

- Every endpoint is behind `SessionGuard` + `OrgScopeGuard`. Cross-org access returns 404.
- Per-endpoint `RequireCapability` decorators enforce the matrix.
- PDF endpoints additionally require `ExportReports`. A caller with a `View*` capability but no `ExportReports` sees the on-screen report but the Export button is absent; hitting the PDF URL directly returns 403.

### Column-permission enforcement

- Column intersection happens **server-side** before the Prisma projection. Denied columns are never selected, so the response payload never contains their values, even to a client that spoofs the header keys.
- This is the report parity item Teammerly encoded via `IMappingService` choosing among three projection variants; the NestJS port implements it as three distinct `select` shapes chosen by a small resolver.

### Cross-organization protection (IDOR)

- Every Prisma query scopes by `session.organizationId`. Path `orgId` is compared to the session but never used as a filter directly.
- Requesting `memberIds[]` that belong to a different org: the query silently drops them (no error) — the resulting rollup is scoped to what the session can legitimately see. A membership id that resolves to another org contributes nothing.

### Input handling

- `startDate` / `endDate` parsed with strict ISO 8601. Ambiguous inputs (`"2026-8-3"`, `"08/03/2026"`) return 422.
- `memberIds[]`, `projectIds[]`, `clientIds[]` items validated as cuids.
- `columns[]` items intersected with a fixed allowed set; unknown items dropped.

### CSRF & session

- Same-origin fetch with `credentials: 'same-origin'`; PDF endpoints use the same session cookie.
- `Account.securityStamp` revocation enforced by `SessionGuard`.

### Rate limiting

- App-wide default for JSON endpoints.
- PDF endpoints have an additional **10 requests/minute per session** cap because each launch of Playwright is expensive. Excess returns 429.

### Logging

- Every JSON fetch logs `{ event: "report_fetched", actorAccountId, organizationId, report, ownerScope, startDate, endDate, filters, rowCount, durationMs }` at info.
- Every PDF export logs the same plus `bytes` at info.
- PII scrubbing: member names appear in the aggregation output but not in the log message.

## Out of Scope

- CSV / Excel export.
- Report scheduling / email delivery.
- Saved report configurations (name + filter payload).
- Cross-currency FX conversion.
- Per-project bill/pay rate overrides.
- Long-running PDF queueing.
- Client-facing invoices generated from Amounts Owed.
- Timesheet approvals (approval loop on time entries before they appear in reports).
- Rate-history editing UI. Reports show what's in the DB; changing history stays out of scope.
- Report-level bookmarking / URL naming.
- Per-user preferred column defaults.

## Test Cases

### Unit

- **TC-01-UNIT-01: Range validator — happy.** `validateRange('2026-08-01','2026-08-31',callerTz)` returns valid, produces UTC bounds correctly.
- **TC-01-UNIT-02: Range validator — end before start.** Returns the end-before-start error.
- **TC-01-UNIT-03: Range validator — too wide.** Range of 400 days returns the range-too-wide error.
- **TC-01-UNIT-04: Column intersection — deny Spent.** Given granted `[ViewTimeAndActivity, ViewTimeAndActivityBilled]` and requested `columns=['Client','Spent']`, returns `['Project','Time','Member','Client','Billed Amount']` (defaults union'd, Spent dropped).
- **TC-01-UNIT-05: Column intersection — allow Spent.** With `ViewTimeAndActivitySpent` granted, Spent stays in the projection.
- **TC-01-UNIT-06: Column intersection — default columns cannot be removed.** Requested `columns=['Client']` alone — response projection still includes `Project, Time, Member`.
- **TC-01-UNIT-07: Rate lookup — snapshot before, live matches.** With snapshot at `2026-01-01, rate=45` and live `rate=45`, entry on `2026-03-15` uses `45`.
- **TC-01-UNIT-08: Rate lookup — snapshot before, live differs.** With snapshot at `2026-01-01, rate=45` and live `rate=55` (change on `2026-06-01`), entry on `2026-03-15` uses `45`; entry on `2026-07-15` uses `55`.
- **TC-01-UNIT-09: Rate lookup — no snapshot precedes date.** With snapshot only at `2026-04-01` and live at `2026-04-01`, entry on `2026-03-15` uses the live rate (fallback).
- **TC-01-UNIT-10: Rate lookup — zero salary.** `payRate = 0` when `monthlySalary = 0`.
- **TC-01-UNIT-11: Aggregation — sum & detailed.** Given 3 members × 3 activities × 5 days, returns one group with 3 member × 3 activity rows.
- **TC-01-UNIT-12: Aggregation — per-day & non-detailed.** Same seed returns 5 groups, each with 3 member rows.
- **TC-01-UNIT-13: Empty-row filter.** Group with all-zero rows is dropped from the response.
- **TC-01-UNIT-14: PDF filename sanitizer.** `filename('Foo/Bar Ltd.','TimeAndActivity','2026-08-01','2026-08-31')` returns `Foo_Bar_Ltd._TimeAndActivity_2026-08-01_to_2026-08-31.pdf`.
- **TC-01-UNIT-15: Weighted-average rate.** Given 10h at €50 and 30h at €55 in a summed range, `displayRate = 53.75`, `amount = 500 + 1650 = 2150`.
- **TC-01-UNIT-16: Holiday row generator.** Given a member with `phoneCountryCode = 'BY'`, a `BY`-scoped holiday, and a bill rate of `50`, produces a synthetic row `{hours: '8.00', rate: '50.00', amount: '400.00'}` labelled `"Holiday · X"`.
- **TC-01-UNIT-17: Vacation row generator — approved.** Produces a synthetic row with `amount = frozen deductionAmount`.
- **TC-01-UNIT-18: Vacation row generator — pending/rejected.** Returns `null` (no row).

### Integration

- **TC-01-INT-01: All variant as admin — happy.** GET `amounts-owed` returns the 200 shape with expected fields.
- **TC-01-INT-02: All variant as manager — happy.** Returns 200.
- **TC-01-INT-03: All variant as user — 404.** Returns 404, org-scope-style hiding.
- **TC-01-INT-04: My variant as user — happy.** GET `amounts-owed/my` returns 200 with only the caller's rows.
- **TC-01-INT-05: My variant, member filter ignored.** `?memberIds=cly1&memberIds=cly2` on `/my` — response contains only the caller's rows.
- **TC-01-INT-06: My variant — attempt to see All URL — 404.** GET `amounts-owed` as `user` — 404.
- **TC-01-INT-07: Time & Activity column intersection — deny Spent.** Manager without `ViewTimeAndActivitySpent` calls the endpoint with `?columns=Spent`. Response `headers` does not include Spent; rows don't have the field.
- **TC-01-INT-08: Time & Activity column intersection — allow Spent.** Admin gets the field back.
- **TC-01-INT-09: Range too wide — 422.** 400-day range — 422 `range_too_wide`.
- **TC-01-INT-10: Range end before start — 422.**
- **TC-01-INT-11: Rate resolution — snapshot picked correctly.** Seed a rate change on `2026-06-01`. Report for July uses the new rate; report for May uses the old rate.
- **TC-01-INT-12: Holiday inclusion — matching country.** A `BY` holiday appears on a `BY` member's Amounts Owed for the date's range.
- **TC-01-INT-13: Holiday exclusion — non-matching country.** A `BY` holiday does not appear on a `US` member's Amounts Owed.
- **TC-01-INT-14: Global holiday — all members.** A `countryCode = null` holiday appears on every member.
- **TC-01-INT-15: Vacation inclusion — approved.** An approved request in the range adds a synthetic row.
- **TC-01-INT-16: Vacation exclusion — pending/cancelled.** Not shown on Amounts Owed.
- **TC-01-INT-17: Vacation frozen amount.** After approving a request, an admin changes the member's `monthlySalary`. The report still shows the frozen `deductionAmount` for the vacation row.
- **TC-01-INT-18: Billable filter — Amounts Owed excludes non-billable.** Seed 40h billable + 8h non-billable; Amounts Owed total = 40h × rate.
- **TC-01-INT-19: Time & Activity billable split.** Same seed; response shows `billableTime: 40.00`, `nonBillableTime: 8.00`, `billedAmount: 40 × rate`.
- **TC-01-INT-20: Time & Activity total = billable + non-billable.** `time: 48.00`.
- **TC-01-INT-21: Aggregation — sum true, detailed false.** Response has one group titled with the whole range and per-member totals.
- **TC-01-INT-22: Aggregation — per-day, detailed.** Response has one group per date with per-member details.
- **TC-01-INT-23: Empty result — no data.** Returns `groups: []`, `summary` reads zeros.
- **TC-01-INT-24: Zero-row filter — one project all-zero.** After aggregation, the empty project is not in `groups`.
- **TC-01-INT-25: Cross-org member id in `memberIds[]`.** Silently dropped; response contains only in-org rows.
- **TC-01-INT-26: `meta.currencyCode` is always USD.** Every report response — regardless of members' `MemberFinancials.currency` — returns `meta.currencyCode = "USD"`. The field is hardcoded in v1 as a forward-compatibility hook for the future currency spec.
- **TC-01-INT-27: Vacation math untouched.** Run the Amounts Owed report; separately re-run vacation approval on the same request; the `deductionAmount` remains the frozen value.
- **TC-01-INT-28: Timezone — last-day inclusion.** Caller in Europe/Warsaw asks for `endDate=2026-08-31`. An entry dated `2026-08-31` is included in the response; an entry dated `2026-09-01` is not — matching the v1 calendar-day filter (§Query shape, req 2). The intra-day tz-boundary sub-case (an entry at 2026-08-31 23:00 UTC vs 2026-08-31 21:00 UTC) does not apply while every time-carrying column is `@db.Date`; a future spec introducing per-minute entries brings that case back with a new integration test on the tz-shifted UTC bounds `validateReportRange` already exposes.
- **TC-01-INT-29: PDF endpoint — happy.** GET returns `application/pdf` with `Content-Disposition` and non-trivial body length.
- **TC-01-INT-30: PDF row-count backpressure.** Seed > 3000 rows; PDF endpoint returns 422 `range_too_large_for_pdf`.
- **TC-01-INT-31: PDF filename — clean org name.** Filename matches the sanitizer test.
- **TC-01-INT-32: PDF rate limit — 429.** 11 requests/minute — the 11th returns 429.
- **TC-01-INT-33: Session revocation — 401.** Rotate `securityStamp` mid-cycle; PDF endpoint returns 401.
- **TC-01-INT-34: OrgScope guard — 404.** Cross-org PDF request returns 404.
- **TC-01-INT-35: `ExportReports` guard — 403.** User without `ExportReports` calling `/pdf` returns 403.
- **TC-01-INT-36: Time Off `type` filter.** Seed 3 approved vacations + 2 global holidays in the range. GET `time-off?type=vacation` returns only the vacation groups (no `organization_wide` group). GET `?type=holiday` returns only the `organization_wide` group. GET `?type=all` (default) returns both. GET `?type=weekend` returns 422 `Invalid type filter.`
- **TC-01-INT-37: Time Off `status` filter.** Seed 2 approved, 1 pending, 1 cancelled vacation in the range. GET `time-off?status=approved` returns only the 2 approved rows. GET `?status=pending` returns the 1 pending row. GET `?status=all` returns all 4. The `organization_wide` holiday group is present in every case (unaffected by `status`).
- **TC-01-INT-38: Time & Activity `billable` filter.** Seed 40h billable + 8h non-billable for one member in the range. GET `time-and-activity?billable=all` returns rows summing to `time: 48.00, billableTime: 40.00, nonBillableTime: 8.00, billedAmount: 40 × rate`. GET `?billable=billable` returns rows where `time: 40.00, billableTime: 40.00, nonBillableTime: 0.00, billedAmount: 40 × rate`. GET `?billable=non-billable` returns rows where `time: 8.00, billableTime: 0.00, nonBillableTime: 8.00, billedAmount: 0.00`. GET `?billable=maybe` returns 422 `Invalid billable filter.`
- **TC-01-INT-39: My + pending filter.** User calls `time-off/my?status=pending` — returns only their own pending requests. `pending` visibility on `/my` does not require the `ViewTimeOff` capability, just `ViewMyTimeOff`.

### E2E

- **TC-01-E2E-01: Manager runs Time & Activity for August, exports PDF — happy path.** From the landing, manager clicks Time & Activity, changes the range, adjusts the Columns picker, clicks Export PDF, sees the toast and the file download prompt.
  - **Selectors:** `nav-reports`, `reports-card-time-and-activity`, `reports-filter-range`, `reports-filter-columns`, `reports-filter-columns-item-billed-amount`, `reports-export-pdf-btn`, `toast-report-pdf-ready`.
- **TC-01-E2E-02: User opens My Amounts Owed — restricted-role flow.** User sees only Amounts Owed in the sidebar (their sole `View*` capability); opens it, sees only their rows, no All/My toggle, no Members filter.
  - **Selectors:** `nav-reports-amounts-owed`, `reports-owner-toggle` (asserted absent), `reports-filter-members` (asserted absent), `reports-group-{id}`.
- **TC-01-E2E-03: Manager tries `/pdf/my` for another member — unsuccessful flow.** Manager crafts the URL for another member via `page.evaluate`; API returns 404; the report screen shows the "no permission" toast.
  - **Selectors:** `toast-report-forbidden`.
- **TC-01-E2E-04: Range too wide — unsuccessful flow.** Manager picks Jan 1, 2025 – Aug 31, 2026; range picker shows the inline error.
  - **Selectors:** `reports-filter-range-error`.
- **TC-01-E2E-05: PDF too large — unsuccessful flow.** Manager runs a range that hits > 3000 rows; sees the toast; the report table remains rendered.
  - **Selectors:** `toast-report-pdf-too-large`, `reports-table`.
- **TC-01-E2E-06: Column permission — Spent grayed.** Manager without `ViewTimeAndActivitySpent` opens the Columns picker; Spent is disabled with an admin-only tag.
  - **Selectors:** `reports-filter-columns`, `reports-filter-columns-item-spent`.
- **TC-01-E2E-07: Currency always USD.** Any report opened by any role shows amounts formatted with `$`. `meta.currencyCode` in the JSON reads `"USD"`. Members whose `MemberFinancials.currency` is set to a non-USD value on the DB row (a historical possibility) do not change what the report renders.
  - **Selectors:** `reports-summary-tile-total-amount`, `reports-group-{id}-row-{index}` (asserted contains $).
- **TC-01-E2E-08: Vacation frozen — approval date change.** Admin approves a vacation, then changes the member's `monthlySalary`; opens Amounts Owed for the range; the vacation row's amount matches the pre-change frozen deduction.
  - **Selectors:** `reports-group-{id}-row-{index}` (asserted amount matches known frozen value).
- **TC-01-E2E-09: All/My toggle for a dual-capability role.** Admin holds both `ViewTimeAndActivity` and `ViewMyTimeAndActivity`; the toggle appears; switching to My re-fetches JSON and hides other members.
  - **Selectors:** `reports-owner-toggle`, `reports-owner-toggle-my`, `reports-group-{id}-row-{index}`.
