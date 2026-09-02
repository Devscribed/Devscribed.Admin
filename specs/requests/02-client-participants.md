---
id: "02"
title: Client Participants
routes:
  - "/org/{orgId}/requests"
  - "/org/{orgId}/requests/{requestId}"
  - "/org/{orgId}/clients/{clientId}"
  - "/accept-invite"
api:
  - "GET /api/organizations/{orgId}/clients/{clientId}/users"
  - "PATCH /api/organizations/{orgId}/clients/{clientId}/users/{clientMembershipId}/remove"
  - "POST /api/invitations (extended: role=client, clientId)"
  - "POST /api/login (extended: resolves a client principal)"
  - "GET /api/me (extended: resolves a client principal)"
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
spec: `Membership` means "member of staff" everywhere it is read, and widening it would put a
client row into vacation accrual, the members list, project assignment and time tracking, where
nothing would crash and everything would be quietly wrong.

With the principal in place, a client can be the addressee of a request from spec 01. They see
one screen — the requests addressed to them — and nothing else of the organization.

**Depends on:** spec 01 (`Request` and its lifecycle, `assigneeKind`), organization spec 01
(`Client`), user-management spec 03 (`Invitation` and its token).

## Actors & Preconditions

| Actor | Preconditions |
|---|---|
| **Admin / manager** | Active staff member holding `manage-client-users`. Invites and removes client users. |
| **Client user** | An `Account` plus an active `ClientMembership` bound to a `Client` of the organization, whatever that client's status. Holds a session exactly like staff; holds no `Membership`. **Decided:** the client's status does not bear on the principal — an active membership in an archived client is still a principal and still signs in (requirement 24, edge case 22). Rejected: requiring an active `Client` to be a principal, which would log a person out because their client was archived. The active-client condition applies only to being chosen as an addressee (requirement 27). |
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
| Reassign an `open` or `answered` request | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel a request | requester or admin | requester | requester | requester | ❌ |
| Edit a request while `open` or `answered` | requester or admin | requester | requester | requester | ❌ |
| Every other surface — members, projects, time tracking, vacation, documents, clients, settings | per their role | | | | ❌ |

A client user's capability set is exactly `{ ViewOwnRequests }`. Everything else they may do is
an actor rule of spec 01 (being the addressee), not a capability.

## Functional Requirements

### The principal

1. A `ClientMembership` links one `Account` to one `Client` within one `Organization`. Its
   `status` is `active` or `removed`; removal is soft, mirroring `Membership`.
2. **An account holds either an active `Membership` or an active `ClientMembership`, never
   both.** Both tables carry `accountId @unique`, and the accept-invitation handler re-reads
   both inside its transaction and refuses with 409 when an **active** row of **either** kind
   already exists for that account:

   | Invitation being accepted | Active row already held | Refusal |
   |---|---|---|
   | `role = 'client'` | `Membership` | `409 CLIENT_USER_MESSAGES.accountIsStaff` |
   | `role = 'client'` | `ClientMembership` | `409 CLIENT_USER_MESSAGES.accountIsClient` |
   | any staff role | `ClientMembership` | `409 CLIENT_USER_MESSAGES.accountIsClient` |

   A second client principal is refused by that read like any other, and never by a bare unique
   constraint error on `ClientMembership.accountId`. **Decided:**
   a `removed` row of the other kind does not refuse — the accept succeeds and the new principal
   is created (edge case 20). Rejected: refusing whenever any row of the other kind exists, which
   would permanently bar a person who left the agency and now works for a client. Staff and
   client are different kinds of relationship to the organization, and an account that is both
   **active** makes every capability question ambiguous.
3. `SessionPayload` (`apps/api/src/auth/session.service.ts`) is unchanged —
   `{ accountId, organizationId, securityStamp }`. The principal kind is **not** in the cookie: it
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
   `ClientMembership`, and refuse only when neither exists. The principal is resolved **before**
   the password is verified, and that ordering is preserved: verifying the password first would
   let a caller tell a correct password from a wrong one on an account with no active principal.
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
   → 403. The two branches are exhaustive and the fall-through fails closed, exactly as the
   undecorated-route case does today. Every refusal this guard makes carries its existing fixed
   body — `{ "error": "forbidden", "message": TEMPLATE_MESSAGES.generic.forbidden }` — which
   names no resource and no capability.

9a. **Where a refusal message is named, the check is not the guard.** The three client-user
   routes — the People list, the client invitation and the remove — check
   `manage-client-users` **in the service**, before the guard's fixed body can be produced, and
   refuse **every** caller who does not hold it — a staff member of any role and a client
   principal alike — with 403 and `CLIENT_USER_MESSAGES.manageForbidden`. **Decided:** one
   refusal whichever principal the caller is; rejected: a distinct answer for a client
   principal, which would tell a caller which kind of account they hold from a route neither
   kind may use.

   The capability is checked **before** the client or the client membership named in the URL is
   read, so that 403 is identical for an id that exists and one that does not, and a caller
   without the capability learns nothing about what the organization holds. Only a caller who
   does hold it reaches the lookup, and for them a client or a row outside their organization is
   404. **Decided:** these three routes answer a named 403 where the other clients-scoped routes
   answer 404 to a staff caller who lacks `view-clients`; rejected: collapsing these three to
   404 as well, which the ordering above makes unnecessary — nothing is revealed either way —
   and which would leave `manageForbidden` unreachable.

   **Decided:** a named message means a service-level check, which is the discipline spec 01
   already follows for `createForbidden` and `scopeForbidden`; rejected: gating those three
   routes with `CapabilityGuard`, which would answer the fixed body and make
   `manageForbidden` unreachable. This spec changes the gate on no other route: a route gated by
   `CapabilityGuard` keeps that guard and therefore the fixed body (requirement 9).

