# User Management Specifications

Functional specifications for the user-management surface of Devscribed.Admin. Each spec is self-contained with requirements, UI, API contracts, and test cases. Specs use YAML frontmatter (`tags`, `routes`, `api`, `entities`) for discoverability — grep frontmatter to find relevant specs.

## Spec Index

| # | Spec | Tags |
|---|------|------|
| 01 | [Organization Creation](01-organization-creation.md) | signup, registration, org-creation, admin-role, password-policy |
| 02 | [Authentication & Login](02-authentication-login.md) | login, session, forgot-password, reset-password, SecurityStamp |
| 03 | [User Invitation](03-user-invitation.md) | invite, token, accept-invite, role-picker, onboarding, supersede |
| 04 | [Member List & Management](04-member-list-management.md) | member-list, search, soft-delete, restore, last-admin-guard |
| 05 | [Member Detail: About](05-member-detail-about.md) | member-detail, role-picker, job-title, zero-admin-guard, avatar |
| 06 | [Account Settings](06-account-settings.md) | account-settings, change-email, change-password, profile, timezone |
| 07 | [Member Financial Settings](07-vacation-accrual-management.md) | salary, hourly-rate, billing, reserve, auto-calculate, snapshot |
| 08 | [Vacation Reserve & Auto-Accrual](08-vacation-reserve-auto-accrual.md) | vacation-reserve, auto-accrual, ledger, monthly-credit, year-end-expiry |
| 09 | [Vacation Requests](09-vacation-requests.md) | vacation-request, submit, approve, reject, cancel, debit, refund |
| 10 | [Organization Requests Page](10-organization-requests-page.md) | requests-page, sidebar, badge, status-filter, organization-wide |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Password policy (min 8, max 128, >=1 letter + digit) | 01 | 02, 03, 06 |
| Name validation (1-50 chars, letters/hyphens/apostrophes/spaces) | 01 | 03, 06 |
| Email normalization (lowercase, max 254, case-insensitive) | 01 | 02, 03, 06 |
| Token generation (32 bytes, URL-safe base64, SHA-256 stored) | 02 | 03, 06 |
| SecurityStamp session revocation | 02 | 04, 06 |
| Zero-admin guard (reject if 0 active admins remain) | 04, 05 | — |
| Role enum: admin, manager, user, viewer | 01 | all |
| Member status enum: active, removed | 04 | 05, 07-10 |

## Cross-Spec Side Effects

| Trigger | Source | Effect | Target |
|---------|--------|--------|--------|
| Member soft-deleted | 04 | Sessions revoked via SecurityStamp | 02 |
| Member soft-deleted | 04 | Pending/future vacation requests cancelled | 09 |
| Member restored | 04 | JoinedAt reset, JobTitle cleared | 05 |
| Password changed | 06 | Other sessions revoked via SecurityStamp | 02 |
| Password reset | 02 | All sessions revoked | 02 |
| Inviter removed | 04 | Pending invitations invalidated | 03 |
| Financials updated | 07 | Snapshot created (EffectiveFrom = today) | 07 |
| 1st of month (or manual trigger) | 08 | Auto-accrual credit for billing month | 08 |
| Vacation approved | 09 | Debit transaction in reserve ledger | 08 |
| Approved vacation cancelled | 09 | Compensating refund transaction | 08 |
| Year-end (Dec 31) | 08 | Expiry transaction; pending requests cancelled | 08, 09 |

## Dependency Graph

```
01 Organization Creation
├─► 02 Authentication & Login
│   ├─► 06 Account Settings
│   └─► 03 User Invitation
│        └─► 04 Member List & Management
│             ├─► 05 Member Detail: About
│             │    └─► 07 Member Financial Settings
│             │         └─► 08 Vacation Reserve & Auto-Accrual
│             │              └─► 09 Vacation Requests
│             │                   └─► 10 Organization Requests Page
│             └─► 09 (removal cascades)
```
