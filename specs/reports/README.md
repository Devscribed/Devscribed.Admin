# Reports Specifications

Functional specifications for the reporting surface of Devscribed.Admin — payable amounts per member, time-and-activity by project/client/member, and time-off across the organization. This area ports the Reports feature originally shipped in Teammerly.API. Each spec is self-contained with requirements, UI, API contracts, and test cases. Specs use YAML frontmatter (`tags`, `routes`, `api`, `entities`) for discoverability — grep frontmatter to find relevant specs.

## Why this area exists

Time tracking (spec `user-management/12`) collects the raw hours, and vacation accrual (specs `user-management/07`–`09`) tracks the reserve, but neither presents finance-facing rollups. Reports fills that gap: a manager needs to see payable amounts for a range, a finance person needs a per-client hours breakdown, a member needs their own vacation and time record. This area exposes those three rollups in one place, in one currency, with a consistent filter surface and PDF export.

## Spec Index

| # | Spec | Design | Tags |
|---|------|--------|------|
| 01 | [Reports](01-reports.md) *(pending)* | [Mockup](01-reports.mock.html) | reports, amounts-owed, time-and-activity, time-off, pdf, filters, capabilities |

## Product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Report catalog | Three reports in one spec — Amounts Owed, Time &amp; Activity, Time Off | They share the filter bar, the All/My scope toggle, the PDF pipeline, and the sidebar group. Splitting them into three specs would triple boilerplate. Each report still gets its own endpoint pair and its own test slice. |
| Owner scopes | Two variants per report — `All` and `My` — each behind its own capability | Matches the Teammerly permission model and lets admins/managers see everyone while users see only themselves. A single-endpoint auto-scoping shortcut was rejected because it hides the permission decision from tests. |
| Output formats | JSON and PDF only in v1 | JSON drives the on-screen table; PDF drives the finance handoff. CSV / Excel export is deferred. |
| PDF engine | Reuse the existing `PdfRenderer` port (`apps/api/src/pdf/`) with the Playwright adapter | Zero new browser plumbing. Same abstraction the Documents area already uses. |
| Report currency | Always `Organization.currencyCode` (spec `organization/02`) | One currency per report line prevents "which currency am I looking at?" ambiguity. Per-member currency overrides are display-only, not report-facing. |
| Report timezone | The **caller's** `Account.timezone` | Simpler than adding `Organization.timeZone`; per-user tz already exists (spec `user-management/06`). Two viewers of the same range can therefore see marginally different day boundaries — documented in the spec. |
| Rate source | `MemberFinancials` live + `MemberFinancialsSnapshot` history, keyed by `TimeEntry.date` | Reuses the exact lookup pattern the accrual job (spec 08) uses. No per-project rate overrides in v1. |
| Aggregation branches | Four branches mirroring Teammerly — `(sumDateRanges, detailedReports)` matrix | Deviating would break parity with the finance workflows already in use. |
| Column permissions in Time &amp; Activity | Requested `columns[]` intersected with the caller's granted column capabilities server-side | Users without `ViewTimeAndActivityBilled` never receive the Billed Amount value in the JSON, even if they craft the column into the request. |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Every report endpoint scopes by `session.organizationId`, never the path `orgId`. Cross-org access returns 404. | 01 | — |
| Interpret `startDate` / `endDate` in the caller's `Account.timezone`; convert to UTC; `endDate` is inclusive (end of day) | 01 | — |
| For per-day grouping, split cross-day time entries so per-day totals credit the right day (mirrors Teammerly `GiveElapsedProjectTime`) | 01 | — |
| Rate = `MemberFinancialsSnapshot` in effect on `TimeEntry.date`, live `MemberFinancials` as fallback | 01 | — |
| Bill rate = `clientHourlyRate`; pay rate = `monthlySalary / hoursPerMonth` with the constant declared in the spec | 01 | — |
| Zero-time and zero-amount rows are dropped from the response after aggregation | 01 | — |
| PDF filename: `{OrgName}_{ReportType}_{startYYYY-MM-DD}_to_{endYYYY-MM-DD}.pdf` | 01 | — |
| Report-only capabilities: `ViewAmountsOwed`, `ViewMyAmountsOwed`, `ViewTimeAndActivity`, `ViewMyTimeAndActivity`, `ViewTimeOff`, `ViewMyTimeOff`, `ViewTimeAndActivitySpent`, `ViewTimeAndActivityBilled` | 01 | — |

## Cross-Spec Side Effects

