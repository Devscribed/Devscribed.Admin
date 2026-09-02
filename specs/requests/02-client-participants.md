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
  - "POST /api/invitations"
  - "POST /api/invitations/accept"
  - "POST /api/login"
  - "GET /api/me"
entities: [ClientMembership, Invitation, Request, RequestMessage, RequestEvent]
tags: [client, client-user, principal, invitation, capability-guard, navigation, session, request]
depends-on: ["requests/01", "organization/01", "user-management/03"]
bundle:
  - 02-client-participants.contracts.md
  - 02-client-participants.cases.md
---

# 02 — Client Participants

## Summary

A person at a client signs in to this product like anyone else: an email, a password, a session
cookie, the same login screen. What differs is what links them to the organization — a
**`ClientMembership`** bound to a `Client`, not a `Membership`. That choice is the whole spec:
`Membership` means "member of staff" everywhere it is read, and widening it would put a client
row into vacation accrual, the members list, project assignment and time tracking, where nothing
would crash and everything would be quietly wrong.

With the principal in place, a client can be the addressee of a request. They see one screen —
the requests addressed to them — and nothing else of the organization.

## Actors & Preconditions

| Actor | Preconditions |
|---|---|
| **Admin / manager** | Active staff member holding `manage-client-users`. Invites and removes client users. |
| **Client user** | An `Account` plus an active `ClientMembership` bound to a `Client` of the organization, whatever that client's status. Holds a session like staff; holds no `Membership`. |
| **Client** | A `Client` row of the organization. Its status bears on being invited for and being addressed, never on holding a principal. |
| **Project** | A `Project` whose `clientId` is that client, required before a request can be addressed to one of its users. |

## Roles & Permission Matrix

The client is **not a fifth role.** `Membership.role` and `ROLE_CAPABILITIES` stay staff-only, so
no role-keyed lookup gains an entry a `Membership` could carry. Capability is resolved from the
principal kind first (REQ-02-009).

| Capability | admin | manager | user | viewer | client user |
|---|---|---|---|---|---|
| `manage-client-users` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `view-own-requests` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `create-request` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `view-all-requests` | ✅ | ✅ | ❌ | ❌ | ❌ |
| Address a request to a client user | ✅ | ✅ | ✅ | ❌ | ❌ |
| Post a message on a request I am party to | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mark `answered` / `declined` on a request addressed to me | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mark `granted` | requester or admin | requester | requester | requester | ❌ |
| Reassign an `open` or `answered` request | ✅ | ✅ | ❌ | ❌ | ❌ |
| Cancel a request | requester or admin | requester | requester | requester | ❌ |
| Edit a request while `open` or `answered` | requester or admin | requester | requester | requester | ❌ |
| Members, projects, time tracking, vacation, documents, clients, settings | per their role | | | | ❌ |

A client user's capability set is exactly `{ ViewOwnRequests }`. Everything else they may do is an
actor rule of being the addressee, not a capability.

## Functional Requirements

### The principal

#### REQ-02-001 — the link

THE SYSTEM SHALL link one `Account` to one `Client` within one `Organization` through a
`ClientMembership` whose `status` is `active` or `removed`.

#### REQ-02-002 — what a client invitation's acceptance does, by the row the account holds

WHEN a `role = 'client'` invitation is accepted, THE SYSTEM SHALL re-read both membership tables
inside the accept transaction and decide by the pair of rows found, as the table decides.

`accountId` is unique **per table**, so an account holds at most one `Membership` and at most one
`ClientMembership` and the two are independent: the staff row and the client row are separate keys,
and every pair of their states is a state this product reaches.

`decision-table: keys=(staffRow, clientRow) domains=(staffRow: none|active|removed, clientRow: none|active|removedBoundClient|removedOtherClient)`

