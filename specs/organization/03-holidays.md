---
id: "03"
title: Holidays
routes: ["/org/{orgId}/settings/holidays"]
api:
  - "GET    /api/organizations/{orgId}/holidays"
  - "POST   /api/organizations/{orgId}/holidays"
  - "PATCH  /api/organizations/{orgId}/holidays/{holidayId}"
  - "DELETE /api/organizations/{orgId}/holidays/{holidayId}"
entities: [Holiday]
tags: [holiday, calendar, paid-hours, country-code, admin-settings, reports]
depends-on:
  - "documents/04"       # Signing Settings — established the Settings sidebar group this spec extends
  - "user-management/06" # Account Settings — owns `Account.phoneCountryCode` used for country resolution
  - "user-management/09" # Vacation Requests — this spec surfaces a hint on that form
---

# 03 — Holidays

## Summary

Organizations maintain a **holiday calendar** — paid public holidays like New Year's Day, Independence Day, Christmas — that Reports (`specs/reports/`) render as "Holiday" activity rows in Amounts Owed (that spec owns the aggregation, the rate lookup, and the tests; see §Effect on Reports), and that the Time Tracking calendar (spec `user-management/12`) shows as read-only markers so members know a day is a paid holiday before they log time. A holiday has a date, a name, paid hours, and an optional country code so a single organization can serve teams in multiple jurisdictions. **This spec deliberately does not alter vacation math** — `calculateWorkingDays` (spec 09) still counts Mon–Fri only. Excluding holidays from working-day counts is a separate future amendment to spec 09.

## Actors & Preconditions

- **Actors:** `admin` creates, edits, and deletes holidays. `manager` can create and edit but cannot delete. `user` and `viewer` see holidays as read-only markers on their own Time Tracking calendar; they do not open the Settings › Holidays page.
- **Preconditions:** the caller is an `active` member of the organization. This spec ships its own row in the sidebar's Settings group (spec 04 established the group; `apps/web/src/layout/Sidebar.tsx:150`) gated on `ViewHolidays`, so admins and managers see the row and nobody else does — no dead links, no reliance on a shell that has not shipped.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View Settings › Holidays page | ✅ | ✅ | ❌ | ❌ |
| List holidays via API — `scope=all` (all rows, `country?` filter) | ✅ | ✅ | ❌ | ❌ |
| List holidays via API — `scope=mine` (own country + globals) | ✅ | ✅ | ✅ | ✅ |
| Create holiday | ✅ | ✅ | ❌ | ❌ |
| Edit holiday | ✅ | ✅ | ❌ | ❌ |
| Delete holiday | ✅ | ❌ | ❌ | ❌ |
| See holidays on the Time Tracking calendar | ✅ | ✅ | ✅ | ❌ |

## Functional Requirements

### Holiday entity

1. A holiday belongs to exactly one organization and has: `date` (a specific calendar date, date-only, no time), `name`, `paidHours`, an optional `countryCode`.
2. `name` is required, 1–120 characters after trimming. Allowed characters: any Unicode letter, digit, space, `- & . , ' ( ) /`. Leading and trailing whitespace is trimmed.
3. `paidHours` is required, a `Decimal(4,2)` between `0.00` and `24.00` inclusive. Default `8.00`. Non-integer values are allowed for half-day holidays.
4. `countryCode` is optional, exactly 2 uppercase letters (ISO 3166-1 alpha-2). If null, the holiday applies to **all countries** (i.e. every member sees it and it applies to every member for Amounts Owed).
5. Two holidays cannot share the same `(organizationId, date, countryCode)`. `countryCode = null` counts as its own value — so a global holiday on `2026-05-01` does not conflict with a `BY`-scoped holiday on the same date.
6. Holidays are stored in UTC dates (they are calendar-day facts, not instants); the display uses the caller's `Account.timezone` for the day-of-week label but never shifts the date.

### Effect on Reports (Amounts Owed) — contract, not aggregation

