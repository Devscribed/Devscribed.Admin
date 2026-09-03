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
| `GET /api/organizations/{orgId}/request-topics` | session, org scope | `200` | `400` `REQUEST_TOPIC_MESSAGES.audienceUnknown`; `404` |
| `POST /api/organizations/{orgId}/request-topics` | session, org scope, `ManageRequestTopics` | `201` | `400` `REQUEST_TOPIC_MESSAGES.audienceUnknown`, `REQUEST_TOPIC_MESSAGES.nameRequired`, `REQUEST_TOPIC_MESSAGES.nameTooLong`, `REQUEST_TOPIC_MESSAGES.typeUnknown`; `403` `REQUEST_TOPIC_MESSAGES.manageForbidden`; `404`; `409` `REQUEST_TOPIC_MESSAGES.nameDuplicate` |
| `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | session, org scope, `ManageRequestTopics` | `200` | `400` `REQUEST_TOPIC_MESSAGES.nameRequired`, `REQUEST_TOPIC_MESSAGES.nameTooLong`, `REQUEST_TOPIC_MESSAGES.audienceImmutable`; `403` `REQUEST_TOPIC_MESSAGES.manageForbidden`; `404`; `409` `REQUEST_TOPIC_MESSAGES.nameDuplicate` |
| `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` | session, org scope, `ManageRequestTopics` | `200` | `403` `REQUEST_TOPIC_MESSAGES.manageForbidden`; `404`; `409` `REQUEST_TOPIC_MESSAGES.statusUnchanged` |
| `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore` | session, org scope, `ManageRequestTopics` | `200` | `403` `REQUEST_TOPIC_MESSAGES.manageForbidden`; `404`; `409` `REQUEST_TOPIC_MESSAGES.statusUnchanged` |
| `PATCH /api/organizations/{orgId}/request-topics/order` | session, org scope, `ManageRequestTopics` | `200` | `400` `REQUEST_TOPIC_MESSAGES.audienceUnknown`, `REQUEST_TOPIC_MESSAGES.orderIncomplete`; `403` `REQUEST_TOPIC_MESSAGES.manageForbidden`; `404` |
| `POST /api/organizations/{orgId}/requests` | session, org scope, `CreateRequest` | `201` | `400` `REQUEST_MESSAGES.topicRequired`, `REQUEST_MESSAGES.topicUnavailable`, `REQUEST_MESSAGES.topicAudienceMismatch`, `REQUEST_MESSAGES.classifierNotAccepted`; `403` `REQUEST_MESSAGES.createForbidden`; `404` |
| `GET /api/organizations/{orgId}/requests` | session, org scope | `200` | `403` `REQUEST_MESSAGES.scopeForbidden`; `404` |
| `PATCH /api/organizations/{orgId}/requests/{requestId}` | session, org scope | `200` | `400` `REQUEST_MESSAGES.fieldImmutable`; `403` `REQUEST_MESSAGES.editForbidden`; `404` |

The last three already exist and are amended here; the topic routes are new. The requests
controller is `apps/api/src/requests/requests.controller.ts` and its service is
`apps/api/src/requests/requests.service.ts`.

### `GET /api/organizations/{orgId}/request-topics`

Query: `audience` (`staff` | `client`; omitted returns both), `status` (`active` default |
`archived` | `all`).

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

Accepts `name`. Accepts `audience` only when it equals the stored value (REQ-02-004). `type`
and `sortOrder` are not accepted — ordering has its own route, so a rename can never reorder.
`200` with `{ "topic": { … } }`.

### `PATCH /api/organizations/{orgId}/request-topics/order`

```json
{ "audience": "staff", "topicIds": ["…", "…", "…"] }
```

`topicIds` must name **every** topic of that audience, whatever its status, exactly once;
anything else is `400` `REQUEST_TOPIC_MESSAGES.orderIncomplete` and nothing is written. Each
named topic's `sortOrder` is rewritten to its index times ten, in one transaction, so an
interrupted reorder leaves the order the curator last chose. `200` with the audience's topics
in their new order (REQ-02-031).

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
(REQ-02-022); `type` is written by the server from the topic (REQ-02-021).

The `201` body observed today carries `id`, `number`, `type`, `accessKind`, `title`,
`description`, `status`, `priority`, `blocking`, `overdue`, `neededBy`, `project`,
`requester`, `assignee`, `createdAt`, `lastActivityAt`, `answeredAt`, `resolvedAt` and
`messageCount`. This spec adds one member and removes none:

```json
{ "topic": { "id": "…", "name": "VPN", "audience": "staff", "type": "access", "status": "active" } }
```

`topic` is `null` on a request raised before this spec. `topic.name` is the **snapshot**
`topicLabel`, not the catalogue's current name (REQ-02-025); `topic.status` is read from the
catalogue row so a screen can mark a topic that has since been archived, and is `null` when
the row is gone.

### `GET /api/organizations/{orgId}/requests` — amended

Query gains `topicId`. `status` gains the value `closed` (REQ-02-027) alongside the five it
already accepts and `all`. Each row of `requests[]` gains the same `topic` member.

## Error Messages

`REQUEST_TOPIC_MESSAGES` is a new export in `packages/validation/src/index.ts`. The
`REQUEST_MESSAGES` rows extend the existing export in place — none of the keys collides with
one already there.

| Export | Route | Message | New |
|---|---|---|---|
| `REQUEST_TOPIC_MESSAGES.audienceUnknown` | `GET /api/organizations/{orgId}/request-topics`, `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/order` | Choose a valid audience | yes |
| `REQUEST_TOPIC_MESSAGES.audienceImmutable` | `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | A topic cannot change audience after it is created | yes |
| `REQUEST_TOPIC_MESSAGES.typeUnknown` | `POST /api/organizations/{orgId}/request-topics` | Choose whether this topic is an access or a question | yes |
| `REQUEST_TOPIC_MESSAGES.nameRequired` | `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | Enter a topic name | yes |
| `REQUEST_TOPIC_MESSAGES.nameTooLong` | `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | Topic name must be 60 characters or fewer | yes |
| `REQUEST_TOPIC_MESSAGES.nameDuplicate` | `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}` | A topic with this name already exists for this audience | yes |
| `REQUEST_TOPIC_MESSAGES.manageForbidden` | `POST /api/organizations/{orgId}/request-topics`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore`, `PATCH /api/organizations/{orgId}/request-topics/order` | You do not have permission to manage request topics | yes |
| `REQUEST_TOPIC_MESSAGES.orderIncomplete` | `PATCH /api/organizations/{orgId}/request-topics/order` | Send every topic of this audience, once each | yes |
| `REQUEST_TOPIC_MESSAGES.statusUnchanged` | `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive`, `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore` | This topic is already in that state | yes |
| `REQUEST_TOPIC_MESSAGES.pickerEmpty` | — | There are no request topics yet. An admin can add one in Settings. | yes |
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

## Status Labels

One exported map, read by the list rows, the detail header and the filter control
(REQ-02-028). It is display copy, not a validation message, and lives beside the messages so
web and API cannot disagree about the word a status shows as.

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
| `topicId` | `String?` FK → `RequestTopic`, **SetNull** | The chosen topic. Nullable, so requests that predate this spec need no backfill. `SetNull` never fires in practice: there is no route that deletes a topic. |
| `topicLabel` | `String?` `@db.VarChar(60)` | Snapshot of the topic's name at creation. Written once, never rewritten (REQ-02-023, REQ-02-025). |

`type` and `accessKind` keep their columns and their stored values. `type` is now written by
the server; `accessKind` is written on no new row and is read for display on rows that carry
one.

### New Capabilities

Registered in **both** unions, as the clients and holidays surfaces established.

`MemberCapability` (lowercase-dashed, read by `can()`): `manage-request-topics` —
admin, manager.

`Capability` (PascalCase, read by `@RequireCapability`): `ManageRequestTopics` — admin,
manager.

No existing capability changes meaning or grants.

### New Enums

None. Every value set is a `String` column validated in `packages/validation`.

## Seed Data

Written for every organization at creation (REQ-02-015) and for every existing organization by
the migration (REQ-02-016). `createdByAccountId` is `null` on each.

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

The staff set covers what the retired `accessKind` vocabulary covered, plus the two the
request named, so nothing an organization could classify before becomes unclassifiable. Every
row is the organization's own from the moment it is written: renaming or archiving any of them
is an ordinary edit.

The migration writes the same rows for every organization that already exists, but nothing
depends on it having run: REQ-02-016 seeds an audience holding no row of any status on the next
read, so the migration is a materialization of what the read path would do anyway. Archived
rows are rows, so a catalogue emptied by archiving is never re-seeded, and the seed is
therefore applied at most once per audience per organization.

## Validation Rules

| # | Field | Constraint | Message | Server-only |
|---|---|---|---|---|
| 1 | topic `name` | Required, 1–60 chars after trim and whitespace collapse | `REQUEST_TOPIC_MESSAGES.nameRequired` / `REQUEST_TOPIC_MESSAGES.nameTooLong` | no |
| 2 | topic `audience` | One of `staff`, `client` | `REQUEST_TOPIC_MESSAGES.audienceUnknown` | no |
| 3 | topic `audience` on rename | Equal to the stored value | `REQUEST_TOPIC_MESSAGES.audienceImmutable` | yes |
| 4 | topic `type` | One of `access`, `question` | `REQUEST_TOPIC_MESSAGES.typeUnknown` | no |
| 5 | topic `name` uniqueness | Unique per organization and audience, ignoring case | `REQUEST_TOPIC_MESSAGES.nameDuplicate` | yes |
| 6 | order `topicIds` | Names every topic of the audience exactly once, whatever its status | `REQUEST_TOPIC_MESSAGES.orderIncomplete` | yes |
| 7 | request `topicId` | Required | `REQUEST_MESSAGES.topicRequired` | no |
| 8 | request `topicId` | An active topic in the caller's organization | `REQUEST_MESSAGES.topicUnavailable` | yes |
| 9 | request `topicId` | Audience matching the addressee kind | `REQUEST_MESSAGES.topicAudienceMismatch` | yes |
| 10 | request `type`, `accessKind` | Absent from the body | `REQUEST_MESSAGES.classifierNotAccepted` | yes |

The client validates rules 1, 2, 4 and 7 for immediate feedback. **The server re-validates
every rule**, including the ones the client cannot check: 3, 5, 8 and 9 need the stored row,
and 10 is a contract the client is simply expected to keep. Submit controls are never disabled
for validation — clicking an invalid form shows every error and focuses the first invalid
field.

## Required data-testid Attributes

| id | Screen | Asserted |
|---|---|---|
| `settings-tab-request-topics` | Sidebar | present for admin, absent for `user` |
| `request-topics-page` | Settings › Request topics | present |
| `request-topics-audience-staff` | Settings › Request topics | present |
| `request-topics-audience-client` | Settings › Request topics | present |
| `request-topics-add-btn` | Settings › Request topics | present |
| `request-topic-row-{id}` | Settings › Request topics | present |
| `request-topic-row-{id}-archive-btn` | Settings › Request topics | present while active |
| `request-topic-row-{id}-move-up-btn` | Settings › Request topics | present, and absent on the first row of an audience |
| `request-topic-row-{id}-move-down-btn` | Settings › Request topics | present, and absent on the last row of an audience |
| `request-topic-row-{id}-restore-btn` | Settings › Request topics | present while archived |
| `request-topic-modal` | Settings › Request topics | present while adding or renaming |
| `request-topic-name` | Settings › Request topics | present |
| `request-topic-audience` | Settings › Request topics | present when adding, absent when renaming |
| `request-topic-type` | Settings › Request topics | present when adding, absent when renaming |
| `request-topic-submit` | Settings › Request topics | present |
| `request-topic-error-name` | Settings › Request topics | present on a duplicate name |
| `request-new-topic` | New request modal | present |
| `request-new-topic-empty` | New request modal | present when the audience has no active topic |
| `request-new-error-topic` | New request modal | present when no topic is chosen |
| `requests-topic-filter` | Requests list | present |
| `request-row-{id}-topic` | Requests list | present when the request carries a topic |
| `request-detail-topic` | Request detail | present when the request carries a topic |
| `requests-new-btn` | Requests list | present for a requester |
| `request-new-modal` | Requests list | present while raising a request |
| `request-new-submit` | New request modal | present, and absent when the picker is empty |
| `requests-status-filter` | Requests list | present, showing the four labels |
| `request-row-{id}-status` | Requests list | present, showing the label for the stored status |
| `request-detail-status` | Request detail | present, showing the label and the closure sub-label |
| `requests-page` | Requests list | present |

`requests-new-btn`, `request-new-modal`, `request-new-submit`, `requests-status-filter`,
`request-row-{id}-status`, `request-detail-status` and `requests-page` are already drawn by the
requests screens; they appear here because this spec's cases assert them and their contents
change. `request-new-type` and `request-new-access-kind` are **removed** from the new-request
modal by REQ-02-022 and appear in no case here.

## Screens

### `/org/{orgId}/settings/request-topics`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Settings › Request topics                            [ + Add topic ]         │
├──────────────────────────────────────────────────────────────────────────────┤
│  ( Staff | Client )                                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  ⠿  VPN               access                        [ Rename ] [ Archive ]   │
│  ⠿  Claude            access                        [ Rename ] [ Archive ]   │
│  ⠿  Repository        access                        [ Rename ] [ Archive ]   │
│  ⠿  Question          question                      [ Rename ] [ Archive ]   │
│  ⠿  Other             question                      [ Rename ] [ Archive ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│  Archived                                                                    │
│     Legacy VPN        access                                   [ Restore ]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

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
| Permission-limited (`user`, `viewer`) | The Settings row is not rendered and neither is the page's Add control; the route answers `403` regardless. |
| Error (catalogue) | An inline banner with a retry control; the last good list stays on screen behind it. |

## DS gaps

| Gap | Where it bites | What ships instead | What closes it |
|---|---|---|---|
| No drag-handle or reorder list primitive | The catalogue's ordering control | Up and down controls on each row. A press swaps the row with its neighbour in the list the screen holds and sends the whole audience's new order to the order route — keyboard-reachable, and no pointer-only interaction | A `SortableList` in `@ds` with a keyboard contract |
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
| 12a | Two curators reorder one audience at the same instant | Each call rewrites every row of the audience in one transaction, so the later one wins whole. Neither leaves an order nobody chose. |
| 12b | A reorder omits a topic, names one twice, or names one of the other audience | `400` `REQUEST_TOPIC_MESSAGES.orderIncomplete`, and no `sortOrder` is written. |
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