| staffRow | clientRow | Outcome |
|---|---|---|
| none | none | The `ClientMembership` is created `active`; the invitation becomes `used`. |
| none | active | `409 CLIENT_USER_MESSAGES.accountIsClient`. Nothing is written; the invitation stays `pending`. |
| none | removedBoundClient | That row is restored (REQ-02-023); no second row is created. |
| none | removedOtherClient | `409 CLIENT_USER_MESSAGES.accountLinkedToAnotherClient`. Nothing is written. |
| active | none | `409 CLIENT_USER_MESSAGES.accountIsStaff`. Nothing is written; the invitation stays `pending`. |
| active | active | `409 CLIENT_USER_MESSAGES.accountIsStaff` — the staff row is inspected first. |
| active | removedBoundClient | `409 CLIENT_USER_MESSAGES.accountIsStaff` — the staff row is inspected first. |
| active | removedOtherClient | `409 CLIENT_USER_MESSAGES.accountIsStaff` — the staff row is inspected first. |
| removed | none | The `ClientMembership` is created `active`; the removed staff row is untouched. |
| removed | active | `409 CLIENT_USER_MESSAGES.accountIsClient`. Nothing is written. |
| removed | removedBoundClient | That row is restored (REQ-02-023); the removed staff row is untouched. |
| removed | removedOtherClient | `409 CLIENT_USER_MESSAGES.accountLinkedToAnotherClient`. Nothing is written. |

**Decided:** an **active** staff row decides before the client row is read, so the four `active`
rows answer one refusal. Rejected: reading the client row first, which would answer
`accountIsClient` to an account that is plainly staff.

**Decided:** a `removed` row of the other kind does not refuse — a person who left the agency and
now works for a client is a real case, and only two **active** principals make a capability
question ambiguous. Rejected: refusing whenever any row of the other kind exists.

**Decided:** a `removed` client row bound to the invited client is restored rather than duplicated.
Rejected: inserting a second row, which `accountId @unique` turns into a 500; and rejected:
refusing every re-admission, which leaves a removed client user no way back.

**Decided:** a fresh invitation naming a different client refuses rather than rebinding. Rejected:
rewriting `clientId`, which would move a row that the old client's requests still resolve through
and would leave a request addressed to a membership of another client.

#### REQ-02-003 — what a staff invitation's acceptance does about a client row

WHEN a staff-role invitation is accepted, THE SYSTEM SHALL decide by the `ClientMembership` the
account holds, as the table decides.

`decision-table: keys=(heldClientRow) domains=(heldClientRow: none|active|removed)`

| heldClientRow | Outcome |
|---|---|
| none | This spec adds no check; the staff acceptance proceeds and writes no `ClientMembership`. |
| active | `409 CLIENT_USER_MESSAGES.accountIsClient`. Nothing is written; the invitation stays `pending`. |
| removed | This spec adds no check; the staff acceptance proceeds and the removed client row is untouched. |

#### REQ-02-004 — the principal is not in the cookie

THE SYSTEM SHALL resolve the principal kind from the database on every request, leaving
`SessionPayload` (`apps/api/src/auth/session.service.ts`) carrying
`{ accountId, organizationId, securityStamp }` and no principal kind.

#### REQ-02-005 — the session guard is untouched

THE SYSTEM SHALL authenticate a client account through the existing `SessionGuard`
(`apps/api/src/auth/session.guard.ts`), which reads `Account.securityStamp` and no membership.

### Signing in

#### REQ-02-006 — either row resolves a principal

WHEN an account presents a correct password and holds an active `Membership` or an active
`ClientMembership`, THE SYSTEM SHALL establish the session and answer `200`.

#### REQ-02-007 — no principal, one refusal

IF an account holds neither an active `Membership` nor an active `ClientMembership`, THEN THE
SYSTEM SHALL refuse login with `400 AUTH_MESSAGES.deactivated`, whichever cause it has.

#### REQ-02-008 — the principal is resolved before the password

THE SYSTEM SHALL resolve the principal before verifying the password, so a correct and an
incorrect password on an account with no active principal are answered identically.

#### REQ-02-009 — the organization comes from the resolving row

THE SYSTEM SHALL take the session's `organizationId` from whichever row resolved the principal.

### Capabilities and guards

#### REQ-02-010 — the guard resolves the principal first

WHEN `CapabilityGuard` (`apps/api/src/auth/capability.guard.ts`) decides, THE SYSTEM SHALL take
the capability set from `ROLE_CAPABILITIES` for an active `Membership`, from `CLIENT_CAPABILITIES`
for an active `ClientMembership`, and refuse a caller with neither with
`403 TEMPLATE_MESSAGES.generic.forbidden`, which names no resource and no capability.

