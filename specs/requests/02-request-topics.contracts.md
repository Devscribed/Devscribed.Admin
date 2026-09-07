# 02 — Request Topics & Vocabulary · Contracts

Tables only. The rules are in [02-request-topics.md](02-request-topics.md) and are named here
by id.

## Routes

Every route below sits behind `SessionGuard` → `OrgScopeGuard` (`apps/api/src/auth/session.guard.ts`,
`apps/api/src/auth/org-scope.guard.ts`). Queries filter on `session.organizationId`; the path
`orgId` is checked and never used as a selector, so a row in another organization answers `404`
with no body message, identical to a row that does not exist.

| Route | Guards | Success | Errors |
|---|---|---|---|
| `GET /api/organizations/{orgId}/request-topics` | session, org scope | `200` | `400` `REQUEST_TOPIC_MESSAGES.audienceUnknown`, `REQUEST_TOPIC_MESSAGES.statusUnknown`; `404` |
| `POST /api/organizations/{orgId}/request-topics` | session, org scope, `ManageRequestTopics` | `201` | `400` `REQUEST_TOPIC_MESSAGES.audienceUnknown`, `REQUEST_TOPIC_MESSAGES.nameRequired`, `REQUEST_TOPIC_MESSAGES.nameTooLong`, `REQUEST_TOPIC_MESSAGES.typeUnknown`, `REQUEST_TOPIC_MESSAGES.sortOrderInvalid`; `403` `REQUEST_TOPIC_MESSAGES.manageForbidden`; `404`; `409` `REQUEST_TOPIC_MESSAGES.nameDuplicate` |
| `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | session, org scope, `ManageRequestTopics` | `200` | `400` `REQUEST_TOPIC_MESSAGES.nameRequired`, `REQUEST_TOPIC_MESSAGES.nameTooLong`, `REQUEST_TOPIC_MESSAGES.audienceImmutable`, `REQUEST_TOPIC_MESSAGES.typeImmutable`, `REQUEST_TOPIC_MESSAGES.sortOrderInvalid`; `403` `REQUEST_TOPIC_MESSAGES.manageForbidden`; `404`; `409` `REQUEST_TOPIC_MESSAGES.nameDuplicate` |
| `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` | session, org scope, `ManageRequestTopics` | `200` | `403` `REQUEST_TOPIC_MESSAGES.manageForbidden`; `404`; `409` `REQUEST_TOPIC_MESSAGES.statusUnchanged` |
| `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore` | session, org scope, `ManageRequestTopics` | `200` | `403` `REQUEST_TOPIC_MESSAGES.manageForbidden`; `404`; `409` `REQUEST_TOPIC_MESSAGES.statusUnchanged` |
| `POST /api/organizations/{orgId}/requests` | session, org scope, `CreateRequest` | `201` | `400` `REQUEST_MESSAGES.topicRequired`, `REQUEST_MESSAGES.topicUnavailable`, `REQUEST_MESSAGES.topicAudienceMismatch`, `REQUEST_MESSAGES.classifierNotAccepted`, and the field messages the route already answers, listed under it below; `403` `REQUEST_MESSAGES.createForbidden`; `404` |
| `GET /api/organizations/{orgId}/requests` | session, org scope | `200` | `400` for an unrecognised `status`, `scope` or `type`, in the shape below; `403` `REQUEST_MESSAGES.scopeForbidden`; `404` |
| `PATCH /api/organizations/{orgId}/requests/{requestId}` | session, org scope | `200` | `400` `REQUEST_MESSAGES.fieldImmutable`; `403` `REQUEST_MESSAGES.editForbidden`; `404` |

The last three already exist and are amended here; the topic routes are new. The requests
controller is `apps/api/src/requests/requests.controller.ts` and its service is
`apps/api/src/requests/requests.service.ts`.

### `GET /api/organizations/{orgId}/request-topics`

Query: `audience` (`staff` | `client`; omitted returns both), `status` (`active` default |
`archived` | `all`). A value outside either set is refused with `400` —
`REQUEST_TOPIC_MESSAGES.audienceUnknown` for the first, `REQUEST_TOPIC_MESSAGES.statusUnknown`
for the second (REQ-02-002) — never silently defaulted, so a typo in a query string cannot look
like an empty catalogue.

```json
{
  "topics": [
    {
      "id": "…",
      "audience": "staff",
      "type": "access",
      "name": "VPN",
      "sortOrder": 10,
      "status": "active",
      "createdAt": "2026-09-02T18:56:12.403Z",
      "updatedAt": "2026-09-02T18:56:12.403Z"
    }
  ]
}
```

### `POST /api/organizations/{orgId}/request-topics`

```json
{ "audience": "staff", "type": "access", "name": "Figma seat", "sortOrder": 45 }
```

`201` with `{ "topic": { … } }`, the row shape above. `sortOrder` is optional and defaults to
the highest stored value in that audience plus ten, so a new topic lands at the bottom of its
list without the caller computing anything.

### `PATCH /api/organizations/{orgId}/request-topics/{topicId}`

Accepts `name` and `sortOrder`. Accepts `audience` and `type` only when each equals the stored
value; a different one is refused, not ignored (REQ-02-004). `200` with `{ "topic": { … } }`.

### `PATCH …/request-topics/{topicId}/archive` · `/restore`

No body. `200` with `{ "topic": { … } }`.

### `POST /api/organizations/{orgId}/requests` — amended

```json
{
  "topicId": "…",
  "title": "VPN profile for the new hire",
  "description": "Needs the staging VPN.",
  "projectId": "…",
  "assigneeKind": "member",
  "assigneeMembershipId": "…",
  "priority": "high",
  "blocking": true,
  "neededBy": "2026-09-10"
}
```

`201` with the row shape below. `type` and `accessKind` are no longer accepted in the body
(REQ-02-022); `type` is written by the server from the topic and `accessKind` is written `null`
(REQ-02-021). Neither name is validated as a body field here, so this route answers with none
of `REQUEST_MESSAGES.typeUnknown`, `REQUEST_MESSAGES.accessKindRequired`,
`REQUEST_MESSAGES.accessKindUnknown` or `REQUEST_MESSAGES.accessKindNotAllowed`.

Every other `400` this route answers is unchanged, over the fields the body above still
carries: `REQUEST_MESSAGES.titleRequired`, `REQUEST_MESSAGES.titleTooShort`,
`REQUEST_MESSAGES.titleTooLong`, `REQUEST_MESSAGES.descriptionTooLong`,
`REQUEST_MESSAGES.priorityUnknown`, `REQUEST_MESSAGES.neededByInvalid`,
`REQUEST_MESSAGES.neededByPast`, `REQUEST_MESSAGES.assigneeInvalid`,
`REQUEST_MESSAGES.assigneeInactive` and `REQUEST_MESSAGES.projectUnavailable`. Those, and the
topic messages this spec adds, come back in the field-keyed body
`{ "error": "validation_error", "fields": { … } }`, every failing field at once —
`REQUEST_MESSAGES.topicRequired`, `REQUEST_MESSAGES.topicUnavailable` and
`REQUEST_MESSAGES.topicAudienceMismatch` under `topicId`, and
`REQUEST_MESSAGES.classifierNotAccepted` under the refused name, `type` or `accessKind`.

The `201` body observed today carries `id`, `number`, `type`, `accessKind`, `title`,
`description`, `status`, `priority`, `blocking`, `overdue`, `neededBy`, `project`,
`requester`, `assignee`, `createdAt`, `lastActivityAt`, `answeredAt`, `resolvedAt` and
`messageCount`. This spec adds one member and removes none:

```json
{ "topic": { "id": "…", "name": "VPN", "audience": "staff", "type": "access", "status": "active" } }
```

The member is keyed on `topicLabel`: `topic` is `null` exactly when the request carries no
`topicLabel`, which is every request raised before this spec and no request raised after it.
`topic.name` is the **snapshot** `topicLabel`, not the catalogue's current name (REQ-02-025).
`topic.id`, `topic.audience`, `topic.type` and `topic.status` are read from the row `topicId`
names, so a screen can mark a topic that has since been archived; each of the four is `null`
when the request carries a label and no `topicId`, the state a row reaches only if its topic
was deleted outside this product's routes.

### `GET /api/organizations/{orgId}/requests` — amended

Query gains `topicId`. `status` gains the value `closed` (REQ-02-027) alongside the five it
already accepts and `all`. Each row of `requests[]` gains the same `topic` member.

A `status`, `scope` or `type` outside its set is refused with `400` and the body
`{ "error": "validation_error", "fields": { "status": "unknown_value" } }`, keyed by the
parameter at fault and carrying that code rather than user-facing copy. `closed` is inside
the `status` set from this spec on, so it is accepted rather than refused.

## Error Messages

`REQUEST_TOPIC_MESSAGES` is a new export in `packages/validation/src/index.ts`. The
`REQUEST_MESSAGES` rows extend the existing export in place — none of the keys collides with
one already there.

| Export | Route | Message | New |
|---|---|---|---|
| `REQUEST_TOPIC_MESSAGES.audienceUnknown` | `GET /api/organizations/{orgId}/request-topics`, `POST /api/organizations/{orgId}/request-topics` | Choose a valid audience | yes |
| `REQUEST_TOPIC_MESSAGES.statusUnknown` | `GET /api/organizations/{orgId}/request-topics` | Choose a valid status | yes |
| `REQUEST_TOPIC_MESSAGES.audienceImmutable` | `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | A topic cannot change audience after it is created | yes |
| `REQUEST_TOPIC_MESSAGES.typeUnknown` | `POST /api/organizations/{orgId}/request-topics` | Choose whether this topic is an access or a question | yes |
| `REQUEST_TOPIC_MESSAGES.typeImmutable` | `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | A topic cannot change kind after it is created | yes |
| `REQUEST_TOPIC_MESSAGES.nameRequired` | `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | Enter a topic name | yes |
| `REQUEST_TOPIC_MESSAGES.nameTooLong` | `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | Topic name must be 60 characters or fewer | yes |
| `REQUEST_TOPIC_MESSAGES.nameDuplicate` | `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | A topic with this name already exists for this audience | yes |
| `REQUEST_TOPIC_MESSAGES.sortOrderInvalid` | `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | Enter a whole number for the order | yes |
| `REQUEST_TOPIC_MESSAGES.manageForbidden` | `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore` | You do not have permission to manage request topics | yes |
| `REQUEST_TOPIC_MESSAGES.statusUnchanged` | `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore` | This topic is already in that state | yes |
| `REQUEST_TOPIC_MESSAGES.pickerEmpty` | — | No request topics are available. An admin or manager can add one in Settings. | yes |
| `REQUEST_MESSAGES.topicRequired` | `POST /api/organizations/{orgId}/requests` | Choose what this request is about | yes |
| `REQUEST_MESSAGES.topicUnavailable` | `POST /api/organizations/{orgId}/requests` | That topic is not available | yes |
| `REQUEST_MESSAGES.topicAudienceMismatch` | `POST /api/organizations/{orgId}/requests` | That topic cannot be used for this addressee | yes |
| `REQUEST_MESSAGES.classifierNotAccepted` | `POST /api/organizations/{orgId}/requests` | The request kind is set by the topic and cannot be sent | yes |
| `REQUEST_MESSAGES.createForbidden` | `POST /api/organizations/{orgId}/requests` | You do not have permission to create requests | no |
| `REQUEST_MESSAGES.scopeForbidden` | `GET /api/organizations/{orgId}/requests` | You do not have permission to view other people's requests | no |
| `REQUEST_MESSAGES.fieldImmutable` | `PATCH /api/organizations/{orgId}/requests/{requestId}` | That field cannot be changed after the request is created | no |
| `REQUEST_MESSAGES.editForbidden` | `PATCH /api/organizations/{orgId}/requests/{requestId}` | You do not have permission to edit this request | no |

`REQUEST_TOPIC_MESSAGES.pickerEmpty` carries no route: it is screen copy for REQ-02-017 and
no endpoint emits it.

**Decided:** that copy says *available* rather than *yet*, and names both grantees. The screen
is reached just as often by archiving the last active topic (edge case 13), where topics
exist, and `manage-request-topics` is a manager's as well as an admin's. Rejected: "There are
no request topics yet. An admin can add one in Settings", which is false in that state and
sends the reader to the wrong person.

## Status Labels

One exported map, read by the list rows, the detail header, the detail history entries and the
filter control (REQ-02-028). It is display copy, not a validation message, and lives beside
the messages so web and API cannot disagree about the word a status shows as.

| Stored status | Label | Closure sub-label |
|---|---|---|
| `open` | Pending | — |
| `answered` | In progress | — |
| `granted` | Completed | — |
| `declined` | Closed | declined |
| `cancelled` | Closed | cancelled |

The filter control offers `All statuses`, `Pending`, `In progress`, `Completed` and `Closed`,
sending `all`, `open`, `answered`, `granted` and `closed`. The endpoint keeps accepting
`declined` and `cancelled` for a link somebody saved.

The map covers the stored statuses of a `Request` and nothing else. The vacation section of the
same list keeps its own vocabulary — a vacation card goes on reading `Pending`, `Approved`,
`Rejected` or `Cancelled` from its own stored value — so selecting Closed can leave a card
reading Rejected beside a request reading Closed.

**Decided:** the four words are the request vocabulary alone. Rejected: relabelling vacations
through the same map, which would call an approved vacation Completed and a rejected one
Closed, renaming a decision this spec has no requirement about.

## Data Model

Migrations are additive: a new table, nullable columns on `Request`, no rename, no drop, and no
new `NOT NULL` on an existing table.

### RequestTopic

| Field | Type | Description |
|---|---|---|
| `id` | `String` PK, uuid | |
| `organizationId` | `String` FK → `Organization`, **Cascade** | Scope key. A required argument with no default on every service method (REQ-02-001). |
| `audience` | `String` | `staff` \| `client`. A documented string column rather than a Prisma enum, following `Client.status` and `Project.status`, so a third audience is additive. |
| `type` | `String` | `access` \| `question`. Written onto the request raised under the topic (REQ-02-021). |
| `name` | `String` `@db.VarChar(60)` | Trimmed, whitespace-collapsed. |
| `sortOrder` | `Int` `@default(0)` | Ascending. Ties break on name (REQ-02-009). |
| `status` | `String` `@default("active")` | `active` \| `archived`. Archiving is the soft delete; there is no hard delete (REQ-02-014). |
| `createdAt` | `DateTime` `@default(now())` | |
| `updatedAt` | `DateTime` `@updatedAt` | |
| `createdByAccountId` | `String?` FK → `Account`, **SetNull** | Audit, set from the session. `null` on a seeded row, which nobody created. |
| `archivedAt` | `DateTime?` | Set on archive, cleared on restore. |
| `archivedByAccountId` | `String?` FK → `Account`, **SetNull** | Set on archive, cleared on restore. |

Indexes: `@@index([organizationId, audience, status])` — the picker's query. Uniqueness is a
functional `UNIQUE` index on `(organizationId, audience, LOWER(name))` written in the
migration SQL, not a Prisma `@@unique`, which would be case-sensitive. This is the device
`Client` already uses for its per-organization name uniqueness.

### Request (existing table, new columns)

| Field | Type | Description |
|---|---|---|
| `topicId` | `String?` FK → `RequestTopic`, **SetNull** | The chosen topic. Nullable, so requests that predate this spec need no backfill. `SetNull` fires through no route: this spec exposes none that deletes a topic (REQ-02-014). |
| `topicLabel` | `String?` `@db.VarChar(60)` | Snapshot of the topic's name at creation. Written once, never rewritten (REQ-02-023, REQ-02-025). |

`type` and `accessKind` keep their columns and their stored values. `type` is now written by
the server; `accessKind` is written on no new row and is read for display on rows that carry
one.

### New Capabilities

Registered in **both** unions, as the clients and holidays surfaces established.

`MemberCapability` (lowercase-dashed, read by `can()`): `manage-request-topics` —
admin, manager.

`Capability` (PascalCase, read by `@RequireCapability`): `ManageRequestTopics` — admin,
manager. The check runs in the topics service, not in `CapabilityGuard`, because the refusal
must carry `REQUEST_TOPIC_MESSAGES.manageForbidden` and the guard's message is fixed; the
`ManageRequestTopics` entry in the Routes table names the capability, not the guard.

No existing capability changes meaning or grants.

### New Enums

None. Every value set is a `String` column validated in `packages/validation`.

## Seed Data

Written for every organization at creation (REQ-02-015) and for every existing organization by
the backfill migration (REQ-02-016), which is a migration file of its own, separate from the
one creating the table, and inserts only where the organization holds no row, so executing it
twice is safe. `createdByAccountId` is `null` on each.

| audience | sortOrder | name | type |
|---|---|---|---|
| staff | 10 | VPN | access |
| staff | 20 | Claude | access |
| staff | 30 | Repository | access |
| staff | 40 | Environment | access |
| staff | 50 | Server | access |
| staff | 60 | Admin panel | access |
| staff | 70 | Documentation | access |
| staff | 80 | Question | question |
| staff | 90 | Other | question |
| client | 10 | Access | access |
| client | 20 | Other | question |

Every row is the organization's own from the moment it is written: renaming or archiving any
of them is an ordinary edit, and the seed is never re-applied.

**Decided:** the staff seed is wider than VPN, Claude, Question and Other, because it also
names the access kinds the retired `accessKind` dial offered — `repository`, `environment`,
`server`, `vpn`, `admin_panel` and `documentation` — so an organization that classified
requests by that dial finds the same words in the catalogue and types none of them into
Settings before its next request. Rejected: seeding VPN, Claude, Question and Other alone,
which hands every organization the same list to re-type and makes the catalogue narrower than
the vocabulary the product already had. The wider seed is also the cheaper mistake: a seeded
row an organization does not want is archived from its row in Settings, while a word the seed
omits has to be typed there before anybody can raise a request under it.

## Validation Rules

| # | Field | Constraint | Message | Server-only |
|---|---|---|---|---|
| 1 | topic `name` | Required, 1–60 chars after trim and whitespace collapse | `REQUEST_TOPIC_MESSAGES.nameRequired` / `REQUEST_TOPIC_MESSAGES.nameTooLong` | no |
| 2 | topic `audience` | One of `staff`, `client` | `REQUEST_TOPIC_MESSAGES.audienceUnknown` | no |
| 3 | topic `audience` on rename | Equal to the stored value | `REQUEST_TOPIC_MESSAGES.audienceImmutable` | yes |
| 3a | topic `type` on rename | Equal to the stored value | `REQUEST_TOPIC_MESSAGES.typeImmutable` | yes |
| 4 | topic `type` | One of `access`, `question` | `REQUEST_TOPIC_MESSAGES.typeUnknown` | no |
| 5 | topic `name` uniqueness | Unique per organization and audience, ignoring case | `REQUEST_TOPIC_MESSAGES.nameDuplicate` | yes |
| 6 | topic `sortOrder` | Optional integer, 0–32767 | An out-of-range integer is clamped to the bound and answers `201` or `200`; a value that is not an integer — a string, a fraction, a boolean — is refused with `400` `REQUEST_TOPIC_MESSAGES.sortOrderInvalid` rather than coerced or dropped, so a caller never gets a topic ordered somewhere it did not ask for | yes |
| 7 | request `topicId` | Required | `REQUEST_MESSAGES.topicRequired` | no |
| 8 | request `topicId` | An active topic in the caller's organization | `REQUEST_MESSAGES.topicUnavailable` | yes |
| 9 | request `topicId` | Audience matching the addressee kind, compared only on a topic rule 8 has found active | `REQUEST_MESSAGES.topicAudienceMismatch` | yes |
| 10 | request `type`, `accessKind` | Absent from the body | `REQUEST_MESSAGES.classifierNotAccepted` | yes |

On a topic write, a violation of the audience or kind immutability is answered before the
name-uniqueness one, so a rename carrying both a changed `audience` and a name another topic of
that audience already holds answers `400` `REQUEST_TOPIC_MESSAGES.audienceImmutable` and writes
nothing.

The client validates rules 1, 2, 4 and 7 for immediate feedback. **The server re-validates
every rule**, including the ones the client cannot check: 3, 3a, 5, 8 and 9 need the stored row,
and 10 is a contract the client is simply expected to keep. Submit controls are never disabled
for validation — clicking an invalid form shows every error and focuses the first invalid
field.

## Required data-testid Attributes

| id | Screen | Asserted |
|---|---|---|
| `settings-tab-request-topics` | Sidebar | present for admin, absent for `user` |
| `request-topics-page` | Settings › Request topics | present for a caller holding `manage-request-topics`, and absent for one without it |
| `request-topics-audience-staff` | Settings › Request topics | present |
| `request-topics-audience-client` | Settings › Request topics | present |
| `request-topics-add-btn` | Settings › Request topics | present |
| `request-topic-row-{id}` | Settings › Request topics | present |
| `request-topic-row-{id}-up-btn` | Settings › Request topics | present on an active row, absent on the first row of the audience and on every archived row |
| `request-topic-row-{id}-down-btn` | Settings › Request topics | present on an active row, absent on the last row of the audience and on every archived row |
| `request-topic-row-{id}-rename-btn` | Settings › Request topics | present on an active row, absent on an archived row; opening it draws `request-topic-modal` on that row |
| `request-topic-row-{id}-archive-btn` | Settings › Request topics | present while active |
| `request-topic-row-{id}-restore-btn` | Settings › Request topics | present while archived |
| `request-topic-modal` | Settings › Request topics | present while adding or renaming |
| `request-topic-name` | Settings › Request topics | present |
| `request-topic-audience` | Settings › Request topics | present when adding, absent when renaming |
| `request-topic-type` | Settings › Request topics | present when adding, absent when renaming |
| `request-topic-submit` | Settings › Request topics | present |
| `request-topic-error-name` | Settings › Request topics | present on a duplicate name |
| `request-new-topic` | New request modal | present, and absent when the audience has no active topic |
| `request-new-topic-empty` | New request modal | present when the audience has no active topic |
| `request-new-error-topic` | New request modal | present when no topic is chosen |
| `requests-topic-filter` | Requests list | present, offering every topic of the organization with the archived ones marked archived, from the catalogue read carrying `status=all` (REQ-02-031) |
| `request-row-{id}-topic` | Requests list | present when the request carries a topic |
| `request-detail-topic` | Request detail | present when the request carries a topic |
| `requests-new-btn` | Requests list | present for a requester |
| `request-new-modal` | Requests list | present while raising a request |
| `request-new-submit` | New request modal | present, and absent when the picker is empty |
| `requests-status-filter` | Requests list | present, showing the four labels |
| `request-row-{id}-status` | Requests list | present, showing the label for the stored status |
| `request-detail-status` | Request detail | present, showing the label and the closure sub-label |
| `request-detail-history` | Request detail | present, its status entries showing the labels and not the stored values |
| `requests-page` | Requests list | present |

`requests-new-btn`, `request-new-modal`, `request-new-submit`, `requests-status-filter`,
`request-row-{id}-status`, `request-detail-status`, `request-detail-history` and `requests-page`
are already drawn by the requests screens; they appear here because this spec's cases assert
them and their contents change. `request-new-type` and `request-new-access-kind` are
**removed** from the new-request modal by REQ-02-022 and appear in no case here.

## Screens

### `/org/{orgId}/settings/request-topics`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Settings › Request topics                            [ + Add topic ]         │
├──────────────────────────────────────────────────────────────────────────────┤
│  ( Staff | Client )                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│      [▼]  VPN         access                        [ Rename ] [ Archive ]   │
│   [▲][▼]  Claude      access                        [ Rename ] [ Archive ]   │
│   [▲][▼]  Repository  access                        [ Rename ] [ Archive ]   │
│   [▲][▼]  Question    question                      [ Rename ] [ Archive ]   │
│   [▲]     Other       question                      [ Rename ] [ Archive ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│  Archived                                                                    │
│     Legacy VPN        access                                   [ Restore ]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

Ordering is the up and down controls the DS gaps table commits to, and no drag handle: the
`@ds` barrel (`apps/web/src/ds.ts`) exports no drag or sortable primitive, and a pointer-only
handle is unreachable from the keyboard. Each control issues one
`PATCH …/request-topics/{topicId}` carrying that row's new `sortOrder` and no other row's: up
sends the `sortOrder` of the row above minus one, down sends the `sortOrder` of the row below
plus one, so the moved row lands past the neighbour it moved over. A value outside `0`–`32767`
is clamped to the bound (validation rule 6), and the clamp wins where the two meet: against a
neighbour already holding `0` or `32767` the moved row clamps onto the neighbour's own value,
the two tie, and the name tiebreak (REQ-02-009) decides the order — so that one press can leave
the list as it was, and every other press reorders it.

**Decided:** the moved row takes a value one past its neighbour, clamped to the bound, and the
press against a row already on the bound is the one that may not move. Rejected: sending the
neighbour's own value on every press, which ties the moved row to its neighbour on every move
rather than only at the bound; and reaching past the bound with a second `PATCH` renumbering
the neighbour, which makes one press into a pair of writes with no lock between them.

The first row of an audience draws no up control and the last draws no down one —
a control that cannot act is not drawn. The archived list draws neither, and draws no rename
control: the route accepts a `sortOrder` and a name on an archived topic, and the screen
offers restoring it instead.

### The new-request modal, amended

```
┌──────────────────────────────────────────────┐
│ New request                                  │
│ About      [ VPN                        ▾ ]  │   ← replaces Type + Access kind
│ Title      [                              ]  │
│ Project    [ Any                        ▾ ]  │
│ To         [ A. Admin                   ▾ ]  │
│ Priority   [ Normal                     ▾ ]  │
│ Needed by  [ 2026-09-10                   ]  │
│ ☐ Work is blocked                            │
│                          [ Cancel ] [ Send ] │
└──────────────────────────────────────────────┘
```

### The list, amended

```
│ ( Mine | All )  About [ Any ▾ ]  Status [ Pending ▾ ]  Project [ Any ▾ ]  🔍 │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⛔ #14  Staging DB access          VPN      Acme redesign   → A. Admin       │
│         blocked · needed by 2 Sep (overdue)                    Pending       │
├──────────────────────────────────────────────────────────────────────────────┤
│    #9   Which invoice template?    Question                 → A. Admin       │
│                                                    Closed · cancelled        │
```

The existing Type control (`requests-type-filter`) stays as drawn today, between About and
Status; it is omitted from the mock only for width. It still selects the vacation section and
is not changed by this spec.

## UI Description

Components come from `@ds` via `apps/web/src/ds.ts`. No hardcoded colour or size; tokens only.
Light theme only, as everywhere else this release.

| Surface | Behaviour |
|---|---|
| Loading (catalogue) | A skeleton in the rows' place; no empty state, no flash of "no topics". |
| Loaded, empty audience | The audience tab renders its heading, an explanatory line and the Add control; the list area is empty rather than absent. |
| Saving a topic | The submit control shows an in-flight state and is disabled only for the duration of the call, released on success and on failure. |
| Invalid submission | Every field error is rendered and focus moves to the first invalid field; the submit control is never disabled for validation. |
| Duplicate name | The modal stays open with `request-topic-error-name` under the field and the typed value intact. |
| Archived topic on a request | The detail screen renders the snapshot name with a muted "archived" marker beside it; the request is otherwise unchanged. |
| Picker with no active topic | `request-new-topic-empty` carrying `REQUEST_TOPIC_MESSAGES.pickerEmpty`, and no submit control. |
| Archived topic in the list's filter | Offered with the archived marker the detail screen uses; selecting it returns the requests raised under it (REQ-02-031). The new-request picker does not offer it. |
| Permission-limited (`user`, `viewer`) | The Settings row is not rendered, and the address draws no topics page: `request-topics-page`, `request-topics-add-btn` and every row control are absent, nothing of the screen is drawn in their place, and the browser is sent to `/org/{orgId}/members`, which every role can open. The write routes answer `403` regardless. **Decided:** the address is not a destination for a caller who cannot curate. Rejected: drawing the catalogue read-only, which `GET …/request-topics` would serve to a `user` (REQ-02-008) but which offers a screen whose every control is missing. |
| Error (catalogue) | An inline banner with a retry control; the last good list stays on screen behind it. |

## DS gaps

| Gap | Where it bites | What ships instead | What closes it |
|---|---|---|---|
| No drag-handle or reorder list primitive | The catalogue's ordering control | Up and down controls on each active row, as the mock draws them, each issuing one `PATCH` — keyboard-reachable, and no pointer-only interaction | A `SortableList` in `@ds` with a keyboard contract |
| No segmented-control primitive | The Staff / Client audience switch | Two `Button`s with an aria-pressed state, carrying `var(--sp-*)` and `var(--fs-*)` tokens | A `SegmentedControl` in `@ds`, adopted by this screen and the requests scope toggle together |

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | Two curators rename two topics to the same name at the same instant | The functional unique index rejects the second; the service maps the violation to `409` `REQUEST_TOPIC_MESSAGES.nameDuplicate`. |
| 2 | A curator archives a topic while somebody has the new-request modal open | The stale picker still offers it; `POST …/requests` answers `400` `REQUEST_MESSAGES.topicUnavailable` and the modal shows the error against the picker. |
| 3 | A topic is renamed after a request was raised under it | The request keeps reading the snapshot name. The catalogue shows the new one. |
| 4 | A topic is archived after a request was raised under it | The request is readable, filterable by that topic, and renders the snapshot name with an archived marker. |
| 5 | A `client`-audience topic is chosen for a request addressed to a member | `400` `REQUEST_MESSAGES.topicAudienceMismatch`. The picker does not offer it either. |
| 6 | A `topicId` from another organization | `400` `REQUEST_MESSAGES.topicUnavailable`, identical to an archived topic in the caller's own organization. |
| 7 | A body carries both `topicId` and `type` | `400` `REQUEST_MESSAGES.classifierNotAccepted`. No request is created. |
| 8 | A request raised before this spec is listed | `topic` is `null`; the row shows the stored `type` as its About value and nothing breaks. |
| 9 | `status=closed` with a vacation section visible | The vacation rows shown are the rejected and cancelled ones; `open` still selects pending and `granted` still selects approved. |
| 10 | `status=declined` from a saved link | Accepted, returning only declined requests. The control shows Closed as the nearest selection. |
| 11 | A topic name is submitted as `"  VPN   profile "` | Stored as `VPN profile`; a second topic submitted as `vpn profile` is `409` `REQUEST_TOPIC_MESSAGES.nameDuplicate`. |
| 12 | Two curators archive one topic at the same instant | The row lock serializes them: one write, one `409` `REQUEST_TOPIC_MESSAGES.statusUnchanged`. |
| 13 | The catalogue's last active staff topic is archived | The Settings screen shows an empty staff list; the new-request picker shows `REQUEST_TOPIC_MESSAGES.pickerEmpty` and draws no submit control. |
| 14 | A `viewer` calls `GET …/request-topics` | `200` with the catalogue. Reading the words is not a privilege; raising a request still is. |
| 15 | `PATCH …/requests/{requestId}` carries `topicId` | `400` `REQUEST_MESSAGES.fieldImmutable`. The title, description, priority, blocking flag and needed-by date stay editable. |

## Security

- Every route states its guard chain above. Every query filters on `session.organizationId`,
  a required argument with no default in the service's method signatures.
- Cross-organization access answers **404, not 403**, matching `OrgScopeGuard`. A topic id
  from another organization is not distinguishable from one that never existed.
- A topic id used on `POST …/requests` is the exception and answers `400`
  `REQUEST_MESSAGES.topicUnavailable` whether it is archived here or lives elsewhere, so the
  create route leaks nothing either.
- This spec adds **no unauthenticated route**, no token, and no rate limiter.
- Topic names are author-controlled text rendered as text. They are trimmed and
  whitespace-collapsed on write, stored cleaned, and never interpreted as markup, so there is
  one sanitization path and nothing to sandbox.
- No PII is introduced. A topic carries the account that created it and no personal data.
