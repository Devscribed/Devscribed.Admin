---
id: "03"
title: Client Participants & Client-Addressed Requests
routes:
  - "/org/{orgId}/requests"
  - "/org/{orgId}/clients/{clientId}"
  - "/login"
api:
  - "GET/POST /api/organizations/{orgId}/clients/{clientId}/contacts"
  - "DELETE /api/organizations/{orgId}/clients/{clientId}/contacts/{contactId}"
  - "POST /api/invitations/accept"
  - "POST /api/login"
  - "GET /api/me"
  - "POST /api/organizations/{orgId}/requests"
entities: [ClientMembership, Invitation, Request, RequestNotification]
tags:
  [client, client-user, principal, invitation, capability, navigation, session, notification,
   outbox, port, stakeholder]
depends-on: ["requests/01", "requests/02", "organization/01", "user-management/03"]
bundle:
  - 03-client-participants.contracts.md
  - 03-client-participants.cases.md
---

# 03 — Client Participants & Client-Addressed Requests

## Summary

A person at a client becomes a **signed-in principal of the organization**, so a developer
blocked on an access from that client can raise a request against them and watch it answered
in the product rather than in somebody's inbox. The principal is a `ClientMembership`, never
a fifth role on `Membership`: staff membership is read all over the API — vacation accrual,
the members list, project assignment, time tracking — where a client row would crash nothing
and be quietly wrong everywhere.

Two things bound the surface. A client-addressed request must name a **project** the requester
is assigned to and that belongs to the addressee's client. And a client principal sees **only
requests they are party to** — no members, no projects, no vacation, no other client.

This spec also introduces the **notification port**: every event a party should learn about
writes an outbox row in the transaction that caused it, and a `RequestNotifier` delivers them
afterwards. The adapter that ships delivers nothing, so adding email later is an adapter and a
channel value, not a migration and not a change to any rule below.

Blast radius and backward compatibility for this spec are in [README.md](README.md).

## Actors & Preconditions

| Actor | Preconditions |
|---|---|
| **Client contact** | An account holding an active `ClientMembership` of a client of the organization. Signed in. |
| **Contact manager** | An active member holding `manage-clients` (admin, manager). Invites and removes contacts. |
| **Requester** | An active member holding `create-request` who is assigned to the project the request names. |
| **Client** | An active `Client` row of the organization, with at least one active project. |

There is no non-account actor: a contact holds a session like anybody else, and this spec adds
no unauthenticated route, no token and no rate limiter.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer | client contact |
|---|---|---|---|---|---|
| Invite and remove client contacts | ✅ | ✅ | ❌ | ❌ | ❌ |
| Raise a request, to a colleague or to a client contact | ✅ | ✅ | ✅ | ❌ | ❌ |
| Read a request they are party to | ✅ | ✅ | ✅ | ✅ | ✅ |
| Read every request in the organization | ✅ | ✅ | ❌ | ❌ | ❌ |
| Mark a request answered, as its addressee | ✅ | ✅ | ✅ | ✅ | ✅ |
| Decline a request, as its addressee | ✅ | ✅ | ✅ | ✅ | ✅ |
| Mark a request granted | requester or admin | requester | requester | requester | ❌ |
| Post a message on a request they are party to | ✅ | ✅ | ✅ | ✅ | ✅ |
| Reach any organization screen other than requests | ✅ | ✅ | ✅ | ✅ | ❌ |

A client contact holds no role at all: their capabilities come from the principal kind
(REQ-03-016), so no value of `Membership.role` can produce them by accident.

## Functional Requirements

### The client principal

#### REQ-03-001 — what links a client contact to the organization

THE SYSTEM SHALL link a client contact to the organization through a `ClientMembership` row
carrying the account, the organization and the client.

**Decided:** a separate table makes every existing staff-membership query incapable of
returning a client by construction, not by a rule each future author must remember.

#### REQ-03-002 — one active principal per account

