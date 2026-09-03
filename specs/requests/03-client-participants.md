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
in the product. The principal is a `ClientMembership`, never a role on `Membership`.

It also introduces the **notification port**: every event a party should learn about writes an
outbox row in the transaction that caused it, and a `RequestNotifier` delivers them after the
commit. Blast radius and backward compatibility are in [README.md](README.md).

## Actors & Preconditions

| Actor | Preconditions |
|---|---|
| **Client contact** | An account holding an active `ClientMembership` of a client of the organization. Signed in. |
| **Contact manager** | An active member holding `manage-clients` (admin, manager). Invites and removes contacts. |
| **Requester** | An active member holding `create-request` who is assigned to the project the request names. |
| **Client** | An active `Client` row of the organization, with at least one active project. |

## Roles & Permission Matrix

The matrix is in the contracts file. A client contact holds no role: their rights come from
the principal kind (REQ-03-016), and no value of `Membership.role` produces them.

## Functional Requirements

### The client principal

#### REQ-03-001 — what links a client contact to the organization

THE SYSTEM SHALL link a client contact to the organization through a `ClientMembership` row
carrying the account, the organization and the client.

**Decided:** a separate table makes every staff-membership query — accrual, members, project assignment, time tracking — incapable of returning a client by construction.

#### REQ-03-002 — one active principal per account

THE SYSTEM SHALL resolve at most one principal for an account, by the table below.

`decision-table: keys=(staffRow, clientRow) domains=(staffRow: none|active|removed, clientRow: none|active|removed)`

| staffRow | clientRow | Outcome |
|---|---|---|
| none | none | Sign-in is refused with `AUTH_MESSAGES.deactivated`. |
| none | active | Sign-in resolves the **client** principal. |
| none | removed | Sign-in is refused with `AUTH_MESSAGES.deactivated`. |
| active | none | Sign-in resolves the **staff** principal. |
| active | active | Unreachable — REQ-03-014 refuses the accept that would write the client row, REQ-03-042 refuses the invitation and the accept that would write the staff row, and no other writer creates either. |
| active | removed | Sign-in resolves the **staff** principal. |
| removed | none | Sign-in is refused with `AUTH_MESSAGES.deactivated`. |
| removed | active | Sign-in resolves the **client** principal. |
| removed | removed | Sign-in is refused with `AUTH_MESSAGES.deactivated`. |

#### REQ-03-003 — signing in as a client contact

WHEN an account holding an active `ClientMembership` and no active `Membership` signs in
successfully, THE SYSTEM SHALL issue the session cookie for that client's organization.

**Decided:** the cookie's fields do not change; the principal kind is read per request, as the role already is.

#### REQ-03-004 — signing in with no principal at all

IF an account holds neither an active `Membership` nor an active `ClientMembership`, THEN THE
SYSTEM SHALL refuse the sign-in with `AUTH_MESSAGES.deactivated`.

#### REQ-03-005 — the shell's identity answer

WHEN a client principal calls `GET /api/me`, THE SYSTEM SHALL answer `200` with the account,
the organization, `principal: "client"` and the client's id and name.

**Decided:** it answers `null` today for an account with no staff membership, which the shell reads as signed out.

#### REQ-03-006 — removing a contact revokes their sessions

WHEN a contact manager removes a client contact, THE SYSTEM SHALL rotate that account's
`securityStamp` in the same transaction as the status write.

#### REQ-03-007 — a removed contact cannot sign in

IF a removed client contact signs in with correct credentials, THEN THE SYSTEM SHALL refuse
with `AUTH_MESSAGES.deactivated`.

### Inviting a client contact

#### REQ-03-008 — who may manage contacts

IF a caller without `manage-clients` invites or removes a client contact, or a caller without
`view-clients` lists them, THEN THE SYSTEM SHALL answer `404` with no message.

**Decided:** `404`, not a `403` naming the capability — the client's own detail route answers
that caller `404`, so a distinctive refusal here would say the client exists to somebody who
may not see it.

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

WHEN a `client` invitation is accepted, THE SYSTEM SHALL create one active `ClientMembership`
or return the account's existing row to `active`, and write no `Membership`.

#### REQ-03-013 — an address that is already a contact

IF the invited address already holds a `ClientMembership` of another client of the
organization, or an active one of the named client, THEN THE SYSTEM SHALL answer `409` with
`CLIENT_USER_MESSAGES.alreadyLinked`.

**Decided:** any client of the organization, whatever the row's status — returning a removed
row to `active` under a new client would rebind a row the old client's requests resolve
through. One in another organization meets REQ-03-014 at accept.

