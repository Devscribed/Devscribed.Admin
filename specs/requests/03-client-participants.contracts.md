# 03 — Client Participants & Client-Addressed Requests · Contracts

Tables only. The rules are in [03-client-participants.md](03-client-participants.md) and are
named here by id.

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

## Routes

Organization routes sit behind `SessionGuard` → `OrgScopeGuard`
(`apps/api/src/auth/session.guard.ts`, `apps/api/src/auth/org-scope.guard.ts`). Queries filter
on `session.organizationId`, a required argument with no default. `POST /api/login`,
`POST /api/invitations/accept` and `GET /api/me` carry no `orgId`: the first two answer before
a session exists and the third is the endpoint that says which organization the caller belongs
to.

| Route | Guards | Success | Errors |
|---|---|---|---|
| `POST /api/login` | none | `200` | `400` `AUTH_MESSAGES.invalidCredentials`, `AUTH_MESSAGES.deactivated` |
| `POST /api/invitations/accept` | none | `200` | `400` `INVITE_MESSAGES.tokenInvalid`; `409` `CLIENT_USER_MESSAGES.principalConflict` |
| `GET /api/me` | session | `200` | `401` |
| `GET /api/organizations/{orgId}/clients/{clientId}/contacts` | session, org scope, `ViewClients` | `200` | `403` `CLIENT_MESSAGES.forbidden`; `404` |
| `POST /api/organizations/{orgId}/clients/{clientId}/contacts` | session, org scope, `ManageClients` | `201` | `400` `CLIENT_MESSAGES.clientArchived`, `CLIENT_USER_MESSAGES.emailInvalid`; `403` `CLIENT_USER_MESSAGES.inviteForbidden`; `404`; `409` `CLIENT_USER_MESSAGES.alreadyLinked` |
| `DELETE /api/organizations/{orgId}/clients/{clientId}/contacts/{contactId}` | session, org scope, `ManageClients` | `200` | `403` `CLIENT_USER_MESSAGES.inviteForbidden`; `404`; `409` `CLIENT_USER_MESSAGES.alreadyRemoved` |
| `POST /api/organizations/{orgId}/requests` | session, org scope | `201` | `400` `REQUEST_MESSAGES.topicRequired`, `REQUEST_MESSAGES.assigneeInvalid`, `REQUEST_MESSAGES.classifierNotAccepted`, `REQUEST_MESSAGES.topicUnavailable`, `REQUEST_MESSAGES.topicAudienceMismatch`, `REQUEST_MESSAGES.assigneeInactive`, `REQUEST_MESSAGES.clientProjectRequired`, `REQUEST_MESSAGES.clientProjectMismatch`, `REQUEST_MESSAGES.notOnProject`; `403` `CLIENT_USER_MESSAGES.clientCannotCreate`, `REQUEST_MESSAGES.createForbidden`; `404` |
| `GET /api/organizations/{orgId}/request-topics` | session, org scope | `200` | `404` |
| `GET /api/organizations/{orgId}/requests` | session, org scope | `200` | `404` |
| `GET /api/organizations/{orgId}/requests/{requestId}` | session, org scope | `200` | `404` |
| `POST /api/organizations/{orgId}/requests/{requestId}/answer` | session, org scope | `200` | `403` `REQUEST_MESSAGES.notYoursToAnswer`; `404`; `409` `REQUEST_MESSAGES.alreadyTerminal` |
| `POST /api/organizations/{orgId}/requests/{requestId}/decline` | session, org scope | `200` | `400` `REQUEST_MESSAGES.declineReasonRequired`; `403` `REQUEST_MESSAGES.notYoursToDecline`; `404` |
| `POST /api/organizations/{orgId}/requests/{requestId}/grant` | session, org scope | `200` | `403` `REQUEST_MESSAGES.notYoursToGrant`; `404` |
| `POST /api/organizations/{orgId}/requests/{requestId}/messages` | session, org scope | `201` | `404`; `409` `REQUEST_MESSAGES.threadClosed` |
| `GET /api/organizations/{orgId}/members` | session, org scope | `200` | `404` |
| `GET /api/organizations/{orgId}/projects` | session, org scope | `200` | `404` |

The members and projects routes are listed because REQ-03-019 changes what they answer a
client principal, and a case has to name them. The topics route is listed because the
new-request modal reads it once per addressee kind and a case asserts what it returns for
`audience=client`; it needs no capability — every active member reads the catalogue to fill
the picker — and this spec does not amend it. The contacts routes are new; everything else is
amended.