10. `CLIENT_CAPABILITIES` is a flat readonly list, not a role-keyed table. There is one kind of
    client user and inventing a role dimension for a set with one member would be a table
    nobody can populate a second row of.
11. **No query that reads `Membership` gains a client row.** A client is never a `Membership`
    row, so every query that reads one keeps its present meaning. This is the property the whole
    design exists to buy, and TC-02-INT-09 asserts it against the surfaces where a wrong answer
    would be silent. **Decided:** this rule constrains what a `Membership` query may *return*,
    not which handlers may be edited — a handler may read `ClientMembership` as well, which is
    what requirement 11a requires of the session endpoint. Rejected: reading it as "no handler
    that reads `Membership` is visited", which would forbid the one change the sidebar needs.

### Navigation

11a. **`GET /api/me` resolves either principal.** It answers `200` with the account, the
    organization and `features` exactly as today, plus `principalKind`. For an account with an
    active `Membership`: `principalKind: "staff"` and `role` as today. For an account with an
    active `ClientMembership` and no active `Membership`: `principalKind: "client"`,
    `role: null`, and the organization taken from the `ClientMembership`. For an account with
    neither the body is `null`, as today, and the shell sends that caller to the login screen.
    **Decided:** `role` is `null` for a client principal; rejected: sending `role: "client"`,
    which would put a client value into a role-keyed lookup that requirement 10 and the roles
    matrix exist to keep staff-only.

12. The sidebar is composed from `principalKind` first and from the role second. A client
    principal sees exactly one row: **Requests**. No row is drawn from a role lookup for a
    caller whose `principalKind` is `client`.
13. **`nav-members` is today added unconditionally** (`apps/web/src/layout/Sidebar.tsx`) — the
    Members row is drawn for every signed-in member. This spec moves it behind a staff check. It
    is a defect against the existing "a nav item the current role cannot use is not rendered"
    rule the moment a non-staff principal exists, and it is fixed here rather than carved out.

13a. **Where a client principal lands.** After a successful login, and after accepting an
    invitation, the screen resolves `GET /api/me` and sends a caller whose `principalKind` is
    `client` to `/org/{orgId}/requests`; a staff principal continues to `/org/{orgId}/members`,
    unchanged. Accepting a `role = 'client'` invitation establishes the session cookie in the
    same response, exactly as accepting a staff invitation does, so a client user reaches
    Requests without a second sign-in. **Decided:** the accept screen branches on
    `principalKind` rather than sending everyone to Members; rejected: leaving the shared
    destination, which lands a client principal on the one screen requirement 12 says they never
    see and edge case 8 says answers 403.

14. A client user who types the URL of any staff screen reaches no data: the API answers 403 for
    a capability-gated route and 404 for an org-scoped resource they are not party to. The
    absent nav row is a convenience; the server is the gate.

14a. **The two shapes of that 403.** A route gated by `CapabilityGuard` answers the guard's
    fixed body (requirement 9). A staff route that instead resolves its caller from `Membership`
    inside its own service — the members, projects, time-tracking, vacation and clients routes
    among them — finds none for a client principal and answers
    `403 {"message":"Forbidden","statusCode":403}`, which names no resource and no capability.
    **Decided:** those routes keep the refusal they already make; rejected: teaching them the
    guard's fixed body or a message of this spec's own, which would be a new answer on every
    staff surface for a caller they already refuse, and would give a client principal a way to
    tell one staff surface from another. Under either shape the status is 403 and no route
    returns data.

14b. **What a client principal sees on a staff URL.** The shell resolves `GET /api/me` and sends
    a caller whose `principalKind` is `client` who opens any `/org/{orgId}/…` route other than
    `/org/{orgId}/requests` and `/org/{orgId}/requests/{requestId}` to `/org/{orgId}/requests`;
    no staff screen is rendered for them. **Decided:** the shell redirects to the one screen
    they have; rejected: drawing a forbidden state on the staff screen, which would introduce an
    empty state, a `data-testid` and a message for a screen a client principal has no reason to
    stand on. The redirect is a convenience and never a gate — requirements 14 and 14a are what
    withhold the data.

### Inviting a client user

15. Client invitations reuse the `Invitation` model (`apps/api/prisma/schema.prisma`) rather
    than a parallel table: the token, its SHA-256 storage, the seven-day expiry, the supersession rule
    and the accept screen are all built and tested in user-management spec 03.
16. `Invitation` gains one nullable column, `clientId`, and one new accepted value of `role`:
    `client`. `role = 'client'` requires `clientId`; any other role requires it to be absent.
    Both are rejected with 400 and `CLIENT_USER_MESSAGES.invitationShapeInvalid`. This shape is
    checked only after the caller's permission to send that body has been decided: a caller
    without it meets the 403 the `POST /api/invitations` contract names, whatever shape the body
    has.
17. Inviting a client user requires `manage-client-users` (admin, manager) and an **active**
    `Client`. An archived client is rejected with 400 and `CLIENT_USER_MESSAGES.clientArchived`.
18. Accepting a `role = 'client'` invitation creates the `Account` (when new) and a
    `ClientMembership`, in one transaction with the invitation's transition to `used` — the same
    transaction shape spec 03 already uses.
19. The supersession rule of spec 03 is inherited unchanged: at most one live `pending`
    invitation per (email, organization), whichever kind it is. Inviting an address that already
    has a pending staff invitation supersedes it, and the reverse also holds. A superseded token
    is no longer live: presenting it answers `400 INVITE_MESSAGES.tokenInvalid`.