#### REQ-02-011 — a named refusal means a service check

WHERE a route answers `403 CLIENT_USER_MESSAGES.manageForbidden`, THE SYSTEM SHALL check
`manage-client-users` in the service and before reading the client or the membership named in the
URL, so that refusal is identical for an id that exists and one that does not.

**Decided:** one refusal whichever principal the caller is, staff or client. Rejected: a distinct
answer for a client principal, which would tell a caller which kind of account they hold from a
route neither kind may use.

#### REQ-02-012 — the client capability list

THE SYSTEM SHALL define `CLIENT_CAPABILITIES` as a flat readonly list holding exactly
`ViewOwnRequests`, with no role dimension.

#### REQ-02-013 — no membership query gains a client

THE SYSTEM SHALL return no `ClientMembership` row from any query that reads `Membership`.

### Navigation

#### REQ-02-014 — the session endpoint resolves either principal

WHEN `GET /api/me` is called with a valid session, THE SYSTEM SHALL answer `200` carrying
`principalKind` — `"staff"` with the role for an active `Membership`, `"client"` with `role: null`
and the organization of the `ClientMembership` for an active client row — and a `null` body for an
account with neither.

**Decided:** `role` is `null` for a client principal. Rejected: `role: "client"`, which would put a
client value into a role-keyed lookup that REQ-02-012 exists to keep staff-only.

#### REQ-02-015 — one sidebar row

WHERE `principalKind` is `client`, THE SYSTEM SHALL draw exactly one sidebar row, Requests, and
draw no row from a role lookup.

#### REQ-02-016 — the members row becomes staff-only

THE SYSTEM SHALL draw `nav-members` only for a staff principal, replacing the unconditional
rendering in `apps/web/src/layout/Sidebar.tsx`.

#### REQ-02-017 — where a principal lands

WHEN a session is established by login or by accepting an invitation, THE SYSTEM SHALL send a
client principal to `/org/{orgId}/requests` and a staff principal to `/org/{orgId}/members`.

#### REQ-02-018 — a client principal on a staff URL

WHEN a client principal opens an `/org/{orgId}/…` route other than `/org/{orgId}/requests` and
`/org/{orgId}/requests/{requestId}`, THE SYSTEM SHALL redirect them to `/org/{orgId}/requests` and
render no staff screen.

#### REQ-02-019 — the redirect is never the gate

THE SYSTEM SHALL refuse a client principal with `403` on every capability-gated staff route,
independently of what any screen draws.

### Inviting a client user

#### REQ-02-020 — the invitation carries a client

THE SYSTEM SHALL accept `role = 'client'` with a `clientId` on `POST /api/invitations`, reusing the
`Invitation` model in `apps/api/prisma/schema.prisma` with its token, its SHA-256 storage and its
seven-day expiry.

#### REQ-02-021 — the shape rule, and when it is applied

IF a body carries `role = 'client'` without a `clientId`, or a `clientId` without
`role = 'client'`, THEN THE SYSTEM SHALL answer `400 CLIENT_USER_MESSAGES.invitationShapeInvalid`,
applied only to a caller who has already passed the permission check of REQ-02-011.

#### REQ-02-022 — an archived client may not be invited for

IF the `clientId` names a client whose status is not `active`, THEN THE SYSTEM SHALL answer
`400 CLIENT_USER_MESSAGES.clientArchived`.

#### REQ-02-023 — what a restore writes

WHEN REQ-02-002 restores a `removed` `ClientMembership`, THE SYSTEM SHALL keep the row and its
`id`, set `status` to `active`, set `removedAt` and `removedByAccountId` to `null`, set `joinedAt`
to the acceptance time, set `invitedByMembershipId` to the sender of the accepted invitation, and
write neither `clientId` nor `organizationId`.

#### REQ-02-024 — one live invitation per address

THE SYSTEM SHALL keep at most one live `pending` invitation per email address per organization,
whichever kind it is, superseding the previous one, whose token then answers
`400 INVITE_MESSAGES.tokenInvalid`.

#### REQ-02-025 — invitation time inspects no client row

