---
id: "07"
title: Member Financial Settings
routes: ["Vacation tab on /org/{orgId}/members/{memberId}"]
api: ["GET .../vacation", "PUT .../vacation/financials"]
entities: [MemberFinancials, MemberFinancialsSnapshot]
tags: [salary, hourly-rate, billing, reserve, auto-calculate, vacation-tab, financial-settings, snapshot, currency]
depends-on: ["05"]
---

# 07 — Member Financial Settings

## Summary

Each member of an organization can have **financial settings** that track their monthly salary, client hourly rate, and vacation reserve percentage. An `admin` or `manager` configures these settings on the member's **Vacation tab** in the Member Detail view. The system auto-calculates the vacation reserve percentage based on salary and billing data, or the manager can manually override it. Every change to financial settings creates a **snapshot** that preserves the historical values for future accrual calculations (spec 08). This spec covers the foundation layer: configuring and viewing financial settings. Reserve accrual, vacation requests, and the Requests page are covered in specs 08–10.

## Actors & Preconditions

- **Actors:** `admin` and `manager` configure and view financial settings. `user` views their own Vacation tab (limited: days only, no financials). `viewer` has no access to vacation features.
- **Preconditions:** the member must be `active` and belong to the caller's organization.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View Vacation tab (any member, full financial data) | ✅ | ✅ | ❌ | ❌ |
| View own vacation balance (days only, no financials) | ✅ | ✅ | ✅ | ❌ |
| Edit MemberFinancials (salary, rate, reserve %) | ✅ | ✅ | ❌ | ❌ |

> **Note:** a `viewer` sees the Vacation tab label as disabled in the tab bar, identical to the Projects and Roles tabs. A `user` viewing **another** member's detail also sees the Vacation tab as disabled — `user` can only access the Vacation tab on their own detail.

## Functional Requirements

### Financial Settings

1. Each `active` membership may have exactly one **MemberFinancials** record. It stores `MonthlySalary`, `ClientHourlyRate`, `VacationReservePercent`, `IsReservePercentManual`, `VacationDaysPerYear`, and `Currency`.
2. `MonthlySalary` is a positive decimal. Minimum: `0.01`. Maximum: `999999.99`. Two decimal places. Required.
3. `ClientHourlyRate` is a positive decimal. Minimum: `0.01`. Maximum: `9999.99`. Two decimal places. Required.
4. `VacationDaysPerYear` is a positive integer. Minimum: `1`. Maximum: `365`. Default: `20`.
5. `Currency` is a 3-character uppercase ISO 4217 code (e.g., `USD`, `EUR`). Required.
6. `VacationReservePercent` is a positive decimal between `0.01` and `99.99`, two decimal places. It may be **auto-calculated** or **manually set**.

### Auto-Calculated Reserve Percentage

7. When `IsReservePercentManual` is `false`, the system computes:
   ```
   dailySalary = monthlySalary × 12 / 260
   annualVacationCost = dailySalary × vacationDaysPerYear
   expectedAnnualBilling = clientHourlyRate × 2080
   vacationReservePercent = round(annualVacationCost / expectedAnnualBilling × 100, 2)
   ```
   Constants: **260** working days per year, **2080** billable hours per year (8 hours × 260 days). These constants are fixed and not configurable.
8. The auto-calculated percentage is recomputed and saved whenever `MonthlySalary`, `ClientHourlyRate`, or `VacationDaysPerYear` changes — but only if `IsReservePercentManual` is `false`.
9. When `IsReservePercentManual` is `true`, the `VacationReservePercent` is the value entered by the manager and does not change when salary or rate changes.
10. Toggling from manual back to auto recalculates the percentage immediately.

### Financial Settings History

11. Every time MemberFinancials is created or updated, the system creates a **MemberFinancialsSnapshot** record capturing the new values and their `EffectiveFrom` date (the date of the change).
12. The snapshot chain allows the auto-accrual job (spec 08) to look up which salary, rate, and reserve percentage were in effect during any given billing month.
13. If financials change multiple times within a single month, the last snapshot before or on the last day of the billing month is used for that month's credit calculation.