19a. **Invitation time inspects no `ClientMembership`.** Spec 03's `alreadyMember` refusal —
    `400 INVITE_MESSAGES.alreadyMember` — reads active `Membership` rows only, and this spec adds
    no counterpart for `ClientMembership`. So an address that already holds an active
    `ClientMembership` can be minted a client invitation and a staff invitation alike, each
    succeeding, and the refusal comes at acceptance: `409 accountIsClient` (requirement 2).
    **Decided:** the one-active-principal guarantee is enforced only in the accept transaction;
    rejected: a mirror refusal at invitation time, which would need a message this spec does not
    define and would make edge cases 2 and 21 unreachable.

    **The `alreadyMember` refusal does not fire for `role = 'client'`.** A body carrying
    `role = 'client'` is minted, stored and mailed like any other client invitation even when
    that address holds an active `Membership`, and the refusal comes at acceptance:
    `409 accountIsStaff` (requirement 2, edge case 1). `400 INVITE_MESSAGES.alreadyMember` is
    answered only when the body invites that address as staff, which is what the Error Messages
    row for `alreadyMember` scopes it to. **Decided:** the staff refusal is scoped to staff
    invitations; rejected: letting it fire for a client invitation too, which would make it
    impossible ever to mint a client invitation for a staff address and would leave edge case 1
    and TC-02-INT-03 unreachable.
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
23. An `open` or `answered` request addressed to a removed client user is **not** cancelled and
    **not** reassigned automatically. It reads `assignee.inactive: true`, which draws the
    inactive banner and the reassign control on the detail screen and nothing on the list row.
    An admin or manager may then reassign it — to a member, or to another active client user of
    the project's client — and the reassignment writes a `RequestEvent` with
    `action = 'assignee_changed'` carrying both display names in `oldLabel` / `newLabel`.
24. Archiving a `Client` does **not** remove its users and does not revoke their sessions.
    Conversations already under way finish; the client is simply no longer offered for new work
    (requirement 27). Consistent with spec 01's treatment of an archived project.

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
29. **What a client principal may do to a request addressed to them**, in full:
    - **Post a message**, while the status is `open` or `answered`. The body is required, 1–5000
      characters (`REQUEST_MESSAGES.messageRequired` / `messageTooLong`), and is written with
      `authorKind = 'client'`. In a terminal status the composer is not drawn and
      `POST …/messages` answers `409 REQUEST_MESSAGES.threadClosed`.
    - **`open → answered`**, through `POST …/answer`, answering `200` with the row and writing a
      `status_changed` event in the same transaction. A second answer, attempted from
      `answered`, answers `409 REQUEST_MESSAGES.invalidTransition`.
    - **`open → declined`** and **`answered → declined`**, through `POST …/decline`, which
      **requires** a reason of 1–1000 characters (`REQUEST_MESSAGES.declineReasonRequired` /
      `declineReasonTooLong`, `400` on either). The reason is stored as the body of a
      `RequestMessage` with `authorKind = 'client'`, written in the same transaction as the
      status, so a refusal is always visible in the conversation.
    - Any transition attempted from a terminal status answers
      `409 REQUEST_MESSAGES.alreadyTerminal`. A terminal request stays readable to them.
    - They may **not** grant, cancel, edit or reassign, and none of those controls is drawn:
      `POST …/grant` answers `403 REQUEST_MESSAGES.notYoursToGrant` — only the requester or an
      admin grants, and a client is never the requester in this spec; `POST …/cancel` answers
      `403 …notYoursToCancel`; `PATCH …/requests/{id}` answers `403 …editForbidden`;
      `POST …/reassign` is capability-gated on `ViewAllRequests`, which no client holds, and
      answers `403` with the guard's fixed body (requirement 9).
    - A request they are not party to answers `404`, identical to a non-existent id.
30. A client user's request list is scoped to requests where they are the addressee. `scope=all`
    answers 403 with `REQUEST_MESSAGES.scopeForbidden`, as it does for a `user`. The response
    carries `counts.waitingOnMe`, the non-terminal requests addressed to them, and **no**
    `vacation` key — a client principal holds no `view-requests`. That counter, alone, is what
    the sidebar badge shows them.
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
│  R. Ops         r.ops@acme.example         invited                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Flows

### Flow: a manager brings a client contact into the product

1. On the client's detail screen the manager clicks **Invite a person** and enters an email.
2. `POST /api/invitations` with `role=client` and `clientId`. The token is minted, hashed and
   stored, and any live pending invitation for that address in this organization is superseded.
3. `client_invitation` is sent after commit.
4. The recipient opens the accept screen from spec 03, sets a name and a password, and submits.
5. The accept handler re-reads both membership tables inside its transaction, finds no active
   row of either kind, creates the `Account` and the `ClientMembership`, and marks the
   invitation `used`. The response sets the session cookie.
6. The accept screen resolves `GET /api/me`, reads `principalKind: "client"`, and lands them on
   `/org/{orgId}/requests` (requirement 13a). Signing in later at the ordinary login screen
   lands them on the same route — the only row they have.

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

`SessionGuard` → `OrgScopeGuard`, then a **service-level** `manage-client-users` check
(requirement 9a). Returns active and removed client users plus pending client invitations for
that client.

**Errors:** `403 CLIENT_USER_MESSAGES.manageForbidden` for any caller without the capability,
staff or client principal, and the capability is checked before the client is read, so that 403
is the same for a `clientId` that does not exist (requirement 9a); `404` when the client is not
in the caller's organization — never 403.

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

When `role = 'client'`, a **service-level** `manage-client-users` check (requirement 9a);
otherwise unchanged from spec 03. Body gains `clientId`.