**Reports/01 owns the aggregation.** `specs/reports/01-reports.md` (§18–21, `TC-01-INT-12/13/14`) is where the "Holiday · {name}" row is defined, rate-looked-up, and tested; that spec `depends-on: organization/03`, so this one ships first with the entity and the country-resolution rule it needs, and reports/01 ships next with the rollup. This section states the invariants reports/01 is entitled to assume from the entity, not the aggregation itself — the aggregation is not restated here, and this spec's test suite does not re-verify it.

7. **The storable contract is complete.** A `Holiday` row carries `date`, `name`, `paidHours` and an optional `countryCode`, and country resolution (§14–15) is the only filter reports/01 applies. Nothing further about the Amounts Owed row shape lives in this spec.
8. **Deleting or editing a holiday never mutates a rendered PDF.** The PDF is a stored artefact (spec 05); a subsequent JSON fetch reflects the new state. Reports/01 depends on this invariant and this spec upholds it by never rewriting through the PDF path.
9. **Holidays are orthogonal to `TimeEntry.billable`.** Non-billable hours logged on a holiday date do not shadow, modify, or replace the synthetic Holiday row reports/01 adds; the two coexist on the report. No trigger or cascade in this spec touches `TimeEntry` when a `Holiday` is written.

### Effect on the Time Tracking calendar

10. The Weekly and Monthly views in `apps/web/app/org/[orgId]/time-tracking/` call `GET /api/organizations/{orgId}/holidays?scope=mine` (see §API Contracts) on mount alongside their existing time-entries fetch, and render each returned row as a read-only marker on the matching day cell: a small star icon, the holiday name in a tooltip, and an amber-tinted background token distinct from the selected/current-day token. **This spec adds no route to `apps/api/src/time-tracking/`**; the calendar reads the holidays endpoint directly, so `time-tracking.controller.ts` is not touched.
11. A member can still log time on a holiday (they may have been called in). Logging time on a holiday does not remove the marker; the two coexist visually.

### Effect on Vacation

12. **Vacation math is unchanged.** `VacationRequest.workingDays` continues to be calculated by `calculateWorkingDays` (Mon–Fri only, per spec 09). A vacation that overlaps a holiday still deducts the full working-day count.
13. The vacation Request form (spec 09) **surfaces** a non-blocking hint when the range overlaps a holiday: **"Note: {n} paid holiday(s) fall in this range. Vacation is deducted for the working days; holidays are paid separately in Amounts Owed."** This is UI-only, informational — no math changes. The element carries `data-testid="vacation-request-holiday-hint"` (§Required data-testid Attributes) and is asserted by `TC-03-E2E-05`.

### Member country resolution

14. A member's country for holiday filtering is resolved as: `Account.phoneCountryCode` (existing field from spec 06 with a normalized alpha-2 value) if present; otherwise `null` (matches only `countryCode = null` holidays).
15. **This spec does not add a "member country" field**; if the user needs a richer country model it belongs in a follow-up. `phoneCountryCode` is a pragmatic reuse.

## Data Model

### Holiday

| Field | Type | Description |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `organizationId` | String (FK) | References `Organization.id`. Cascade delete. |
| `name` | String(120) | Trimmed. |
| `date` | `DateTime @db.Date` | Calendar date only. |
| `paidHours` | `Decimal @db.Decimal(4, 2)` | Default `8.00`. Range 0–24. |
| `countryCode` | String? `@db.Char(2)` | ISO 3166-1 alpha-2, uppercase. Nullable = applies to all countries. |
| `createdAt` | DateTime | UTC. |
| `updatedAt` | DateTime | UTC. |
| `createdByAccountId` | String (FK) | Account that created the holiday. |

**Indexes:**
- `@@unique([organizationId, date, countryCode])` — the primary uniqueness constraint. Postgres treats each `NULL` as distinct by default, so this alone permits two global (`countryCode IS NULL`) holidays on the same date.
- A **partial** unique index that closes the `NULL` case: `CREATE UNIQUE INDEX "Holiday_org_date_globalUniq" ON "Holiday" ("organizationId", "date") WHERE "countryCode" IS NULL;`. Together the two indexes match every row of the Duplicate table in §Test Cases: same date + same non-null country → 409; same date + both null → 409; same date + one null one country → both succeed. A single expression index on `(organizationId, date, (countryCode IS NULL))` cannot satisfy both — unique it rejects the mixed-country case, non-unique it enforces nothing — so it is not used.
- `(organizationId, date)` for range queries.