The create route's `400`s are listed in the order it decides them, which the answers make
observable: the body's own fields are reported together, then the topic row, then the
addressee row, then the project. `REQUEST_MESSAGES.createForbidden` is the refusal a member
without `create-request` already receives and is restated because REQ-03-027 puts the client
refusal in front of it.

### `POST /api/organizations/{orgId}/clients/{clientId}/contacts`

```json
{ "email": "stakeholder@acme.example", "firstName": "Dana", "lastName": "Stone" }
```

`201` with `{ "contact": { "id": "…", "email": "…", "status": "invited" } }`. `firstName` and
`lastName` are optional hints shown in the contacts list until the invitation is accepted; the
names the account itself carries win from then on. The mail sink names this message type
`invitation`, the type it already carries, because the token, the expiry and the accept screen
are the ones the staff invitation uses.

### `GET /api/organizations/{orgId}/clients/{clientId}/contacts`

```json
{
  "contacts": [
    {
      "id": "…",
      "email": "stakeholder@acme.example",
      "displayName": "Dana Stone",
      "status": "active",
      "invitedAt": "2026-09-02T18:56:12.403Z",
      "joinedAt": "2026-09-02T19:02:44.000Z"
    }
  ]
}
```

`status` is `invited` while a pending invitation exists with no accepted row, `active` once
accepted, and `removed` after a removal.

### `GET /api/me` — amended

The body observed today carries `account`, `organization`, `role` and `features`. For a client
principal `role` is `null` and two members are added:

```json
{ "principal": "client", "client": { "id": "…", "name": "Acme" } }
```

For a staff principal `principal` is `"member"` and `client` is `null`, so one shape answers
both and the shell branches on a value that is always present.

### `POST /api/invitations/accept` — amended

Answers `200` with `{ "accountId": "…", "redirectTo": "/requests" }` for a `client`
invitation, and with the members destination it already returns for a staff one (REQ-03-015).

### `GET /api/organizations/{orgId}/request-topics` — unchanged, read with a second audience

The picker's read. `?audience=client&status=active` returns the client half of the catalogue,
which every organization is seeded with:

```json
{ "topics": [
  { "id": "…", "audience": "client", "type": "access",   "name": "Access", "sortOrder": 10, "status": "active" },
  { "id": "…", "audience": "client", "type": "question", "name": "Other",  "sortOrder": 20, "status": "active" }
] }
```

The modal issues this read with `audience=staff` today and re-issues it with `audience=client`
when the client addressee kind is chosen. Nothing about the route changes.

### `POST /api/organizations/{orgId}/requests` — amended

```json
{
  "topicId": "…",
  "title": "Read access to the analytics warehouse",
  "projectId": "…",
  "assigneeKind": "client",
  "assigneeClientMembershipId": "…",
  "priority": "high",
  "blocking": true,
  "neededBy": "2026-09-10"
}
```

`assigneeKind` accepts `client` in addition to `member`. The `assignee` member of the response
gains the same kind:

```json
{ "assignee": { "kind": "client", "id": "…", "displayName": "Dana Stone", "clientName": "Acme", "inactive": false } }
```

### `GET /api/organizations/{orgId}/requests` — amended

For a client principal the response carries `requests` and `counts` and **no** `vacation`
member, because that member is drawn by a capability a client principal does not hold. Its
`counts.waitingOnMe` is the count of non-terminal requests addressed to them, which is what
the badge shows.

## Error Messages

`CLIENT_USER_MESSAGES` is a new export in `packages/validation/src/index.ts`. The
`REQUEST_MESSAGES` rows marked new extend that export in place; the rest are restated here so
a case author asserting a body never leaves this bundle.