THE SYSTEM SHALL resolve at most one principal for an account, by the table below.

`decision-table: keys=(staffRow, clientRow) domains=(staffRow: none|active|removed, clientRow: none|active|removed)`

| staffRow | clientRow | Outcome |
|---|---|---|
| none | none | Sign-in is refused with `AUTH_MESSAGES.deactivated`. |
| none | active | Sign-in resolves the **client** principal. |
| none | removed | Sign-in is refused with `AUTH_MESSAGES.deactivated`. |
| active | none | Sign-in resolves the **staff** principal. |
| active | active | Unreachable — an accept that would write the second row is refused by REQ-03-014, and no other writer creates one. |
| active | removed | Sign-in resolves the **staff** principal. |
| removed | none | Sign-in is refused with `AUTH_MESSAGES.deactivated`. |
| removed | active | Sign-in resolves the **client** principal. |
| removed | removed | Sign-in is refused with `AUTH_MESSAGES.deactivated`. |

#### REQ-03-003 — signing in as a client contact

WHEN an account holding an active `ClientMembership` and no active `Membership` signs in
successfully, THE SYSTEM SHALL issue the session cookie for that client's organization.

**Decided:** the cookie's fields do not change — the principal kind is read from the database
per request, as the role already is, so there is no session format to migrate.

#### REQ-03-004 — signing in with no principal at all

IF an account holds neither an active `Membership` nor an active `ClientMembership`, THEN THE
SYSTEM SHALL refuse the sign-in with `AUTH_MESSAGES.deactivated`.

#### REQ-03-005 — the shell's identity answer

WHEN a client principal calls `GET /api/me`, THE SYSTEM SHALL answer `200` with the account,
the organization, `principal: "client"` and the client's id and name.

**Decided:** the endpoint answers `null` today for an account with no staff membership, and
the shell sends `null` back to the sign-in screen — a client would sign in and bounce forever.

#### REQ-03-006 — removing a contact revokes their sessions

WHEN a contact manager removes a client contact, THE SYSTEM SHALL rotate that account's
`securityStamp` in the same transaction as the status write.

#### REQ-03-007 — a removed contact cannot sign in

IF a removed client contact signs in with correct credentials, THEN THE SYSTEM SHALL refuse
with `AUTH_MESSAGES.deactivated`.

### Inviting a client contact

#### REQ-03-008 — who may invite

IF a caller without `manage-clients` invites a client contact, THEN THE SYSTEM SHALL answer
`403` with `CLIENT_USER_MESSAGES.inviteForbidden`.

#### REQ-03-009 — the invitation names the client

WHEN a contact manager invites a client contact, THE SYSTEM SHALL write an `Invitation`
carrying the client's id and the role value `client`.
#### REQ-03-010 — an archived client takes no contacts

IF the named client is archived, THEN THE SYSTEM SHALL answer `400` with
`CLIENT_MESSAGES.clientArchived`.

#### REQ-03-011 — one live invitation per address

WHEN a contact invitation is written, THE SYSTEM SHALL invalidate every other pending
invitation for that address in the organization, staff or client alike, in the same
transaction.

#### REQ-03-012 — accepting creates the client principal

WHEN a `client` invitation is accepted, THE SYSTEM SHALL create an active `ClientMembership`
and no `Membership`.

#### REQ-03-013 — an address that is already a contact of that client

IF the invited address already holds an active `ClientMembership` in the organization, THEN
THE SYSTEM SHALL answer `409` with `CLIENT_USER_MESSAGES.alreadyLinked`.

**Decided:** one answer whether the existing row is for this client or another, so the refusal
never says which client a person works for.

#### REQ-03-014 — an address that belongs to staff

IF the account accepting a `client` invitation holds an active `Membership` or an active
`ClientMembership` of any organization, THEN THE SYSTEM SHALL answer `409` with
`CLIENT_USER_MESSAGES.principalConflict`.