### New Capabilities

- `ManageHolidays` / `manage-holidays` — create and edit holidays (admin, manager).
- `DeleteHolidays` / `delete-holidays` — delete holidays (admin only).
- `ViewHolidays` / `view-holidays` — see the Holidays page (admin, manager). Members always see the calendar markers via the Time Tracking capability chain from spec 12; no new capability is needed for that.

## API Contracts

### `GET /api/organizations/{orgId}/holidays`

**Query:**
- `year?` — integer, defaults to the current year in the caller's tz.
- `country?` — 2-letter code, or the literal `all`. Default `all`.
- `scope?` — one of `all` (default) or `mine`. `all` returns rows the caller's role is authorized to see and applies the `country` filter. `mine` overrides `country` and returns exactly the rows a member should see on their own Time Tracking calendar: server resolves the caller's country per §14 (`Account.phoneCountryCode` if present, else `null`) and returns holidays whose `countryCode` equals the resolved value **or** is `null` (global). `mine` and `country=all` together return `mine`'s result — the calendar page is not a settings tool.

**200 Response:**
```json
{
  "holidays": [
    {
      "id": "cly…",
      "date": "2026-01-01",
      "name": "New Year's Day",
      "paidHours": 8.00,
      "countryCode": null,
      "createdAt": "2025-12-10T09:00:00Z"
    }
  ]
}
```

Ordered by `date` ascending.

Available to all members. `scope=all` requires `view-holidays` (admin, manager); a caller without that capability who passes `scope=all` or omits `scope` receives 404 (per the `OrgScopeGuard` pattern — unknown and unauthorized look identical). `scope=mine` is available to every authenticated org member — this is what the Time Tracking calendar calls, so `user` and `viewer` can read the endpoint without `view-holidays`.

### `POST /api/organizations/{orgId}/holidays`

**Body:**
```json
{
  "date": "2026-05-01",
  "name": "Labour Day",
  "paidHours": 8.00,
  "countryCode": null
}
```

**201 Response:** `{ "holiday": { …Holiday } }`
**409 Response:** `{ "error": "holiday_duplicate", "message": "A holiday already exists on this date." }`
**422 Response:** `{ "error": "validation_error", "fields": { … } }`

Requires `manage-holidays`.

### `PATCH /api/organizations/{orgId}/holidays/{holidayId}`

Same body shape; all fields optional. Same error codes as POST.

### `DELETE /api/organizations/{orgId}/holidays/{holidayId}`

**204 Response** on success. Requires `delete-holidays` (admin only).

### No changes to `apps/api/src/time-tracking/`

No new route is added to `apps/api/src/time-tracking/time-tracking.controller.ts` and no existing route grows a `holidays` array. The Weekly and Monthly views call `GET /api/organizations/{orgId}/holidays?scope=mine` directly; the time-tracking module is not modified by this spec. (An earlier draft extended a `GET .../time-tracking/calendar` endpoint that does not exist and never has — the controller declares only `timer/*` and `time-entries/*` — and that section has been retired in favour of the direct read above.)

## Validation Rules

1. `date` required — "Date is required."
2. `date` must be a valid calendar date — "Invalid date."
3. `name` required — "Holiday name is required." (empty after trim).
4. `name` too long — "Holiday name cannot exceed 120 characters."
5. `name` disallowed characters — "Holiday name contains disallowed characters."
6. `paidHours` required — "Paid hours is required."
7. `paidHours` out of range — "Paid hours must be between 0 and 24."
8. `countryCode` malformed — "Country code must be 2 uppercase letters."
9. Duplicate — "A holiday already exists on this date." (409)

## Error Messages