## Data Model

### MemberFinancials

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `MembershipId` | Guid (FK, unique) | References `Membership.Id`. One-to-one. |
| `MonthlySalary` | decimal(10,2) | Employee monthly salary. Min 0.01, max 999999.99. |
| `ClientHourlyRate` | decimal(8,2) | Hourly rate billed to the client. Min 0.01, max 9999.99. |
| `VacationReservePercent` | decimal(5,2) | Percentage of client billing reserved for vacation. Min 0.01, max 99.99. |
| `IsReservePercentManual` | bool | `true` if the manager set the percentage manually; `false` if auto-calculated. |
| `VacationDaysPerYear` | int | Maximum vacation days per calendar year. Default 20. Min 1, max 365. |
| `Currency` | string(3) | ISO 4217 currency code (e.g. "USD"). |
| `UpdatedAt` | DateTime | Last modification timestamp. |
| `UpdatedByAccountId` | Guid (FK) | Account that last modified these settings. |

### MemberFinancialsSnapshot

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `MembershipId` | Guid (FK) | References `Membership.Id`. |
| `MonthlySalary` | decimal(10,2) | Salary at the time of this snapshot. |
| `ClientHourlyRate` | decimal(8,2) | Client rate at the time of this snapshot. |
| `VacationReservePercent` | decimal(5,2) | Reserve percentage at the time of this snapshot. |
| `IsReservePercentManual` | bool | Whether the percentage was manually set. |
| `VacationDaysPerYear` | int | Days per year at the time of this snapshot. |
| `Currency` | string(3) | Currency at the time of this snapshot. |
| `EffectiveFrom` | DateOnly | Date from which these settings are effective. |
| `CreatedAt` | DateTime | When this snapshot was created. |

### New Capabilities (extend `Capability` enum)

- `ViewVacation` — view vacation tab with full financial data (admin, manager)
- `ViewOwnVacationBalance` — view own vacation day balance (admin, manager, user)
- `EditMemberFinancials` — edit salary, rate, reserve % (admin, manager)

## Screens

### Vacation Tab — admin/manager view (financials configured)

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to members                                         │
│                                                             │
│                        ┌────┐                               │
│                        │ AK │                               │
│                        └────┘                               │
│                    Alex Kaminski                             │
│                       [user]                                │
│                  Joined Jun 1, 2025                         │
│                  ✉  alex@acme.com                           │
│                  🕐 America/New_York                        │
│                                                             │
│  About   [ VACATION ]   Projects   Roles   Payments        │
│          active          disabled   disabled  disabled      │
│                                                             │
│  ┌─ Financial Settings ──────────────────── [ Edit ] ─┐    │
│  │  Monthly salary     $3,000.00  USD                  │    │
│  │  Client hourly rate $40.00                          │    │
│  │  Reserve %          3.33% (auto)                    │    │
│  │  Days per year      20                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Vacation Balance ─────────────────────────────────┐    │
│  │                                                     │    │
│  │   0 days available   │  0 used  │  0 pending        │    │
│  │                                                     │    │
│  │   Reserve: $0.00 USD                                │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Vacation Tab — user view (own profile)

```
┌─────────────────────────────────────────────────────────────┐
│  About   [ VACATION ]   Projects   Roles   Payments        │
│          active          disabled   disabled  disabled      │
│                                                             │
│  ┌─ Vacation Balance ─────────────────────────────────┐    │
│  │                                                     │    │
│  │   0 days available   │  0 used  │  0 pending        │    │
│  │   out of 20 per year                                │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Vacation Tab — empty state (no financials configured)

```
┌─────────────────────────────────────────────────────────────┐
│  About   [ VACATION ]   Projects   Roles   Payments        │
│                                                             │
│              ┌─────────────────────────────────┐            │
│              │                                 │            │
│              │  Vacation tracking has not been  │            │
│              │  set up for this member yet.     │            │
│              │                                  │            │
│              │  [ Set up financials ]           │            │
│              │  (admin/manager only)            │            │
│              │                                  │            │
│              └──────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