**Errors:** `403 CLIENT_USER_MESSAGES.manageForbidden` when `role = 'client'` and the caller
lacks the capability, staff or client principal; `400 …invitationShapeInvalid` for a
role/clientId mismatch;
`400 …clientArchived`; everything else exactly as spec 03 defines it.

**Decided:** the refusal a caller without permission meets is chosen by the `role` in the body,
which is read before the refusal is chosen. `role = 'client'` answers
`403 CLIENT_USER_MESSAGES.manageForbidden`; any body that does not carry `role = 'client'` —
another role, an invalid one, or none at all — keeps spec 03's refusal unchanged,
`403 INVITE_MESSAGES.permissionDenied` ("You do not have permission to invite members").
Rejected: answering `permissionDenied` for a client invitation too, which
would leave `manageForbidden` unreachable on this route and name the wrong permission. **Who may
invite does not change**: `manage-client-users` is held by admin and manager, and this route
already admits only an active admin or manager of the session's organization. Only what a refused
caller sending `role = 'client'` is told changes, and TC-02-INT-02 observes both branches.

**Decided:** the permission refusal is chosen and returned **before** the body's shape is
validated. A caller who lacks the capability and sends `role = 'client'` meets
`403 manageForbidden` whether or not the body carries a `clientId`, and never
`400 invitationShapeInvalid`; the shape rule of requirement 16 is applied only to a caller who
passes the permission check. Rejected: validating the shape first, which would tell a caller
who may invite nothing at all which bodies this route accepts.

### `PATCH …/clients/{clientId}/users/{clientMembershipId}/remove`

`SessionGuard` → `OrgScopeGuard`, then a **service-level** `manage-client-users` check
(requirement 9a). `204`. Rotates the security stamp in the same transaction.

**Errors:** `403 CLIENT_USER_MESSAGES.manageForbidden` for any caller without the capability,
staff or client principal, and checked before the row is read, so that 403 is the same for a
`clientMembershipId` that does not exist (requirement 9a); `404` when the row is not in the
caller's organization — never 403.

### `GET /api/me` (extended)

`SessionGuard`. Unchanged request. The response gains `principalKind` and resolves a client
principal (requirement 11a):

```json
{ "account": { "…": "unchanged" },
  "organization": { "id": "…", "name": "Acme Agency" },
  "principalKind": "client",
  "role": null,
  "features": { "mailOutbox": false } }
```

**Errors:** `401` without a valid session, as today; body `null` for an account with no active
principal of either kind, as today.

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
| 4 | `role = 'client'` without `clientId`, from an admin or manager | `400 invitationShapeInvalid`. From a caller without `manage-client-users` the same body answers `403 manageForbidden`, because permission is decided before shape. |
| 5 | `role = 'user'` with a `clientId`, from an admin or manager | `400 invitationShapeInvalid`. |
| 6 | Inviting a client user for an archived client | `400 clientArchived`. |
| 7 | A client user signs in | Lands on Requests. The sidebar has exactly one row; `nav-members` is absent. |
| 8 | A client user types `/org/{orgId}/members` | The shell sends them to `/org/{orgId}/requests` and draws no staff screen (requirement 14b); the members route answers `403 {"message":"Forbidden","statusCode":403}` (requirement 14a). |
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
| 21 | Two managers invite the same address to the same client at once | Nothing serializes the two writes, and both may leave a `pending` invitation: the supersession rule is last-writer-wins and this spec adds no lock and no unique constraint. **Decided:** the guarantee lives at acceptance, not at invitation — whichever token is accepted first creates the `ClientMembership`, and accepting a second **live** token for that address afterwards answers `409 accountIsClient` (requirement 2), so at most one principal exists whatever the order. A token the supersession rule invalidated is not live and answers `400 INVITE_MESSAGES.tokenInvalid` instead (requirement 19). Rejected: claiming exactly one `pending` invitation survives, which no mechanism in this spec provides. |
| 22 | A client user's account holds a `ClientMembership` in an archived client, and they log in | Login succeeds while the membership is `active` (requirement 24); they see their existing requests and can be addressed no new ones. |

## Validation Rules

| # | Field | Constraint | Message |
|---|---|---|---|
| 1 | `role` | One of `admin`, `manager`, `user`, `viewer`, `client` | `MESSAGES.role.invalid` |
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
| Manage without capability | `CLIENT_USER_MESSAGES.manageForbidden` | `GET …/clients/{clientId}/users`, `POST /api/invitations` with `role = 'client'`, `PATCH …/users/{id}/remove` — emitted by the service check of requirement 9a, never by `CapabilityGuard` | You do not have permission to manage client users |
| Client user unavailable | `REQUEST_MESSAGES.clientUserUnavailable` | `POST …/requests`, `/reassign` | That client user is no longer available |
| Project required | `REQUEST_MESSAGES.projectRequiredForClient` | `POST …/requests`, `/reassign` | Choose the project this client request is for |
| Project/client mismatch | `REQUEST_MESSAGES.contactProjectMismatch` | `POST …/requests`, `/reassign` | That person does not belong to this project's client |
| Empty people list, and the empty client picker | `CLIENT_USER_MESSAGES.emptyUsers` | `/org/{orgId}/clients/{clientId}`, and the new-request modal's client person picker | Nobody from this client has been invited yet. |

**Reused, not added.** Messages this spec's requirements and test cases assert without changing
them. The text below is the text in `packages/validation` today, and it is restated here so a
case author asserting a body never leaves this document.