**Decided:** refused at accept as well as at invite: the account may acquire the other
principal between the two, and the accept is the write that would break REQ-03-002.

#### REQ-03-015 — where accepting lands a client

WHEN a `client` invitation is accepted, THE SYSTEM SHALL answer with a `redirectTo` of
`/requests`.
### Capability and navigation

#### REQ-03-016 — client capabilities are a flat set

THE SYSTEM SHALL resolve a client principal's capabilities from a single exported list, not
from a role table.
#### REQ-03-017 — the principal kind is asked first

WHEN a capability is checked, THE SYSTEM SHALL resolve the principal kind before consulting
any role.

#### REQ-03-018 — the client's navigation

WHILE the signed-in principal is a client contact, THE SYSTEM SHALL render the requests
destination as the only organization navigation entry.

#### REQ-03-019 — every other organization route

IF a client principal calls an organization route this spec does not grant them, THEN THE
SYSTEM SHALL answer `404`.
### Addressing a request to a client

#### REQ-03-020 — the addressee kind

WHEN a request carries `assigneeKind` of `client`, THE SYSTEM SHALL require
`assigneeClientMembershipId` to name an active contact of the caller's organization.

#### REQ-03-021 — a client request names a project

IF a request addressed to a client carries no `projectId`, THEN THE SYSTEM SHALL answer `400`
with `REQUEST_MESSAGES.clientProjectRequired`.
#### REQ-03-022 — the project belongs to the addressee's client

IF the named project is not linked to the addressee's client, THEN THE SYSTEM SHALL answer
`400` with `REQUEST_MESSAGES.clientProjectMismatch`.

#### REQ-03-023 — the requester works on that project

IF the requester holds no `ProjectMember` row on the named project, THEN THE SYSTEM SHALL
answer `400` with `REQUEST_MESSAGES.notOnProject`.

**Decided:** an admin is not carved out — anyone may assign themselves first, and the
carve-out would remove the only rule keeping a client's inbox to people they work with.

#### REQ-03-024 — the topic's audience

IF the chosen topic's audience does not match the addressee's kind, THEN THE SYSTEM SHALL
answer `400` with `REQUEST_MESSAGES.topicAudienceMismatch`.

`decision-table: keys=(topicAudience, assigneeKind) domains=(topicAudience: staff|client, assigneeKind: member|client)`

| topicAudience | assigneeKind | Outcome |
|---|---|---|
| staff | member | The request is created `201`. |
| staff | client | `400` with `REQUEST_MESSAGES.topicAudienceMismatch`. |
| client | member | `400` with `REQUEST_MESSAGES.topicAudienceMismatch`. |
| client | client | The request is created `201`. |

#### REQ-03-025 — an inactive contact at creation

IF `assigneeClientMembershipId` names a removed contact, THEN THE SYSTEM SHALL answer `400`
with `REQUEST_MESSAGES.assigneeInactive`.

#### REQ-03-026 — a contact removed after the fact

WHILE the addressee of an open request is a removed client contact, THE SYSTEM SHALL report
the request's assignee as inactive and cancel nothing.

#### REQ-03-027 — a client contact does not raise requests

IF a client principal calls the create route, THEN THE SYSTEM SHALL answer `403` with
`CLIENT_USER_MESSAGES.clientCannotCreate`.
### What a client may do with a request

#### REQ-03-028 — a client contact is party to their own requests

WHERE a request's addressee is the calling client principal, THE SYSTEM SHALL treat that
principal as a party to it.

#### REQ-03-029 — the client's list

WHEN a client principal lists requests, THE SYSTEM SHALL return only requests addressed to
them.

#### REQ-03-030 — a client answers

WHEN the addressee client principal marks a request answered, THE SYSTEM SHALL move it to
`answered`.

#### REQ-03-031 — a client declines

WHEN the addressee client principal declines a request with a reason, THE SYSTEM SHALL move
it to `declined`.