### Edit Financial Settings Modal

```
┌───────────── Edit Financial Settings ─────────────┐
│                                                    │
│  Monthly salary *                                  │
│  [ 3000.00                            ]            │
│                                                    │
│  Client hourly rate *                              │
│  [ 40.00                              ]            │
│                                                    │
│  Currency *                                        │
│  [ USD                                ▾ ]          │
│                                                    │
│  Vacation days per year *                          │
│  [ 20                                 ]            │
│                                                    │
│  Reserve percentage                                │
│  ( ) Auto-calculate  (●) Set manually              │
│  [ 3.33                               ] %         │
│                                                    │
│  (auto-calc preview: 3.33%)                        │
│                                                    │
│            [ Cancel ]  [ Save changes ]            │
└────────────────────────────────────────────────────┘
```

## Flows

### Main Flow: Manager sets up financial settings

1. Manager navigates to a member's detail page and clicks the Vacation tab.
2. System shows the empty state: "Vacation tracking has not been set up for this member yet." with a "Set up financials" button.
3. Manager clicks "Set up financials".
4. System opens the Edit Financial Settings modal with empty fields and "Auto-calculate" selected by default.
5. Manager enters monthly salary, client hourly rate, selects currency, and confirms vacation days per year (default 20).
6. System shows auto-calculated reserve percentage preview (e.g., "3.33%").
7. Manager clicks "Save changes".
8. System sends `PUT /api/organizations/{orgId}/members/{memberId}/vacation/financials`.
9. On success: modal closes, toast "Financial settings saved" appears, Vacation tab refreshes to show the full view with zero balance. A MemberFinancialsSnapshot is created with `EffectiveFrom` = today.

### Alt Flow: Edit financial settings (branches from Main Flow, step 3)

3a. On a member that already has financials, manager clicks "Edit" in the Financial Settings section.
3b. Modal opens pre-filled with current values.
3c. Manager edits and saves. System sends `PUT .../vacation/financials`.
3d. On success: modal closes, toast "Financial settings saved", tab refreshes. A new MemberFinancialsSnapshot is created with `EffectiveFrom` = today. If `IsReservePercentManual` was toggled to `false`, the percentage is recalculated.

### Alt Flow: Network/server error (any mutation)

- System shows error toast "Something went wrong. Please try again."
- Modal/form retains values. Buttons re-enable.

## API Contracts

### GET /api/organizations/{orgId}/members/{memberId}/vacation

**Authentication:** required. Caller must be `active` member of the organization.

**Authorization:**
- `admin`/`manager`: returns full data for any member.
- `user`: returns limited data (days only, no financials) — and only for their own membership. Returns `403` if viewing another member.
- `viewer`: returns `403`.

**Response `200` (admin/manager view, financials configured):**
```json
{
  "financials": {
    "monthlySalary": 3000.00,
    "clientHourlyRate": 40.00,
    "vacationReservePercent": 3.33,
    "isReservePercentManual": false,
    "vacationDaysPerYear": 20,
    "currency": "USD"
  },
  "balance": {
    "reserveBalance": 0,
    "availableDays": 0,
    "usedDays": 0,
    "pendingDays": 0,
    "totalDaysPerYear": 20
  },
  "canEdit": true,
  "canReviewRequests": false,
  "canSubmitRequest": false
}
```

**Response `200` (user viewing own profile, financials configured):**
```json
{
  "financials": null,
  "balance": {
    "reserveBalance": null,
    "availableDays": 0,
    "usedDays": 0,
    "pendingDays": 0,
    "totalDaysPerYear": 20
  },
  "canEdit": false,
  "canReviewRequests": false,
  "canSubmitRequest": false
}
```

**Response when financials not configured:**
```json
{
  "financials": null,
  "balance": null,
  "canEdit": true,
  "canReviewRequests": false,
  "canSubmitRequest": false
}
```

**Errors:**
- `401 Unauthorized`: not authenticated.
- `403 Forbidden`: `viewer` role, or `user` viewing another member's vacation — `{ "error": "forbidden", "message": "You do not have permission to view this member's vacation data" }`.
- `404 Not Found`: member not found — `{ "error": "not_found", "message": "Member not found" }`.