| Export | Route | Message | New |
|---|---|---|---|
| `CLIENT_USER_MESSAGES.inviteForbidden` | `POST /api/organizations/{orgId}/clients/{clientId}/contacts`, `DELETE /api/organizations/{orgId}/clients/{clientId}/contacts/{contactId}` | You do not have permission to manage client contacts | yes |
| `CLIENT_USER_MESSAGES.emailInvalid` | `POST /api/organizations/{orgId}/clients/{clientId}/contacts` | Enter a valid email address | yes |
| `CLIENT_USER_MESSAGES.alreadyLinked` | `POST /api/organizations/{orgId}/clients/{clientId}/contacts` | This person is already a contact of this client | yes |
| `CLIENT_USER_MESSAGES.alreadyRemoved` | `DELETE /api/organizations/{orgId}/clients/{clientId}/contacts/{contactId}` | This contact has already been removed | yes |
| `CLIENT_USER_MESSAGES.principalConflict` | `POST /api/invitations/accept` | This email address already belongs to somebody in a workspace | yes |
| `CLIENT_USER_MESSAGES.clientCannotCreate` | `POST /api/organizations/{orgId}/requests` | Client contacts cannot raise requests | yes |
| `CLIENT_MESSAGES.clientArchived` | `POST /api/organizations/{orgId}/clients/{clientId}/contacts` | This client is archived and cannot be assigned to new projects. | no |
| `CLIENT_MESSAGES.forbidden` | `GET /api/organizations/{orgId}/clients/{clientId}/contacts` | You do not have permission to manage clients. | no |
| `AUTH_MESSAGES.deactivated` | `POST /api/login` | Your account has been deactivated. Contact your administrator. | no |
| `AUTH_MESSAGES.invalidCredentials` | `POST /api/login` | Invalid email or password | no |
| `INVITE_MESSAGES.tokenInvalid` | `POST /api/invitations/accept` | This invitation is no longer valid | no |
| `REQUEST_MESSAGES.clientProjectRequired` | `POST /api/organizations/{orgId}/requests` | Choose the project this request belongs to | yes |
| `REQUEST_MESSAGES.clientProjectMismatch` | `POST /api/organizations/{orgId}/requests` | That project does not belong to this client | yes |
| `REQUEST_MESSAGES.notOnProject` | `POST /api/organizations/{orgId}/requests` | You can only ask a client about a project you are assigned to | yes |
| `REQUEST_MESSAGES.assigneeInvalid` | `POST /api/organizations/{orgId}/requests` | Choose who this request is for | no |
| `REQUEST_MESSAGES.assigneeInactive` | `POST /api/organizations/{orgId}/requests` | That person is no longer active in this organization | no |
| `REQUEST_MESSAGES.topicAudienceMismatch` | `POST /api/organizations/{orgId}/requests` | That topic cannot be used for this addressee | no |
| `REQUEST_MESSAGES.topicRequired` | `POST /api/organizations/{orgId}/requests` | Choose what this request is about | no |
| `REQUEST_MESSAGES.topicUnavailable` | `POST /api/organizations/{orgId}/requests` | That topic is not available | no |
| `REQUEST_MESSAGES.classifierNotAccepted` | `POST /api/organizations/{orgId}/requests` | The request kind is set by the topic and cannot be sent | no |
| `REQUEST_MESSAGES.createForbidden` | `POST /api/organizations/{orgId}/requests` | You do not have permission to create requests | no |
| `REQUEST_TOPIC_MESSAGES.pickerEmpty` | New request modal, screen copy | No request topics are available. An admin or manager can add one in Settings. | no |
| `REQUEST_MESSAGES.notYoursToAnswer` | `POST /api/organizations/{orgId}/requests/{requestId}/answer` | Only the person this is addressed to can answer it | no |
| `REQUEST_MESSAGES.notYoursToDecline` | `POST /api/organizations/{orgId}/requests/{requestId}/decline` | Only the person this is addressed to can decline it | no |
| `REQUEST_MESSAGES.notYoursToGrant` | `POST /api/organizations/{orgId}/requests/{requestId}/grant` | Only the person who asked can confirm this | no |
| `REQUEST_MESSAGES.declineReasonRequired` | `POST /api/organizations/{orgId}/requests/{requestId}/decline` | Say why you cannot provide this | no |
| `REQUEST_MESSAGES.alreadyTerminal` | `POST /api/organizations/{orgId}/requests/{requestId}/answer` | This request has already been closed | no |
| `REQUEST_MESSAGES.threadClosed` | `POST /api/organizations/{orgId}/requests/{requestId}/messages` | This request is closed | no |

`CLIENT_USER_MESSAGES.principalConflict` names no address and no organization, so it tells a
stranger holding a valid token nothing about who else uses the address beyond the fact that
the accept did not proceed.

## State Machine

The client contact’s own lifecycle, as the rules in the behaviour file decide it. The
request’s lifecycle is unchanged by this spec.

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