#### REQ-03-032 — a client does not confirm the grant

IF a client principal calls the grant route, THEN THE SYSTEM SHALL answer `403` with
`REQUEST_MESSAGES.notYoursToGrant`.
#### REQ-03-033 — a client writes in the thread

WHEN the addressee client principal posts a message on a non-terminal request, THE SYSTEM
SHALL append it with `authorKind` of `client`.

#### REQ-03-034 — a client sees nothing else

IF a client principal reads a request they are not the addressee of, THEN THE SYSTEM SHALL
answer `404`.

### Notifying the parties

#### REQ-03-035 — the outbox is written with the event

WHEN a request is created, answered, granted, declined, cancelled, reassigned or receives a
message, THE SYSTEM SHALL write one `RequestNotification` row per recipient in the same
transaction as the `RequestEvent`.

#### REQ-03-036 — who the recipients are

THE SYSTEM SHALL make the recipients of an event the request's requester and its addressee,
minus the principal who caused it.

**Decided:** not "every party", which by the composed definition includes every holder of
`view-all-requests` — that would notify every admin and manager of every event in the
organization the first time an adapter exists.

#### REQ-03-037 — delivery happens after the commit

THE SYSTEM SHALL call the notifier only after the transaction that wrote the outbox rows has
committed.

**Decided:** a slow or hanging provider must never hold a row lock on a request.

#### REQ-03-038 — the adapter that ships delivers nothing

THE SYSTEM SHALL mark a row handled by the shipped notifier as `skipped` with a channel of
`none`.

#### REQ-03-039 — a notification is written once per event and recipient

IF a second row would be written for one event and one recipient, THEN THE SYSTEM SHALL
reject it on the outbox's uniqueness constraint.

#### REQ-03-040 — a delivery failure changes nothing about the request

IF the notifier fails, THEN THE SYSTEM SHALL leave the request, its status and its events
exactly as the committed transaction wrote them.
#### REQ-03-041 — nothing waits on a scheduler

THE SYSTEM SHALL leave every read path — the list, the detail screen and the sidebar badge —
authoritative whether or not any outbox row has ever been delivered.

## State Machine

The client contact's own lifecycle. The request's lifecycle is unchanged by this spec.

`decision-table: keys=(state, event) domains=(state: none|active|removed, event: invite|accept|remove)`

| state | event | Outcome |
|---|---|---|
| none | invite | An `Invitation` is written; no `ClientMembership` yet. |
| none | accept | A valid token with no existing row writes an active `ClientMembership`. |
| none | remove | `404`; there is no contact to remove. |
| active | invite | `409` `CLIENT_USER_MESSAGES.alreadyLinked`; nothing is written. |
| active | accept | `409` `CLIENT_USER_MESSAGES.principalConflict`; the existing row is untouched. |
| active | remove | `status` → `removed`, and the account's `securityStamp` rotates in the same transaction. |
| removed | invite | An `Invitation` is written; accepting it restores the row to `active`. |
| removed | accept | The existing row returns to `active`; no second row is created. |
| removed | remove | `409` `CLIENT_USER_MESSAGES.alreadyRemoved`; nothing is written. |

Invariants:

1. An account never holds an active `Membership` and an active `ClientMembership` at once.
2. A `ClientMembership` moves between `active` and `removed` and is never deleted.
3. Every removal rotates the security stamp inside its own transaction, so revocation is never
   observed as half done.
4. Every write of a request's status re-reads the row with `FOR UPDATE` and evaluates the actor
   guard against that read, whichever principal kind the actor is.
5. Every outbox row is written in the transaction that wrote its event, and delivered outside
   it.

## Out of Scope

- **A client raising a request.** REQ-03-027 refuses it; the thread carries anything urgent.
- **Any actual mail**, and **per-contact notification preferences**. The adapter and the
  channel value are what a later spec adds; there is nothing to prefer yet.