### PUT /api/organizations/{orgId}/members/{memberId}/vacation/financials

**Authentication:** required. Caller must be `admin` or `manager` with `active` membership.

**Request:**
```json
{
  "monthlySalary": 3000.00,
  "clientHourlyRate": 40.00,
  "vacationDaysPerYear": 20,
  "currency": "USD",
  "isReservePercentManual": false,
  "vacationReservePercent": null
}
```

When `isReservePercentManual` is `false`, `vacationReservePercent` is ignored (auto-calculated). When `true`, `vacationReservePercent` must be provided.

**Side effect:** creates a MemberFinancialsSnapshot with `EffectiveFrom` = today.

**Success `200`:**
```json
{
  "success": true,
  "vacationReservePercent": 3.33
}
```

Returns the effective percentage (auto-calculated or manual).

**Errors:**
- `400 Bad Request` (validation): `{ "errors": { "monthlySalary": "Monthly salary must be between 0.01 and 999999.99", ... } }`
- `400 Bad Request` (removed member): `{ "error": "member_removed", "message": "Cannot configure vacation for a removed member" }`
- `403 Forbidden`: caller is `user`/`viewer` — `{ "error": "forbidden", "message": "You do not have permission to edit financial settings" }`
- `404 Not Found`: member not found.

## Validation Rules

1. **MonthlySalary**: required, decimal, min `0.01`, max `999999.99`, two decimal places. Error: "Monthly salary must be between 0.01 and 999,999.99".
2. **ClientHourlyRate**: required, decimal, min `0.01`, max `9999.99`, two decimal places. Error: "Client hourly rate must be between 0.01 and 9,999.99".
3. **VacationDaysPerYear**: required, integer, min `1`, max `365`. Error: "Vacation days per year must be between 1 and 365".
4. **Currency**: required, 3 uppercase letters, must be a valid ISO 4217 code. Error: "Invalid currency code".
5. **VacationReservePercent** (when manual): required, decimal, min `0.01`, max `99.99`, two decimal places. Error: "Reserve percentage must be between 0.01 and 99.99".

Client-side validation: field-level validation on blur/submit for all numeric fields. Auto-calc preview updates on field change.

Server-side validation: all rules enforced regardless of UI state.

## Error Messages

| Context | Message |
|---|---|
| Financials — salary out of range | "Monthly salary must be between 0.01 and 999,999.99" |
| Financials — rate out of range | "Client hourly rate must be between 0.01 and 9,999.99" |
| Financials — days out of range | "Vacation days per year must be between 1 and 365" |
| Financials — invalid currency | "Invalid currency code" |
| Financials — reserve % out of range | "Reserve percentage must be between 0.01 and 99.99" |
| Financials — removed member | "Cannot configure vacation for a removed member" |
| View — forbidden | "You do not have permission to view this member's vacation data" |
| Edit — forbidden | "You do not have permission to edit financial settings" |
| Network/server error | "Something went wrong. Please try again." |
| Toast — financials saved | "Financial settings saved" |
| Empty state — no financials (admin/manager) | "Vacation tracking has not been set up for this member yet." |
| Empty state — no financials (user, own) | "Vacation tracking has not been set up for your account yet. Please contact your manager." |

## UI Description

### Vacation Tab Layout

- Route: `/org/{orgId}/members/{memberId}` (same as spec 05, Vacation tab context).
- The Vacation tab is the second tab in the tab bar: `About | VACATION | Projects | Roles | Payments`.
- The Vacation tab is **enabled** for `admin`/`manager` on any `active` member, and for `user` on their own membership only. It remains **disabled** for `viewer` and for `user` viewing another member.
- Content area below tabs is vertically stacked, max-width ~600px, centered.

### Vacation Tab Components

