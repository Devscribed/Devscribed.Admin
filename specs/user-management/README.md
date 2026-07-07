# User Management Specifications

Functional specifications for the user-management surface of Devscribed.Admin. These are implementation-agnostic (no framework or test-runner is assumed) and are the source of truth for behavior, acceptance criteria, and test cases.

## Reading / implementation order

The files are numbered in the order they should be built — each depends on the ones before it:

| # | Spec | Depends on |
|---|------|-----------|
| 01 | [Organization Creation](01-organization-creation.md) | — |
| 02 | [Authentication & Login](02-authentication-login.md) | 01 |
| 03 | [Roles & Permissions](03-roles-and-permissions.md) | 01 |
| 04 | [User Invitation](04-user-invitation.md) | 01, 02, 03 |
| 05 | [Member List & Management](05-member-list-management.md) | 03, 04 |
| 06 | [Member Detail: About](06-member-detail-about.md) | 03, 04 |
| 07 | [Account Settings](07-account-settings.md) | 02 |

## Key model decisions (shared across specs)

- **Single organization per account.** An account belongs to exactly one organization at a time. Accepting an invitation to a different organization moves the membership (see 04).
- **Self-serve org creation.** Signup creates the account, the organization, and the creator's `admin` membership together (01).
- **Four roles:** `admin`, `manager`, `user`, `viewer`, governed by the permission matrix in 03. Only `admin` assigns roles; `manager` can manage members but not roles; `user`/`viewer` are read-only on this surface.
- **Two member states:** `active` and `removed`. Delete is a soft-delete → `removed` (blocks login); Restore returns → `active` without a new invite (05). There is no separate "disabled" state.
- **Zero-admin guard:** no operation may leave an organization with zero active admins (03, 05).

## Spec structure

Each spec follows the same template: Summary · Actors & Preconditions · Functional Requirements (numbered, testable) · UI Notes (including required `data-testid` selectors) · Out of Scope · Test Cases · Open Questions / Assumptions.

## Test cases

Every spec's Test Cases section contains fully-written cases at three levels — **Unit** (pure logic/validation), **Integration** (API/service + persistence), **E2E** (full UI flow). Each case lists explicit numbered steps and expected results; E2E cases name the stable `data-testid` selectors they target so automation (and browser-driven agents) can locate every element deterministically. Test-case IDs follow `TC-<spec#>-<level>-<n>` (e.g. `TC-05-E2E-03`).