- **A contact belonging to more than one client**, or to more than one organization.
- **Client-side attachments** and any client-facing document surface.
- **A client seeing tasks, time or reports.** Requests are the whole of their product.
- **Self-service client sign-up.** A contact exists because somebody invited them.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| Nobody outside the product is told anything, so a client learns of a request only by signing in | The port, the outbox and every recipient decision ship and are tested; only the adapter is absent, and adding one writes no migration and changes no rule here | An adapter spec that adds an email channel and its templates |
| A removed contact's open requests are flagged but not reassigned | The same choice the staff side already makes: an access asked for may still be needed by whoever takes the relationship over | A reassign path that accepts a client addressee |
| The client shell is the requests screens with the rest of the navigation withheld, not a separately designed product | It is one screen and a list; designing a second shell before anybody has used the first is guesswork | A design pass once real contacts have used it |
| A client contact's email address is visible to every member holding `view-all-requests` | It is the address a member of staff mailed yesterday, and the requester needs to know who they are waiting on | Nothing needs to; it is named so a reviewer meets it deliberately |
| A pending contact invitation cannot be revoked, only superseded or left to expire | Inviting the corrected address supersedes it, and it expires in seven days; a mistyped address is a live seven-day grant until then. The staff invitation flow of user-management/03 has had exactly this property since it shipped, so this adds no new exposure class | A revoke route on the invitation, which would close it for staff invitations at the same time |
| Delivery is attempted only while requests are being made against the API | With the shipped adapter there is nothing to deliver, so the property costs nothing today; an adapter spec will state its own drain | The adapter spec, which chooses between a queue and a scheduled drain |

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| AC-1 | An invited client contact can sign in and reach the requests screen, and today's sign-in refusal for an account with no staff membership no longer applies to them. | TC-03-INT-03, TC-03-E2E-01 |
| AC-2 | No account ends up holding both an active staff membership and an active client membership. | TC-03-INT-08 |
| AC-3 | A client principal reaches no organization screen other than requests, and every other organization route answers 404. | TC-03-INT-13, TC-03-E2E-02 |
| AC-4 | A request addressed to a client requires a project that the requester works on and that belongs to that client. | TC-03-INT-15, TC-03-INT-16, TC-03-INT-17 |
| AC-5 | A client-audience topic is required for a client-addressed request and refused for a staff-addressed one. | TC-03-INT-18 |
| AC-6 | A client contact can answer and decline a request addressed to them, and cannot grant one. | TC-03-INT-20, TC-03-INT-21, TC-03-INT-22 |
| AC-7 | A client contact sees no request they are not the addressee of, and no vacation row. | TC-03-INT-19, TC-03-INT-23 |
| AC-8 | Removing a contact revokes their live sessions on the next request they make. | TC-03-INT-10, TC-03-E2E-03 |
| AC-9 | Every notifiable event leaves one outbox row per recipient, written in the same transaction as its event. | TC-03-INT-24, TC-03-INT-25 |
| AC-10 | The actor who caused an event is never a recipient of it. | TC-03-INT-25 |
| AC-11 | No outbound call is made inside a database transaction, and a notifier that throws leaves the request and its events untouched. | TC-03-INT-26, TC-03-INT-27 |
| AC-12 | Replaying an event cannot produce a second notification for the same recipient. | TC-03-INT-28 |
| AC-13 | The list, the detail screen and the badge are correct with no notification ever delivered. | TC-03-INT-29 |
| AC-14 | A client contact cannot raise a request through any route. | TC-03-INT-14 |
| AC-15 | An invitation to an archived client is refused, and one to an address already contacting that client is refused. | TC-03-INT-06, TC-03-INT-07 |
| AC-16 | A removed contact who is re-invited comes back as the same row rather than a second one. | TC-03-INT-11 |
| AC-17 | Adding an email channel later needs no migration: the outbox row already carries the channel, the provider key and the provider reference. | TC-03-INT-30 |
