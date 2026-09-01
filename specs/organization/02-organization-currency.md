---
id: "02"
title: Organization Currency
routes: ["/org/{orgId}/settings/general"]
api:
  - "GET    /api/organizations/{orgId}/settings"
  - "PATCH  /api/organizations/{orgId}/settings"
entities: [Organization, MemberFinancials]
tags: [organization, currency, iso-4217, settings, member-financials, format-currency]
depends-on: ["04", "07"]
---

# 02 — Organization Currency

## Summary

Every organization has a single **ISO 4217 currency code** that finance-facing rollups — reports (`specs/reports/`), invoices, exports — render in. Before this spec, currency lived only on `MemberFinancials.currency` per member. This spec promotes it to `Organization.currencyCode` and defines the precedence rule: **the organization currency is the source of truth for reports; the per-member `MemberFinancials.currency` is kept as a legacy display override for the member's own Vacation panel**. A new admin-only Settings › General screen exposes the picker, and a shared `formatCurrency` helper in `packages/validation` replaces two local duplicates. Vacation math (specs 07/08/09) never reads currency and is unaffected.

## Actors & Preconditions

- **Actors:** `admin` changes the org currency. `manager`, `user`, and `viewer` may see the value in the Settings screen (read-only). Every member sees the currency indirectly wherever an amount is formatted.
- **Preconditions:** the caller is an `active` member of the organization; the current settings screen shell is either being introduced here or already exists.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View Settings › General page | ✅ | ✅ | ❌ | ❌ |
| Read `Organization.currencyCode` via API | ✅ | ✅ | ✅ | ✅ |
| Change `Organization.currencyCode` | ✅ | ❌ | ❌ | ❌ |
| Reset a member's per-member currency to the org default | ✅ | ✅ | ❌ | ❌ |

## Functional Requirements

### Currency field

1. `Organization.currencyCode` is a non-null `VarChar(3)` ISO 4217 code. New organizations are created with `"USD"`.
2. Only the allowed set of ISO 4217 codes is accepted. The initial allowed set is: `USD`, `EUR`, `GBP`, `BYN`, `RUB`, `UAH`, `PLN`, `DE` (EUR again — no, wrong; drop), `CAD`, `AUD`, `CHF`, `JPY`, `CNY`, `KZT`, `GEL`. Additions require a code change; the spec does not surface a "custom currency" field.
3. Writing any other code returns `422 Unprocessable Entity` with `{ error: "currency_not_supported", message: "This currency is not supported. Contact support if you need it added." }`.

### Precedence for member-facing displays

4. **Report currency is always `Organization.currencyCode`.** Every amount in every report (`specs/reports/`) — Amounts Owed, Time & Activity, Time Off — is formatted using the org currency, regardless of individual members' `MemberFinancials.currency`.
5. **Per-member currency is a legacy display override for the member's own Vacation panel only.** `MemberFinancials.currency`, when present, formats the member's vacation-reserve totals on their own profile page. Elsewhere it is ignored.
6. When `MemberFinancials.currency` equals `Organization.currencyCode`, the Vacation panel shows an "inherited" chip and no override banner. When it differs, the panel shows an "override" chip and an inline banner explaining that reports use `{Organization.currencyCode}` while the panel shows `{MemberFinancials.currency}`, with a "Reset to org default" action for `admin`/`manager`.
7. New members created after this spec ships inherit `Organization.currencyCode` into `MemberFinancials.currency` at creation. The spec's data migration does **not** rewrite existing rows (see §Migration).

### Changing the org currency

8. Changing `Organization.currencyCode` takes effect immediately for reports run after the change.
9. PDFs already generated retain the currency they were rendered in — the response file is not retroactively edited.
10. Existing `MemberFinancials.currency` values are **not** rewritten by a currency change; the precedence rule (§4–5) governs the display.
11. The change is written in one transaction with an audit row (`OrganizationSettingsAudit`) that captures `{ organizationId, actorAccountId, field: "currencyCode", oldValue, newValue, changedAt }`. The audit table is append-only.
12. A change is confirmed by the UI showing a non-blocking banner: **"Currency change confirmed. Reports run from now on will use {newCode}. {n} member(s) have a custom currency ({list}) and will keep it on their vacation panels — see the Members tab to align them if desired."** The `{n}` and `{list}` are derived from the current `MemberFinancials.currency` rows.