| Context | Export | Route that emits it | Message |
|---|---|---|---|
| Any refusal by `CapabilityGuard` | `TEMPLATE_MESSAGES.generic.forbidden` | in this spec: `POST …/requests/{id}/reassign` and the guard-gated staff routes of TC-02-INT-08 | You do not have permission to manage templates |
| `scope=all` by a client user | `REQUEST_MESSAGES.scopeForbidden` | `GET …/requests` | You do not have permission to view other people's requests |
| Create attempted by a client user | `REQUEST_MESSAGES.createForbidden` | `POST …/requests` | You do not have permission to create requests |
| Grant attempted by a client user | `REQUEST_MESSAGES.notYoursToGrant` | `POST …/requests/{id}/grant` | Only the person who asked can confirm this |
| Cancel attempted by a client user | `REQUEST_MESSAGES.notYoursToCancel` | `POST …/requests/{id}/cancel` | Only the person who asked can cancel this |
| Edit attempted by a client user | `REQUEST_MESSAGES.editForbidden` | `PATCH …/requests/{id}` | You do not have permission to edit this request |
| Addressee malformed | `REQUEST_MESSAGES.assigneeInvalid` | `POST …/requests`, `/reassign` | Choose who this request is for |
| Message body missing / too long | `REQUEST_MESSAGES.messageRequired` / `…messageTooLong` | `POST …/messages` | Write a message / Message must be 5000 characters or fewer |
| Posting on a terminal request | `REQUEST_MESSAGES.threadClosed` | `POST …/messages` | This request is closed |
| Transition from a terminal status | `REQUEST_MESSAGES.alreadyTerminal` | every transition route | This request has already been closed |
| A second answer, from `answered` | `REQUEST_MESSAGES.invalidTransition` | every transition route | This request cannot move to that state |
| Decline reason missing / too long | `REQUEST_MESSAGES.declineReasonRequired` / `…declineReasonTooLong` | `POST …/decline` | Say why you cannot provide this / Reason must be 1000 characters or fewer |
| Invitation role not one of the five | `MESSAGES.role.invalid` | `POST /api/invitations` | Invalid role |
| A superseded or used invitation token | `INVITE_MESSAGES.tokenInvalid` | `POST /api/invitations/accept` | This invitation is no longer valid |
| Invite attempted without permission, for a body that is not a client invitation | `INVITE_MESSAGES.permissionDenied` | `POST /api/invitations` | You do not have permission to invite members |
| An address that already holds an active `Membership` is invited as staff | `INVITE_MESSAGES.alreadyMember` | `POST /api/invitations` | This person is already a member of your organization |
| Login with no active principal of either kind | `AUTH_MESSAGES.deactivated` | `POST /api/login` | Your account has been deactivated. Contact your administrator. |

## UI Description

| State | Behaviour |
|---|---|
| Client user, sidebar | Exactly one row, Requests: `sidebar-requests-link` is the only navigation **destination** the sidebar draws, and every other navigation id the sidebar can draw is absent from the DOM — `nav-members`, `nav-projects`, `nav-clients`, `nav-time-tracking`, `nav-envelopes`, `nav-documents`, `nav-outbox`, `nav-settings` and `settings-tab-holidays` among them. Nothing is drawn from a role lookup for this caller (requirement 12), so a navigation row added later is absent here without this row being edited. |
| Client user, Requests badge | The Requests row carries its badge, `sidebar-requests-badge`, counting the non-terminal requests addressed to that client user and nothing else — no vacation count, which a client principal holds no capability to see. It is absent at zero, as it is for staff. **Decided:** the badge is drawn for a client principal, and the absolute above is a rule about navigation destinations only, which the badge is not; rejected: suppressing the badge for a client principal, which would hide the work waiting on exactly the caller whose whole surface is that one inbox. |
| Client user, request list | No scope control, no New Request; status filter only. |
| Client user, request detail | No History panel; Answer and Decline only; Grant, Reassign, Cancel and Edit absent. |
| Client user, terminal request | Composer absent, both action controls absent, thread readable. |
| Staff, client detail, People section | Drawn only for a caller holding `manage-client-users`, always with the invite control. **Decided:** there is no read-only rendering — one capability gates both the section and the control, and a staff caller without it is refused by the API (`403 manageForbidden`). Rejected: a read-only People section, which no role could reach, since `manage-client-users` and `view-clients` are held by the same two roles. |
| Pending invitation row | Drawn as `client-user-pending-row-{email}`, showing the address and the status `invited`, with **no control**. **Decided:** the row is keyed by the invited address, which is what the People payload carries for a pending invitation; rejected: keying it by an id, which would mean adding one to that payload for a row that has no action on it. **Decided:** a pending invitation is not revoked from this screen — re-inviting the same address supersedes it (requirement 19) and it expires on its own after seven days. Rejected: a Remove control on the pending row, which would need a revoke route and a refusal message that this spec does not define. |
| Empty People list | `client-users-empty-state` with `emptyUsers`. |
| New-request modal, addressee kind `client` | The person picker is filtered to active users of the selected project's client. When that client has none, the picker is empty and `request-new-assignee-client-empty` is drawn with `CLIENT_USER_MESSAGES.emptyUsers`. |

## Required `data-testid` Attributes

**Client detail, People** — `client-users-section`, `client-users-invite-btn`,
`client-users-empty-state`, `client-user-row-{id}`, `client-user-row-{id}-status`,
`client-user-row-{id}-remove-btn`, `client-user-pending-row-{email}`,
`client-user-invite-modal`, `client-user-invite-email`,
`client-user-invite-submit`, `client-user-invite-error-email`.

**New request** — `request-new-assignee-kind`, `request-new-assignee-client`,
`request-new-assignee-client-empty`, `request-new-project`,
`request-new-error-assigneeClientMembershipId`.