WHEN an invitation is minted, THE SYSTEM SHALL inspect no `ClientMembership`, so an address holding
an active client row is minted a client invitation and a staff invitation alike and the refusal
comes at acceptance.

#### REQ-02-026 — the staff refusal, for a staff body

IF a body invites an address that already holds an active `Membership` as staff, THEN THE SYSTEM
SHALL answer `400 INVITE_MESSAGES.alreadyMember`.

#### REQ-02-055 — a client body is minted whatever the address holds

WHEN a body carries `role = 'client'`, THE SYSTEM SHALL mint, store and mail the invitation
whatever `Membership` that address holds, leaving the refusal to acceptance (REQ-02-002).

#### REQ-02-027 — the invitation mail

WHEN a client invitation is minted, THE SYSTEM SHALL send a `client_invitation` mail after commit
naming the organization, the client, the inviter and the accept link, and carrying no project, no
request and no member email address.

### Removing a client user

#### REQ-02-028 — removal is soft and immediate

WHEN a caller holding `manage-client-users` removes a client user, THE SYSTEM SHALL set the
`ClientMembership` status to `removed` and rotate `Account.securityStamp` in the same transaction,
keeping the row so historical requests, messages and events resolve the person's name.

#### REQ-02-029 — removing a removed row

IF the named `ClientMembership` is already `removed`, THEN THE SYSTEM SHALL answer `204`, write
nothing and rotate no stamp.

**Decided:** the call is idempotent. Rejected: refusing it, which a stale tab reaches from a screen
that draws removed rows, with no answer a person could act on.

#### REQ-02-030 — a request addressed to a removed client user

WHILE a client user is `removed`, THE SYSTEM SHALL leave an `open` or `answered` request addressed
to them in its status, report `assignee.inactive: true` on it, and offer it for reassignment to a
member or to another active client user of the project's client.

#### REQ-02-031 — archiving a client touches no membership

WHEN a `Client` is archived, THE SYSTEM SHALL change no `ClientMembership` row and revoke no
session.

### Addressing a request to a client user

#### REQ-02-032 — the addressee column

THE SYSTEM SHALL accept `assigneeKind = 'client'` with `assigneeClientMembershipId` and exactly one
of the two addressee ids set, refusing any other combination with
`400 REQUEST_MESSAGES.assigneeInvalid`.

#### REQ-02-033 — a client request needs a project

IF a request is addressed to a client user, by creation or by reassignment, and carries no
`projectId`, THEN THE SYSTEM SHALL answer `400 REQUEST_MESSAGES.projectRequiredForClient`.

#### REQ-02-034 — the project's client must be theirs

IF a request is addressed to a client user, by creation or by reassignment, and its project's
`clientId` differs from the addressee's `clientId`, THEN THE SYSTEM SHALL answer
`400 REQUEST_MESSAGES.contactProjectMismatch`.

#### REQ-02-035 — only an active user of an active client

IF the chosen client user is `removed` or their `Client` is not `active`, THEN THE SYSTEM SHALL
answer `400 REQUEST_MESSAGES.clientUserUnavailable`.

#### REQ-02-036 — authorship and actorship

THE SYSTEM SHALL accept `client` as a value of `RequestMessage.authorKind` and
`RequestEvent.actorKind`, with `authorClientMembershipId` and `actorClientMembershipId` set to
match, and snapshot display names into `oldLabel` and `newLabel` as it does for a member.

#### REQ-02-037 — a client addressee may post

WHILE the request is `open` or `answered`, WHEN the client addressee posts a message of 1–5000
characters, THE SYSTEM SHALL store it with `authorKind = 'client'` and answer `201`.

#### REQ-02-038 — the thread closes with the request

IF the client addressee posts a message on a request in a terminal status, THEN THE SYSTEM SHALL
answer `409 REQUEST_MESSAGES.threadClosed` and draw no composer.

#### REQ-02-039 — answering

WHILE the request is `open`, WHEN the client addressee answers it, THE SYSTEM SHALL move it to
`answered`, write a `status_changed` event in the same transaction, and answer `200`.

#### REQ-02-040 — a second answer

IF the client addressee answers a request already `answered`, THEN THE SYSTEM SHALL answer
`409 REQUEST_MESSAGES.invalidTransition`.