| Context | Message |
|---|---|
| Toast — created | "Holiday added." |
| Toast — updated | "Holiday updated." |
| Toast — deleted | "Holiday deleted." |
| Toast — delete forbidden (403) | "You don't have permission to delete holidays." |
| Confirm — delete holiday for a past date | "Delete **{name}** on {date}? Amounts Owed reports run after now will no longer include it. Reports already exported as PDF are unchanged." |
| Confirm — delete holiday for a future date | "Delete **{name}** on {date}?" |
| Confirm buttons | "Cancel" / "Delete holiday" (danger) |
| Empty state — no holidays for the selected year | "No holidays for {year} yet. Add holidays so paid public days appear on Amounts Owed reports and the Time Tracking calendar." |
| Empty state — no results for country filter | "No holidays for {country} in {year}." |
| Vacation hint — overlaps holiday(s) | "Note: {n} paid holiday(s) fall in this range. Vacation is deducted for the working days; holidays are paid separately in Amounts Owed." |
| Calendar tooltip | "★ Holiday · {name}" |

Every string in the table above is exported from `packages/validation/src/holiday-messages.ts` as `HOLIDAY_MESSAGES` and re-exported through the package barrel. The API returns the delete-forbidden string in the 403 body's `message` field (overriding the `capability.guard.ts` generic-forbidden default for this resource) so the web layer's toast reads the tabulated wording, not the generic one. Rule per [CLAUDE.md](../../CLAUDE.md): never write a user-facing validation message inline.

## Screens

Rendered as a standalone page under `/org/{orgId}/settings/holidays`. The sidebar's Settings group (spec 04) gains a **Holidays** row gated on `ViewHolidays` — no other settings shell exists yet, and none is required for this spec. See [`03-holidays.mock.html`](03-holidays.mock.html) for the visual target (the mock draws a five-item settings nav for illustration; only the Holidays row and the pre-existing Signing row from spec 04 are rendered — the other three are deferred to spec 02 and not drawn until it ships). Three states are canonical:

### Holidays list — populated

Grouped by month with sticky month bands. Each row: date (with day-of-week), name, paid hours (mono), country cell (2-letter chip + full name, or "All"), rename/edit icon-button. Year tabs above the toolbar.

### Empty state

Centered card with a 🗓️ glyph, a title **"No holidays for {year} yet."**, a subtitle explaining the effect on Amounts Owed and the calendar, and a primary CTA **"+ Add holiday"**.

### Add / Edit modal

Row 1: Date (native `<input type="date">`) + Paid hours (numeric with `step="0.25"`, min 0, max 24).
Row 2: Name (text).
Row 3: Country picker with **All countries** as the first option and ISO 3166 alpha-2 codes below.
Actions: Cancel + primary Add/Save. Edit modal additionally shows a danger-tone **"Delete holiday"** button in the bottom-left (admin only).

## Flows

### Main Flow: Admin adds a holiday

1. Admin opens **Settings** › **Holidays**.
2. System shows the list for the current year (or empty state).
3. Admin clicks **+ Add holiday**.
4. System opens the Add Holiday modal with today's date pre-filled and `paidHours = 8.00`.
5. Admin picks the date, types the name, adjusts hours if needed, picks a country (defaults to **All countries**).
6. Admin clicks **Add holiday**.
7. System sends `POST /api/organizations/{orgId}/holidays`.
8. On success: modal closes, toast **"Holiday added."**, the row appears in the list under its month band.

### Alt Flow A: Duplicate holiday (branches from step 7)

7a. Server returns 409. Modal stays open with an inline error under the Date field: **"A holiday already exists on this date."** The submit button is not disabled.

### Alt Flow B: Delete a past holiday (branches from Edit modal)

1. Admin opens the Edit modal for a past-date holiday.
2. Admin clicks **Delete holiday**.
3. System shows the past-date confirmation (§Error Messages).
4. Admin confirms.
5. System sends `DELETE /api/organizations/{orgId}/holidays/{id}`.
6. On success: both modals close, toast **"Holiday deleted."**, the row disappears from the list.

### Alt Flow C: Manager tries to delete (branches from step 2 of Alt B)

2c. The **Delete holiday** button is not rendered for the manager. If a manager crafts the DELETE request directly, server returns 403.

### Alt Flow D: Member logs time on a holiday date