**Client's own surface** — `requests-page`, `request-row-{id}`, `request-detail-page`,
`request-detail-thread`, `request-detail-composer`, `request-detail-composer-submit`,
`request-detail-answer-btn`, `request-detail-decline-btn`, `request-detail-decline-reason`,
`request-detail-decline-confirm`, `request-detail-history`, `request-detail-grant-btn`,
`requests-scope-toggle`, `requests-new-btn`, `nav-members`, `sidebar-requests-link`,
`sidebar-requests-badge`.

Five ids in the last group — `request-detail-history`, `request-detail-grant-btn`,
`requests-scope-toggle`, `requests-new-btn` and `nav-members` — are asserted **absent** for a
client principal, in TC-02-E2E-01 and TC-02-E2E-03, and **present** for a staff one, in
TC-02-E2E-02 and TC-02-E2E-05. `sidebar-requests-badge` is asserted both ways for a client
principal, because the badge is drawn only for a non-zero count: absent in TC-02-E2E-01, where
nothing is addressed to them yet, and present in TC-02-E2E-03, where a request is. Every other
id in that group is asserted present for a client principal. **Decided:** the absent set is
named here; rejected: deriving it from a position in the list, which counted five ids the cases
assert present for a client principal.

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
| **Every state that needs a request addressed to a client user is `not run` below.** | The principal, the invitation and the guards are provable today and were proved; what is unprovable is unprovable because the column and the table it hangs off are this spec's own work, not because it was skipped. | Walking those rows at the start of this spec's implementation, once `ClientMembership` and `Request.assigneeClientMembershipId` exist, and filling them in before the cases that need them are trusted. |
| Login refuses an account with no active principal with a different message than it refuses a wrong password on an account that has one, which is an account-existence oracle. The principal is checked **before** the password, so a valid and a wrong password on such an account are answered identically — that ordering is the property requirement 6 preserves. | **Pre-existing**, observed while probing this spec and not introduced by it. Narrowing it changes a message user-management spec 02 owns. | An amendment to user-management spec 02 making the two refusals identical. Named here so it is not rediscovered as this spec's defect. |
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

**This spec's route is walked in two parts.** Everything reachable at spec time was walked then
and is recorded as observed. Everything that needs a state this spec itself creates — a
`ClientMembership`, or a request addressed to one — is marked `not run`, and is walked at the
start of this spec's implementation.

### Bringing it up

Identical to spec 01's, including the two environment repairs (`prisma generate` from
`apps/api`, `npm run build --workspace @devscribed/validation`) that a fresh checkout after the
`organization/01` merge needs. Ports `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1`, database
`devscribed_e2e` at `localhost:5433`, which is the port the tracked harness defaults to.

### Reaching the states the cases need

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| An organization with an admin | `signupOrg` (`e2e/tests/helpers.ts:734`) | yes | yes |
| A `Client` | `POST …/clients` | yes | yes — and the body is `{ "client": {…} }`, not the client itself; the helper this spec owes must unwrap `.client` |
| A project linked to that client | `PUT …/projects/{id}` with `clientId` | yes | yes — 200 |
| **An account with no `Membership`** | `createBareAccount` (`helpers.ts:898`) | yes | yes |
| **What login does with such an account** | `POST /api/login` | yes | yes — `400 {"message":"Your account has been deactivated. Contact your administrator."}`, reproduced across two runs. This is the exact refusal requirement 6 changes and AC-11 pins. |
| **The refusal shape with no session at all** | `GET …/requests`, `…/clients`, `…/members` with an empty cookie jar | yes | yes — all three answer `401 {"message":"Not signed in","error":"Unauthorized","statusCode":401}` |
| A staff invitation and its token | `inviteAndAcceptViaApi` (`helpers.ts:921`), `latestInvitationToken` (`:794`) | yes | yes |
| Mail readable by a test | `GET /api/test/mail/latest?email=&type=` | yes | yes — 200 |
| A `ClientMembership` | — | no | **not run** — created by this spec. Helper `inviteAndAcceptClientViaApi`, a thin variant of `inviteAndAcceptViaApi`, is work this spec owes. |
| A request addressed to a client user | — | no | **not run** — nothing can be addressed to a client user until `Request.assigneeClientMembershipId` exists, which is this spec's column |
| A request in each status, addressed to a client user | — | no | **not run** — same reason |
| A removed client user holding a live session | — | no | **not run** — depends on this spec's own remove route |

### Access this needs

| What | Name | Where the value lives | How the next agent gets it | Proven against |
|---|---|---|---|---|
| — | — | — | — | Nothing. No third-party system, no API key, no MCP server. Mail is the in-memory sink. No credential exists for this spec to obtain and none appears in any tracked file. |

### Observing each criterion

| Acceptance criterion | Observer | Level | Proven at spec time |
|---|---|---|---|
| AC-1 | TC-02-E2E-01 | E2E | login path observed; the membership half is not run |
| AC-2 | TC-02-E2E-01 | E2E | `nav-members` confirmed unconditional in `Sidebar.tsx` — the defect is real today |
| AC-3 | TC-02-E2E-05 | E2E | staff sidebar reachable today |
| AC-4 | TC-02-INT-03, TC-02-INT-04 | Integration | not run |
| AC-5 | TC-02-INT-09 | Integration | the surfaces the case compares all exist today; the client half is not run |
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
- **Expected Result:** 200; the mail names the organization, the client and the inviter and
  carries the link; a `ClientMembership` exists with `status = 'active'`; the invitation is
  `used`.

### TC-02-INT-02