## Data Model

Migrations are additive: new tables, nullable columns on existing ones, no rename, no drop, no
new `NOT NULL` anywhere.

### ClientMembership

| Field | Type | Description |
|---|---|---|
| `id` | `String` PK, uuid | |
| `accountId` | `String` `@unique` FK → `Account`, **Cascade** | One client contact per account. The uniqueness is what makes REQ-03-002's invariant a schema fact rather than a rule. |
| `organizationId` | `String` FK → `Organization`, **Cascade** | Scope key. |
| `clientId` | `String` FK → `Client`, **Cascade** | The client this person works for. |
| `status` | `String` `@default("active")` | `active` \| `removed`. Removal is a soft delete; there is no hard delete. |
| `invitedByMembershipId` | `String?` FK → `Membership`, **SetNull** | Audit. |
| `joinedAt` | `DateTime` `@default(now())` | Set when the invitation is accepted. |
| `removedAt` | `DateTime?` | Set on removal, cleared on restore. |
| `removedByAccountId` | `String?` FK → `Account`, **SetNull** | Set on removal, cleared on restore. |

Indexes: `@@index([organizationId, status])`, `@@index([clientId, status])`.

### Invitation (existing table, one new column)

| Field | Type | Description |
|---|---|---|
| `clientId` | `String?` FK → `Client`, **SetNull** | Set on a client-contact invitation, null on a staff one. Nullable, so every existing row stays valid without a backfill. |

`Invitation.role` accepts the value `client` in addition to the staff roles. The column is a
free-form `String` already, so this is a validation change and not a migration.

### Request (existing table, one new column)

| Field | Type | Description |
|---|---|---|
| `assigneeClientMembershipId` | `String?` FK → `ClientMembership`, **SetNull** | Required while `assigneeKind` is `client`, null otherwise. |

`assigneeKind` accepts `client`; the column was written to hold a second value and needs no
change.

### RequestMessage and RequestEvent (existing tables, one new column each)

| Field | Type | Description |
|---|---|---|
| `RequestMessage.authorClientMembershipId` | `String?` FK → `ClientMembership`, **SetNull** | Set when `authorKind` is `client`. |
| `RequestEvent.actorClientMembershipId` | `String?` FK → `ClientMembership`, **SetNull** | Set when `actorKind` is `client`. |

`authorKind` and `actorKind` accept `client`. Display names keep being snapshotted into the
event's label columns, so the trail survives a removed contact.

### RequestNotification

The outbox. One row is what a future adapter reads; nothing else is added when a channel
arrives.

| Field | Type | Description |
|---|---|---|
| `id` | `String` PK, uuid | |
| `organizationId` | `String` FK → `Organization`, **Cascade** | Scope key. |
| `requestId` | `String` FK → `Request`, **Cascade** | |
| `eventId` | `String` FK → `RequestEvent`, **Cascade** | The event that caused it. Deleting a request removes both. |
| `recipientKind` | `String` | `member` \| `client`. |
| `recipientId` | `String` | The membership or client-membership id. **No foreign key**: a notification must survive the principal it points at being removed, the same reason the event trail snapshots display names. |
| `channel` | `String` `@default("none")` | `none` today. An adapter writes its own value. |
| `providerKey` | `String?` | Which adapter handled the row. |
| `providerRef` | `String?` | The provider's own id for the message it sent, recorded before the next attempt. |
| `status` | `String` `@default("pending")` | `pending` \| `delivered` \| `skipped` \| `failed`. |
| `attempts` | `Int` `@default(0)` | Incremented before each delivery attempt. |
| `lastError` | `String?` | The failure text, never the recipient's address. |
| `handledAt` | `DateTime?` | Set when the row leaves `pending`. |
| `createdAt` | `DateTime` `@default(now())` | |

Indexes: `@@unique([eventId, recipientKind, recipientId])` — REQ-03-039's mechanism;
`@@index([organizationId, status, createdAt])` — the dispatcher's query.

No recipient address is stored. An adapter resolves it from the account at delivery time, and
a row whose principal has since been removed is marked `skipped`. That keeps the only copy of
an address in `Account`, where the rest of the product already governs it.

### New Capabilities

None in the role table, and none in either staff capability union.