1. Member opens the Weekly view.
2. Holiday cells render with an amber-tinted background and a tooltip **"★ Holiday · {name}"**.
3. Member logs time normally into the cell.
4. The entry saves. The holiday marker remains visible on the cell.

## UI Description

### Route

`/org/{orgId}/settings/holidays` — the holidays list. Modals overlay this route.

### States

| State | Trigger | Rendered |
|---|---|---|
| Loading | Initial fetch or year switch | Table skeleton with 6 shimmering rows |
| Empty | 0 holidays for the selected year | Centered empty card with primary CTA |
| Empty (country filter) | 0 holidays match the country | Compact inline "No holidays for {country} in {year}" |
| Populated | 1+ holidays | Table grouped by month |
| Error | 5xx / network | Inline banner with **Retry** |

### Responsive Behavior

**Desktop (>1024px):** as above.
**Tablet (768–1024px):** month band stays sticky. Actions column collapses to `⋯` menu.
**Mobile (<768px):** table converts to a card list — each holiday is a card with the date badge, name, hours, and country chip; the Edit modal is full-screen with a bottom sheet for the country picker.

### Accessibility

- Month bands are `role="rowheader"` for screen-readers.
- The Add/Edit modal traps focus, `Esc` closes.
- The country select's list floats over the dialog rather than extending it (design-system
  [§95](../design-system/decisions.md)): opening it never scrolls or clips the dialog, whatever
  the dialog's height. `Esc` with the list open closes the list, not the dialog.
- Country chips carry an `aria-label` with the full country name; the 2-letter code alone is not read.
- The Time Tracking calendar's holiday marker is announced to a live region on day-cell focus: **"Holiday: {name}. Paid hours: {n}."**

## Required `data-testid` Attributes

### Sidebar & tab

- `settings-tab-holidays`

### Page

- `holidays-page`, `holidays-page-title`
- `holidays-year-tab-{yyyy}`
- `holidays-country-filter`
- `holidays-add-btn`
- `holidays-table`
- `holidays-row-{id}`, `holidays-row-{id}-edit-btn`
- `holidays-month-band-{yyyy}-{mm}`
- `holidays-empty-state`, `holidays-empty-primary-cta`
- `holidays-loading-skeleton`
- `holidays-error-banner`, `holidays-error-retry-btn`

### Modal

- `holiday-modal`, `holiday-modal-title`
- `holiday-date-input`, `holiday-name-input`, `holiday-hours-input`, `holiday-country-select`
- `holiday-save-btn`, `holiday-cancel-btn`, `holiday-delete-btn`
- `holiday-delete-confirm`, `holiday-delete-confirm-btn`, `holiday-delete-cancel-btn`
- `field-error-date`, `field-error-name`, `field-error-paidHours`, `field-error-countryCode`

### Time Tracking calendar

- `time-cell-{yyyy}-{mm}-{dd}-holiday-marker` — asserted by `TC-03-E2E-04`.

### Vacation Request form (spec 09)

- `vacation-request-holiday-hint` — asserted by `TC-03-E2E-05`, per requirement 13.

### Toasts

- `toast-holiday-added`
- `toast-holiday-updated`
- `toast-holiday-deleted`
- `toast-server-error`

## Security

### Authentication & Authorization

- Every endpoint sits behind `SessionGuard` + `OrgScopeGuard`.
- `GET /holidays?scope=mine` is available to every authenticated org member; `scope=all` (and the omitted-scope default) requires `view-holidays` and returns **404** — not 403 — to a caller without it, matching the `OrgScopeGuard` pattern for unknown-vs-unauthorized parity.
- `POST` and `PATCH` require `manage-holidays`.
- `DELETE` requires `delete-holidays`. The 403 body's `message` is `HOLIDAY_MESSAGES.deleteForbidden` (§Error Messages) so the toast shows the tabulated wording rather than the generic one.

### Cross-organization protection (IDOR)

- Server filters by `session.organizationId`; path `orgId` is compared only.
- `POST` sets `organizationId = session.organizationId`; the body cannot carry it.

### Input handling