#### REQ-03-014 — an address that belongs to staff

IF the account accepting a `client` invitation holds an active `Membership` or an active
`ClientMembership` of any organization, THEN THE SYSTEM SHALL answer `409` with
`CLIENT_USER_MESSAGES.principalConflict`.

#### REQ-03-042 — an address that belongs to a client contact

IF a staff invitation is written for, or accepted by, an account holding an active
`ClientMembership` of any organization, THEN THE SYSTEM SHALL answer `409` with
`CLIENT_USER_MESSAGES.principalConflict`, writing neither the invitation nor the `Membership`.

**Decided:** both ends, mirroring REQ-03-014 and for its reason — the account may acquire the
client principal between the invitation and its acceptance. The staff invitation's existing
duplicate check reads staff rows only, and without this rule the cell REQ-03-002 calls
unreachable is reached by inviting a contact to staff, which REQ-03-011 contemplates.

#### REQ-03-015 — where accepting lands a client

WHEN a `client` invitation is accepted, THE SYSTEM SHALL answer with a `redirectTo` of
`/requests`.

### Capability and navigation

#### REQ-03-016 — client capabilities are a flat set of their own

THE SYSTEM SHALL resolve a client principal's capabilities from a single exported list whose
values belong to no staff capability union, not from a role table.

**Decided:** a union of its own — a value added to a staff union is one every staff role must
be refused, for a right no role can hold.

#### REQ-03-017 — the principal kind is asked first

WHEN a right is checked, THE SYSTEM SHALL resolve the principal kind before calling any
role-keyed helper.

**Decided:** an ordering rule — a role-keyed helper answers a principal with no role the viewer set rather than nothing.

#### REQ-03-018 — the client's navigation

WHILE the signed-in principal is a client contact, THE SYSTEM SHALL render the requests
destination as the only organization navigation entry.

**Decided:** Members is the entry that has to be gated for this to hold — it is drawn
unconditionally, where every other row asks a capability a caller with no role is refused.

#### REQ-03-019 — every other organization route

IF a client principal calls an organization route other than the requests list, a request
they are the addressee of, that request's answer, decline and message routes, and the create
and grant routes, THEN THE SYSTEM SHALL answer `404`.

**Decided:** create and grant are the whole of the exception and answer the `403`s REQ-03-027
and REQ-03-032 state. `404` on those two was rejected: grant acts on a request the caller may
read, and create is refused by a sentence written for a contact rather than for staff.

### Addressing a request to a client

#### REQ-03-020 — the addressee kind

WHEN a request carries `assigneeKind` of `client`, THE SYSTEM SHALL require
`assigneeClientMembershipId` to name a contact of the caller's organization, answering `404`
with no message when it names none.

**Decided:** an id of another organization is `404`, identical to one naming nothing; a `400`
would say the id belongs to somebody. A removed contact of the caller's own organization is
`400` `REQUEST_MESSAGES.assigneeInactive` (REQ-03-025).

#### REQ-03-043 — which contacts a requester may choose from

WHEN a member holding `create-request` reads the addressees available to them, THE SYSTEM
SHALL return the active client contacts of every client owning a project that member is
assigned to, and no other.

**Decided:** the boundary the create route already enforces (REQ-03-023), so the picker offers
what the server accepts. `view-clients` would offer a `user` an addressee it can never fill.

#### REQ-03-021 — a client request names a project

IF a request addressed to a client carries no `projectId`, THEN THE SYSTEM SHALL answer `400`
with `REQUEST_MESSAGES.clientProjectRequired`.

#### REQ-03-022 — the project belongs to the addressee's client

IF the named project is not linked to the addressee's client, THEN THE SYSTEM SHALL answer
`400` with `REQUEST_MESSAGES.clientProjectMismatch`.

#### REQ-03-023 — the requester works on that project

IF the requester holds no `ProjectMember` row on the named project, THEN THE SYSTEM SHALL
answer `400` with `REQUEST_MESSAGES.notOnProject`.

**Decided:** an admin is not carved out — that would remove the only rule keeping a client's inbox to people they work with.

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

Every row above is a topic **active and in the caller's organization**, named by a body whose
own fields are valid; an archived topic, one of another organization and one that names no row
are all `400` `REQUEST_MESSAGES.topicUnavailable`, audience never compared.

#### REQ-03-025 — an inactive contact at creation

IF `assigneeClientMembershipId` names a removed contact, THEN THE SYSTEM SHALL answer `400`
with `REQUEST_MESSAGES.assigneeInactive`.