| Trigger | Source | Effect | Target |
|---|---|---|---|
| Rename a `Client` after a report is generated | organization/01 | The PDF stays frozen with the old name; the JSON endpoint returns the new name | 01 |
| Archive a `Client` | organization/01 | Historical projects and their time entries still resolve the client name in reports; the client cannot be picked as a new filter dimension | 01 |
| Add/edit/delete a `Holiday` for a past date | organization/03 | Amounts Owed reports run *after* the change reflect the new state; already-issued PDFs are frozen | 01 |
| Change `Organization.currencyCode` | organization/02 | Reports run *after* the change use the new currency; previously issued PDFs stay in the currency they were rendered in | 01 |
| Toggle `TimeEntry.billable` | user-management/16 | Amounts Owed only counts billable entries; Time &amp; Activity splits Billable/Non-Billable/Billed Amount columns based on the flag | 01 |
| Approve/cancel a `VacationRequest` | user-management/09 | Time Off report reflects the frozen `workingDays` and `deductionAmount`; the report never recomputes those values | 01 |

## Dependency Graph

```
organization/01-clients.md                ─┐
organization/02-organization-currency.md  ─┤
organization/03-holidays.md               ─┼─►  reports/01-reports.md
user-management/16-billable-time.md       ─┘
```

The four prerequisite specs have no dependencies on each other and can be implemented in any order or in parallel. The Reports spec depends on all four; it cannot ship until they all merge.

## Blast Radius

**Database.** No new tables or columns are introduced by this area — reports are read-only aggregations over `TimeEntry`, `VacationRequest`, `MemberFinancials(Snapshot)`, `Project`, `Client`, `Holiday`, and `Organization`. Every input entity was introduced by another spec.

**Shared code that breaks on contact.** New capabilities land in `packages/validation/src/roles.ts` and its `MemberCapability` sibling in `packages/validation/src/index.ts`. `apps/web/src/layout/Sidebar.tsx` gains the Reports nav group. `apps/api/src/reports/` is a fresh NestJS module with a controller, three services (one per report), a shared filter/rate service, and an HTML-rendering helper that feeds the existing `PdfRenderer`.

**Security surface.** Twelve new endpoints under `/api/organizations/{orgId}/reports/…`. All guarded by `SessionGuard`, `OrgScopeGuard`, and a per-endpoint `RequireCapability`. PDF endpoints stream `application/pdf` with `Content-Disposition: attachment`; they never accept an HTML payload from the client. Column-permission intersection runs server-side before Prisma selection so denied columns never touch the response, even for a hand-crafted request.

**Operations.** PDF generation launches a headless browser via the existing Playwright adapter. Expect a few hundred milliseconds of latency; large ranges (hundreds of members × 12 months) may push past 10 seconds. The spec proposes a client-side loading indicator and documents the current lack of a queue — a follow-up spec adds queueing if the p95 grows unmanageable.

## Backward Compatibility

1. No existing endpoint changes shape. Reports is purely additive.
2. Adding capabilities to the enum is backward-compatible; existing roles gain the report permissions per the spec's role → capability matrix.
3. Rendering a report against pre-migration data (before any client, holiday, or billable flag existed) shows a sensible view: no clients means the Client column reads `—`; no holidays means the Amounts Owed report has no Holiday rows; entries without a `billable` value read as billable (default).
4. Renaming a client or changing the org currency after a PDF has been rendered does not retroactively alter the PDF.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| No CSV / Excel export | JSON drives the screen; PDF drives finance. CSV can be added on demand. | A follow-up spec adds a CSV route per report, streaming the same aggregation output. |
| No report scheduling / email delivery | Users still generate reports on demand. Scheduled email reports are a feature-flag-worthy addition, not v1 scope. | A follow-up spec `02-report-schedules.md` adds cron-style schedules keyed on saved-report configurations. |
| No saved report configurations | Filter state lives in the URL; a manager who wants "monthly by client" reruns the filter. | A follow-up spec adds `SavedReport` with name + filter payload; landing surfaces user's saved reports. |
| Cross-currency conversion | The org currency rule + per-member override behavior (spec organization/02) makes reports single-currency by design. | A future spec `organization/05-fx-rates.md` — snapshot vs live rate, per-transaction vs per-period conversion. |
| Per-project rate overrides | v1 uses `MemberFinancials` as the sole rate source. Client / project rate overrides are a Teammerly parity item deferred by design. | A future spec `organization/04-project-rates.md`. |
| Long-running PDF queueing | PDF rendering is synchronous inside the request; large orgs may see 10+ s latencies. | A follow-up spec adds an async render + presigned-URL delivery via the existing `JobQueue` port. |