- `date` parsed with strict ISO 8601 date parser; time components are rejected.
- `countryCode` validated against `^[A-Z]{2}$` — never used as a raw string in SQL.
- `name` is rendered as text (React auto-escapes) and stored trimmed.

### Concurrency & audit

- Duplicate creates are serialized by the unique index; the loser gets 409.
- Deletes are atomic — no soft delete, hard remove.

### Rate limiting

- App-wide default.

### Logging

- Every mutation logs `{ event, actorAccountId, organizationId, holidayId, date, name, paidHours, countryCode }` at info.

## Out of Scope

- Recurring holidays (e.g. "every third Monday of March") — each occurrence is a separate row in v1.
- Regional / state / province scope smaller than country (e.g. Quebec vs Ontario).
- Import from an external calendar API (iCal, Google Calendar).
- Holiday-aware `workingDays` computation — a separate future amendment to spec 09.
- Multiple `paidHours` variants per holiday for different member cohorts.
- Non-paid observances (e.g. "Awareness Day" with `paidHours = 0` is allowed by validation; the UI just shows it as informational).

## Test Cases

### Unit

- **TC-03-UNIT-01: Name validation — empty.** Returns `{ valid: false, error: "Holiday name is required." }`.
- **TC-03-UNIT-02: Name validation — too long.** 121-char name returns the length error.
- **TC-03-UNIT-03: paidHours boundary — 0.** Returns `{ valid: true }`.
- **TC-03-UNIT-04: paidHours boundary — 24.** Returns `{ valid: true }`.
- **TC-03-UNIT-05: paidHours boundary — 24.01.** Returns the range error.
- **TC-03-UNIT-06: paidHours — negative.** Returns the range error.
- **TC-03-UNIT-07: countryCode — valid.** `validateCountryCode('BY')` returns valid.
- **TC-03-UNIT-08: countryCode — lowercase.** Returns the format error.
- **TC-03-UNIT-09: countryCode — null allowed.** `validateCountryCode(null)` returns valid.
- **TC-03-UNIT-10: `calculateWorkingDays` unchanged with holiday overlap.** Given a Mon–Fri range with a Wednesday holiday in the middle, `calculateWorkingDays` returns 5 (still counts Wednesday) — this test locks the design decision that vacation math is unaffected.

### Integration

- **TC-03-INT-01: Create as admin — happy path.** POST returns 201; a subsequent GET returns the row.
- **TC-03-INT-02: Create as manager.** Returns 201.
- **TC-03-INT-03: Create as user.** Returns 404.
- **TC-03-INT-04: Duplicate — same date, both null country.** Second POST returns 409.
- **TC-03-INT-05: Duplicate — same date, same country.** Two POSTs on `2026-05-01` with `countryCode = 'BY'` — second is 409.
- **TC-03-INT-06: Non-duplicate — same date, different countries.** POST `2026-05-01, BY` and `2026-05-01, US` both succeed.
- **TC-03-INT-07: Non-duplicate — same date, null vs country.** POST `2026-05-01, null` and `2026-05-01, US` both succeed.
- **TC-03-INT-08: Edit — happy path.** PATCH the name; GET reflects the change; `updatedAt` moves.
- **TC-03-INT-09: Edit — conflict.** PATCH to a date that already has a holiday for the same country — 409.
- **TC-03-INT-10: Delete as admin.** DELETE returns 204; a subsequent GET does not return the row.
- **TC-03-INT-11: Delete as manager — forbidden.** DELETE returns 403.
- **TC-03-INT-12: Year filter.** Seed holidays in 2025 and 2026. GET with `?year=2026` returns only 2026 rows.
- **TC-03-INT-13: Country filter.** GET with `?country=BY` returns only `BY`-scoped and `null` (global) holidays.
- **TC-03-INT-14: `scope=mine` server-side country resolution.** Seed three holidays: `2026-05-01` global (`countryCode = null`), `2026-05-09` `BY`, `2026-07-04` `US`. As a `user` whose `Account.phoneCountryCode = 'BY'`, GET `/api/organizations/{orgId}/holidays?year=2026&scope=mine` — response contains exactly the global row and the `BY` row; the `US` row is absent. GET the same URL as a `user` with `phoneCountryCode = null` — response contains only the global row. This is the endpoint the Time Tracking calendar reads (§10).
- **TC-03-INT-15: Vacation math unaffected.** Create a `VacationRequest` overlapping a holiday; `workingDays` and `deductionAmount` remain identical to the same range without the holiday.
- **TC-03-INT-16: Retired.** Amounts Owed aggregation for a matching-country holiday is owned by `specs/reports/01-reports.md` §18 and covered by `TC-01-INT-12` (matching-country) and `TC-01-INT-14` (global). This spec's contract with reports/01 (§7) is that the entity carries `date`, `name`, `paidHours` and `countryCode`; the aggregation itself is not retested here.
- **TC-03-INT-17: Retired.** Cross-country exclusion is owned by `specs/reports/01-reports.md` §18 and covered by `TC-01-INT-13`. Same rationale as TC-03-INT-16.
- **TC-03-INT-18: Retired.** PDF immutability across a subsequent delete is owned by spec 05 (the rendered PDF is a stored artefact) and its consequence on Amounts Owed is asserted by reports/01. This spec upholds the invariant by never rewriting through the PDF path (§8); the case need not run twice.
- **TC-03-INT-19: Cross-org IDOR blocked.** Admin in org A calls DELETE for a holiday in org B — 404.
- **TC-03-INT-20: Session revocation.** Rotate `Account.securityStamp` mid-request cycle — the next mutating call returns 401.