#### REQ-02-041 — declining

WHILE the request is `open` or `answered`, WHEN the client addressee declines it with a reason of
1–1000 characters, THE SYSTEM SHALL move it to `declined`, store the reason as a `RequestMessage`
with `authorKind = 'client'` in the same transaction, and answer `200`.

#### REQ-02-042 — declining without a reason

IF a decline carries no reason, THEN THE SYSTEM SHALL answer
`400 REQUEST_MESSAGES.declineReasonRequired` and change no status.

#### REQ-02-043 — a terminal request

IF any transition is attempted on a request in a terminal status, THEN THE SYSTEM SHALL answer
`409 REQUEST_MESSAGES.alreadyTerminal` and leave the request readable to its client addressee.

#### REQ-02-044 — granting is not theirs

IF a client principal grants a request, THEN THE SYSTEM SHALL answer
`403 REQUEST_MESSAGES.notYoursToGrant` and draw no grant control.

#### REQ-02-045 — cancelling is not theirs

IF a client principal cancels a request, THEN THE SYSTEM SHALL answer
`403 REQUEST_MESSAGES.notYoursToCancel` and draw no cancel control.

#### REQ-02-046 — editing is not theirs

IF a client principal edits a request, THEN THE SYSTEM SHALL answer
`403 REQUEST_MESSAGES.editForbidden` and draw no edit control.

#### REQ-02-047 — reassignment is not theirs

IF a client principal reassigns a request, THEN THE SYSTEM SHALL answer
`403 TEMPLATE_MESSAGES.generic.forbidden` from `CapabilityGuard` and draw no reassign control.

#### REQ-02-048 — a request they are not party to

IF a client principal opens a request they are not party to, THEN THE SYSTEM SHALL answer `404`,
identical to a non-existent id.

#### REQ-02-049 — their list is scoped, and what it counts

WHEN a client principal lists requests, THE SYSTEM SHALL return only requests addressed to them,
carrying `counts.waitingOnMe` over the non-terminal ones among them and no `vacation` key.

#### REQ-02-050 — the wider scope is refused

IF a client principal asks for `scope=all`, THEN THE SYSTEM SHALL answer
`403 REQUEST_MESSAGES.scopeForbidden`.

#### REQ-02-051 — creating is refused

IF a client principal creates a request, THEN THE SYSTEM SHALL answer
`403 REQUEST_MESSAGES.createForbidden`.

#### REQ-02-052 — the event trail is withheld at the API

WHERE the viewer of a request is a client principal, THE SYSTEM SHALL omit the `events` array from
the request detail response, so the audit trail is not reachable by reading the API directly.

**Decided:** the trail is withheld by the route, not hidden by the screen. Rejected: returning it
and drawing no panel, which leaves an internal record one fetch away from a client.

#### REQ-02-056 — the controls they are not shown

WHERE the viewer of a request is a client principal, THE SYSTEM SHALL draw no History panel and no
control they cannot use on the request detail screen.

#### REQ-02-053 — the assignment mail

WHEN a request is addressed to a client user by creation or by reassignment, THE SYSTEM SHALL send
a `request_assigned_to_client` mail after commit naming the organization, the project, the request
number, the title and the needed-by date when set, and carrying neither the description nor any
member email address.

#### REQ-02-054 — no outbound call inside a transaction

THE SYSTEM SHALL run no outbound call inside a database transaction and retry neither mail type
automatically.

## State Machine

`decision-table: keys=(state, event) domains=(state: none|active|removed, event: acceptInviteForBoundClient|acceptInviteForOtherClient|adminRemoves|clientArchived)`