A client principal's rights come from a flat exported list of its own — a `ClientCapability`
union in `packages/validation` holding `read-own-requests`, `answer-request`,
`decline-request` and `post-request-message` — resolved from the principal kind before any
role-keyed helper is called (REQ-03-016, REQ-03-017). `Membership.role` gains no value,
`ROLE_CAPABILITIES` gains no row, and `CAPABILITY_MATRIX` gains no column, so no staff role
can acquire a client right and no client right can be spelled the way a staff one is.

The two staff unions stay as they are and keep the fall-through they have. `hasCapability`
normalizes an unrecognised role to `viewer` and `viewer` holds `ViewOwnRequests`; `can`
returns `false` for a role its matrix has no row for. That disagreement is why REQ-03-017 is
an ordering rule: neither helper is reached with a client principal, so neither has to be
changed and neither can be relied on to refuse one.

Holding a `ClientCapability` is necessary and not sufficient. Answering, declining and posting
are still decided against the locked request row — the caller must be a party, and for answer
and decline the addressee — exactly as they are for a member (REQ-03-028).

## The notification port

Declared as an abstract class and used as its own DI token, the shape `MailService`
(`apps/api/src/mail/mail.service.ts`) already uses in this codebase.

| Member | Shape | Notes |
|---|---|---|
| `deliver(notification)` | `Promise<DeliveryOutcome>` | Takes the outbox row's id, organization, request, event action, recipient kind and recipient id. |
| `DeliveryOutcome.status` | `delivered` \| `skipped` \| `failed` | Written onto the row with `handledAt`. |
| `DeliveryOutcome.channel` | `String` | `none` from the shipped adapter. |
| `DeliveryOutcome.providerKey` / `providerRef` | `String?` | Recorded so a retry can be reconciled against what the provider already accepted. |

| Adapter | Ships | Behaviour |
|---|---|---|
| `NullRequestNotifier` | yes | Marks every row `skipped`, channel `none`, provider key `null`. Makes no outbound call of any kind. |
| An email adapter | no | A later spec. It writes `channel: "email"` and a provider reference; it adds no column and changes no rule in this bundle. |

**Retry policy.** The outbox is the only outbound path in this feature; no route makes a call
of its own. `deliver` is **not** assumed idempotent, so `attempts` is incremented and the
provider reference recorded **before** the next attempt, a row is retried only from `failed`
and only while `attempts` is below its bound, and the uniqueness constraint means a replayed
event can never manufacture a second row to retry. With the shipped adapter nothing is ever
retried, because nothing ever fails.

## Validation Rules

| # | Field | Constraint | Message | Server-only |
|---|---|---|---|---|
| 1 | contact `email` | Required, a valid address, normalized to lowercase | `CLIENT_USER_MESSAGES.emailInvalid` | no |
| 2 | contact `email` | Not already an active contact of this client | `CLIENT_USER_MESSAGES.alreadyLinked` | yes |
| 3 | the named client | Active | `CLIENT_MESSAGES.clientArchived` | yes |
| 4 | accepting account | Holds no other active principal | `CLIENT_USER_MESSAGES.principalConflict` | yes |
| 5 | `assigneeClientMembershipId` | Present when `assigneeKind` is `client` | `REQUEST_MESSAGES.assigneeInvalid` | no |
| 6 | `assigneeClientMembershipId` | An active contact of the caller's organization | `REQUEST_MESSAGES.assigneeInactive` | yes |
| 7 | `projectId` | Present when `assigneeKind` is `client` | `REQUEST_MESSAGES.clientProjectRequired` | no |
| 8 | `projectId` | Linked to the addressee's client | `REQUEST_MESSAGES.clientProjectMismatch` | yes |
| 9 | `projectId` | The requester holds a `ProjectMember` row on it | `REQUEST_MESSAGES.notOnProject` | yes |
| 10 | `topicId` | Names an active topic of the caller's organization | `REQUEST_MESSAGES.topicUnavailable` | yes |
| 11 | `topicId` | Audience `client` when the addressee is a client, `staff` when it is a member | `REQUEST_MESSAGES.topicAudienceMismatch` | yes |
| 12 | `assigneeKind` | One of `member`, `client` | `REQUEST_MESSAGES.assigneeInvalid` | no |

Rules 1–2 and 5–12 above are checked in the order of the create route's answers: rules 5, 7
and 12 are body shape and are reported together with the topic's own presence check; rule 10
reads the topic row; rules 6 and 11 follow; rules 8 and 9 read the project last.