### Vacation math

13. Vacation accrual (spec 08) and vacation-request approval (spec 09) do **not** read `Organization.currencyCode` or `MemberFinancials.currency` in any arithmetic. Both operate on plain `Decimal` values; currency is a display concern.
14. This spec does **not** change vacation math. Adding the column and its migration is verified (in spec `organization/README.md`) not to alter any input to `AccrualService`, `VacationService`, or `VacationRequestsService`.

## Data Model

### Organization (extension)

| Field | Type | Description |
|---|---|---|
| `currencyCode` | `String @db.VarChar(3)` | ISO 4217. `@default("USD")`. Non-null. |

### OrganizationSettingsAudit (new)

| Field | Type | Description |
|---|---|---|
| `id` | String (cuid) | Primary key |
| `organizationId` | String (FK) | References `Organization.id`. Cascade delete. |
| `actorAccountId` | String (FK) | Account that made the change. |
| `field` | String | Setting name (`"currencyCode"` for this spec). |
| `oldValue` | String? | Previous value (nullable for insert). |
| `newValue` | String | New value. |
| `changedAt` | DateTime | UTC timestamp. |

**Indexes:** `(organizationId, changedAt DESC)`.

### New Capabilities

- `ManageOrganizationSettings` / `manage-organization-settings` — edit `Organization.currencyCode` and any future org-level setting (admin).
- `ViewOrganizationSettings` / `view-organization-settings` — view the Settings page (admin, manager).

## Migration

- Add `currencyCode` to `Organization` with `@default("USD")` — Postgres backfills existing rows to `"USD"`.
- Run a **data migration** immediately after that fills `Organization.currencyCode` with the majority `MemberFinancials.currency` for orgs where at least 50% of members' financials use the same non-`USD` code. Formal rule: `UPDATE "Organization" SET "currencyCode" = m.majority FROM (subquery selecting each org's mode-of-currency and its share) WHERE m.share >= 0.5 AND m.majority IS NOT NULL AND m.majority != 'USD'`. Orgs with fewer than 2 members with financials, or a tie, stay `"USD"`.
- Create the `OrganizationSettingsAudit` table (empty).
- The migration is idempotent — re-running is a no-op because the update key includes only orgs whose current `currencyCode = "USD"`. Rerun-safety documented in the migration file.
- Log the migration outcome per-org (`orgId`, `chosen`, `share`) at info level so a rollback can inspect the decisions.

## API Contracts

### `GET /api/organizations/{orgId}/settings`

**200 Response:**
```json
{
  "organization": {
    "id": "clw…",
    "name": "Devscribed",
    "currencyCode": "EUR"
  },
  "counters": {
    "membersWithCustomCurrency": 3,
    "customCurrencies": ["USD", "BYN"]
  }
}
```

Available to `admin` and `manager` (`view-organization-settings`). Non-privileged roles that need only the currency code can read a small subset via `GET /api/organizations/{orgId}` (existing endpoint from spec `user-management/04`) — that endpoint gains `currencyCode` to its response.

### `PATCH /api/organizations/{orgId}/settings`

**Body:**
```json
{ "currencyCode": "EUR" }
```

**200 Response:** the updated organization plus fresh counters.
**403 Response:** returned when the caller has only `view-organization-settings` (not manage). Standard capability guard.
**422 Response:** `{ "error": "currency_not_supported", "message": "…" }`.

### Extension to `POST /api/organizations` (signup)

Signup (spec 01 in user-management) does not accept a currency on create; the new org is stamped `"USD"` and an admin can change it afterwards. Rationale: the signup form is already busy, and changing currency later is one click.

### Extension to member creation (invitations, spec 03 in user-management)

When a new `Membership` is created, if a `MemberFinancials` row is created alongside it (spec 07 rule), the row's `currency` is initialized to `Organization.currencyCode`. Existing invitations already-in-flight are unaffected.

## Validation Rules

1. `currencyCode` required — "Currency is required." (empty).
2. `currencyCode` must be 3 uppercase letters — "Currency code must be 3 uppercase letters (ISO 4217)."
3. `currencyCode` must be in the allowed set — "This currency is not supported. Contact support if you need it added."

All rules run **server-side** on every request.

## Error Messages

| Context | Message |
|---|---|
| Toast — currency saved | "Currency updated to {code}." |
| Toast — reset member currency | "Member currency reset to organization default." |
| Banner — after change (n=0) | "Currency updated. Reports will now use **{newCode}**." |
| Banner — after change (n>0) | "Currency updated. Reports will now use **{newCode}**. {n} member(s) still have a custom currency ({list}) — see the Members tab to align them if desired." |
| Inline — per-member override | "This member's currency was set before the organization currency was introduced. Reports use **{orgCode}** (the org currency); this panel and the member's own invoices show **{memberCode}**." |
| Confirm — reset member currency | "Reset **{memberName}**'s currency to the organization default (**{orgCode}**)? Their historical vacation deductions and reserve ledger stay in {memberCode}." |
| Empty state — no supported currencies loaded | "No supported currencies. Check the deployment." (server-side sanity error, should never appear in prod) |

## Screens

### Settings › General — currency card

```
┌────────── Settings ────────────────────────────────────┐
│  General                                                │
│  ──────────────────────────────────────────────────    │
│                                                         │
│  ┌─ Currency ────────────────────────────────────────┐ │
│  │  The currency all financial totals — reports,     │ │
│  │  invoices, exports — are shown in. Existing       │ │
│  │  members with a custom currency keep it as a      │ │
│  │  per-profile override; new members inherit the    │ │
│  │  default.                                          │ │
│  │                                                    │ │
│  │  ORGANIZATION CURRENCY                            │ │
│  │  [ EUR — Euro (€)                             ▾ ] │ │
│  │  ISO 4217 code. Changing this affects new         │ │
│  │  reports only; PDFs generated before the change   │ │
│  │  stay in the currency they were rendered in.      │ │
│  │                                                    │ │
│  │                 [ Cancel ]  [ Save changes ]      │ │
│  └───────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### Member vacation panel — inherited