| state | event | Outcome |
|---|---|---|
| none | acceptInviteForBoundClient | The row is created `active` (REQ-02-002). |
| none | acceptInviteForOtherClient | The row is created `active`; with no row held there is no other client (REQ-02-002). |
| none | adminRemoves | Unreachable — no row exists for the route to name, and an id of another organization answers `404` (REQ-02-011). |
| none | clientArchived | Unreachable — no row exists to change (REQ-02-031). |
| active | acceptInviteForBoundClient | `409 CLIENT_USER_MESSAGES.accountIsClient`; the row stays `active` (REQ-02-002). |
| active | acceptInviteForOtherClient | `409 CLIENT_USER_MESSAGES.accountIsClient`; the row stays `active` (REQ-02-002). |
| active | adminRemoves | The row becomes `removed` and the stamp rotates (REQ-02-028). |
| active | clientArchived | The row stays `active` (REQ-02-031). |
| removed | acceptInviteForBoundClient | The row is restored to `active` (REQ-02-023). |
| removed | acceptInviteForOtherClient | `409 CLIENT_USER_MESSAGES.accountLinkedToAnotherClient`; the row stays `removed` (REQ-02-002). |
| removed | adminRemoves | `204`, nothing written (REQ-02-029). |
| removed | clientArchived | The row stays `removed` (REQ-02-031). |

Invariants:

1. A `ClientMembership` is created or restored only by the accept-invitation handler, in the
   transaction that marks the invitation `used`.
2. `removed` is not terminal; the transition out of it is the restore of REQ-02-023, and there is
   no restore route and no restore control.
3. Writers of a `ClientMembership` row are exactly the accept-invitation handler and the remove
   handler, each deciding on a read taken inside its own transaction.

## Out of Scope

- **A client raising a request.** `CreateRequest` is absent from `CLIENT_CAPABILITIES`.
- **A client seeing anything but their requests** — no project list, no documents, no invoices.
- **More than one client per client user.** `accountId` is unique in both membership tables.
- **A restore route or a restore control.** Re-admission is an invitation accepted (REQ-02-023).
- **Moving a removed client user to a different client.** Refused by REQ-02-002.
- **Per-client branding**, and **any staff feature for a client principal.**

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| A removed client user later invited to a different client must use a second email address | `accountId` is unique in `ClientMembership`, so the row an account holds is bound to one client for its life, and REQ-02-002 refuses the rebind rather than moving a row the old client's requests resolve through | A spec that makes `accountId` non-unique, or that rebinds with the historical resolution rewritten alongside |
| A person who is both staff and a client contact must use two email addresses | REQ-02-002 forbids two active principals for one account, and a principal switcher is a product decision nobody has asked for | A spec adding an organization and principal switcher |
| Login refuses an account with no active principal with a different message than a wrong password on an account that has one | Pre-existing, observed while probing this spec. REQ-02-008 keeps the ordering that stops it becoming a password oracle | An amendment to the login refusal, which user-management owns |
| No audit record of an invitation being sent to a client | `Invitation` rows carry their own history | Whatever closes it for staff invitations |

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| AC-1 | An invited client user signs in at the ordinary login screen and reaches the Requests page. | TC-02-E2E-01 |
| AC-2 | That user's sidebar holds one row and `nav-members` is absent from the DOM. | TC-02-E2E-01 |
| AC-3 | A staff sidebar is unchanged and `nav-members` is present for every staff role. | TC-02-E2E-05 |
| AC-4 | No account holds an active `Membership` and an active `ClientMembership` at once. | TC-02-INT-03, TC-02-INT-04 |
| AC-5 | Every query against `Membership` returns the same rows as before this spec. | TC-02-INT-09 |
| AC-6 | A client user meets `403` on capability-gated staff routes and `404` on org-scoped resources they are not party to. | TC-02-INT-08 |
| AC-7 | A request reaches a client user only when the project's client is theirs. | TC-02-INT-10 |
| AC-8 | A client user answers and declines a request addressed to them and cannot grant it. | TC-02-INT-11, TC-02-E2E-03 |
| AC-9 | Removing a client user revokes their live sessions on their next request. | TC-02-INT-06 |
| AC-10 | An open request addressed to a removed client user stays open and reads inactive. | TC-02-INT-12 |
| AC-11 | The login refusal for an account with no active principal is byte-identical whichever cause it has. | TC-02-INT-07 |
| AC-12 | Neither new mail type carries a request description or a member email address. | TC-02-INT-13 |
| AC-13 | Accepting a client invitation and marking it `used` are one transaction. | TC-02-INT-05 |
| AC-14 | A removed client user is restored on their original row for their own client and refused for another. | TC-02-INT-20 |
| AC-15 | Removing an already-removed client user changes nothing. | TC-02-INT-21 |