The client validates the rules above marked `Server-only: no`, for immediate feedback. **The
server re-validates every rule**; the server-only ones need stored rows and have no
client-side half at all. Submit controls are never disabled for validation.

## Required data-testid Attributes

| id | Screen | Asserted |
|---|---|---|
| `client-contacts-section` | Client detail | present for a contact manager |
| `client-contacts-empty-state` | Client detail | present when the client has no contact |
| `client-contact-invite-btn` | Client detail | present for a contact manager |
| `client-contact-invite-modal` | Client detail | present while inviting |
| `client-contact-invite-email` | Client detail | present |
| `client-contact-invite-submit` | Client detail | present |
| `client-contact-invite-error-email` | Client detail | present on an address already contacting this client |
| `client-contact-row-{id}` | Client detail | present |
| `client-contact-row-{id}-remove-btn` | Client detail | present while the contact is active |
| `request-new-assignee-kind` | New request modal | present for a member holding `create-request` |
| `request-new-assignee-client` | New request modal | present when the client addressee kind is chosen |
| `request-new-assignee-member` | New request modal | present when the colleague addressee kind is chosen, absent when the client kind is |
| `request-new-error-assignee` | New request modal | present when no addressee is chosen |
| `request-new-project` | New request modal | present, and required for a client addressee |
| `request-new-topic` | New request modal | present, offering client-audience topics once the client kind is chosen |
| `request-new-topic-empty` | New request modal | present when the chosen audience has no active topic |
| `request-new-submit` | New request modal | absent when the chosen audience has no active topic |
| `requests-page` | Requests list | present for a client principal |
| `sidebar-requests-link` | Sidebar | present for a client principal |
| `nav-members` | Sidebar | absent for a client principal |
| `nav-projects` | Sidebar | absent for a client principal |
| `nav-clients` | Sidebar | absent for a client principal |
| `request-detail-page` | Request detail | present for the addressee client principal |
| `request-detail-assignee` | Request detail | present, naming the contact and their client |
| `request-detail-answer-btn` | Request detail | present for the addressee client principal |
| `request-detail-decline-btn` | Request detail | present for the addressee client principal |
| `request-detail-decline-reason` | Request detail | present while declining |
| `request-detail-decline-confirm` | Request detail | present while declining |
| `request-detail-grant-btn` | Request detail | absent for a client principal, present for the requester |
| `request-detail-composer` | Request detail | present for the addressee client principal |
| `request-detail-thread` | Request detail | present |
| `requests-new-btn` | Requests list | absent for a client principal |

`requests-page`, `sidebar-requests-link`, `requests-new-btn`, `request-detail-page`,
`request-detail-assignee`, `request-detail-answer-btn`, `request-detail-decline-btn`,
`request-detail-decline-reason`, `request-detail-decline-confirm`,
`request-detail-grant-btn`, `request-detail-composer`, `request-detail-thread`,
`request-new-project`, `request-new-topic`, `request-new-topic-empty`,
`request-new-assignee-member`, `nav-members`, `nav-projects` and `nav-clients` are drawn
today; they appear here because this spec's cases assert them for a principal, an addressee
kind or an audience that could not previously exist. Every other id in the table above is
new. Signing in and accepting an invitation use the user-management screens' own ids, which
belong to that area's contract and are not restated here.

## Screens

