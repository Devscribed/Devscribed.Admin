# User Management Specifications

Functional specifications for the user-management surface of Devscribed.Admin. Each spec is self-contained with requirements, UI, API contracts, and test cases. Specs use YAML frontmatter (`tags`, `routes`, `api`, `entities`) for discoverability — grep frontmatter to find relevant specs.

## Spec Index

| # | Spec | Design | Tags |
|---|------|--------|------|
| 00 | — (no business rules of its own) | [design](00-app-shell.design.md) | app-shell, sidebar, topbar, page-header, navigation, logout |
| 01 | [Organization Creation](01-organization-creation.md) | [design](01-organization-creation.design.md) · [mockup](01-organization-creation.mock.html) | signup, registration, org-creation, admin-role, password-policy |
| 02 | [Authentication & Login](02-authentication-login.md) | [design](02-authentication-login.design.md) · [mockup](02-authentication-login.mock.html) | login, session, forgot-password, reset-password, SecurityStamp |
| 03 | [User Invitation](03-user-invitation.md) | — | invite, token, accept-invite, role-picker, onboarding, supersede |
| 04 | [Member List & Management](04-member-list-management.md) | — | member-list, search, soft-delete, restore, last-admin-guard |
| 05 | [Member Detail: About](05-member-detail-about.md) | — | member-detail, role-picker, job-title, zero-admin-guard, avatar |
| 06 | [Account Settings](06-account-settings.md) | — | account-settings, change-email, change-password, profile, timezone |
| 07 | [Member Financial Settings](07-vacation-accrual-management.md) | — | salary, hourly-rate, billing, reserve, auto-calculate, snapshot |
| 08 | [Vacation Reserve & Auto-Accrual](08-vacation-reserve-auto-accrual.md) | — | vacation-reserve, auto-accrual, ledger, monthly-credit, year-end-expiry |
| 09 | [Vacation Requests](09-vacation-requests.md) | — | vacation-request, submit, approve, reject, cancel, debit, refund |
| 10 | [Organization Requests Page](10-organization-requests-page.md) | — | requests-page, sidebar, badge, status-filter, organization-wide |

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
| Submit CTA is never disabled for validation; clicking an invalid form shows every error and focuses the first invalid field | 01 | 02 (applied), 03 (not yet applied) |
| Signed-out shell: one `AuthLayout`, one 480px card, cross-account link outside the card in the footer | 02 | 01, 03 |

## Design Layer

Business specs own behaviour, API contracts, and validation messages. Visual and interaction detail lives in a paired `NN-name.design.md`, with a static `NN-name.mock.html` next to it as the visual acceptance target. Design specs reference the Teammerly Original DS in [`1_DS for dev/`](../../1_DS%20for%20dev/README.md) by component and token — they never restate a hex value or a pixel size. The design system is being reskinned off the earlier Meridian prototype; [`specs/design-system/README.md`](../design-system/README.md) is the decision record, and each design spec's own header says whether it has been reconciled yet.

Rules that hold across every design spec:

- **Light theme only.** Not a scoping decision any more — the design system has no dark palette, because the product it was measured from ships none. There is no theme toggle and no `[data-theme]` to honour.
- **Copy ownership** — validation messages belong to the business spec; headings, subtitles, placeholders, hints, and micro-labels belong to the design spec. Neither restates the other.
- **DS gaps** — anything missing from the design system is added to the design system, not improvised per screen, and recorded in that design spec's "DS gaps" table. A gap that is missing because the design system measured a product that never needed it is still a gap: it gets filled, numbered in the [divergence ledger](../design-system/ledger.md), and pushed back upstream.
- **The signed-in shell** — every route under `/org/{orgId}/` renders inside one app shell (sidebar, top bar, page header), defined in [00-app-shell.design.md](00-app-shell.design.md). Screens own their content and their page-header copy; they never draw their own chrome, and they never restate a navigation rule.
- **The signed-out set** — `/signup`, `/login`, `/forgot-password`, and `/reset-password` are one visual family. Same shell, same card chrome, same spacing tokens; the cross-account link always sits in `AuthLayout`'s footer, outside the card. Spec 02's design file defines the family; spec 01 conforms.

Spec 03 still gates its submit buttons on validation and needs the shared CTA rule applied when it is next touched. Its "I understand" checkbox gate stays disabled-until-checked — that is a deliberate confirmation, not a validation. Its accept-invite screen also belongs to the signed-out set and should adopt the shell rules above.

`InfoBanner` is one of the six components the reskin opens and remaps rather than replaces, and `Toast` folds into it — so the banner carries more of the product's messaging than it did. Spec 02 uses all four tones. Whether its tones resolve to tokens is settled when that remap lands, and recorded in the ledger; spec 03 should not add more banners before then.

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