- **Level:** Integration
- **Steps:** Invite with `role=client` and no `clientId`; with `role=user` and a `clientId`; for
  an archived client; as a `user`, with `role=client` and the active client's `clientId`; as the
  same `user`, with `role=client` and **no** `clientId`; as the same `user`, with `role=user` and
  no `clientId`.
- **Expected Result:** 400 `invitationShapeInvalid`; 400 `invitationShapeInvalid`; 400
  `clientArchived`; 403 `manageForbidden`; 403 `manageForbidden` again — the permission refusal
  precedes the shape rule, so a malformed client body from a caller without the capability is
  never answered 400 `invitationShapeInvalid`; 403 `INVITE_MESSAGES.permissionDenied`, spec 03's
  refusal unchanged for a body that is not a client invitation. No invitation row written in any
  case.

### TC-02-INT-03

- **Level:** Integration
- **Steps:** Invite an address that is already an active staff member as a client user of an
  active client, then accept that invitation.
- **Expected Result:** the invitation is minted, 200, and not refused with 400
  `INVITE_MESSAGES.alreadyMember` (requirement 19a); accepting it answers 409 `accountIsStaff`;
  no `ClientMembership`; the invitation is still `pending`.

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
- **Steps:** Sign a client user in, call `GET /api/me`, then remove them, then reuse the same
  cookie jar.
- **Expected Result:** `GET /api/me` answers 200 with `principalKind: 'client'`, `role: null` and
  the organization (requirement 11a); after removal the next call answers 401; a fresh login
  answers 400 with the existing message. `ClientMembership.status` is `removed` and the
  account's `securityStamp` differs from before.

### TC-02-INT-07

- **Level:** Integration
- **Steps:** `POST /api/login` for: an account with no principal at all; an account whose
  `ClientMembership` is `removed`; an account whose `Membership` is `removed`.
- **Expected Result:** all three answer `400` with the body observed at spec time, byte for byte
  (AC-11). No response distinguishes the three causes.

### TC-02-INT-08

- **Level:** Integration
- **Steps:** As a client user, call the guard-gated staff routes — `GET …/document-templates`,
  `GET …/envelopes`, `GET …/outbox`, `GET …/settings/signing` and
  `POST …/requests/{id}/reassign`. Then the staff routes that resolve their caller from
  `Membership` in their own service — `GET …/members`, `GET …/projects`, `GET …/time-entries`,
  `GET …/members/{memberId}/vacation` and `GET …/clients`. Then one org-scoped request they are
  not party to.
- **Expected Result:** the first group answers 403 with the fixed forbidden body
  (`TEMPLATE_MESSAGES.generic.forbidden`); the second group answers
  `403 {"message":"Forbidden","statusCode":403}` (requirement 14a); the request answers 404. No
  route returns data.

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
- **Steps:** On one client holding two active client users, address **two** requests to the
  first on a project of that client — both created while that user is still active, since
  requirement 27 refuses a removed addressee — and only then remove that user. Reassign the
  first request to a member and the second to the client's other active client user.
- **Expected Result:** each request stays `open` and reads `assignee.inactive: true` while its
  addressee is removed. Reassigning to a member answers 200, leaves the row with
  `assigneeKind = 'member'`, and writes `assignee_changed` with both display-name snapshots.
  Reassigning to the other active client user answers 200, leaves the row with
  `assigneeKind = 'client'` and `assigneeClientMembershipId` that user's, and writes
  `assignee_changed` carrying both display names in `oldLabel` / `newLabel` (requirement 23).

### TC-02-INT-13

- **Level:** Integration
- **Steps:** Trigger both new mail types and read the sink.
- **Expected Result:** `client_invitation` and `request_assigned_to_client` are present; neither
  body contains the request description nor any member email address (AC-12).

### TC-02-INT-14

- **Level:** Integration
- **Steps:** As a client user, `GET …/requests` with no query, then `scope=all`, then
  `POST …/requests`.
- **Expected Result:** 200 with only requests addressed to them, carrying
  `counts.waitingOnMe` equal to the non-terminal ones among them and no `vacation` key
  (requirement 30); 403 `scopeForbidden`; 403 `createForbidden`.

### TC-02-INT-15

- **Level:** Integration
- **Steps:** Invite an address as a staff `user`, then invite the same address as a client user
  of an active client. Then attempt to accept the first (staff) token, and then the second
  (client) token. Covers edge case 3.
- **Expected Result:** the staff invitation's status is `invalidated` and the client one is
  `pending`; accepting the staff token answers 400 `INVITE_MESSAGES.tokenInvalid` and writes no
  membership of either kind; accepting the client token creates the `ClientMembership` and marks
  its invitation `used`.

### TC-02-INT-16

- **Level:** Integration
- **Steps:** Mint a client invitation for an address and client, then mint a second for the same
  address and client, keeping both tokens — the second supersedes the first (requirement 19).
  Accept the surviving token, then the superseded one. Then mint a third client invitation for
  the same address, now an active client user (requirement 19a), and accept that token too.
- **Expected Result:** the first acceptance creates exactly one `ClientMembership` and marks its
  invitation `used`; the superseded token answers 400 `INVITE_MESSAGES.tokenInvalid` and creates
  nothing; the third invitation is created, and accepting its token answers 409 `accountIsClient`
  and creates nothing. Exactly one `ClientMembership` exists for that address at the end — the
  acceptance guarantee edge case 21 rests on. The number of `pending` rows left behind is not
  asserted — this spec makes no serialization guarantee at invitation time.

### TC-02-INT-17

- **Level:** Integration
- **Steps:** With an active client user holding requests addressed to them, archive their
  `Client`. Then log in as that user, list their requests, and attempt to address a new request
  to them. Covers edge case 22 and the success half of requirement 24.