**Financial Settings card (`vacation-financials-card`):**
- Visible only to `admin`/`manager`.
- Displays: monthly salary, client hourly rate, reserve %, days per year, currency.
- "Edit" button (`vacation-financials-edit-btn`) opens the Edit Financial Settings modal.
- Reserve % shows "(auto)" or "(manual)" suffix.
- When financials are not yet configured, the entire Vacation tab shows the empty state instead.

**Vacation Balance card (`vacation-balance-card`):**
- Shows: available days (large number), used days, pending days.
- For `admin`/`manager`: also shows reserve balance in currency.
- For `user`: shows "out of {N} per year" but no monetary amount.
- At this stage (before spec 08 is implemented), all values are zero.

### Modal Components

**Edit Financial Settings modal (`vacation-financials-modal`):**
- Fields: Monthly salary input (`vacation-salary-input`), Client hourly rate input (`vacation-rate-input`), Currency dropdown (`vacation-currency-select`), Vacation days per year input (`vacation-days-input`), Reserve % mode toggle (`vacation-reserve-mode-auto`, `vacation-reserve-mode-manual`), Reserve % input (`vacation-reserve-percent-input`, enabled only in manual mode).
- Auto-calc preview (`vacation-reserve-preview`): shown when auto mode is selected, displays the computed percentage in real time as salary/rate/days change.
- Save button (`vacation-financials-save-btn`). Cancel button (`vacation-financials-cancel-btn`).
- Inline errors beneath each field (`field-error-{fieldName}`).

### Vacation Tab States

| State | Behavior |
|---|---|
| **Loading** | Skeleton/shimmer matching the card layout while the GET request is in flight. |
| **Empty (no financials, admin/manager)** | Empty state message with "Set up financials" button. |
| **Empty (no financials, user)** | Empty state message: "Vacation tracking has not been set up for your account yet. Please contact your manager." No action button. |
| **Default (admin/manager)** | Financial settings card and balance card (zeros until spec 08 adds accrual). |
| **Default (user, own profile)** | Balance card (days only, zeros until spec 08). No financials card. |
| **Saving (modal)** | Save button disabled with loading indicator. Fields read-only during submission. |
| **Success** | Toast notification. Modal closes. Tab data refreshes. |
| **Error** | Error toast or inline error beneath the relevant field. Modal stays open. Buttons re-enable. |

### Interactions

- **Tab click (Vacation):** loads vacation data via GET endpoint. Shows loading skeleton.
- **Edit financials click:** opens pre-filled modal (or empty for first setup).
- **Auto/manual toggle:** switching to auto immediately computes and displays the percentage preview. Switching to manual enables the percentage input field.

### Responsive Behavior

- Max-width ~600px, centered on desktop.
- On narrow viewports, full width with horizontal padding.
- Cards stack vertically.
- Modals become full-screen drawers on mobile (< 480px width).

## Required `data-testid` Attributes

**Tab bar:**
- `member-detail-tab-vacation`

**Vacation tab content:**
- `vacation-financials-card`, `vacation-financials-edit-btn`
- `vacation-balance-card`, `vacation-available-days`, `vacation-used-days`, `vacation-pending-days`, `vacation-reserve-amount`
- `vacation-empty-state`, `vacation-setup-btn`
- `vacation-loading-skeleton`

**Edit Financial Settings modal:**
- `vacation-financials-modal`
- `vacation-salary-input`, `vacation-rate-input`, `vacation-currency-select`, `vacation-days-input`
- `vacation-reserve-mode-auto`, `vacation-reserve-mode-manual`, `vacation-reserve-percent-input`
- `vacation-reserve-preview`
- `vacation-financials-save-btn`, `vacation-financials-cancel-btn`
- `field-error-monthlySalary`, `field-error-clientHourlyRate`, `field-error-vacationDaysPerYear`, `field-error-currency`, `field-error-vacationReservePercent`

**Toasts:**
- `toast-financials-saved`

## Out of Scope

- Vacation reserve accrual and transaction ledger (spec 08).
- Vacation requests — submit, review, cancel (spec 09).
- Organization Requests page (spec 10).
- Public holiday calendar (working days = weekdays only).
- Carry-over of unused days across years.
- Currency conversion or multi-currency support within one member.
- Projects, Roles, and Payments tabs (separate future specs).
- Integration with external payroll or billing systems.