```
┌────── Vacation reserve · Alex Kaminski ──────────────┐
│  Currency: EUR (€)   [inherited from organization]    │
│  ────────────────────────────────────────────────    │
│  Monthly salary               €3,000.00 EUR           │
│  Client hourly rate           €45.00 EUR              │
│  Vacation reserve %           10%                     │
│  Available balance            €1,240.00 EUR           │
│                                        [ Edit ]      │
└───────────────────────────────────────────────────────┘
```

### Member vacation panel — override

```
┌────── Vacation reserve · Yulia Nowak ────────────────┐
│  Currency: PLN (zł) [member override · org is EUR]    │
│  ⓘ Reports use EUR; this panel and the member's       │
│    own invoices show PLN. [ Reset to org default ]    │
│  ────────────────────────────────────────────────    │
│  Monthly salary               zł12,500.00 PLN         │
│  Client hourly rate           zł180.00 PLN            │
│  Vacation reserve %           8%                      │
│  Available balance            zł4,200.00 PLN          │
│                                        [ Edit ]      │
└───────────────────────────────────────────────────────┘
```

### Post-change banner

```
┌────────────────────────────────────────────────────────┐
│ ⚠ Currency change confirmed. Reports run from now on   │
│   will use EUR. 3 members have a custom currency       │
│   (USD, BYN) and will keep it on their vacation        │
│   panels — see the Members tab to align them if wanted.│
└────────────────────────────────────────────────────────┘
```

## Flows

### Main Flow: Admin changes the org currency

1. Admin opens **Settings** in the sidebar (or navigates to `/org/{orgId}/settings/general`).
2. System shows the General tab with the currency card. Current value pre-selected.
3. Admin picks a new value from the dropdown.
4. Admin clicks **Save changes**.
5. System sends `PATCH /api/organizations/{orgId}/settings` with the new code.
6. On success: toast **"Currency updated to {code}."**, non-blocking banner appears at the top of the card with the per-member counters (see §Error Messages, "Banner — after change"), audit row is written.

### Alt Flow A: Manager opens the page (branches from step 1)

1a. Manager sees the Currency card with the dropdown **disabled** and a caption **"Only admins can change the organization currency."** The Save button is hidden.

### Alt Flow B: Reset a member's per-member currency (branches from Vacation panel)