### Client detail — the contacts section

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Acme                                                        [ Archive ]      │
│ Projects (3)                                                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│ Contacts                                          [ + Invite contact ]       │
│   Dana Stone      dana@acme.example      active     joined 2 Sep  [ Remove ] │
│   Sam Reid        sam@acme.example       invited    sent 2 Sep    [ Remove ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

### The new-request modal, with a client addressee

```
┌──────────────────────────────────────────────┐
│ New request                                  │
│ About      [ Access                     ▾ ]  │   ← client-audience topics only
│ Title      [                              ]  │
│ Description[                              ]  │
│ Project    [ Acme redesign              ▾ ]  │   ← required, and filtered
│ To         [ Client                     ▾ ]  │
│ For        [ Dana Stone                 ▾ ]  │   ← the client name under each option
│ Priority   [ High                       ▾ ]  │
│ Needed by  [ 2026-09-10                   ]  │
│ ☑ Work is blocked                            │
│                          [ Cancel ] [ Send ] │
└──────────────────────────────────────────────┘
```

The field order is the one the modal already has, with the addressee kind inserted above the
addressee itself; `About`, `Title`, `Description`, `Project`, `Priority`, `Needed by` and the
blocking checkbox keep their positions and their ids.

Choosing the client addressee kind re-reads the catalogue with `audience=client`, narrows the
project control to projects the requester is assigned to **and** that belong to the chosen
contact's client, and replaces the member picker with the contact picker. The narrowings are
conveniences; the server decides.

**When the client audience has no active topic** the picker is replaced by
`REQUEST_TOPIC_MESSAGES.pickerEmpty` and no submit control is drawn — the same answer the
modal already gives when the staff audience is empty, evaluated per audience rather than once
for the modal. Every organization is seeded with two client topics, so this state is reached
only by archiving both.

### What a client contact sees

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Acme · Requests                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⛔ #21  Read access to the analytics warehouse    Access                      │
│         Acme redesign · needed by 10 Sep                       Pending       │
└──────────────────────────────────────────────────────────────────────────────┘
```

One navigation entry, no scope control, no vacation section, no All scope.

## UI Description

Components come from `@ds` via `apps/web/src/ds.ts`. No hardcoded colour or size; tokens only.
Light theme only.

| Surface | Behaviour |
|---|---|
| Loading (contacts) | A skeleton inside the contacts section; the client's own details render immediately behind it. |
| Contacts, empty | `client-contacts-empty-state` with a line saying what a contact is for, and the invite control beside it. |
| Inviting | The submit control shows an in-flight state and is disabled only for the duration of the call. |
| Address already a contact | The modal stays open with the error under the field and the typed address intact. |
| Client principal, first load | Nothing renders until the identity endpoint answers, so no member-only navigation is ever painted and then removed. |
| Client principal, no requests | The requests empty state, with copy that does not mention scopes or filters they do not have. |
| Client principal, terminal request | The composer and every action control are not rendered, as they already are for staff. |
| Removed mid-visit | The next call answers `401` and the shell sends them to the sign-in screen; nothing is drawn from a stale response. |
| Addressee inactive | The requester's detail screen shows the inactive banner naming the contact and the client. |
| Switching addressee kind | The topic control re-reads the catalogue for the new audience and the chosen topic is cleared, because a topic of the other audience is one the server will refuse. The title, description, priority, needed-by and blocking values are kept. |
| The chosen audience has no active topic | The picker is replaced by `REQUEST_TOPIC_MESSAGES.pickerEmpty` and the submit control is not drawn, per audience. Switching back to an audience that has topics restores both. |
| The catalogue read fails | Nothing is claimed: the picker is neither filled nor replaced by the empty copy, because "no topics" is a statement and a failed read has not made it. |

## DS gaps

**None.** Both controls this spec adds are built from primitives the design system already
exports through `apps/web/src/ds.ts`, and nothing here is improvised per screen.

| What was in doubt | What it is built from | Why no gap |
|---|---|---|
| The Colleague / Client addressee switch | `Select`, labelled `To`, with two options | The catalogue's own audience switch is a `Select`, so the two screens that choose an audience choose it the same way. `Toggle` — the pill-shaped segmented control the design system exports and the kanban header uses — is the other candidate; it is declined here because every other field of this modal is a labelled `Select` or `Input`, and a segmented control among them reads as a view switch rather than a field. |
| The client contact picker, which must show a person and their client | `Select`, whose option `label` is a `ReactNode` | A two-line option needs no new primitive: the option renders the person's name over the client's, and the same `label` type is what the topics picker already passes a plain string to. |

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | An address holding an active staff membership accepts a client invitation | `409` `CLIENT_USER_MESSAGES.principalConflict`. No `ClientMembership` is written and the staff membership is untouched. |
| 2 | A contact is removed while they are reading a request | The stamp rotates, so their next call answers `401` and the shell sends them to sign in. Nothing they already read is retracted. |
| 3 | A contact is removed and later invited again | The same `ClientMembership` returns to `active`; no second row exists, and the requests addressed to them are theirs again. |
| 4 | The client is archived while a contact is signed in | The contact keeps their session and their open requests. The client is not offered for new projects, and no new contact may be invited to it. |
| 5 | A request is addressed to a client contact who is then removed | The request stays open and reports its assignee as inactive. Nothing is cancelled and nothing is reassigned. |
| 6 | A requester is unassigned from the project after raising the request | The request is unaffected. The rule is a gate at creation, not a standing condition, because retracting a client's request when staffing changes would be worse than the leak it prevents. |
| 7 | A member raises a client request naming a project of a different client | `400` `REQUEST_MESSAGES.clientProjectMismatch`, with no hint whether the project exists. |
| 8 | A client principal calls the members route | `404`, identical to an organization they have no part in. |
| 9 | A client principal calls the create-request route directly | `403` `CLIENT_USER_MESSAGES.clientCannotCreate`, and the control is not drawn. |
| 10 | A client principal calls the grant route on their own request | `403` `REQUEST_MESSAGES.notYoursToGrant`. The control is not drawn for them. |
| 11 | Two contacts of the same client are addressed by two requests on one project | Both exist independently; a contact sees only the one addressed to them. |
| 12 | The notifier throws on every row | The requests, their statuses and their events are exactly as committed. Rows sit at `failed` with `lastError` set, and the screens are unaffected. |
| 13 | The same event is dispatched twice | The second write is rejected by the uniqueness constraint. Exactly one row per event and recipient exists, whatever the dispatcher did. |
| 14 | A recipient's principal is removed before delivery | The row is marked `skipped`. No address is looked up and none is stored. |
| 15 | A client contact posts on a request that was closed a moment earlier | `409` `REQUEST_MESSAGES.threadClosed`, the same answer a member gets. |
| 16 | An account with no principal at all signs in with the correct password | `400` `AUTH_MESSAGES.deactivated`, which is what the route answers today for the same account. |
| 17 | A client principal reaches a role-keyed capability helper | It must not be able to. The helper would normalize their absent role to `viewer` and hand back the viewer capability set, which includes `ViewOwnRequests` — a grant, not a refusal. REQ-03-017 puts the principal kind ahead of every such call for this reason. |
| 18 | A member raises a client request under a topic that was archived a moment earlier | `400` `REQUEST_MESSAGES.topicUnavailable`. The audience is not compared, so an archived client topic and a staff topic are told apart by the answer and an archived one of either audience is not. |
| 19 | A member sends `assigneeKind: "client"` before contacts exist | `400` `REQUEST_MESSAGES.assigneeInvalid` — today's answer, because the kind itself is refused by the body check. It is the answer this spec replaces, and the reason the client rows of REQ-03-024's table are unobservable until it does. |
| 20 | Both seeded client topics are archived and a member chooses the client addressee kind | The picker is replaced by the empty-catalogue copy and no request can be raised against a client until a topic is added. Nothing is broken and no request already raised is affected. |

## Security

- Every organization route states its guard chain above; every query filters on
  `session.organizationId`, a required argument with no default.
- **A client principal is refused with `404`, never `403`, on every organization route this
  spec does not grant them**, matching `OrgScopeGuard`'s answer for an organization the caller
  has no part in. The shape of the staff product is therefore not enumerable by a contact.
- A contact reading a request they are not the addressee of gets the same `404` as one that
  does not exist, so request existence is not enumerable either.
- **A role-keyed check does not fail closed on a principal with no role.** `normalizeRole`
  maps an unrecognised value — `null` included — to `viewer`, so `hasCapability` answers a
  client principal with the viewer set rather than with nothing; the sibling helper `can`
  answers `false` for the same input. Neither is reached with a client principal, and the
  ordering that keeps them unreachable (REQ-03-017) is a stated rule rather than a property
  of where the checks happen to sit today.
- **Revocation is the existing mechanism**: removing a contact rotates `Account.securityStamp`,
  which `SessionGuard` re-reads on every request, so every live session ends on the next call.
- The session cookie's fields are unchanged, and the principal kind is resolved from the
  database on each request. A cookie cannot assert a principal it was not issued for, and no
  cookie minted before this spec becomes invalid.
- **PII.** A client contact's email address is PII. It is stored once, on `Account`. It is not
  copied into `RequestNotification`, is never written to `lastError`, and appears in no event
  row — the trail snapshots display names only. It is visible on the contacts list to holders
  of `ViewClients` and on a request to the parties and to holders of `ViewAllRequests`.
- This spec adds **no unauthenticated route** of its own. It amends two that are already
  public — sign-in and invitation acceptance — and adds no new refusal to either that names an
  account.
- No author-controlled markup is introduced. Messages and descriptions remain plain text on
  write and are rendered as text.