### E2E

- **TC-03-E2E-01: Admin adds a global holiday — happy path.** Admin picks the year 2026, clicks **+ Add holiday**, fills the modal with a date, name, hours, and leaves country as **All**, saves, and sees the row in the correct month band.
  - **Selectors:** `settings-tab-holidays`, `holidays-add-btn`, `holiday-date-input`, `holiday-name-input`, `holiday-hours-input`, `holiday-country-select`, `holiday-save-btn`, `toast-holiday-added`, `holidays-row-{id}`.
- **TC-03-E2E-02: Manager cannot delete — unsuccessful flow.** Manager opens the Edit modal for a holiday and sees **no** Delete button. A direct DELETE via `page.evaluate` returns 403 with `message = HOLIDAY_MESSAGES.deleteForbidden`; the toast renders that exact string (`§Error Messages`, "delete forbidden").
  - **Selectors:** `holiday-delete-btn` (asserted absent), `toast-server-error`.
- **TC-03-E2E-03: Duplicate — unsuccessful flow.** Admin tries to create a holiday on a date/country combination that already exists; sees the inline error under the date field; the Save button is not disabled.
  - **Selectors:** `field-error-date`, `holiday-save-btn`.
- **TC-03-E2E-04: Member sees the holiday marker on the calendar.** User in `BY` opens the Weekly view. The page issues `GET /api/organizations/{orgId}/holidays?scope=mine` (asserted with Playwright's `page.waitForRequest`), and the corresponding cell renders the holiday marker; on focus, the live-region announces the holiday name and paid hours (§Accessibility).
  - **Selectors:** `time-cell-{yyyy}-{mm}-{dd}-holiday-marker`.
- **TC-03-E2E-05: Vacation form hint.** Member submits a vacation request spanning a holiday; sees the non-blocking note explaining vacation is deducted per working day.
  - **Selectors:** `vacation-request-holiday-hint`.
- **TC-03-E2E-06: Opening the country select does not scroll or clip the modal** ([BUG-007](../bugs/BUG-007-select-list-scrolls-the-modal-it-opens-in.md)). Admin opens **Add holiday** and reads the dialog's `scrollHeight` and `clientHeight`; opens the **Country** field and reads both again and the list's bounding box. Closed and open alike, `scrollHeight <= clientHeight` — the list floats over the dialog and adds nothing to its scroll box — the list's bottom is inside the viewport, and the option `Afghanistan` is visible. Fails against the code before the fix with `Expected: <= 421, Received: 647`.
  - **Selectors:** `holidays-empty-primary-cta`, `holiday-modal`, `holiday-country-select`, the listbox named `Country`.