- **Expected Result:** login answers 200 and the session resolves; `GET …/requests` returns
  their existing requests; the `ClientMembership` is still `active` and its session was never
  revoked; creating a new request addressed to them answers 400 `clientUserUnavailable`.

### TC-02-INT-18

- **Level:** Integration
- **Steps:** As the client user addressee, on a request that is `open`: `POST …/cancel`,
  `PATCH …/requests/{id}` and `POST …/requests/{id}/reassign`. On the same request once it is
  `answered`: `POST …/answer` a second time. On a request in a terminal status:
  `POST …/messages` and `POST …/answer`.
- **Expected Result:** 403 `notYoursToCancel`; 403 `editForbidden`; 403 with the guard's fixed
  body (requirement 29); 409 `invalidTransition`; 409 `threadClosed`; 409 `alreadyTerminal`.
  After all six the requests' statuses, fields and message counts are unchanged, and the
  terminal request is still readable by that client user.

### TC-02-INT-19

- **Level:** Integration
- **Steps:** On one client holding an active client user, a removed client user and a pending
  client invitation, call `GET …/clients/{clientId}/users` as an admin, as a `user`, and as a
  `user` for a `clientId` that does not exist; then as an admin for a client of another
  organization. Then call `PATCH …/clients/{clientId}/users/{clientMembershipId}/remove` as a
  `user`, and as an admin for a client membership of another organization.
- **Expected Result:** 200 whose `users` carries the active and the removed row with `id`,
  `displayName`, `email`, `status` and `joinedAt`, and whose `pendingInvitations` carries the
  invited address and its `expiresAt`; 403 `manageForbidden`; 403 `manageForbidden`
  byte-identical to the previous answer, so the absent client is not distinguishable
  (requirement 9a); 404; 403 `manageForbidden`; 404. No `ClientMembership` changes status in any
  refused call.

### TC-02-E2E-01

- **Level:** E2E
- **Steps:** Open the invite modal and submit a malformed email first, then a valid one; accept
  through the invitation screen; then sign out and sign in at the ordinary login screen; then,
  still signed in as the client user, type `/org/{orgId}/members`.
- **Expected Result:** the malformed address shows the inline field error and the submit control
  stays enabled; the valid one creates the invitation and draws the invited address as a pending
  row with the status `invited` and no control. Accepting lands on
  `/org/{orgId}/requests` without a second sign-in, and signing in afterwards lands on the same
  route (requirement 13a); on both arrivals the Requests page renders, the sidebar has exactly
  one row, `nav-members` is absent from the DOM, the Requests row carries no badge because
  nothing is addressed to that client user yet, and neither the scope control nor New Request
  is drawn. Typing the members URL lands on `/org/{orgId}/requests` with the Requests page drawn
  and no members screen (requirement 14b).
- **Selectors:** `client-users-section`, `client-users-invite-btn`, `client-user-invite-modal`,
  `client-user-invite-email`, `client-user-invite-error-email`, `client-user-invite-submit`,
  `client-user-pending-row-{email}`, `client-user-row-{id}`,
  `client-user-row-{id}-status`, `sidebar-requests-link`, `requests-page`, `nav-members`
  (asserted absent), `sidebar-requests-badge` (asserted absent), `requests-scope-toggle`
  (asserted absent), `requests-new-btn` (asserted absent).

### TC-02-E2E-02

- **Level:** E2E
- **Steps:** As a `user`, open the requests page and start a new request addressed to a client
  user, choosing the addressee kind and then the project: first a project whose client has no
  client users, then a project of the wrong client, then the right one. Open the created
  request.
- **Expected Result:** `requests-new-btn` is drawn; the client with no users leaves the person
  picker empty and draws the hint carrying `emptyUsers`; the wrong client shows the inline error
  and the submit control stays enabled; the right one creates the request. On the created
  request the History panel and the Grant control are drawn for the requester — the staff half
  of the ids TC-02-E2E-03 asserts absent for a client principal.
- **Selectors:** `requests-new-btn`, `request-new-assignee-kind`, `request-new-project`,
  `request-new-assignee-client`, `request-new-assignee-client-empty`,
  `request-new-error-assigneeClientMembershipId`, `request-detail-page`,
  `request-detail-history`, `request-detail-grant-btn`.

### TC-02-E2E-03

- **Level:** E2E
- **Steps:** As the client user, open the request **from the inbox row**, post a reply, click
  **I have provided this**; then on a second request click **I cannot provide this** and submit a
  reason.
- **Expected Result:** on arriving at the inbox the Requests row carries its badge, reading the
  two open requests addressed to them; the first reaches `answered`, the second `declined` with
  the reason last in the thread; on both, the History panel and the Grant control are absent
  throughout.
- **Selectors:** `requests-page`, `sidebar-requests-badge`, `request-row-{id}`,
  `request-detail-page`,
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
- **Steps:** Sign in as each of admin, manager, user and viewer and inspect the sidebar. As the
  admin, open the requests page, then open a client's detail.
- **Expected Result:** `nav-members` is present for all four staff roles — the regression witness
  that requirement 13's fix did not over-reach; the scope control is drawn for the admin, whose
  role holds `view-all-requests`; the People section renders for the admin with its invite
  control. What a `user` sees of the People section is not asserted here — a `user` reaches no
  client detail at all — and the refusal the gating rests on is TC-02-INT-19's.
- **Selectors:** `nav-members`, `sidebar-requests-link`, `requests-page`,
  `requests-scope-toggle`, `client-users-section`, `client-users-invite-btn`,
  `client-users-empty-state`.