## Test Cases

### TC-07-UNIT-01: Auto-calculate reserve percentage

- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Calculate for monthlySalary=3000, clientHourlyRate=40, vacationDaysPerYear=20.
  2. Calculate for monthlySalary=5000, clientHourlyRate=60, vacationDaysPerYear=20.
  3. Calculate for monthlySalary=2000, clientHourlyRate=25, vacationDaysPerYear=15.
- **Expected Result:**
  1. dailySalary = 3000×12/260 = 138.46. annualCost = 138.46×20 = 2769.23. billing = 40×2080 = 83200. percent = 2769.23/83200×100 = **3.33%**.
  2. dailySalary = 5000×12/260 = 230.77. annualCost = 230.77×20 = 4615.38. billing = 60×2080 = 124800. percent = 4615.38/124800×100 = **3.70%**.
  3. dailySalary = 2000×12/260 = 92.31. annualCost = 92.31×15 = 1384.62. billing = 25×2080 = 52000. percent = 1384.62/52000×100 = **2.66%**.

### TC-07-INT-01: Create financial settings — happy path

- **Level:** Integration
- **Preconditions:** org with admin A and active user M (no financials configured).
- **Steps:**
  1. As A, `PUT /api/organizations/{orgId}/members/{M.id}/vacation/financials` with `{ "monthlySalary": 3000, "clientHourlyRate": 40, "vacationDaysPerYear": 20, "currency": "USD", "isReservePercentManual": false }`.
  2. As A, `GET /api/organizations/{orgId}/members/{M.id}/vacation`.
- **Expected Result:**
  1. HTTP 200, `vacationReservePercent: 3.33`. A MemberFinancialsSnapshot is created with `EffectiveFrom` = today.
  2. Response includes `financials` with all values, `balance` with all zeros.

### TC-07-INT-02: Create financial settings — manual reserve %

- **Level:** Integration
- **Preconditions:** org with admin A and active user M.
- **Steps:**
  1. As A, `PUT .../vacation/financials` with `{ "monthlySalary": 3000, "clientHourlyRate": 40, "vacationDaysPerYear": 20, "currency": "USD", "isReservePercentManual": true, "vacationReservePercent": 5.00 }`.
- **Expected Result:**
  1. HTTP 200, `vacationReservePercent: 5.00`.

### TC-07-INT-03: Create financial settings — validation errors

- **Level:** Integration
- **Preconditions:** org with admin A and active user M.
- **Steps:**
  1. `PUT .../vacation/financials` with `monthlySalary: 0` → rejected.
  2. `PUT .../vacation/financials` with `monthlySalary: 1000000` → rejected.
  3. `PUT .../vacation/financials` with `clientHourlyRate: -5` → rejected.
  4. `PUT .../vacation/financials` with `vacationDaysPerYear: 0` → rejected.
  5. `PUT .../vacation/financials` with `currency: "XXXX"` → rejected.
  6. `PUT .../vacation/financials` with `isReservePercentManual: true, vacationReservePercent: 100` → rejected.
- **Expected Result:**
  1–6. Each returns HTTP 400 with the relevant validation error.

### TC-07-INT-04: Create financial settings — forbidden for user/viewer

- **Level:** Integration
- **Preconditions:** org with user U and viewer V.
- **Steps:**
  1. As U, `PUT .../vacation/financials` with valid data.
  2. As V, `PUT .../vacation/financials` with valid data.
- **Expected Result:**
  1–2. HTTP 403 with `{ "error": "forbidden" }`.

### TC-07-INT-05: Update financials recalculates auto-percent and creates snapshot

- **Level:** Integration
- **Preconditions:** member M with financials (auto, salary=3000, rate=40, percent=3.33).
- **Steps:**
  1. As admin, `PUT .../vacation/financials` with `monthlySalary: 4000` (rate unchanged, auto mode).
