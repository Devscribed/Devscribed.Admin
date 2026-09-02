---
id: "02"
title: Client Participants
routes:
  - "/org/{orgId}/requests"
  - "/org/{orgId}/requests/{requestId}"
  - "/org/{orgId}/clients/{clientId}"
  - "/accept-invite"
api:
  - "GET/POST /api/organizations/{orgId}/clients/{clientId}/users"
  - "PATCH /api/organizations/{orgId}/clients/{clientId}/users/{clientMembershipId}/remove"
  - "POST /api/invitations (extended: role=client, clientId)"
  - "POST /api/login (extended: resolves a client principal)"
entities: [ClientMembership, Invitation, Request, RequestMessage, RequestEvent]
tags:
  [client, client-user, principal, invitation, capability-guard, navigation, session, request]
depends-on: ["requests/01", "organization/01", "user-management/03"]
---

# 02 — Client Participants

## Summary

A person at a client signs in to this product like anyone else: an email, a password, a
session cookie, the same login screen. What differs is what links them to the organization —
a **`ClientMembership`** bound to a `Client`, not a `Membership`. That choice is the whole
spec: `Membership` means "member of staff" at 35 query sites across 16 files, and widening it
would put a client row into vacation accrual, the members list, project assignment and time
tracking, where nothing would crash and everything would be quietly wrong.

With the principal in place, a client can be the addressee of a request from spec 01. They see
one screen — the requests addressed to them — and nothing else of the organization.