#### REQ-03-026 — a contact removed after the fact

WHILE the addressee of an open request is a removed client contact, THE SYSTEM SHALL report
the request's assignee as inactive and cancel nothing.

#### REQ-03-027 — a client contact does not raise requests

IF a client principal calls the create route, THEN THE SYSTEM SHALL answer `403` with
`CLIENT_USER_MESSAGES.clientCannotCreate`, decided before the route consults any capability.

**Decided:** the ordering is part of the rule — asking `create-request` first answers a
client `REQUEST_MESSAGES.createForbidden`, the sentence written for a viewer.

### What a client may do with a request

#### REQ-03-028 — a client contact is party to their own requests

WHERE a request's addressee is the calling client principal, THE SYSTEM SHALL treat that
principal as a party to it.

**Decided:** the client half of "party", not a second authorization scheme — answer, decline
and message keep the two tests they apply to a member.

#### REQ-03-029 — the client's list

WHEN a client principal lists requests, THE SYSTEM SHALL return only requests addressed to
them, whether the query names `scope=mine`, `scope=all` or no scope at all.

**Decided:** `scope=all` answers `200` with their own rows, not the `403`
`REQUEST_MESSAGES.scopeForbidden` a member without `view-all-requests` receives — the query
widens nothing a client could ever be granted. Any other `scope` value is the `400`
`validation_error` this route answers every principal, decided before the caller's kind is
looked at; answering a client `200` for a value outside those two was rejected.

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

THE SYSTEM SHALL make the recipients of an event the request's requester and the addressee
the request carries as the transaction that wrote the event leaves it, other than the
principal who caused it, and nobody else: a holder of `view-all-requests` who is neither
receives nothing.

**Decided:** a reassignment therefore notifies the incoming addressee and not the outgoing one;
telling the person who lost the request was rejected, and adding it later takes nothing back.

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

The client contact's own lifecycle, whose transition table is in the contracts file. Its
invariants:

1. An account never holds an active `Membership` and an active `ClientMembership` at once.
2. A `ClientMembership` moves between `active` and `removed` and is never deleted.
3. Every write of a request's status re-reads the row with `FOR UPDATE` and tests the actor guard against that read, whichever principal kind the actor is.

## Out of Scope

- **A client raising a request.** REQ-03-027 refuses it; the thread carries anything urgent.
- **Any actual mail**, and **per-contact notification preferences**: a later spec's adapter.
- **A contact belonging to more than one client**, or to more than one organization.
- **Client-side attachments** and any client-facing document surface.
- **A client seeing tasks, time or reports.** Requests are the whole of their product.
- **Self-service client sign-up.** A contact exists because somebody invited them.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| Nobody outside the product is told anything, so a client learns of a request only by signing in | The port, the outbox and every recipient decision ship and are tested; only the adapter is absent, and adding one writes no migration and changes no rule here | An adapter spec that adds an email channel and its templates |
| A removed contact's open requests are flagged but not reassigned | The same choice the staff side already makes: an access asked for may still be needed by whoever takes the relationship over | A reassign path that accepts a client addressee |
| A client contact's email address is visible on the contacts list to every member holding `view-clients` | It is the address a member of staff mailed yesterday, and the manager who invites and removes contacts has to see which person a row is | Nothing needs to; it is named so a reviewer meets it deliberately |
| Delivery is attempted only while requests are being made against the API | With the shipped adapter there is nothing to deliver, so the property costs nothing today; an adapter spec will state its own drain | The adapter spec, which chooses between a queue and a scheduled drain |

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| AC-1 | An invited client contact can sign in and reach the requests screen, and today's sign-in refusal for an account with no staff membership no longer applies to them. | TC-03-INT-03, TC-03-E2E-01 |
| AC-2 | No account ends up holding both an active staff membership and an active client membership, approached from the client invitation and from the staff one alike. | TC-03-INT-08 |
| AC-3 | A client principal reaches no organization screen other than requests, and the members, projects, contacts and request-topics routes answer 404. | TC-03-INT-13, TC-03-E2E-02 |
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
| AC-15 | An invitation to an archived client is refused, and so is one to an address already contacting any client of the organization. | TC-03-INT-06, TC-03-INT-07 |
| AC-16 | A removed contact who is re-invited comes back as the same row rather than a second one. | TC-03-INT-11 |
| AC-17 | Adding an email channel later needs no migration: the outbox row already carries the channel, the provider key and the provider reference. | TC-03-INT-30 |
