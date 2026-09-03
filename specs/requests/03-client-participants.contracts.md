# 03 — Client Participants & Client-Addressed Requests · Contracts

Tables only. The rules are in [03-client-participants.md](03-client-participants.md) and are
named here by id.

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
| `POST /api/organizations/{orgId}/requests` | session, org scope | `201` | `400` `REQUEST_MESSAGES.assigneeInvalid`, `REQUEST_MESSAGES.assigneeInactive`, `REQUEST_MESSAGES.clientProjectRequired`, `REQUEST_MESSAGES.clientProjectMismatch`, `REQUEST_MESSAGES.notOnProject`, `REQUEST_MESSAGES.topicAudienceMismatch`; `403` `CLIENT_USER_MESSAGES.clientCannotCreate`; `404` |
| `GET /api/organizations/{orgId}/requests` | session, org scope | `200` | `404` |
| `GET /api/organizations/{orgId}/requests/{requestId}` | session, org scope | `200` | `404` |
| `POST /api/organizations/{orgId}/requests/{requestId}/answer` | session, org scope | `200` | `403` `REQUEST_MESSAGES.notYoursToAnswer`; `404`; `409` `REQUEST_MESSAGES.alreadyTerminal` |
| `POST /api/organizations/{orgId}/requests/{requestId}/decline` | session, org scope | `200` | `400` `REQUEST_MESSAGES.declineReasonRequired`; `403` `REQUEST_MESSAGES.notYoursToDecline`; `404` |
| `POST /api/organizations/{orgId}/requests/{requestId}/grant` | session, org scope | `200` | `403` `REQUEST_MESSAGES.notYoursToGrant`; `404` |
| `POST /api/organizations/{orgId}/requests/{requestId}/messages` | session, org scope | `201` | `404`; `409` `REQUEST_MESSAGES.threadClosed` |
| `GET /api/organizations/{orgId}/members` | session, org scope | `200` | `404` |
| `GET /api/organizations/{orgId}/projects` | session, org scope | `200` | `404` |

The members and projects routes are listed because REQ-03-019 changes what they answer a
client principal, and a case has to name them. The contacts routes are new; everything else is
amended.

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
| `REQUEST_MESSAGES.notYoursToAnswer` | `POST /api/organizations/{orgId}/requests/{requestId}/answer` | Only the person this is addressed to can answer it | no |
| `REQUEST_MESSAGES.notYoursToDecline` | `POST /api/organizations/{orgId}/requests/{requestId}/decline` | Only the person this is addressed to can decline it | no |
| `REQUEST_MESSAGES.notYoursToGrant` | `POST /api/organizations/{orgId}/requests/{requestId}/grant` | Only the person who asked can confirm this | no |
| `REQUEST_MESSAGES.declineReasonRequired` | `POST /api/organizations/{orgId}/requests/{requestId}/decline` | Say why you cannot provide this | no |
| `REQUEST_MESSAGES.alreadyTerminal` | `POST /api/organizations/{orgId}/requests/{requestId}/answer` | This request has already been closed | no |
| `REQUEST_MESSAGES.threadClosed` | `POST /api/organizations/{orgId}/requests/{requestId}/messages` | This request is closed | no |

`CLIENT_USER_MESSAGES.principalConflict` names no address and no organization, so it tells a
stranger holding a valid token nothing about who else uses the address beyond the fact that
the accept did not proceed.

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

None in the role table. A client principal's capabilities come from a flat exported list —
`view-own-requests`, `answer-request`, `decline-request`, `post-request-message` — resolved
before any role is consulted (REQ-03-016, REQ-03-017). `Membership.role` gains no value and
`ROLE_CAPABILITIES` gains no row, so no staff role can acquire a client capability.

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
| 10 | `topicId` | Audience `client` when the addressee is a client | `REQUEST_MESSAGES.topicAudienceMismatch` | yes |

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
| `request-new-error-assignee` | New request modal | present when no addressee is chosen |
| `request-new-project` | New request modal | present, and required for a client addressee |
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
`request-new-project`, `nav-members`, `nav-projects` and `nav-clients` are drawn today; they
appear here because this spec's cases assert them for a principal that could not previously
exist. Signing in and accepting an invitation use the user-management screens' own ids, which
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
│ To         ( Colleague | Client )            │
│            [ Dana Stone · Acme          ▾ ]  │
│ Project    [ Acme redesign              ▾ ]  │   ← required, and filtered
│ Priority   [ High                       ▾ ]  │
│ Needed by  [ 2026-09-10                   ]  │
│ ☑ Work is blocked                            │
│                          [ Cancel ] [ Send ] │
└──────────────────────────────────────────────┘
```

Choosing the client addressee kind narrows the project control to projects the requester is
assigned to **and** that belong to the chosen contact's client, and narrows the topic control
to the client audience. Both narrowings are conveniences; the server decides.

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

## DS gaps

| Gap | Where it bites | What ships instead | What closes it |
|---|---|---|---|
| No segmented-control primitive | The Colleague / Client addressee switch | Two `Button`s with an aria-pressed state carrying `var(--sp-*)` and `var(--fs-*)` tokens, the same stand-in the topics catalogue uses for its audience switch | A `SegmentedControl` in `@ds`, adopted by both screens at once |
| No two-line option primitive for a picker | The client contact picker, which must show a person and their client | A native `<select>` whose option text is the person, with the client name rendered beside the control once chosen | An `OptionWithMeta` in `@ds` |

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

## Security

- Every organization route states its guard chain above; every query filters on
  `session.organizationId`, a required argument with no default.
- **A client principal is refused with `404`, never `403`, on every organization route this
  spec does not grant them**, matching `OrgScopeGuard`'s answer for an organization the caller
  has no part in. The shape of the staff product is therefore not enumerable by a contact.
- A contact reading a request they are not the addressee of gets the same `404` as one that
  does not exist, so request existence is not enumerable either.
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