- **Expected Result:**
  1. New percent = 4000×12/260×20 / (40×2080) × 100 = **4.44%**. A new MemberFinancialsSnapshot is created with `EffectiveFrom` = today and the updated values. Existing transactions are NOT retroactively changed.

### TC-07-INT-06: Financials for removed member rejected

- **Level:** Integration
- **Preconditions:** removed member R.
- **Steps:**
  1. As admin, `PUT .../members/{R.id}/vacation/financials` with valid data.
- **Expected Result:**
  1. HTTP 400 with `{ "error": "member_removed" }`.

### TC-07-INT-07: View vacation — user sees own data only

- **Level:** Integration
- **Preconditions:** user U and user M in same org. Both have financials.
- **Steps:**
  1. As U, `GET .../members/{U.membershipId}/vacation` → success.
  2. As U, `GET .../members/{M.membershipId}/vacation` → forbidden.
- **Expected Result:**
  1. HTTP 200 with `financials: null` (no financial details), `balance` with days only.
  2. HTTP 403.

### TC-07-INT-08: View vacation — viewer gets 403

- **Level:** Integration
- **Preconditions:** viewer V in org with member M who has financials.
- **Steps:**
  1. As V, `GET .../members/{M.membershipId}/vacation`.
  2. As V, `GET .../members/{V.membershipId}/vacation`.
- **Expected Result:**
  1–2. HTTP 403.

### TC-07-E2E-01: Full financial settings setup (admin)

- **Level:** E2E
- **Preconditions:** logged in as admin; member "Alex Kaminski" (user) has no financials.
- **Steps:**
  1. Open Alex's member detail → click Vacation tab.
  2. Verify empty state message and "Set up financials" button.
  3. Click "Set up financials".
  4. Enter salary 3000, rate 40, currency USD, days 20. Leave auto-calculate selected.
  5. Verify reserve % preview shows "3.33%".
  6. Click "Save changes".
  7. Verify toast "Financial settings saved". Verify Financial Settings card shows correct values.
  8. Verify balance card shows reserve $0.00, available days 0.
  9. Reload page. Verify data persists.
- **Selectors:** `member-detail-tab-vacation`, `vacation-empty-state`, `vacation-setup-btn`, `vacation-financials-modal`, `vacation-salary-input`, `vacation-rate-input`, `vacation-currency-select`, `vacation-days-input`, `vacation-reserve-mode-auto`, `vacation-reserve-preview`, `vacation-financials-save-btn`, `toast-financials-saved`, `vacation-financials-card`, `vacation-balance-card`, `vacation-reserve-amount`.

### TC-07-E2E-02: Viewer sees Vacation tab disabled

- **Level:** E2E
- **Preconditions:** logged in as viewer.
- **Steps:**
  1. Open any member's detail. Observe the tab bar.
- **Expected Result:**
  1. Vacation tab is visible but disabled (greyed out, not clickable). Same as Projects, Roles, Payments.
- **Selectors:** `member-detail-tab-vacation`.

### TC-07-E2E-03: User cannot see another member's vacation data

- **Level:** E2E
- **Preconditions:** logged in as user Alex; another member "Jane" exists.
- **Steps:**
  1. Navigate to Jane's member detail.
  2. Observe the tab bar.
- **Expected Result:**
  1. Vacation tab is disabled for Alex on Jane's profile.
- **Selectors:** `member-detail-tab-vacation`.

### TC-07-E2E-04: Financial settings validation errors in modal

- **Level:** E2E
- **Preconditions:** logged in as admin; member with no financials.
- **Steps:**
  1. Open Vacation tab → click "Set up financials".
  2. Leave all fields empty and click "Save changes".
  3. Verify inline errors appear for salary, rate, currency.
  4. Enter salary "0", rate "-1". Verify specific error messages.
  5. Enter valid values. Verify errors clear and save succeeds.
- **Selectors:** `vacation-financials-modal`, `vacation-salary-input`, `vacation-rate-input`, `vacation-currency-select`, `vacation-financials-save-btn`, `field-error-monthlySalary`, `field-error-clientHourlyRate`, `field-error-currency`, `toast-financials-saved`.
