# User Management Specifications

Functional specifications for the user-management surface of Devscribed.Admin. Each spec is self-contained with requirements, UI, API contracts, and test cases. Specs use YAML frontmatter (`tags`, `routes`, `api`, `entities`) for discoverability — grep frontmatter to find relevant specs.

## Spec Index

| # | Spec | Design | Tags |
|---|------|--------|------|
| 00 | — (no business rules of its own) | [design](00-app-shell.design.md) | app-shell, sidebar, topbar, page-header, navigation, logout |
| 01 | [Organization Creation](01-organization-creation.md) | [design](01-organization-creation.design.md) · [mockup](01-organization-creation.mock.html) | signup, registration, org-creation, admin-role, password-policy |
| 02 | [Authentication & Login](02-authentication-login.md) | [design](02-authentication-login.design.md) · [mockup](02-authentication-login.mock.html) | login, session, forgot-password, reset-password, SecurityStamp |
| 03 | [User Invitation](03-user-invitation.md) | [design](03-user-invitation.design.md) | invite, token, accept-invite, role-picker, onboarding, supersede |
| 04 | [Member List & Management](04-member-list-management.md) | [design](04-member-list-management.design.md) | member-list, search, soft-delete, restore, last-admin-guard |
| 05 | [Member Detail: About](05-member-detail-about.md) | [design](05-member-detail-about.design.md) | member-detail, role-picker, job-title, zero-admin-guard, avatar |
| 06 | [Account Settings](06-account-settings.md) | [design](06-account-settings.design.md) | account-settings, change-email, change-password, profile, timezone |
| 07 | [Member Financial Settings](07-vacation-accrual-management.md) | [design](07-vacation-accrual-management.design.md) | salary, hourly-rate, billing, reserve, auto-calculate, snapshot |
| 08 | [Vacation Reserve & Auto-Accrual](08-vacation-reserve-auto-accrual.md) | — | vacation-reserve, auto-accrual, ledger, monthly-credit, year-end-expiry |
| 09 | [Vacation Requests](09-vacation-requests.md) | — | vacation-request, submit, approve, reject, cancel, debit, refund |
| 10 | [Organization Requests Page](10-organization-requests-page.md) | — | requests-page, sidebar, badge, status-filter, organization-wide |
| 11 | [Projects](11-projects.md) | [mockup](11-projects.mock.html) | project, project-member, assignment, archive, restore, sidebar, projects-page |
| 12 | [Time Tracking](12-time-tracking.md) | [mockup](12-time-tracking.mock.html) | time-tracking, timer, time-entry, running-timer, daily-view, weekly-view, monthly-view, calendar, topbar-indicator |

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
| Member status enum: active, removed | 04 | 05, 07-12 |
| Submit CTA is never disabled for validation; clicking an invalid form shows every error and focuses the first invalid field | 01 | 02 (applied), 03 (not yet applied) |
| Signed-out shell: one `AuthLayout`, one 480px card, cross-account link outside the card in the footer | 02 | 01, 03 |

## Design Layer

Business specs own behaviour, API contracts, and validation messages. Visual and interaction detail lives in a paired `NN-name.design.md`, with a static `NN-name.mock.html` next to it as the visual acceptance target. Design specs reference the Teammerly Meridian design system in [`1_DS for dev/`](../../1_DS%20for%20dev/README.md) by component and token — they never restate a hex value or a pixel size.

Rules that hold across every design spec:

- **Light theme only** this release. Dark mode exists in the design system but is out of scope; no theme toggle ships yet.
- **Copy ownership** — validation messages belong to the business spec; headings, subtitles, placeholders, hints, and micro-labels belong to the design spec. Neither restates the other.
- **DS gaps** — anything missing from the design system is added to the design system, not improvised per screen, and recorded in that design spec's "DS gaps" table.
- **The signed-in shell** — every route under `/org/{orgId}/` renders inside one app shell (sidebar, top bar, page header), defined in [00-app-shell.design.md](00-app-shell.design.md). Screens own their content and their page-header copy; they never draw their own chrome, and they never restate a navigation rule.
- **The signed-out set** — `/signup`, `/login`, `/forgot-password`, and `/reset-password` are one visual family. Same shell, same card chrome, same spacing tokens; the cross-account link always sits in `AuthLayout`'s footer, outside the card. Spec 02's design file defines the family; spec 01 conforms.

Spec 03 still gates its submit buttons on validation and needs the shared CTA rule applied when it is next touched. Its "I understand" checkbox gate stays disabled-until-checked — that is a deliberate confirmation, not a validation. Its accept-invite screen also belongs to the signed-out set and should adopt the shell rules above.

`InfoBanner` hardcodes its four tone triplets as literal `oklch(...)` values rather than tokens. Spec 02 uses all four; promoting them to tokens is the outstanding design-system chore before spec 03 adds more banners.

Two DS-level items surfaced while building spec 07's currency picker (details in [07's DS gaps](07-vacation-accrual-management.design.md)):

- **`Select` dropdown scroll — fixed.** The `Select` popover had no `max-height` and `overflow: hidden`, so a long option list (the 42-item ISO 4217 currency picker) was clipped inside a `Modal` and its lower options — including `USD` — were unreachable by mouse. `1_DS for dev/components/forms/Select.jsx` now caps the dropdown at `max-height: 280px` with `overflow-y: auto` (keeping `overflow-x: hidden` for rounded corners). Strictly-improving for every `Select` instance (role picker, timezone, country, currency, first-day); short lists are unaffected.
- **`Modal` full-screen drawer < 480px — open.** Spec 07 asks for the edit modal to become a full-screen drawer on narrow viewports, but the DS `Modal` has a fixed `width` prop and no breakpoint variant. Not addressed yet — the modal uses the standard `width={480}` shell; a responsive `Modal` variant is the outstanding chore.

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
| Project archived | 11 | Existing time entries preserved; project hidden from selectors | 12 |
| Member removed | 04 | Project assignments cascade-deleted | 11 |
| Member removed | 04 | Running timer cascade-deleted (no entry created) | 12 |
| Timer stopped | 12 | TimeEntry created from RunningTimer | 12 |
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
│
11 Projects
└─► 12 Time Tracking
```