**Depends on:** spec 01 (`Request` and its lifecycle, `assigneeKind`), organization spec 01
(`Client`), user-management spec 03 (`Invitation` and its token). **Spec 01 must be merged and
running before this spec's verification route can be walked** — see
[Verification Plan](#verification-plan).

## Actors & Preconditions

| Actor | Preconditions |
|---|---|
| **Admin / manager** | Active staff member holding `manage-client-users`. Invites and removes client users. |
| **Client user** | An `Account` plus an active `ClientMembership` bound to an active `Client` of the organization. Holds a session exactly like staff; holds no `Membership`. |
| **Client** | An existing `Client` row (organization spec 01) with status `active`. |
| **Project** | A `Project` whose `clientId` is that client — required before a request can be addressed to one of its users. |

## Roles & Permission Matrix

The client is **not a fifth role.** `Membership.role` and `ROLE_CAPABILITIES` stay staff-only,
so no role-keyed lookup anywhere gains an entry that a `Membership` could accidentally carry.
Capability is resolved from the **principal kind** first (requirement 9).

| Capability | admin | manager | user | viewer | client user |
|---|---|---|---|---|---|
| `manage-client-users` — invite, list, remove | ✅ | ✅ | ❌ | ❌ | ❌ |
| `view-own-requests` (spec 01) | ✅ | ✅ | ✅ | ✅ | ✅ |
| `create-request` (spec 01) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `view-all-requests` (spec 01) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Address a request to a client user | ✅ | ✅ | ✅ | ❌ | ❌ |
| Post a message on a request I am party to | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mark `answered` / `declined` on a request addressed to me | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mark `granted` | requester or admin | requester | requester | requester | ❌ |
| Reassign, cancel, edit | per spec 01 | | | | ❌ |
| Every other surface — members, projects, time tracking, vacation, documents, clients, settings | per their role | | | | ❌ |

A client user's capability set is exactly `{ ViewOwnRequests }`. Everything else they may do is
an actor rule of spec 01 (being the addressee), not a capability.

## Functional Requirements

### The principal

1. A `ClientMembership` links one `Account` to one `Client` within one `Organization`. Its
   `status` is `active` or `removed`; removal is soft, mirroring `Membership`.
2. **An account holds either a `Membership` or a `ClientMembership`, never both.** Both tables
   carry `accountId @unique`, and the accept-invitation handler re-reads both inside its
   transaction and refuses when the other kind already exists, with 409 and
   `CLIENT_USER_MESSAGES.accountIsStaff` or `…accountIsClient`. Staff and client are different
   kinds of relationship to the organization, and an account that is both makes every
   capability question ambiguous.
3. `SessionPayload` is unchanged — `{ accountId, organizationId, securityStamp }`
   (`apps/api/src/auth/session.service.ts:7`). The principal kind is **not** in the cookie: it
   is resolved from the database on each request, for the same reason `CapabilityGuard` reads
   the role from the membership rather than the cookie — so a revocation takes effect on the
   next request rather than the next sign-in.
4. `SessionGuard` (`apps/api/src/auth/session.guard.ts`) is **unchanged**. It reads only
   `Account.securityStamp`, so it authenticates a client account already.
5. `OrgScopeGuard` is **unchanged**.

### Signing in

6. Login today refuses an account with no active `Membership`. Observed:
   `POST /api/login` → `400 {"message":"Your account has been deactivated. Contact your
   administrator."}`. Login must resolve **either** an active `Membership` **or** an active
   `ClientMembership`, and refuse only when neither exists.
7. When the account has a `ClientMembership` whose status is `removed`, or whose `Client` is
   archived **and** whose membership is `removed`, login is refused with the **existing**
   message, unchanged. A different message for this case would tell a stranger which kind of
   account an address belongs to.
8. `organizationId` in the session comes from whichever row resolved the principal. There is no
   second cookie, no second token and no second login screen.

### Capabilities and guards

9. `CapabilityGuard` (`apps/api/src/auth/capability.guard.ts`) resolves the principal before it
   decides: an active `Membership` → capability comes from `ROLE_CAPABILITIES` as today; an
   active `ClientMembership` → capability comes from a new `CLIENT_CAPABILITIES` list; neither
   → 403 with the existing fixed message. The two branches are exhaustive and the fall-through
   fails closed, exactly as the undecorated-route case does today.
10. `CLIENT_CAPABILITIES` is a flat readonly list, not a role-keyed table. There is one kind of
    client user and inventing a role dimension for a set with one member would be a table
    nobody can populate a second row of.
11. **No existing query against `Membership` changes.** A client is never a `Membership` row, so
    the 35 call sites in 16 files that read one keep their present meaning without being
    visited. This is the property the whole design exists to buy, and TC-02-INT-09 asserts it
    against the surfaces where a wrong answer would be silent.

### Navigation

12. The sidebar is composed from the principal, not only from the role. A client user sees
    exactly one row: **Requests**.
13. **`nav-members` is today added unconditionally** (`apps/web/src/layout/Sidebar.tsx:71`) — the
    Members row is drawn for every signed-in member. This spec moves it behind a staff check. It
    is a defect against the existing "a nav item the current role cannot use is not rendered"
    rule the moment a non-staff principal exists, and it is fixed here rather than carved out.
14. A client user who types the URL of any staff screen reaches no data: the API answers 403 for
    a capability-gated route and 404 for an org-scoped resource they are not party to. The
    absent nav row is a convenience; the server is the gate.

### Inviting a client user

15. Client invitations reuse `Invitation` (`apps/api/prisma/schema.prisma:102`) rather than a
    parallel table: the token, its SHA-256 storage, the seven-day expiry, the supersession rule
    and the accept screen are all built and tested in user-management spec 03.
16. `Invitation` gains one nullable column, `clientId`, and one new accepted value of `role`:
    `client`. `role = 'client'` requires `clientId`; any other role requires it to be absent.
    Both are rejected with 400 and `CLIENT_USER_MESSAGES.invitationShapeInvalid`.
17. Inviting a client user requires `manage-client-users` (admin, manager) and an **active**
    `Client`. An archived client is rejected with 400 and `CLIENT_USER_MESSAGES.clientArchived`.
18. Accepting a `role = 'client'` invitation creates the `Account` (when new) and a
    `ClientMembership`, in one transaction with the invitation's transition to `used` — the same
    transaction shape spec 03 already uses.
19. The supersession rule of spec 03 is inherited unchanged: at most one live `pending`
    invitation per (email, organization), whichever kind it is. Inviting an address that already
    has a pending staff invitation supersedes it, and the reverse also holds.
20. A `client_invitation` mail type is added. It names the organization, the client, and who
    invited, and carries the accept link. It does not name any project, any request, or any
    member's email address.

### Removing a client user

21. An admin or manager may remove a client user. The `ClientMembership` status becomes
    `removed`, and the account's `securityStamp` is rotated in the same transaction, which
    revokes every live session instantly — the mechanism user-management spec 02 already
    defines.
22. Removal is soft. The row survives so that historical requests, messages and events keep
    resolving the person's name.
23. Open requests addressed to a removed client user read `assignee.inactive: true` and are
    offered for reassignment, exactly as spec 01 requirement 36 does for staff.
24. Archiving a `Client` does **not** remove its users and does not revoke their sessions.
    Conversations already under way finish; the client is simply no longer offered for new work
    (requirement 26). Consistent with spec 01's treatment of an archived project.

### Addressing a request to a client user

25. `assigneeKind` gains the value `client`, and `Request` gains a nullable
    `assigneeClientMembershipId`. Exactly one of `assigneeMembershipId` and
    `assigneeClientMembershipId` is set, matching `assigneeKind`; any other combination is 400
    with `REQUEST_MESSAGES.assigneeInvalid` (spec 01's message, unchanged).
26. A request addressed to a client user **requires** `projectId`, and that project's `clientId`
    must equal the client user's `clientId`. A mismatch is 400 with
    `REQUEST_MESSAGES.contactProjectMismatch`; a missing project is 400 with
    `REQUEST_MESSAGES.projectRequiredForClient`. A request cannot ask one client for access on
    another client's project.
27. Only an active client user of an active client may be chosen. A removed user, or a user of
    an archived client, is 400 with `REQUEST_MESSAGES.clientUserUnavailable`.
28. `RequestMessage.authorKind` and `RequestEvent.actorKind` gain the value `client`, with
    nullable `authorClientMembershipId` and `actorClientMembershipId`. Display-name snapshots in
    `oldLabel` / `newLabel` work identically.
29. A client user may post messages, mark `answered` and `decline` on a request addressed to
    them, under spec 01's rules 23, 25 and 16–17 unchanged. They may **not** grant: only the
    requester or an admin does that (spec 01 requirement 24), and a client is never the
    requester in this spec.
30. A client user's request list is scoped to requests where they are the addressee. `scope=all`
    answers 403 with `REQUEST_MESSAGES.scopeForbidden`, as it does for a `user`.
31. The request detail rendered for a client user omits the **History** panel and every control
    they cannot use — reassign, cancel, edit, grant. The audit trail is an internal record; the
    conversation is the shared one.
32. A `request_assigned_to_client` mail is sent to the client user after the creating or
    reassigning transaction commits. It names the organization, the project, the request number
    and title, and the needed-by date when set. **It does not carry the description**, which may
    name internal systems, and it carries no member email address.
33. No outbound call runs inside a database transaction, and neither mail type is retried
    automatically. Re-inviting and reassigning are the recovery paths, and both are actions a
    person takes deliberately.

## Data Model

### ClientMembership

| Field | Type | Description |
|---|---|---|
| `id` | `String` PK, uuid | |
| `accountId` | `String` **`@unique`** FK → `Account`, **Cascade** | Mirrors `Membership.accountId @unique`. Half of the "staff or client, never both" rule (requirement 2). |
| `clientId` | `String` FK → `Client`, **Cascade** | |
| `organizationId` | `String` FK → `Organization`, **Cascade** | Denormalized from the client so every scoping query has the key without a join. |
| `status` | `String` `@default("active")` | `active` \| `removed`. |
| `invitedByMembershipId` | `String?` FK → `Membership`, **SetNull** | The staff member who invited them. |
| `joinedAt` | `DateTime` `@default(now())` | |
| `removedAt` | `DateTime?` | |
| `removedByAccountId` | `String?` FK → `Account`, **SetNull** | |

Indexes: `@@index([organizationId, status])`, `@@index([clientId, status])`.

### Invitation (existing table, one new column)

| Field | Type | Description |
|---|---|---|
| `clientId` | `String?` FK → `Client`, **Cascade** | Required when `role = 'client'`, absent otherwise (requirement 16). Nullable, so every existing row is valid unchanged. |

`role` gains the accepted value `client`. The column is already a free-form `String`, so this is
a validation change and not a migration of the column.

### Request (spec 01's table, one new column)

| Field | Type | Description |
|---|---|---|
| `assigneeClientMembershipId` | `String?` FK → `ClientMembership`, **SetNull** | Set iff `assigneeKind = 'client'`. |

`assigneeKind` gains the value `client`. Spec 01 put that column in its first migration for
exactly this reason, so no column changes here.

### RequestMessage / RequestEvent (spec 01's tables, one new column each)

| Field | Type | Description |
|---|---|---|
| `RequestMessage.authorClientMembershipId` | `String?` FK → `ClientMembership`, **SetNull** | Set iff `authorKind = 'client'`. |
| `RequestEvent.actorClientMembershipId` | `String?` FK → `ClientMembership`, **SetNull** | Set iff `actorKind = 'client'`. |

### New Enums

None, for spec 01's stated reason: every value set is a `String` validated in
`packages/validation`, so `client` joins `assigneeKind`, `authorKind`, `actorKind` and
`Invitation.role` without a migration touching any of those columns.

### New Capabilities

`MemberCapability` and `Capability`, both: `manage-client-users` / `ManageClientUsers` —
admin and manager.

`CLIENT_CAPABILITIES: readonly Capability[] = ['ViewOwnRequests']` — a flat list, not a
role-keyed table (requirement 10).

`NormalizedRole` is **not** extended. `ROLE_CAPABILITIES` gains no row.

## State Machine

```
   (invitation accepted)            (admin removes)
            │                              │
            ▼                              ▼
        active ─────────────────────────► removed ■
            │                              ▲
            │  client archived             │  (no automatic transition —
            └── stays active ──────────────┘   requirement 24)
```

Invariants:

1. A `ClientMembership` is created only by accepting a `role = 'client'` invitation, in the same
   transaction that marks the invitation `used`.
2. `removed` is terminal in this spec; there is no restore path, and re-admitting a person is a
   fresh invitation, which is how spec 03 already handles a removed member.
3. The transition to `removed` rotates `Account.securityStamp` in the same transaction, so no
   live session survives it.
4. Archiving the `Client` changes no `ClientMembership` row.
5. Writers of a `ClientMembership` row are exactly: the accept-invitation handler and the remove
   handler. Each re-reads the row inside its transaction and decides on that read.

## Screens

### Client's inbox — `/org/{orgId}/requests`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Devscribed                                              J. Client ▾         │
│  ▸ Requests                        ← the only row in the sidebar             │
├──────────────────────────────────────────────────────────────────────────────┤
│ Requests                                                                      │
│ Status [ Open ▾ ]                          (no Mine/All, no + New request)    │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⛔ #14  Staging DB access                     Acme redesign                   │
│         access · blocked · needed by 2 Sep (overdue)              open       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Client's request detail

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Requests                                                                    │
│ #14  Staging DB access                                       [ open ]        │
│ access · repository · needed by 2 Sep          Project: Acme redesign        │
│ From: Sam Dev                                                                 │
│                        [ I have provided this ]  [ I cannot provide this ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Conversation                                                                  │
│  Sam Dev · 1 Sep    We need read access to the staging database.             │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ Write a message…                                          [ Send ]   │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

No History panel, no Grant, no Reassign, no Cancel, no Edit.

### Client users, on the client detail — `/org/{orgId}/clients/{clientId}`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Acme Corp                                                     [ active ]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ People                                              [ + Invite a person ]    │
│  J. Client      j.client@acme.example      active        [ Remove ]          │
│  R. Ops         r.ops@acme.example         invited       [ Remove ]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Flows

### Flow: a manager brings a client contact into the product

1. On the client's detail screen the manager clicks **Invite a person** and enters an email.
2. `POST /api/invitations` with `role=client` and `clientId`. The token is minted, hashed and
   stored, and any live pending invitation for that address in this organization is superseded.
3. `client_invitation` is sent after commit.
4. The recipient opens the accept screen from spec 03, sets a name and a password, and submits.
5. The accept handler re-reads both membership tables inside its transaction, finds neither,
   creates the `Account` and the `ClientMembership`, and marks the invitation `used`.
6. They sign in at the ordinary login screen and land on Requests — the only row they have.

### Flow: a developer asks the client for an access

1. A `user` creates a request, chooses addressee kind **client**, picks the project “Acme
   redesign” and the person J. Client.
2. The service checks that the project's `clientId` equals the client user's `clientId`
   (requirement 26) and commits the request and its `created` event.
3. `request_assigned_to_client` is sent after commit.
4. J. Client signs in, opens the request, replies, and clicks **I have provided this**. Status →
   `answered`.
5. The requester verifies the access and clicks **Grant**. J. Client can still read the request
   and can no longer post: the thread is closed in a terminal status (spec 01 requirement 17).

### Alt Flow: the invited address already belongs to a staff member (branches from flow 1, step 5)

The transaction re-reads `Membership`, finds an active row, and answers 409
`accountIsStaff`. No `ClientMembership` is created and the invitation stays `pending`, so the
mistake is recoverable by inviting a different address.

### Alt Flow: the client user is removed while holding a session (branches from flow 2, step 4)

`ClientMembership.status` becomes `removed` and the security stamp rotates in the same
transaction. Their next request — including one already in flight from an open tab — fails
`SessionGuard` with 401 and they are returned to the login screen, where login now refuses with
the existing message.

### Alt Flow: mail fails on either type

The transaction has committed. The failure is logged, nothing retries, and the recovery is a
deliberate action: re-invite, or reassign. No status claims a delivery that did not happen.

### Alt Flow: network or server error on any submission

As spec 01: inline error, control stays enabled, nothing disabled for validation, no partial
write.

## API Contracts

### `GET /api/organizations/{orgId}/clients/{clientId}/users`

`SessionGuard` → `OrgScopeGuard` → `ViewClients`. Returns active and removed client users plus
pending client invitations for that client.

```json
{
  "users": [
    { "id": "…", "displayName": "J. Client", "email": "j.client@acme.example",
      "status": "active", "joinedAt": "…" }
  ],
  "pendingInvitations": [ { "email": "r.ops@acme.example", "expiresAt": "…" } ]
}
```

### `POST /api/invitations` (extended)

`ManageClientUsers` when `role = 'client'`; otherwise unchanged from spec 03. Body gains
`clientId`.

**Errors:** `400 …invitationShapeInvalid` for a role/clientId mismatch;
`400 …clientArchived`; everything else exactly as spec 03 defines it.

### `PATCH …/clients/{clientId}/users/{clientMembershipId}/remove`

`ManageClientUsers`. `204`. Rotates the security stamp in the same transaction.

**Errors:** `404` when the row is not in the caller's organization — never 403.

### `POST /api/login` (extended)

Unchanged request and response. The only change is which rows can resolve a principal
(requirements 6–8). **The refusal body for an account with no active principal of either kind
is unchanged, byte for byte**, from what was observed:
`400 {"message":"Your account has been deactivated. Contact your administrator."}`

### Spec 01's request routes (extended)

`POST …/requests` and `POST …/requests/{id}/reassign` accept `assigneeKind: "client"` with
`assigneeClientMembershipId`. Every other route is unchanged in shape; what changes is that a
client principal can now be party to a request and therefore pass spec 01's party check.

**Errors added:** `400 …projectRequiredForClient`; `400 …contactProjectMismatch`;
`400 …clientUserUnavailable`.

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | An address that is already an active staff member accepts a client invitation | `409 accountIsStaff`. No `ClientMembership`; the invitation stays `pending`. |
| 2 | An address that is already an active client user accepts a staff invitation | `409 accountIsClient`, symmetrically. |
| 3 | A pending staff invitation exists and a client invitation is sent to the same address | The staff one is superseded, per spec 03's rule inherited unchanged. |
| 4 | `role = 'client'` without `clientId` | `400 invitationShapeInvalid`. |
| 5 | `role = 'user'` with a `clientId` | `400 invitationShapeInvalid`. |
| 6 | Inviting a client user for an archived client | `400 clientArchived`. |
| 7 | A client user signs in | Lands on Requests. The sidebar has exactly one row; `nav-members` is absent. |
| 8 | A client user types `/org/{orgId}/members` | The API answers 403; the screen shows the standard forbidden state and offers Requests. |
| 9 | A client user requests `scope=all` | `403 scopeForbidden`. |
| 10 | A client user tries `POST …/requests` | `403 createForbidden` — `CreateRequest` is not in `CLIENT_CAPABILITIES`. |
| 11 | A client user tries to grant a request addressed to them | `403 notYoursToGrant`, and the control is not rendered. |
| 12 | A client user opens a request they are not party to | `404`, identical to a non-existent id. |
| 13 | A request is addressed to a client user with no `projectId` | `400 projectRequiredForClient`. |
| 14 | The project's client differs from the client user's client | `400 contactProjectMismatch`. |
| 15 | The chosen client user has been removed | `400 clientUserUnavailable`. |
| 16 | The client user's `Client` was archived after the request was created | The request continues and the thread stays open; the client user is absent from the addressee picker for new requests. |
| 17 | A client user is removed while holding a live session | The next request fails `SessionGuard` with 401; login then refuses with the existing message. |
| 18 | A client user is removed while a request addressed to them is open | The request stays open, reads `assignee.inactive: true`, and is offered for reassignment. |
| 19 | An account with neither kind of membership attempts to log in | `400` with the existing message, byte-identical to the removed-membership case, so the answer distinguishes nothing. |
| 20 | A staff member's `Membership` is removed but a `ClientMembership` is later created for the same account | Permitted: rule 2 forbids holding **both active**, and the accept handler re-reads for an *active* row of the other kind. A person who left the agency and now works for a client is a real case. |
| 21 | Two managers invite the same address to the same client at once | The supersession index of spec 03 serializes them; exactly one invitation is `pending` afterwards. |
| 22 | A client user's account holds a `ClientMembership` in an archived client, and they log in | Login succeeds while the membership is `active` (requirement 24); they see their existing requests and can be addressed no new ones. |

## Validation Rules

| # | Field | Constraint | Message |
|---|---|---|---|
| 1 | `role` | One of `admin`, `manager`, `user`, `viewer`, `client` | spec 03's existing message |
| 2 | `clientId` | Required iff `role = 'client'`; must be an active client of the caller's organization | `invitationShapeInvalid` / `clientArchived` |
| 3 | invite `email` | The shared email rule of user-management spec 01 | spec 01's existing messages |
| 4 | `assigneeKind` | One of `member`, `client`, with exactly the matching id set | `REQUEST_MESSAGES.assigneeInvalid` |
| 5 | `assigneeClientMembershipId` | Active client user of an active client in the caller's organization | `clientUserUnavailable` |
| 6 | `projectId` | Required when `assigneeKind = 'client'`; its `clientId` must match | `projectRequiredForClient` / `contactProjectMismatch` |

Rules 2, 5 and 6 are decidable only server-side. The client's copy of rules 1, 3 and 4 is a
convenience, never a gate, and the server re-validates all six. Submit buttons are never
disabled for validation.

## Error Messages

New strings live in `CLIENT_USER_MESSAGES`; the three request-side additions extend spec 01's
`REQUEST_MESSAGES`.

| Context | Export | Route that emits it | Message |
|---|---|---|---|
| Account is already staff | `CLIENT_USER_MESSAGES.accountIsStaff` | `POST /api/invitations/accept` | This email address already belongs to a team member |
| Account is already a client user | `CLIENT_USER_MESSAGES.accountIsClient` | `POST /api/invitations/accept` | This email address already belongs to a client user |
| Invitation shape invalid | `CLIENT_USER_MESSAGES.invitationShapeInvalid` | `POST /api/invitations` | Choose a client for a client invitation, and none for a team invitation |
| Client archived | `CLIENT_USER_MESSAGES.clientArchived` | `POST /api/invitations` | You cannot invite people for an archived client |
| Manage without capability | `CLIENT_USER_MESSAGES.manageForbidden` | client-user routes | You do not have permission to manage client users |
| Client user unavailable | `REQUEST_MESSAGES.clientUserUnavailable` | `POST …/requests`, `/reassign` | That client user is no longer available |
| Project required | `REQUEST_MESSAGES.projectRequiredForClient` | `POST …/requests`, `/reassign` | Choose the project this client request is for |
| Project/client mismatch | `REQUEST_MESSAGES.contactProjectMismatch` | `POST …/requests`, `/reassign` | That person does not belong to this project's client |
| Empty people list | `CLIENT_USER_MESSAGES.emptyUsers` | `/org/{orgId}/clients/{clientId}` | Nobody from this client has been invited yet. |

The login refusal message is spec 02 of user-management's and is **not** restated, changed, or
duplicated here.

## UI Description

| State | Behaviour |
|---|---|
| Client user, sidebar | Exactly one row, Requests. `nav-members`, `nav-projects`, `nav-clients`, `nav-time-tracking`, `nav-envelopes`, `nav-documents` all absent. |
| Client user, request list | No scope control, no New Request; status filter only. |
| Client user, request detail | No History panel; Answer and Decline only; Grant, Reassign, Cancel and Edit absent. |
| Client user, terminal request | Composer absent, both action controls absent, thread readable. |
| Staff, client detail, People section | Invite control for `manage-client-users` only; otherwise the list renders read-only. |
| Pending invitation row | Shown with status `invited` and a Remove control that revokes the invitation. |
| Empty People list | `client-users-empty-state` with `emptyUsers`. |
| New-request modal, addressee kind `client` | The person picker is filtered to active users of the selected project's client, and is empty with an explanatory hint when that client has none. |

## Required `data-testid` Attributes

**Client detail, People** — `client-users-section`, `client-users-invite-btn`,
`client-users-empty-state`, `client-user-row-{id}`, `client-user-row-{id}-status`,
`client-user-row-{id}-remove-btn`, `client-user-invite-modal`, `client-user-invite-email`,
`client-user-invite-submit`, `client-user-invite-error-email`.

**New request** — `request-new-assignee-kind`, `request-new-assignee-client`,
`request-new-project`, `request-new-error-assigneeClientMembershipId`.

**Client's own surface** — `requests-page`, `request-row-{id}`, `request-detail-page`,
`request-detail-thread`, `request-detail-composer`, `request-detail-composer-submit`,
`request-detail-answer-btn`, `request-detail-decline-btn`, `request-detail-decline-reason`,
`request-detail-decline-confirm`, `request-detail-history`, `request-detail-grant-btn`,
`requests-scope-toggle`, `requests-new-btn`, `nav-members`, `sidebar-requests-link`.

Every id in the last group except the first six is asserted **absent** for a client principal
and present for a staff one, and both halves appear in the cases below.

## Security

- **The whole point of the schema choice is a security property**: a client principal cannot
  appear in any query that reads `Membership`, so no existing surface can leak to them through
  an omission. Requirement 11 and TC-02-INT-09.
- Every route states its guard chain. Cross-organization access answers 404, not 403.
- A client user's list is scoped to requests where they are the addressee; the scope is applied
  in the query, not by filtering a wider result after the fact.
- Removal rotates the security stamp, so revocation is immediate rather than eventual — the
  mechanism user-management spec 02 defines and this spec reuses without restating.
- **This spec adds no unauthenticated surface.** There is no token, no public route and no
  rate-limiter: a client holds a session like anyone else. This is the substantive difference
  from a magic-link design, and it removes the forwardable-link exposure such a design carries.
- The login refusal for an account with no active principal is byte-identical whichever cause it
  has, so the answer distinguishes nothing about which kind of account an address is.
- Neither new mail type carries a request description or any member email address.

## Out of Scope

- **A client raising a request.** In this spec a client user is an addressee only. A client
  asking *us* for something is a natural next step and is not built; `CreateRequest` is simply
  absent from `CLIENT_CAPABILITIES`, so adding it later is a one-line grant plus its screens.
- **A client seeing anything but their requests** — no project list, no documents, no invoices,
  no reports.
- **More than one client per client user.** `accountId` is unique in both membership tables, the
  same single-org constraint staff live under.
- **Restoring a removed client user.** A fresh invitation is the path, as it is for staff.
- **Per-client branding** on the login screen or in mail.
- **Vacation, time tracking or any staff feature for a client principal.** They are not staff and
  the schema is what says so.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| **This spec's verification route cannot be walked until spec 01 is merged.** Every state involving a `Request` is `not run` below. | The principal, the invitation and the guards are provable today and were proved; what is unprovable is unprovable because the entity it hangs off does not exist yet, not because it was skipped. | Walking the route at the start of this spec's implementation, on a branch with 01 merged, and filling in the `not run` rows before its cases are trusted. |
| Login answers a different message for a valid password on an account with no active principal than for a wrong password, which is an account-existence oracle | **Pre-existing**, observed while probing this spec and not introduced by it. Narrowing it changes a message user-management spec 02 owns. | An amendment to user-management spec 02 making the two refusals identical. Named here so it is not rediscovered as this spec's defect. |
| A person who is both staff and a client contact must use two email addresses | Rule 2 forbids two active principals for one account, and the alternative — a principal switcher — is a product decision nobody has asked for | A spec that makes `accountId` non-unique in both tables and adds an organization/principal switcher, which is also what multi-org would need |
| No audit record of an invitation being sent to a client | `Invitation` rows carry their own history and spec 03 owns that surface | Whatever closes it for staff invitations closes it here |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | An invited client user can sign in at the ordinary login screen and reach the Requests page. |
| AC-2 | That user's sidebar contains exactly one row; `nav-members` is absent from the DOM. |
| AC-3 | A staff member's sidebar is unchanged by this spec, and `nav-members` is present for all four staff roles. |
| AC-4 | No account holds an active `Membership` and an active `ClientMembership` at the same time. |
| AC-5 | Every existing query against `Membership` returns the same rows after this spec as before, with client users present in the organization. |
| AC-6 | A client user receives 403 on every capability-gated staff route and 404 on every org-scoped resource they are not party to. |
| AC-7 | A request can be addressed to a client user only when the project's client matches theirs. |
| AC-8 | A client user can answer and decline a request addressed to them, and cannot grant it. |
| AC-9 | Removing a client user revokes their live sessions on their next request. |
| AC-10 | An open request addressed to a removed client user stays open and is flagged inactive. |
| AC-11 | The login refusal body for an account with no active principal is byte-identical to the one observed before this spec. |
| AC-12 | Neither new mail type contains a request description or a member email address. |
| AC-13 | Accepting a client invitation and marking it `used` happen in one transaction; a failure leaves no `ClientMembership` and a still-`pending` invitation. |

## Verification Plan

**This spec's route is walked in two parts.** Everything that does not depend on spec 01 was
walked now and is recorded as observed. Everything that does is marked `not run`, and is walked
at the start of this spec's implementation on a branch with spec 01 merged. That ordering is
inherent: the entity these cases hang off does not exist in the tree yet.

### Bringing it up

Identical to spec 01's, including the two environment repairs (`prisma generate` from
`apps/api`, `npm run build --workspace @devscribed/validation`) that a fresh checkout after the
`organization/01` merge needs. Ports `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1`, database
`devscribed_e2e` at `localhost:5434`.

### Reaching the states the cases need

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| An organization with an admin | `signupOrg` (`e2e/tests/helpers.ts:734`) | yes | yes |
| A `Client` | `POST …/clients` | yes | yes — and the body is `{ "client": {…} }`, not the client itself; the helper this spec owes must unwrap `.client` |
| A project linked to that client | `PUT …/projects/{id}` with `clientId` | yes | yes — 200 |
| **An account with no `Membership`** | `createBareAccount` (`helpers.ts:898`) | yes | yes |
| **What login does with such an account** | `POST /api/login` | yes | yes — `400 {"message":"Your account has been deactivated. Contact your administrator."}`, reproduced across two runs. This is the exact refusal requirement 6 changes and AC-11 pins. |
| **The refusal shape with no session at all** | `GET …/requests`, `…/clients`, `…/members` with an empty cookie jar | yes | yes — all three answer `401 {"message":"Not signed in","error":"Unauthorized","statusCode":401}`, identical to a caller holding a session that cannot resolve a principal |
| A staff invitation and its token | `inviteAndAcceptViaApi` (`helpers.ts:921`), `latestInvitationToken` (`:794`) | yes | yes |
| Mail readable by a test | `GET /api/test/mail/latest?email=&type=` | yes | yes — 200 |
| A `ClientMembership` | — | no | **not run** — created by this spec. Helper `inviteAndAcceptClientViaApi`, a thin variant of `inviteAndAcceptViaApi`, is work this spec owes. |
| A request addressed to a client user | — | no | **not run** — depends on spec 01 |
| A request in each status, addressed to a client user | — | no | **not run** — depends on spec 01 |
| A removed client user holding a live session | — | no | **not run** — depends on this spec's own remove route |

### Access this needs

| What | Name | Where the value lives | How the next agent gets it | Proven against |
|---|---|---|---|---|
| — | — | — | — | Nothing. No third-party system, no API key, no MCP server. Mail is the in-memory sink. No credential exists for this spec to obtain and none appears in any tracked file. |

### Observing each criterion

| Acceptance criterion | Observer | Level | Proven at spec time |
|---|---|---|---|
| AC-1 | TC-02-E2E-01 | E2E | login path observed; the membership half is not run |
| AC-2 | TC-02-E2E-01 | E2E | `nav-members` confirmed unconditional in `Sidebar.tsx:71` — the defect is real today |
| AC-3 | TC-02-E2E-05 | E2E | staff sidebar reachable today |
| AC-4 | TC-02-INT-03, TC-02-INT-04 | Integration | not run |
| AC-5 | TC-02-INT-09 | Integration | the 35 call sites in 16 files were enumerated by grep at spec time |
| AC-6 | TC-02-INT-08 | Integration | today's 401/403 shapes observed |
| AC-7 | TC-02-INT-10 | Integration | not run |
| AC-8 | TC-02-INT-11, TC-02-E2E-03 | Integration + E2E | not run |
| AC-9 | TC-02-INT-06 | Integration | the stamp mechanism is proven by `account-settings.spec.ts` today |
| AC-10 | TC-02-INT-12 | Integration | not run |
| AC-11 | TC-02-INT-07 | Integration | **the exact body is recorded above and is what the case asserts** |
| AC-12 | TC-02-INT-13 | Integration | mail sink proven |
| AC-13 | TC-02-INT-05 | Integration | not run |

### Rehearsal

One throwaway Playwright spec, `e2e/tests/_probe-clientuser.spec.ts`, created an organization, a
client and an account with no membership, then asked the auth chain about it from an isolated
cookie jar. Command and result:

```
cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 PW_WORKERS=1 \
  npx playwright test tests/_probe-clientuser.spec.ts --reporter=list

[probe3] orgId aed29403-0c1c-4bab-8401-2990932cd577 | bare account probe3-bare+…@acme.com
[probe3] login, no membership => 400 {"message":"Your account has been deactivated. Contact your administrator."}
[probe3] GET /requests as that account => 401 {"message":"Not signed in","error":"Unauthorized","statusCode":401}
[probe3] GET /clients   as that account => 401 {"message":"Not signed in","error":"Unauthorized","statusCode":401}
[probe3] GET /members   as that account => 401 {"message":"Not signed in","error":"Unauthorized","statusCode":401}
[probe3] GET /requests, no cookie       => 401 {"message":"Not signed in","error":"Unauthorized","statusCode":401}
[probe3] control — admin GET /members => 200
  ✓  1 [chromium] › tests\_probe-clientuser.spec.ts:11:5 (442ms)
  1 passed (11.4s)
```

An earlier version of this probe reported 200 for the three guarded routes. It was wrong: login
had failed, so the calls were being made on the admin's cookie jar. The isolated context above
is the corrected run, and the lesson is written into the helper this spec owes — a client-user
helper must assert that its login succeeded rather than assume the jar switched.

The file was deleted after the run. What it could not reach is marked `not run` above.

## Test Cases

Sections without a test case of their own: **Summary**, **Actors & Preconditions**, **Screens**,
**Out of Scope** and **Known Gaps** state context rather than behaviour; **Verification Plan** is
the rig. Every other section is covered below.

### TC-02-UNIT-01

- **Level:** Unit
- **Steps:** Validate invitation shapes: (`user`, no clientId), (`client`, clientId),
  (`client`, no clientId), (`user`, clientId), (`nonsense`, clientId).
- **Expected Result:** valid; valid; `invitationShapeInvalid`; `invitationShapeInvalid`; the
  spec-03 role message.

### TC-02-UNIT-02

- **Level:** Unit
- **Steps:** Validate addressee pairs after this spec: `member`+membershipId;
  `client`+clientMembershipId; `client`+membershipId; both ids; neither.
- **Expected Result:** valid; valid; `assigneeInvalid`; `assigneeInvalid`; `assigneeInvalid`.

### TC-02-UNIT-03

- **Level:** Unit
- **Steps:** Assert `CLIENT_CAPABILITIES` contents, and that `NormalizedRole` and
  `ROLE_CAPABILITIES` are unchanged by this spec.
- **Expected Result:** `CLIENT_CAPABILITIES` is exactly `['ViewOwnRequests']`; the four staff
  roles and their capability lists are byte-identical to spec 01's, plus `ManageClientUsers` for
  admin and manager only.

### TC-02-INT-01

- **Level:** Integration
- **Steps:** Invite a client user; read the mail sink for `client_invitation`; accept.
- **Expected Result:** 201; the mail names the organization, the client and the inviter and
  carries the link; a `ClientMembership` exists with `status = 'active'`; the invitation is
  `used`.

### TC-02-INT-02

- **Level:** Integration
- **Steps:** Invite with `role=client` and no `clientId`; with `role=user` and a `clientId`; for
  an archived client; without `manage-client-users`.
- **Expected Result:** 400 `invitationShapeInvalid`; 400 `invitationShapeInvalid`; 400
  `clientArchived`; 403 `manageForbidden`. No invitation row written in any case.

### TC-02-INT-03

- **Level:** Integration
- **Steps:** Accept a client invitation with an address that is already an active staff member.
- **Expected Result:** 409 `accountIsStaff`; no `ClientMembership`; the invitation is still
  `pending`.

### TC-02-INT-04

- **Level:** Integration
- **Steps:** Accept a staff invitation with an address that is already an active client user.
- **Expected Result:** 409 `accountIsClient`, symmetrically. Then repeat with the client user
  first removed — it succeeds, per edge case 20.

### TC-02-INT-05

- **Level:** Integration
- **Steps:** Force the `ClientMembership` insert to fail inside the accept transaction.
- **Expected Result:** no `ClientMembership`, no `Account` created for a new invitee, and the
  invitation still `pending` — nothing half-applied (AC-13).

### TC-02-INT-06

- **Level:** Integration
- **Steps:** Sign a client user in, then remove them, then reuse the same cookie jar.
- **Expected Result:** the first call succeeds; after removal the next call answers 401; a fresh
  login answers 400 with the existing message. `ClientMembership.status` is `removed` and the
  account's `securityStamp` differs from before.

### TC-02-INT-07

- **Level:** Integration
- **Steps:** `POST /api/login` for: an account with no principal at all; an account whose
  `ClientMembership` is `removed`; an account whose `Membership` is `removed`.
- **Expected Result:** all three answer `400` with the body observed at spec time, byte for byte
  (AC-11). No response distinguishes the three causes.

### TC-02-INT-08

- **Level:** Integration
- **Steps:** As a client user, call every capability-gated staff route (members, projects, time
  tracking, vacation, documents, clients, signing settings) and one org-scoped request they are
  not party to.
- **Expected Result:** 403 with the fixed forbidden message for each capability-gated route; 404
  for the request. No route returns data.

### TC-02-INT-09

- **Level:** Integration
- **Steps:** In an organization holding staff **and** client users, call each surface that reads
  `Membership` — members list, project members, time entries, vacation balance, the accrual run,
  the requests feed, invitations, kanban assignee resolution — and compare row counts and ids
  against the same organization with no client users.
- **Expected Result:** identical in every case. No client user appears anywhere a `Membership` is
  read (AC-5). This is the case that pays for the schema decision, and it fails loudly if a
  future change moves clients into `Membership`.

### TC-02-INT-10

- **Level:** Integration
- **Steps:** Create a request addressed to a client user: with a matching project; with a project
  of a different client; with no project; naming a removed client user; naming a client user of
  an archived client.
- **Expected Result:** 201; 400 `contactProjectMismatch`; 400 `projectRequiredForClient`; 400
  `clientUserUnavailable`; 400 `clientUserUnavailable`.

### TC-02-INT-11

- **Level:** Integration
- **Steps:** As the client user addressee: post a message, `answer`, then `grant`; and separately
  `decline` with a reason.
- **Expected Result:** 201, 200, then 403 `notYoursToGrant`; the decline writes its reason as a
  `RequestMessage` with `authorKind = 'client'` in the same transaction as the status.

### TC-02-INT-12

- **Level:** Integration
- **Steps:** Address a request to a client user, then remove that user.
- **Expected Result:** the request stays `open`, reads `assignee.inactive: true`, and reassigning
  it to a member succeeds and writes `assignee_changed` with both display-name snapshots.

### TC-02-INT-13

- **Level:** Integration
- **Steps:** Trigger both new mail types and read the sink.
- **Expected Result:** `client_invitation` and `request_assigned_to_client` are present; neither
  body contains the request description nor any member email address (AC-12).

### TC-02-INT-14

- **Level:** Integration
- **Steps:** As a client user, `GET …/requests` with no query, then `scope=all`, then
  `POST …/requests`.
- **Expected Result:** 200 with only requests addressed to them; 403 `scopeForbidden`; 403
  `createForbidden`.

### TC-02-E2E-01

- **Level:** E2E
- **Steps:** Open the invite modal and submit a malformed email first, then a valid one; accept
  through the invitation screen; sign in at the ordinary login screen.
- **Expected Result:** the malformed address shows the inline field error and the submit control
  stays enabled; the valid one creates the invitation. After accepting, the Requests page
  renders; the sidebar has exactly one row; `nav-members` is absent from the DOM; neither the
  scope control nor New Request is drawn.
- **Selectors:** `client-users-section`, `client-users-invite-btn`, `client-user-invite-modal`,
  `client-user-invite-email`, `client-user-invite-error-email`, `client-user-invite-submit`,
  `client-user-row-{id}`,
  `client-user-row-{id}-status`, `sidebar-requests-link`, `requests-page`, `nav-members`
  (asserted absent), `requests-scope-toggle` (asserted absent), `requests-new-btn` (asserted
  absent).

### TC-02-E2E-02

- **Level:** E2E
- **Steps:** As a `user`, create a request addressed to a client user, choosing the addressee
  kind and then the person; first with a project of the wrong client, then the right one.
- **Expected Result:** the wrong client shows the inline error and the submit control stays
  enabled; the right one creates the request.
- **Selectors:** `request-new-assignee-kind`, `request-new-project`,
  `request-new-assignee-client`, `request-new-error-assigneeClientMembershipId`.

### TC-02-E2E-03

- **Level:** E2E
- **Steps:** As the client user, open the request **from the inbox row**, post a reply, click
  **I have provided this**; then on a second request click **I cannot provide this** and submit a
  reason.
- **Expected Result:** the first reaches `answered`, the second `declined` with the reason last
  in the thread; on both, the History panel and the Grant control are absent throughout.
- **Selectors:** `requests-page`, `request-row-{id}`, `request-detail-page`,
  `request-detail-thread`, `request-detail-composer`,
  `request-detail-composer-submit`, `request-detail-answer-btn`, `request-detail-decline-btn`,
  `request-detail-decline-reason`, `request-detail-decline-confirm`, `request-detail-history`
  (asserted absent), `request-detail-grant-btn` (asserted absent).

### TC-02-E2E-04

- **Level:** E2E
- **Steps:** With a client user signed in, have an admin remove them; then have the client user
  act in their still-open tab.
- **Expected Result:** they are returned to the login screen, and logging in again is refused.
- **Selectors:** `client-user-row-{id}-remove-btn`, `requests-page`.

### TC-02-E2E-05

- **Level:** E2E
- **Steps:** Sign in as each of admin, manager, user and viewer and inspect the sidebar; then
  open a client's detail as an admin and as a `user`.
- **Expected Result:** `nav-members` is present for all four staff roles — the regression witness
  that requirement 13's fix did not over-reach; the People section renders for the admin with an
  invite control and for the `user` without one.
- **Selectors:** `nav-members`, `sidebar-requests-link`, `client-users-section`,
  `client-users-invite-btn` (asserted absent for `user`), `client-users-empty-state`.