1. `admin` / `manager` opens a member with an override.
2. System shows the override banner with **Reset to org default** action.
3. Actor clicks the action. System shows the confirmation dialog (see §Error Messages, "Confirm — reset").
4. Actor confirms. System sends `PATCH /api/organizations/{orgId}/members/{membershipId}/financials` with `{ currency: null }`.
5. Server sets `MemberFinancials.currency` to `null` (or to `Organization.currencyCode` — implementer's choice; both produce the same downstream behavior per precedence rules).
6. Toast **"Member currency reset to organization default."**, panel refreshes with the inherited chip.

### Alt Flow C: Unsupported currency (branches from step 5 of Main Flow)

- Server returns 422 `currency_not_supported`. Save button re-enables, inline error appears below the dropdown. UI does not disable the dropdown for validation — the user can pick again immediately.

## UI Description

### Route

`/org/{orgId}/settings/general` — the currency card lives here, alongside the (existing or future) Organization name card and Danger Zone. The Settings shell hosts sub-nav tabs: General · Members · Holidays · Billing · Danger zone. Only `General` and `Holidays` (spec 03) are introduced by this area; the others may exist already or be TBD.

### Sidebar integration

A new **Organization** section at the bottom of the sidebar with one row: **Settings**. Icon: gear. Role-gated: hidden for `user` and `viewer`. Active on any `/org/{orgId}/settings/*` route.

### Layout

The Currency card uses a DS `Card` wrapper, with the DS `Select` for the picker. Native `<select>` semantics are preferred (accessible-by-default). The dropdown lists options as `{CODE} — {Name} ({symbol})` for clarity: `USD — US Dollar ($)`.

The banner is a DS `InfoBanner` with warning tone, dismissible.

### States

| State | Trigger | Rendered |
|---|---|---|
| Idle | Page loads | Currency card with current value; Save button disabled until the user changes the value |
| Dirty | User changes the dropdown | Save button becomes enabled; Cancel button becomes visible |
| Saving | User clicks Save | Save button shows a spinner and label **"Saving…"**; dropdown remains editable but future clicks queue behind the in-flight request |
| Success | 200 response | Toast, banner (§Error Messages), Save button reverts and disables |
| Error — unsupported | 422 response | Inline error below the dropdown, Save button re-enables; the value in the dropdown is **not** reverted |
| Error — network | 5xx / network | Inline error **"Couldn't save. Retry?"** with Retry button that re-runs the last PATCH |

### Accessibility

- Every field carries a label.
- The Save button, when disabled for idle, uses `aria-disabled="true"` and a title **"No changes to save"**; keyboard focus still lands on it.
- The override banner is announced to a `role="status"` live region on load.

## Required `data-testid` Attributes

### Sidebar & shell

- `nav-settings`
- `settings-tab-general`, `settings-tab-holidays`, `settings-tab-members`, `settings-tab-billing`, `settings-tab-danger`

### Currency card

- `settings-currency-card`, `settings-currency-title`
- `settings-currency-select`
- `settings-currency-save-btn`, `settings-currency-cancel-btn`
- `settings-currency-banner` (post-save)
- `field-error-currencyCode`

### Vacation panel (extension of spec 07)

- `vacation-currency-chip` (values: `inherited` | `override`)
- `vacation-override-banner`
- `vacation-reset-currency-btn`
- `vacation-reset-currency-confirm`, `vacation-reset-currency-confirm-btn`, `vacation-reset-currency-cancel-btn`

### Toasts

- `toast-currency-updated`
- `toast-member-currency-reset`
- `toast-server-error`

## Security

### Authentication & Authorization

- Both endpoints require an authenticated session (`SessionGuard`) and pass through `OrgScopeGuard` — cross-org access returns 404.
- `GET /settings` requires `view-organization-settings`.
- `PATCH /settings` requires `manage-organization-settings` — `manager` receives 403 on this endpoint (not 404, because the resource is visible to them via GET).

### Cross-organization protection (IDOR)

- Every query filters by `session.organizationId`. Path `orgId` is used only to match the session.
- `PATCH /settings` never accepts an `id` field.

### Input handling

- `currencyCode` is validated by the shared rules table on the server; the allowed set is a constant.
- No user-supplied HTML or arbitrary text is stored — a fixed enum-like list.

### CSRF & session

- Same-origin fetch with `credentials: 'same-origin'`; no CSRF token needed (app-wide default).
- `Account.securityStamp` revocation enforced by `SessionGuard`.

### Concurrency & audit

- Concurrent writes to `Organization.currencyCode` are serialized by the row-level lock Postgres takes on `UPDATE`. Each successful write writes an `OrganizationSettingsAudit` row in the same transaction.
- The audit table is append-only; there is no delete or update path exposed.

### Rate limiting

- App-wide default; no per-endpoint override.

### Logging

- Every currency change logs `{ event: "org_currency_changed", actorAccountId, organizationId, oldValue, newValue }` at info.
- Member-currency reset logs `{ event: "member_currency_reset", actorAccountId, organizationId, membershipId, oldValue }` at info.

## Out of Scope

- Multi-currency reports and FX conversion — see `organization/05-fx-rates.md` (future).
- Per-user display currency preferences (viewer-preferred currency).
- A "custom currency" field or arbitrary currency codes.
- Auto-detecting the org currency from the signup country.
- Backfilling `MemberFinancials.currency` to the new org currency retroactively.
- Currency symbol placement conventions (before vs after the number) — `Intl.NumberFormat` decides.

## Test Cases

### Unit

- **TC-02-UNIT-01: `formatCurrency` — USD.** `formatCurrency(1234.56, 'USD')` returns `"$1,234.56 USD"`.
- **TC-02-UNIT-02: `formatCurrency` — EUR.** Returns `"€1,234.56 EUR"`.
- **TC-02-UNIT-03: `formatCurrency` — zero.** `formatCurrency(0, 'USD')` returns `"$0.00 USD"`.
- **TC-02-UNIT-04: `formatCurrency` — negative.** `formatCurrency(-100, 'EUR')` returns `"-€100.00 EUR"`.
- **TC-02-UNIT-05: `formatCurrency` — rounding.** `formatCurrency(1.005, 'USD')` returns `"$1.01 USD"` (banker's rounding via `Intl.NumberFormat`).
- **TC-02-UNIT-06: `resolveDisplayCurrency` — inherited.** Given `{ orgCurrency: 'EUR', memberCurrency: null }`, returns `{ code: 'EUR', origin: 'inherited' }`.
- **TC-02-UNIT-07: `resolveDisplayCurrency` — matching override.** Given `{ orgCurrency: 'EUR', memberCurrency: 'EUR' }`, returns `{ code: 'EUR', origin: 'inherited' }` (member value equals org, no override chip).
- **TC-02-UNIT-08: `resolveDisplayCurrency` — differing override.** Given `{ orgCurrency: 'EUR', memberCurrency: 'PLN' }`, returns `{ code: 'PLN', origin: 'override' }`.
- **TC-02-UNIT-09: `resolveReportCurrency` always returns org.** Given `{ orgCurrency: 'EUR', memberCurrency: 'PLN' }`, returns `'EUR'`.
- **TC-02-UNIT-10: `validateCurrencyCode` — happy.** `validateCurrencyCode('EUR')` returns `{ valid: true }`.
- **TC-02-UNIT-11: `validateCurrencyCode` — lowercase.** `validateCurrencyCode('eur')` returns `{ valid: false, error: 'Currency code must be 3 uppercase letters (ISO 4217).' }`.
- **TC-02-UNIT-12: `validateCurrencyCode` — length.** `validateCurrencyCode('USDD')` returns the length error.
- **TC-02-UNIT-13: `validateCurrencyCode` — unsupported.** `validateCurrencyCode('XYZ')` returns `{ valid: false, error: 'This currency is not supported.' }`.

### Integration

- **TC-02-INT-01: GET settings as admin.** Returns 200 with `organization.currencyCode` and counter fields.
- **TC-02-INT-02: GET settings as manager.** Returns 200.
- **TC-02-INT-03: GET settings as user.** Returns 404 (org-scope-style hiding).
- **TC-02-INT-04: PATCH as admin — happy path.** PATCH `{ currencyCode: 'EUR' }` returns 200; a subsequent GET reflects the change; an `OrganizationSettingsAudit` row is written.
- **TC-02-INT-05: PATCH as manager — forbidden.** Returns 403.
- **TC-02-INT-06: PATCH as user — hidden.** Returns 404.
- **TC-02-INT-07: PATCH — unsupported currency.** PATCH `{ currencyCode: 'XYZ' }` returns 422 `currency_not_supported`; audit row is **not** written.
- **TC-02-INT-08: PATCH — lowercase.** PATCH `{ currencyCode: 'eur' }` returns 422 with the case rule; audit row is **not** written.
- **TC-02-INT-09: New member inherits org currency.** Admin invites a member; on acceptance a `MemberFinancials` row is created with `currency = Organization.currencyCode` at that moment.
- **TC-02-INT-10: Existing MemberFinancials not rewritten.** Seed org `"USD"` + a member `MemberFinancials.currency = 'PLN'`. PATCH org to `"EUR"`. Member row still reads `'PLN'`.
- **TC-02-INT-11: Migration — majority rule.** Seed an org with 4 members, 3 in `EUR` financials, 1 in `USD`. Run the data migration. `Organization.currencyCode` becomes `EUR`. Rerun the migration — no change.
- **TC-02-INT-12: Migration — tie stays USD.** Seed 2/2. Migration leaves the org at `USD`.
- **TC-02-INT-13: Migration — no members with financials.** Org with 3 members and zero `MemberFinancials` rows stays at `USD`.
- **TC-02-INT-14: Reset member currency — admin.** PATCH `/members/{id}/financials` with `{ currency: null }` returns 200; the member's `MemberFinancials.currency` reads `null` after; the vacation-panel chip becomes `inherited`.
- **TC-02-INT-15: Reset member currency — manager.** Same as INT-14 but caller is manager. Returns 200.
- **TC-02-INT-16: Reset member currency — user.** Returns 403.
- **TC-02-INT-17: Vacation math unaffected — accrual.** Run `AccrualService.runAccrual` for an org whose currency was just changed from `USD` to `EUR`. The written `VacationReserveTransaction.amount` is identical to the value produced by the same seed on the pre-change org (currency is not an input to the math).
- **TC-02-INT-18: Vacation math unaffected — approval.** Approve a vacation request for a member with `MemberFinancials.currency = 'PLN'` under an org whose currency is `EUR`. `VacationRequest.deductionAmount` is exactly `calculateDeductionAmount(workingDays, monthlySalary)`; the debit written to the ledger equals the frozen amount.
- **TC-02-INT-19: Session revocation.** Rotate `Account.securityStamp` mid-request cycle — the next PATCH returns 401.
- **TC-02-INT-20: Cross-org IDOR blocked.** Admin in org A calls `PATCH /api/organizations/{orgB}/settings` — 404, no audit row written.

### E2E

- **TC-02-E2E-01: Admin changes the org currency — happy path.** From Settings › General, admin picks `EUR`, saves, sees the toast and the post-save banner listing member overrides. Reloading the page keeps the value.
  - **Selectors:** `nav-settings`, `settings-tab-general`, `settings-currency-select`, `settings-currency-save-btn`, `toast-currency-updated`, `settings-currency-banner`.
- **TC-02-E2E-02: Manager sees the card but cannot save — unsuccessful flow.** Manager opens the page; the dropdown is disabled, Save button is absent, a caption explains admin-only.
  - **Selectors:** `settings-currency-select` (asserted disabled), `settings-currency-save-btn` (asserted absent).
- **TC-02-E2E-03: Admin resets a member's per-member currency — confirmation flow.** Admin opens a member with an override, clicks Reset, confirms in the dialog, sees the panel chip flip from `override` to `inherited` and the values reformat with the org currency.
  - **Selectors:** `vacation-override-banner`, `vacation-reset-currency-btn`, `vacation-reset-currency-confirm`, `vacation-reset-currency-confirm-btn`, `vacation-currency-chip`.
- **TC-02-E2E-04: Member with override sees banner on their own profile — unsuccessful "why doesn't my currency match" flow.** A user whose `MemberFinancials.currency = 'PLN'` under an `EUR` org opens their own Vacation panel; sees the override banner explaining reports use EUR; the Reset action is not offered to their role.
  - **Selectors:** `vacation-override-banner`, `vacation-reset-currency-btn` (asserted absent for user role).
- **TC-02-E2E-05: User role cannot reach Settings.** Sidebar has no Settings row for `user`; navigating directly to `/org/{orgId}/settings/general` redirects to `/org/{orgId}/members`.
  - **Selectors:** `nav-settings` (asserted absent), `members-page`.
