---
id: "01"
title: Requests
routes:
  - "/org/{orgId}/requests"
  - "/org/{orgId}/requests/{requestId}"
api:
  - "GET/POST /api/organizations/{orgId}/requests"
  - "GET/PATCH /api/organizations/{orgId}/requests/{requestId}"
  - "POST /api/organizations/{orgId}/requests/{requestId}/messages"
  - "POST /api/organizations/{orgId}/requests/{requestId}/{answer|grant|decline|cancel|reassign}"
entities: [Request, RequestMessage, RequestEvent]
tags:
  [request, access-request, question, inbox, thread, audit-trail, blocking, overdue, requests-page]
depends-on: ["user-management/04", "user-management/10", "user-management/11"]
---

# 01 — Requests

## Summary

A **request** is one record of somebody needing something from somebody else: an access to a
repository, a seat on a paid tool, an answer to a question. It carries an addressee, a
project, a deadline, a conversation and an audit trail, and it lives in the one place people
already look — the organization's Requests page, which this spec turns from a manager-only
vacation feed into everyone's inbox.

This spec covers requests **between members of the organization**. Requests addressed to a
client are spec 02's subject; the seam that lets them be added without changing anything here
is `assigneeKind` (requirement 12).

The one structural decision that shapes everything below: **"answered" and "granted" are
different states, and only the requester writes `granted`.** An addressee who marks their own
work done produces a register of intentions; the register is only worth having if
"unblocked" means unblocked.

**Depends on:** user-management spec 04 (`Membership`, soft delete), spec 10 (the Requests page
this amends), spec 11 (`Project`). Blast radius and backward compatibility are in
[README.md](README.md#blast-radius).

## Actors & Preconditions

| Actor | Preconditions |
|---|---|
| **Requester** | An active member holding `create-request` (admin, manager, user). Signed in. |
| **Addressee** | An active member of the same organization. Any role, including `viewer` — being asked something is not a privilege. |
| **Admin** | Acts for either side: may answer, grant, decline, cancel and reassign any request in the organization. Stated once here; it is the only actor appearing on both sides of every transition rule below. |
| **Organization** | Exists, with at least one active admin, and carries `nextRequestNumber` (default 1). |

There is no non-account actor in this spec. Every actor holds a session, and every route is
behind `SessionGuard`.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| `create-request` | ✅ | ✅ | ✅ | ❌ |
| `view-own-requests` — raised by me or addressed to me | ✅ | ✅ | ✅ | ✅ |
| `view-all-requests` — the All scope, every request in the org | ✅ | ✅ | ❌ | ❌ |
| `view-requests` — the org-wide **vacation** section (unchanged, spec 10) | ✅ | ✅ | ❌ | ❌ |
| Post a message on a request I am party to | ✅ | ✅ | ✅ | ✅ |
| Mark `answered` | addressee, or admin | addressee | addressee | addressee |
| Mark `granted` | requester, or admin | requester | requester | requester |
| Mark `declined` | addressee, or admin | addressee | addressee | addressee |
| Cancel | requester, or admin | requester | requester | requester |
| Reassign | ✅ | ✅ | ❌ | ❌ |

Capability checks run against `normalizeRole()` (`packages/validation/src/roles.ts`), so the
legacy `member` value maps to `user` and the matrix holds against today's data.

**"Party to a request"** means the requester, the addressee, or a member holding
`view-all-requests`. It is composed in the service the way `canReadProfile` composes capability
with identity (`packages/validation/src/roles.ts`), not as a fifth role.

## Functional Requirements

### Creating a request

1. A member holding `create-request` may create a request. `viewer` may not; the New Request
   control is not rendered for them and the endpoint answers 403 with
   `REQUEST_MESSAGES.createForbidden`.
2. A request carries a `type`, one of `access` or `question`. An unknown type is rejected with
   400 and `REQUEST_MESSAGES.typeUnknown`. The column is a `String`, not a Prisma enum, so a
   future type is additive; the accepted set is validated in `packages/validation`.
3. `title` is required, 3–200 characters after trimming and whitespace collapsing.
4. `description` is optional, at most 5000 characters. It is stored and rendered as **plain
   text**; no markup is accepted, stored, or interpreted.
5. When `type` is `access`, `accessKind` is required and is one of `repository`,
   `environment`, `server`, `vpn`, `saas`, `admin_panel`, `documentation`, `other`. When
   `type` is `question`, `accessKind` must be absent; supplying it is a 400.
6. `priority` is one of `low`, `normal`, `high`, `urgent`, defaulting to `normal`.
7. `blocking` is a boolean defaulting to `false`, meaning "work is stopped right now".
8. `neededBy` is an optional date. A date in the past is rejected at creation with
   `REQUEST_MESSAGES.neededByPast`; it may become past afterwards, which is what makes a
   request overdue.
9. `projectId` is optional. A project that is archived, or belongs to another organization, is
   rejected with 400 and `REQUEST_MESSAGES.projectUnavailable`.
10. On creation the request is assigned a per-organization `number`, allocated by incrementing
    `Organization.nextRequestNumber` inside the creating transaction after re-reading that row
    with `FOR UPDATE`. The number is written exactly once and never changes.
11. Creation writes a `RequestEvent` with `action = 'created'` in the same transaction as the
    `Request` row. A request without its creation event is not a state the system can produce.
12. `assigneeKind` is a `String` column whose **only valid value in this spec is `member`**, and
    `assigneeMembershipId` is required. The column exists rather than being implied because
    spec 02 adds a second kind, and a column added in the first migration is what keeps that
    addition additive. A request arriving with any other value is rejected with 400 and
    `REQUEST_MESSAGES.assigneeInvalid`.
13. The addressee must be an **active** membership of the caller's organization. A removed
    membership is rejected with `REQUEST_MESSAGES.assigneeInactive`; one in another
    organization answers 404, never 403, so ids cannot be probed across organizations.
14. A requester may address a request to themselves. Nothing is gained, nothing breaks, and
    forbidding it would need a rule that earns nothing.
15. The initial status is always `open`. A request cannot be created in any other status.

### The thread

16. Any party to a request may post a message. The body is required, 1–5000 characters, plain
    text.
17. A message may be posted in `open` and `answered` only. In a terminal status the composer
    is not rendered and the endpoint answers 409 with `REQUEST_MESSAGES.threadClosed`.
18. Messages are append-only. There is no edit path and no delete path.
19. Every message writes a `RequestEvent` with `action = 'message_posted'` in the same
    transaction as the `RequestMessage` row, and updates `Request.lastActivityAt`.
20. An author's display name is snapshotted into the event's `newLabel` so the thread renders
    correctly after the author is removed or renamed.
21. The thread and the history are two views of one record and are rendered separately: the
    thread is what people said, the history is what happened. A message never appears in the
    history except as the fact that one was posted.

### Lifecycle

22. The statuses are `open`, `answered`, `granted`, `declined`, `cancelled`. `granted`,
    `declined` and `cancelled` are terminal.
23. `open → answered` is written by the addressee or by an admin. It means "I have responded";
    it does not assert that the access works.
24. `answered → granted` and `open → granted` are written by the **requester** or by an admin,
    and by nobody else — including the addressee, and including a manager who is not the
    requester. Only the person who needs the access knows whether it works.
25. `open → declined` and `answered → declined` are written by the addressee or by an admin. A
    decline requires a reason of 1–1000 characters, stored as the body of a `RequestMessage`
    posted in the same transaction, so a refusal is always visible in the conversation and
    never only in a status.
26. `open → cancelled` and `answered → cancelled` are written by the requester or by an admin.
27. No transition leaves a terminal status. An attempt answers 409 with
    `REQUEST_MESSAGES.alreadyTerminal`.
28. Every transition runs inside a transaction that re-reads the `Request` row with
    `FOR UPDATE` and evaluates the actor guard against **that** read. A status loaded before
    the transaction is already stale when it is tested, so two concurrent grants cannot both
    succeed.
29. Every transition writes a `RequestEvent` with `action = 'status_changed'`, `oldValue` and
    `newValue`, in the same transaction as the status write.
30. Transitions are idempotent by construction rather than by a flag: the guard runs on the
    locked row, so a repeated call finds a terminal status and answers 409. A double-clicked
    Grant produces one `granted` and one 409, never two events.
31. `answeredAt` is written exactly once, on the first entry into `answered`. `resolvedAt` and
    `resolvedByAccountId` are written exactly once, on entry into a terminal status.
32. `lastActivityAt` is updated by any message, any status change and any reassignment. It is
    the sort key of the list and the only field a read path may treat as volatile.
33. **Overdue is derived, never stored.** A request is overdue when `neededBy` is strictly
    before today in the reading account's timezone (`Account.timezone`, spec 06) and the status
    is `open` or `answered`. No column holds it and no scheduled job sets it, so the flag is
    correct even if nothing is scheduled.
34. Editing after creation is limited to `title`, `description`, `priority`, `blocking` and
    `neededBy`, by the requester or an admin, and only while the status is `open` or
    `answered`. `type`, `accessKind`, `projectId`, `number` and the addressee fields are not
    editable — the addressee changes through reassignment, which has its own event. Each edited
    field writes a `field_changed` event.
35. An admin or manager may reassign an open or answered request to a different **member**.
    Reassignment writes a `RequestEvent` with `action = 'assignee_changed'` carrying the old and
    new display names in `oldLabel` / `newLabel`, so the trail stays readable after a member is
    removed.
36. When an addressee is later soft-deleted, the request is **not** cancelled and **not**
    reassigned automatically. It is flagged `assigneeInactive` on read and appears under the
    reassignment filter. An access already asked for may still be needed by whoever takes the
    work over.

### The Requests page

37. `/org/{orgId}/requests` renders for **every** signed-in member of the organization,
    regardless of role. This amends the page-level `view-requests` gate of spec 10; the
    capability keeps its meaning and its grants and moves inward (requirements 40 and 41).
38. The sidebar Requests row is rendered for every signed-in member. Today it is drawn only for
    `view-requests` (`apps/web/src/layout/Sidebar.tsx`), and the "no dead links" rule is
    satisfied afterwards because the destination is now reachable by every role.
39. The page has a **scope** control with two values: `mine` and `all`. `mine` is the default
    and returns requests where the caller is the requester or the addressee. `all` returns
    every request in the organization.
40. `all` requires `view-all-requests` (admin, manager). Without it the control is not rendered,
    and `scope=all` on the endpoint answers 403 with `REQUEST_MESSAGES.scopeForbidden` — the
    server decides, and the absent control is a convenience, not the gate.
41. The page also renders the organization-wide **vacation** section, whose rows come from the
    unchanged spec-10 feed and whose visibility keeps requiring `view-requests`. A `user` sees
    the page and their own requests, and does not see anyone's vacation. Vacation rows are not
    `Request` rows in this release.
42. Filters: `type` (`all` | `access` | `question` | `vacation`), `status`
    (`all` | `open` | `answered` | `granted` | `declined` | `cancelled`), `projectId`, and a
    free-text `q` matched against `title` case-insensitively. Filter state lives in the URL.
43. Default ordering is: blocking and non-terminal first, then overdue, then `priority`
    descending, then `lastActivityAt` descending. The two checkable signals outrank the
    self-reported one deliberately (see [README Product decisions](README.md#product-decisions)).
44. The sidebar badge counts requests **waiting on the caller** — non-terminal requests where
    the caller is the addressee — plus, for a holder of `view-requests`, the pending vacation
    count it shows today. The badge is absent at zero, as it is today.
45. Each row shows the number, the title, the status, the addressee, the project when set, and
    two flags when they apply: blocking and overdue.
46. An empty list renders an empty state whose copy depends on the active scope and filters, and
    never a bare table.

### What this spec does not send

47. This spec adds **no mail message type** and makes no outbound call of any kind. An addressee
    learns of a request from the sidebar badge and the list, which is the pattern already
    shipped for vacation requests; a mail for every internal request in a small organization is
    noise that trains people to ignore the channel. `MailService`
    (`apps/api/src/mail/mail.service.ts`) is untouched, which is what keeps this spec's blast
    radius off the four transports that implement it.

## Data Model

### Request

| Field | Type | Description |
|---|---|---|
| `id` | `String` PK, uuid | |
| `organizationId` | `String` FK → `Organization`, **Cascade** | Scope key. A required argument on every service method; there is no default. |
| `number` | `Int` | Per-organization, human-readable. Written exactly once (requirement 10). |
| `type` | `String` | `access` \| `question`. Not a Prisma enum, so a new type is additive. |
| `accessKind` | `String?` | Required when `type = 'access'`, absent otherwise. |
| `title` | `String` `@db.VarChar(200)` | |
| `description` | `String?` `@db.Text` | Plain text, ≤ 5000 chars. |
| `projectId` | `String?` FK → `Project`, **SetNull** | SetNull rather than Cascade: a request outlives a hard-deleted project, and projects are archived rather than deleted anyway. |
| `requesterMembershipId` | `String` FK → `Membership`, **Cascade** | Matches `TaskComment.author`. Member removal is a soft delete, so the cascade does not fire in practice. |
| `assigneeKind` | `String` | `member` is the only valid value here; spec 02 adds one. See requirement 12. |
| `assigneeMembershipId` | `String?` FK → `Membership`, **SetNull** | Required while `assigneeKind = 'member'`. Nullable in the column so spec 02's second kind needs no column change. |
| `priority` | `String` | `low` \| `normal` \| `high` \| `urgent`, default `normal`. |
| `blocking` | `Boolean` | Default `false`. |
| `neededBy` | `DateTime?` `@db.Date` | Date-only. Overdue derives from it (requirement 33). |
| `status` | `String` | `open` \| `answered` \| `granted` \| `declined` \| `cancelled`. |
| `createdAt` | `DateTime` `@default(now())` | |
| `updatedAt` | `DateTime` `@updatedAt` | |
| `answeredAt` | `DateTime?` | Written once (requirement 31). |
| `resolvedAt` | `DateTime?` | Written once. |
| `resolvedByAccountId` | `String?` FK → `Account`, **SetNull** | |
| `lastActivityAt` | `DateTime` `@default(now())` | Sort key. |

Indexes: `@@unique([organizationId, number])`, `@@index([organizationId, status])`,
`@@index([organizationId, assigneeMembershipId, status])`,
`@@index([organizationId, lastActivityAt])`.

### RequestMessage

| Field | Type | Description |
|---|---|---|
| `id` | `String` PK, uuid | |
| `requestId` | `String` FK → `Request`, **Cascade** | |
| `authorKind` | `String` | `member` only in this spec; the same seam as `assigneeKind`. |
| `authorMembershipId` | `String?` FK → `Membership`, **SetNull** | |
| `body` | `String` `@db.Text` | Plain text, 1–5000 chars. |
| `createdAt` | `DateTime` `@default(now())` | |

Index: `@@index([requestId, createdAt])` — the shape `TaskComment` uses
(`apps/api/prisma/schema.prisma:997`).

### RequestEvent

Append-only. The application has no update path and no delete path.

| Field | Type | Description |
|---|---|---|
| `id` | `String` PK, uuid | |
| `requestId` | `String` FK → `Request`, **Cascade** | |
| `actorKind` | `String` | `member` \| `system`. |
| `actorMembershipId` | `String?` FK → `Membership`, **SetNull** | |
| `action` | `String` | `created`, `status_changed`, `assignee_changed`, `field_changed`, `message_posted`. |
| `field` | `String?` | For `field_changed`. |
| `oldValue` / `newValue` | `String?` | Raw values or ids. |
| `oldLabel` / `newLabel` | `String?` | Display-name snapshots at write time, so the trail survives a removed member. The device `TaskActivity` uses (`apps/api/prisma/schema.prisma:1030`). |
| `createdAt` | `DateTime` `@default(now())` | |

Index: `@@index([requestId, createdAt])`.

No hash chain. `EnvelopeEvent` carries one because it is the evidence of a legally executed
contract; this trail is an operational journal, and claiming tamper-evidence it does not have
would be worse than not claiming it.

### Organization (existing table, one new column)

| Field | Type | Description |
|---|---|---|
| `nextRequestNumber` | `Int` `@default(1)` | Allocated under `FOR UPDATE` (requirement 10). The default is what makes a backfill unnecessary. |

### New Enums

None. Every value set is a `String` column validated in `packages/validation`, so adding a
request type, an access kind, or spec 02's second addressee kind is additive and needs no
migration. A deliberate departure from the documents area's Prisma enums, following the more
recent convention of `Project.status` and `Client.status`.

### New Capabilities

Registered in **both** unions, as organization spec 01 established.

`MemberCapability` (lowercase-dashed, read by `can()`): `create-request` (admin, manager,
user), `view-own-requests` (all four roles), `view-all-requests` (admin, manager).

`Capability` (PascalCase, read by `@RequireCapability`): `CreateRequest`, `ViewOwnRequests`,
`ViewAllRequests`, with the same grants.

`view-requests` is **not** changed — same meaning, same grants. Only the place it is checked
moves, from the page to the vacation section within it.

## State Machine

```
                        ┌──────────────────────────► cancelled ◄────┐
                        │        (requester|admin)                  │
      (create)          │                                           │
         │              │                                    (requester|admin)
         ▼              │                                           │
       open ────────────┴──── (addressee|admin) ────► answered ─────┘
         │                                              │
         │  (requester|admin)                           │  (requester|admin)
         ├──────────────────────────────────────────────┼────────────► granted ■
         │                                              │
         │  (addressee|admin, reason required)          │  (addressee|admin, reason required)
         └──────────────────────────────────────────────┴────────────► declined ■
```

Invariants:

1. `open` is the only status a request may be created in.
2. `granted`, `declined` and `cancelled` are terminal; nothing leaves them.
3. Every transition re-reads the `Request` row with `FOR UPDATE` inside its transaction and
   evaluates the actor guard against that read, never against a copy loaded earlier.
4. Every transition writes exactly one `RequestEvent` with `action = 'status_changed'` in the
   same transaction as the status column.
5. `answeredAt` is written on the first entry into `answered` and never rewritten; `resolvedAt`
   and `resolvedByAccountId` on entry into a terminal status and never rewritten.
6. A decline writes its reason as a `RequestMessage` in the same transaction, so a refusal
   cannot exist without an explanation in the thread.
7. `number` is written once, at creation, and is immutable thereafter.
8. Writers of a `Request` row are exactly: the create handler, the four transition handlers, the
   edit handler and the reassign handler. Each takes the row lock; the create handler
   additionally locks the `Organization` row for the number.

## Screens

### `/org/{orgId}/requests` — the inbox

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Requests                                              [ + New request ]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ ( Mine | All )   Type [ All ▾ ]  Status [ Open ▾ ]  Project [ Any ▾ ]  [ 🔍 ] │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⛔ #14  Staging DB access                     Acme redesign   → A. Admin      │
│         access · blocked · needed by 2 Sep (overdue)              open       │
├──────────────────────────────────────────────────────────────────────────────┤
│    #12  Claude seat for the new hire                          → A. Admin     │
│         access · high                                          answered      │
├──────────────────────────────────────────────────────────────────────────────┤
│    #9   Which invoice template for BY?                        → A. Admin     │
│         question · normal                                       granted      │
├──────────────────────────────────────────────────────────────────────────────┤
│ VACATION  (admin/manager only — spec 10 feed, unchanged)                      │
│    Pat Member  12–19 Sep  6 days  −480.00                       pending      │
└──────────────────────────────────────────────────────────────────────────────┘
```

Empty, `mine` scope, no filters: “Nothing is waiting on you.” Empty with filters: “No requests
match these filters.”

### `/org/{orgId}/requests/{requestId}` — detail

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Requests                                                                    │
│ #14  Staging DB access                                       [ open ]        │
│ access · repository · blocked · needed by 2 Sep (overdue) · high             │
│ Project: Acme redesign      To: A. Admin              From: Sam Dev          │
│                                     [ Answer ] [ Grant ] [ Decline ] [ … ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Conversation                                                                  │
│  Sam Dev · 1 Sep    We need read access to the staging database.             │
│  A. Admin · 2 Sep   Asked ops, should be today.                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ Write a message…                                          [ Send ]   │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────────────────┤
│ History                                                                       │
│  1 Sep  Sam Dev created the request                                          │
│  2 Sep  A. Admin replied                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

When the addressee is no longer active, a banner sits above the actions: “The person this
request is addressed to is no longer active. Reassign it to someone else.”

## Flows

### Flow: a developer asks a colleague for an access

1. Sam (role `user`) opens `/org/{orgId}/requests`. The page renders; the scope control shows
   only `Mine`, because Sam lacks `view-all-requests`.
2. Sam clicks **New request**, picks type `access`, kind `saas`, titles it “Claude seat”, marks
   it blocking, sets needed-by, and addresses it to the admin.
3. `POST …/requests` locks the organization row, allocates `number`, writes `Request` and the
   `created` event in one transaction, and returns 201.
4. The admin's sidebar badge increments; the request appears at the top of their `Mine` list
   because it is blocking.
5. The admin opens it, posts “Buying it now”, and clicks **Answer**. Status → `answered`,
   `answeredAt` written, two events.
6. Sam opens it, confirms the seat works, clicks **Grant**. Status → `granted`, `resolvedAt` and
   `resolvedByAccountId` written, the composer disappears.

### Alt Flow: two people grant at once (branches from step 6)

Both transactions attempt the row lock. The first re-reads `open`, passes the guard, writes
`granted` and its event. The second acquires the lock afterwards, re-reads `granted`, fails the
terminal guard, and answers 409 `REQUEST_MESSAGES.alreadyTerminal`. Exactly one
`status_changed` event exists.

### Alt Flow: the addressee leaves (branches from step 5)

The membership is soft-deleted. The request stays `open`, reads `assignee.inactive: true`, and
shows the reassign banner. An admin reassigns it; the trail records both display names.

### Alt Flow: network or server error on any submission

Every mutating control shows an inline error and stays enabled. Nothing is disabled for
validation; disabling is reserved for the in-flight guard, released on both success and
failure. A 500 leaves no partial write: each handler's writes are in one transaction.

## API Contracts

All routes: `SessionGuard` → `OrgScopeGuard` → capability. Queries scope by
`session.organizationId`; the path `orgId` is checked, never used as a selector. A request
belonging to another organization answers **404**, not 403.

### `GET /api/organizations/{orgId}/requests`

Capability: none beyond an active membership. Query: `scope` (`mine` default | `all`), `type`,
`status`, `projectId`, `q`.

```json
{
  "requests": [
    {
      "id": "…", "number": 14, "type": "access", "accessKind": "repository",
      "title": "Staging DB access", "status": "open",
      "priority": "high", "blocking": true, "overdue": true,
      "neededBy": "2026-09-02",
      "project": { "id": "…", "name": "Acme redesign" },
      "requester": { "membershipId": "…", "displayName": "Sam Dev" },
      "assignee": { "kind": "member", "id": "…", "displayName": "A. Admin", "inactive": false },
      "lastActivityAt": "2026-09-02T09:11:00.000Z", "messageCount": 2
    }
  ],
  "vacation": { "requests": [], "pendingCount": 0 },
  "counts": { "waitingOnMe": 1, "total": 3 }
}
```

`vacation` is present only for a caller holding `view-requests`, and its `requests` are the
spec-10 cards, byte-identical to today's.

**Errors:** `403 {"error":"forbidden","message":REQUEST_MESSAGES.scopeForbidden}` for
`scope=all` without `view-all-requests`. `400` for an unknown `status` or `type` value.

### `POST /api/organizations/{orgId}/requests`

Capability: `CreateRequest`.

```json
{
  "type": "access", "accessKind": "repository",
  "title": "Staging DB access", "description": "Read access to the staging database.",
  "projectId": "…", "assigneeKind": "member", "assigneeMembershipId": "…",
  "priority": "high", "blocking": true, "neededBy": "2026-09-02"
}
```

`201` with the row shape above.

**Errors:** `400 {"error":"validation_error","fields":{…}}` per the Validation Rules table.
`403 {"error":"forbidden","message":REQUEST_MESSAGES.createForbidden}` for `viewer`.
`404` for a project or membership outside the caller's organization — never 403.

### `GET /api/organizations/{orgId}/requests/{requestId}`

Capability: party to the request, or `ViewAllRequests`. Returns the row plus `messages[]` and
`events[]`.

**Errors:** `404` when the caller is not party and lacks `ViewAllRequests` — identical to the
answer for a request that does not exist.

### `PATCH /api/organizations/{orgId}/requests/{requestId}`

Requester or admin, non-terminal only. Accepts `title`, `description`, `priority`, `blocking`,
`neededBy` (requirement 34). `200` with the row.

**Errors:** `409 {"error":"conflict","message":REQUEST_MESSAGES.alreadyTerminal}`;
`403 …editForbidden`; `400 …fieldImmutable` for an attempt to change `type`, `accessKind`,
`projectId` or the addressee.

### `POST …/requests/{requestId}/messages`

Party to the request. Body `{ "body": "…" }`. `201` with the message.

**Errors:** `409 …threadClosed` in a terminal status; `400` on length; `404` when not party.

### `POST …/requests/{requestId}/answer` · `/grant` · `/decline` · `/cancel`

Actor rules in requirements 23–26. `decline` requires `{ "reason": "…" }` (1–1000 chars). Each
returns `200` with the row.

**Errors:** `409 …alreadyTerminal`; `409 …invalidTransition`; `403 …notYoursToGrant` /
`…notYoursToDecline` / `…notYoursToCancel`; `404` when not party.

### `POST …/requests/{requestId}/reassign`

Capability: `ViewAllRequests` (admin, manager). Body `{ "assigneeKind": "member",
"assigneeMembershipId": "…" }`, validated exactly as at creation. `200`.

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | Two admins click **Grant** at the same instant | The row lock serializes them. One writes `granted` and one event; the other answers `409 alreadyTerminal`. Exactly one `status_changed` row. |
| 2 | The requester clicks **Grant** twice (double-click) | Same as 1. The in-flight guard hides the second click in the UI; the server does not rely on it. |
| 3 | The addressee tries to mark the request `granted` | `403 notYoursToGrant`. The control is not rendered for them either. |
| 4 | A manager who is neither requester nor addressee tries to grant | `403 notYoursToGrant`. Only an admin acts for the requester (requirement 24). |
| 5 | `type = question` with an `accessKind` | `400`, field `accessKind`, `accessKindNotAllowed`. |
| 6 | `type = access` with no `accessKind` | `400`, field `accessKind`, `accessKindRequired`. |
| 7 | `assigneeKind` is anything but `member` | `400`, `assigneeInvalid`. Also when `assigneeMembershipId` is missing. |
| 8 | `neededBy` is yesterday at creation | `400`, `neededByPast`. |
| 9 | `neededBy` passes while the request is open | No write happens. The row reads `overdue: true` from then on, computed per caller timezone. |
| 10 | Two callers in different timezones read the same request on the boundary day | Each sees `overdue` computed in their own `Account.timezone`. They may legitimately disagree by one day — the same trade the reports area documents for date ranges. |
| 11 | The addressee is soft-deleted while the request is open | The request stays open, reads `assignee.inactive: true`, and shows the reassign banner. Nothing is cancelled. |
| 12 | The requester is soft-deleted | The request stays, readable by admins and by the addressee. `Grant` is available to an admin only, because the requester can no longer act. |
| 13 | The project is archived while the request is open | The request keeps the project and renders its name. The project is absent from the new-request picker. |
| 14 | A message is posted on a terminal request | `409 threadClosed`; the composer is not rendered. |
| 15 | `scope=all` is requested by a `user` | `403 scopeForbidden`. The control is not rendered either, but the server is the gate. |
| 16 | A `viewer` opens `/requests` | The page renders with their own requests. **New request** is not drawn; `POST` answers `403 createForbidden`. |
| 17 | A `user` opens `/requests` with pending vacation in the org | The page renders; the vacation section is absent entirely, not empty. |
| 18 | A request id from another organization is requested | `404`, identical to a non-existent id. |
| 19 | Title is 201 characters | `400`, field `title`, `titleTooLong`. Submitting an invalid form shows **every** error and focuses the first invalid field; the submit button is never disabled for validation. |
| 20 | Two simultaneous creations in one organization | Both take `FOR UPDATE` on `Organization`; numbers are allocated in sequence with no gap and no duplicate. |
| 21 | A decline is submitted with an empty reason | `400`, field `reason`, `declineReasonRequired`. No status change, no message. |

## Validation Rules

| # | Field | Constraint | Message |
|---|---|---|---|
| 1 | `title` | Required, 3–200 chars after trim + whitespace collapse | `titleRequired` / `titleTooShort` / `titleTooLong` |
| 2 | `description` | Optional, ≤ 5000 chars, plain text | `descriptionTooLong` |
| 3 | `type` | One of `access`, `question` | `typeUnknown` |
| 4 | `accessKind` | Required iff `type = access`; one of the eight values | `accessKindRequired` / `accessKindNotAllowed` / `accessKindUnknown` |
| 5 | `priority` | One of `low`, `normal`, `high`, `urgent` | `priorityUnknown` |
| 6 | `neededBy` | Optional ISO date; not before today at creation | `neededByInvalid` / `neededByPast` |
| 7 | `assigneeKind` | `member`, with `assigneeMembershipId` present | `assigneeInvalid` |
| 8 | `assigneeMembershipId` | Active membership in the caller's organization | `assigneeInactive` |
| 9 | `projectId` | Optional; an active project in the caller's organization | `projectUnavailable` |
| 10 | message `body` | Required, 1–5000 chars | `messageRequired` / `messageTooLong` |
| 11 | decline `reason` | Required, 1–1000 chars | `declineReasonRequired` / `declineReasonTooLong` |

The client validates rules 1–7 and 10–11 for immediate feedback. **The server re-validates every
rule, including the ones the client cannot check** — 8 and 9 are only decidable server-side, and
the client's copy of the rest is a convenience, never a gate. Submit buttons are never disabled
for validation: clicking an invalid form shows every error and focuses the first invalid field
(user-management spec 01's shared rule).

## Error Messages

Every string below lives in `packages/validation` and is exported from `REQUEST_MESSAGES`, so
web and API cannot disagree.

| Context | Export | Route that emits it | Message |
|---|---|---|---|
| Create without capability | `createForbidden` | `POST …/requests` | You do not have permission to create requests |
| `scope=all` without capability | `scopeForbidden` | `GET …/requests` | You do not have permission to view other people's requests |
| Unknown type | `typeUnknown` | `POST …/requests` | Choose a request type |
| Title missing | `titleRequired` | `POST/PATCH …/requests` | Enter a title |
| Title too short | `titleTooShort` | `POST/PATCH …/requests` | Title must be at least 3 characters |
| Title too long | `titleTooLong` | `POST/PATCH …/requests` | Title must be 200 characters or fewer |
| Description too long | `descriptionTooLong` | `POST/PATCH …/requests` | Description must be 5000 characters or fewer |
| Access kind missing | `accessKindRequired` | `POST …/requests` | Choose what kind of access this is |
| Access kind on a question | `accessKindNotAllowed` | `POST …/requests` | A question does not have an access kind |
| Access kind unknown | `accessKindUnknown` | `POST …/requests` | Choose a valid access kind |
| Priority unknown | `priorityUnknown` | `POST/PATCH …/requests` | Choose a valid priority |
| Needed-by invalid | `neededByInvalid` | `POST/PATCH …/requests` | Enter a valid date |
| Needed-by in the past | `neededByPast` | `POST …/requests` | The date needed cannot be in the past |
| Addressee malformed | `assigneeInvalid` | `POST …/requests`, `/reassign` | Choose who this request is for |
| Addressee inactive | `assigneeInactive` | `POST …/requests`, `/reassign` | That person is no longer active in this organization |
| Project unavailable | `projectUnavailable` | `POST …/requests` | That project is not available |
| Message missing | `messageRequired` | `POST …/messages` | Write a message |
| Message too long | `messageTooLong` | `POST …/messages` | Message must be 5000 characters or fewer |
| Thread closed | `threadClosed` | `POST …/messages` | This request is closed |
| Already terminal | `alreadyTerminal` | every transition route | This request has already been closed |
| Invalid transition | `invalidTransition` | every transition route | This request cannot move to that state |
| Not yours to grant | `notYoursToGrant` | `POST …/grant` | Only the person who asked can confirm this |
| Not yours to decline | `notYoursToDecline` | `POST …/decline` | Only the person this is addressed to can decline it |
| Not yours to cancel | `notYoursToCancel` | `POST …/cancel` | Only the person who asked can cancel this |
| Edit forbidden | `editForbidden` | `PATCH …/requests/{id}` | You do not have permission to edit this request |
| Immutable field | `fieldImmutable` | `PATCH …/requests/{id}` | That field cannot be changed after the request is created |
| Decline reason missing | `declineReasonRequired` | `POST …/decline` | Say why you cannot provide this |
| Decline reason too long | `declineReasonTooLong` | `POST …/decline` | Reason must be 1000 characters or fewer |
| Empty inbox, no filters | `emptyMine` | `/requests` | Nothing is waiting on you. |
| Empty with filters | `emptyFiltered` | `/requests` | No requests match these filters. |

## UI Description

Components come from `@ds` via `apps/web/src/ds.ts`. No hardcoded colour or size; tokens only.
Anything missing goes into the design system and is recorded in a DS-gaps table, not improvised
here. Light theme only, as in every other spec this release.

| State | Behaviour |
|---|---|
| Loading (list) | `requests-loading-skeleton`; no empty state, no flash of “nothing waiting”. |
| Loaded, empty, `mine`, no filters | `requests-empty-state` with `emptyMine`. |
| Loaded, empty, filters active | `requests-empty-state` with `emptyFiltered` and a control to clear filters. |
| Error (list) | `requests-error-banner` with `requests-error-retry-btn`; the last good list stays on screen behind it rather than being replaced by nothing. |
| Saving (new request) | The submit control shows an in-flight state and is disabled **only** for the duration of the request; released on success and on failure. |
| Invalid submission | Every field error rendered; focus moves to the first invalid field; the submit control is never disabled for validation. |
| Read-only (terminal) | Composer and all action controls are **not rendered**, not disabled — a control the caller cannot use is not drawn. |
| Permission-limited (`viewer`) | `requests-new-btn` absent; scope control absent. |
| Permission-limited (`user`) | Scope control absent; vacation section absent. |
| Addressee inactive | `request-detail-assignee-inactive-banner` above the actions; reassign offered to admin/manager only. |

## Required `data-testid` Attributes

**Requests list** — `requests-page`, `requests-scope-toggle`, `requests-type-filter`,
`requests-status-filter`, `requests-new-btn`, `requests-empty-state`,
`requests-loading-skeleton`, `requests-error-banner`, `requests-error-retry-btn`,
`requests-vacation-section`, `request-row-{id}`, `request-row-{id}-status`,
`request-row-{id}-blocking-flag`, `request-row-{id}-overdue-flag`.

**New request** — `request-new-modal`, `request-new-type`, `request-new-access-kind`,
`request-new-title`, `request-new-description`, `request-new-project`,
`request-new-assignee-member`, `request-new-priority`, `request-new-blocking`,
`request-new-needed-by`, `request-new-submit`, `request-new-error-title`,
`request-new-error-accessKind`.

**Request detail** — `request-detail-page`, `request-detail-title`, `request-detail-status`,
`request-detail-assignee`, `request-detail-assignee-inactive-banner`, `request-detail-thread`,
`request-detail-composer`, `request-detail-composer-submit`, `request-detail-answer-btn`,
`request-detail-grant-btn`, `request-detail-decline-btn`, `request-detail-decline-reason`,
`request-detail-decline-confirm`, `request-detail-cancel-btn`, `request-detail-reassign-btn`,
`request-detail-history`.

**Existing, reused** — `sidebar-requests-link`, `sidebar-requests-badge`.

Signing in uses user-management spec 02's ids, which belong to that spec's contract and are not
restated here.

## Security

- Every route states its guard chain above; every query filters on `session.organizationId`,
  which is a **required argument with no default** in the service's method signatures.
- Cross-organization access answers **404, not 403**, matching `OrgScopeGuard`
  (`apps/api/src/auth/org-scope.guard.ts`). A caller who is not party to a request in their own
  organization also gets 404, so request existence is not enumerable.
- **This spec adds no unauthenticated surface.** Every route is behind `SessionGuard`; there is
  no token, no public route and no rate-limiter of its own. Spec 02 does not add one either — a
  client holds a session like anyone else.
- No author-controlled markup exists anywhere in this feature: descriptions and messages are
  plain text on write and rendered as text, so there is nothing to sanitize and nothing to
  sandbox. A narrowing of scope, not an omission — requirement 4 states it.
- No PII beyond what the members list already exposes is introduced. `RequestEvent` stores
  display names, never email addresses.

## Out of Scope

- **Requests addressed to a client.** Spec 02's subject; the seam is `assigneeKind`.
- **Vacation requests as `Request` rows.** The page unifies; the model does not. See
  [README Known Gaps](README.md#known-gaps).
- **Any outbound mail.** Requirement 47.
- **A registry of what was granted, and what it costs per month.** Asset accounting, its own
  spec.
- **A generic notification centre.** The badge and the list are the notification here, as they
  are for vacation today.
- **Attachments.** A screenshot of an error is the obvious next ask and is not built.
- **Editing or deleting a message.** The thread is append-only.
- **Request templates**, recurring requests, and bulk actions.

## Known Gaps

Area-level gaps — unified vacation, the grant registry, the notification centre — are in
[README.md](README.md#known-gaps). This spec owes one of its own:

| Gap | Why acceptable now | What closes it |
|---|---|---|
| `assigneeKind` and `authorKind` are columns with a single valid value | They exist so spec 02's second kind is an additive validation change rather than a column change — the same reasoning that puts `ProviderKey` in a port's first migration. A reviewer meeting a one-value enum should know it is deliberate. | Spec 02, which adds `client` to both. |
| The `viewer` and `manager` paths were not exercised at spec time | The probe reached admin and `user` only. `setMembershipRole` (`e2e/tests/helpers.ts:160`) is used by `members-list.spec.ts` today, so the route exists and is in daily use; only this spec's use of it is unproven. | TC-01-E2E-03 and TC-01-E2E-11 on first implementation. |

## Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | Every signed-in member, including `viewer`, can open `/org/{orgId}/requests` and see requests they raised or that are addressed to them. |
| AC-2 | A `user` opening that page sees no vacation section and no scope control, and `scope=all` answers 403. |
| AC-3 | No role sees a request, a vacation row, or a control that it cannot see before this spec ships. |
| AC-4 | A request created by any means has a `number` unique within its organization and a `created` event, both written in the transaction that created it. |
| AC-5 | Only the requester or an admin can move a request to `granted`; the addressee receives 403 and is not shown the control. |
| AC-6 | Two simultaneous grants produce exactly one `granted` status and exactly one `status_changed` event; the loser receives 409. |
| AC-7 | A declined request has a `RequestMessage` containing the reason, written in the same transaction as the status. |
| AC-8 | A request whose `neededBy` has passed reads `overdue: true` with no job having run, and no column stores the flag. |
| AC-9 | A soft-deleted addressee leaves the request open and flagged inactive, and cancels nothing. |
| AC-10 | Submitting an invalid new-request form shows every error, focuses the first invalid field, and never disables the submit control. |
| AC-11 | A request id belonging to another organization answers 404, identical to a non-existent id. |
| AC-12 | The existing vacation feed's JSON for a `type: 'vacation'` row is byte-identical to its shape before this spec. |
| AC-13 | The application sends no mail as a result of anything in this spec, and `MailMessages` is unchanged. |
| AC-14 | Concurrent creations in one organization allocate consecutive numbers with no gap and no duplicate. |

## Verification Plan

The rig below was walked before the test cases were written. Every cell is what happened.
**Nothing in this section is `not run`**: every state this spec's cases need is reachable in the
tree as it stands, and this spec owes no test fixture.

### Bringing it up

| Step | Command | Observed |
|---|---|---|
| 1 | `docker ps` | `devscribed-postgres` up 2 days (healthy), `0.0.0.0:5433->5432` and `0.0.0.0:5434->5432`. |
| 2 | `cd apps/api && npx prisma generate` | `Generated Prisma Client (v6.19.3) to ..\..\node_modules\@prisma\client in 151ms`. **Required:** the checked-out client predated the merged `organization/01` migration, and without this the API fails to compile with 39 TS errors beginning `Property 'client' does not exist on type 'PrismaService'`. |
| 3 | `npm run build --workspace @devscribed/validation` | Exit 0. `dist/index.d.ts` then exports `CLIENT_MESSAGES`, `normalizeClientName`, `validateClientName`. **Required:** `dist` was stale, and without this the API fails with `TS2724: '"@devscribed/validation"' has no exported member named 'CLIENT_MESSAGES'`. |
| 4 | `cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 PW_WORKERS=1 npx playwright test tests/<file>` | `prisma migrate deploy` → `17 migrations found`, `No pending migrations to apply`, against database `devscribed_e2e` at `localhost:5434`. Next.js `Ready in 1543ms`. `/org/[orgId]/requests` compiled in 244 ms. |

Steps 2 and 3 are environment repair this stage performed, not product code. They are recorded
because an agent arriving at a fresh checkout after the `organization/01` merge hits both, and
`qa` may repair nothing.

### Reaching the states the cases need

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| An organization with an admin | `signupOrg` (`e2e/tests/helpers.ts:734`) | yes | yes — returned `orgId 67757775-6287-4c69-9b5d-552ceac44f00` |
| A second member holding `user` | `inviteAndAcceptViaApi` (`helpers.ts:921`) | yes | yes |
| A member holding `viewer` / `manager` | `setMembershipRole` (`helpers.ts:160`) | yes | route in daily use by `members-list.spec.ts`; this spec's use of it not exercised (Known Gaps) |
| A project | `createProjectViaApi` (`helpers.ts:1128`) | yes | yes |
| An archived project | `PATCH …/projects/{id}/archive` (`apps/api/src/projects/projects.controller.ts:54`) | yes | route exists and is exercised by `projects.spec.ts` |
| A soft-deleted member | `removeMember` (`helpers.ts:1270`) | yes | route in daily use by `members-list.spec.ts` |
| A pending vacation request | `submitVacationRequestViaApi` (`helpers.ts:1081`) | yes | route in daily use by `vacation-requests.spec.ts` |
| The parent screen, as admin | `sidebar-requests-link` → `/requests` | yes | yes — `requests-page`, `requests-status-filter`, `requests-empty-state` all visible |
| Today's refusal for a `user` | `GET …/requests` as `user` | yes | yes — `403 {"error":"forbidden","message":"You do not have permission to view requests"}` |
| Today's hidden sidebar row | count of `sidebar-requests-link` as `user` | yes | yes — `0` |
| A request in each of the five statuses | This spec's own endpoints | created here | Each case drives the real transition rather than seeding a status. |

### Access this needs

| What | Name | Where the value lives | How the next agent gets it | Proven against |
|---|---|---|---|---|
| — | — | — | — | Nothing. This feature depends on no third-party system, no API key and no MCP server, and sends no mail. There is no credential for this spec to obtain and none appears in any tracked file. |

### Observing each criterion

| Acceptance criterion | Observer | Level | Proven at spec time |
|---|---|---|---|
| AC-1 | TC-01-E2E-03 | E2E | route proven (page reached) |
| AC-2 | TC-01-INT-18, TC-01-E2E-08 | Integration + E2E | today's 403 proven |
| AC-3 | TC-01-INT-18, TC-01-E2E-08, TC-01-E2E-10 | Integration + E2E | today's baseline proven (403 and sidebar count 0) |
| AC-4 | TC-01-INT-01, TC-01-INT-02 | Integration | endpoint is new |
| AC-5 | TC-01-INT-08 | Integration | new |
| AC-6 | TC-01-INT-09 | Integration (concurrency) | new |
| AC-7 | TC-01-INT-11 | Integration | new |
| AC-8 | TC-01-UNIT-05, TC-01-INT-13 | Unit + Integration | new |
| AC-9 | TC-01-INT-17 | Integration | `removeMember` helper exists |
| AC-10 | TC-01-E2E-02 | E2E | the shared CTA rule is already exercised by `signup.spec.ts` |
| AC-11 | TC-01-INT-19 | Integration | `org-scope.spec.ts` proves the 404 convention today |
| AC-12 | TC-01-INT-20 | Integration | today's response shape captured in `requests-page.spec.ts` |
| AC-13 | TC-01-INT-21 | Integration | `MAIL_MESSAGE_TYPES` is the list to assert against |
| AC-14 | TC-01-INT-03 | Integration (concurrency) | new |

### Rehearsal

One throwaway Playwright spec, `e2e/tests/_probe-requests.spec.ts`, signed up an organization,
created a project, invited and accepted a `user`, read the mail sink, signed in through the UI,
reached `/requests` through the sidebar, and asserted the ids the cases name. Command and
result:

```
cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 PW_WORKERS=1 \
  npx playwright test tests/_probe-requests.spec.ts --reporter=list

[probe] orgId 67757775-6287-4c69-9b5d-552ceac44f00
[probe] project->client link status 200
[probe] invited+accepted user probe-user+…@acme.com
[probe] mail sink status 200
[probe] /requests reached: requests-page, requests-status-filter, requests-empty-state all visible
[probe] GET /requests as user => 403 {"error":"forbidden","message":"You do not have permission to view requests"}
[probe] sidebar-requests-link count for user => 0
  ✓  1 [chromium] › tests\_probe-requests.spec.ts:33:5 (6.7s)
  1 passed (16.6s)
```

The file was deleted after the run. The probe also created a client and linked it to a project —
work that belongs to spec 02 and is recorded there, along with the finding that
`POST /clients` answers `{ "client": {…} }` rather than the client itself.

## Test Cases

Sections without a test case of their own, and why: **Summary**, **Actors & Preconditions**,
**Screens**, **Out of Scope** and **Known Gaps** state context and non-goals rather than
behaviour. **Verification Plan** is the standing exception — it is the rig these cases run on.
Every other section is covered: the permission matrix by UNIT-06, INT-04, INT-08 and E2E-03;
the data model's constraints by INT-02 and INT-03; the state machine by INT-07 through INT-12;
the flows by E2E-01; API contracts by every integration case; edge cases row by row; validation
by UNIT-01 through UNIT-03; error messages by the case that emits each; the UI description's
state table by E2E-02, E2E-03, E2E-08, E2E-12 and E2E-13; and Security by INT-19.

### TC-01-UNIT-01

- **Level:** Unit
- **Steps:** Validate a title of 2, 3, 200 and 201 characters, and one that is whitespace only.
- **Expected Result:** 2 → `titleTooShort`; 3 and 200 → valid; 201 → `titleTooLong`; whitespace
  only → `titleRequired`.

### TC-01-UNIT-02

- **Level:** Unit
- **Steps:** Validate `type`/`accessKind` pairs: (`access`, `repository`), (`access`, absent),
  (`question`, absent), (`question`, `vpn`), (`access`, `nonsense`).
- **Expected Result:** valid; `accessKindRequired`; valid; `accessKindNotAllowed`;
  `accessKindUnknown`.

### TC-01-UNIT-03

- **Level:** Unit
- **Steps:** Validate addressees: kind `member` with a membership id; kind `member` with none;
  kind `client` with an id; an empty kind.
- **Expected Result:** valid; `assigneeInvalid`; `assigneeInvalid` — `client` is not yet a valid
  kind and this spec must reject it rather than ignore it; `assigneeInvalid`.

### TC-01-UNIT-04

- **Level:** Unit
- **Steps:** Run the default comparator over rows: blocking+open, overdue+open, `urgent`+open,
  `normal`+open with the newest `lastActivityAt`, and a `granted` row that is blocking.
- **Expected Result:** blocking+open first, then overdue, then `urgent`, then the newest
  `normal`; the terminal row sorts below every non-terminal one despite being blocking.

### TC-01-UNIT-05

- **Level:** Unit
- **Steps:** Compute `overdue` for `neededBy` = yesterday, today and tomorrow, in two timezones
  straddling the date line, for statuses `open`, `answered` and `granted`.
- **Expected Result:** true only for a past date with `open` or `answered`; false for every
  terminal status; the boundary day differs between the two timezones, as requirement 33 and
  edge case 10 state.

### TC-01-UNIT-06

- **Level:** Unit
- **Steps:** Check `CAPABILITY_MATRIX` and `ROLE_CAPABILITIES` for the three new capabilities
  across all four roles, and assert `view-requests` grants are unchanged.
- **Expected Result:** `create-request` admin/manager/user; `view-own-requests` all four;
  `view-all-requests` admin/manager; `view-requests` identical to before.

### TC-01-INT-01

- **Level:** Integration
- **Preconditions:** An organization with an admin and one `user`.
- **Steps:** `POST …/requests` as the `user`, type `access`, addressed to the admin.
- **Expected Result:** 201; `status = 'open'`; `number = 1`; exactly one `RequestEvent` with
  `action = 'created'`; `lastActivityAt` equals `createdAt`.

### TC-01-INT-02

- **Level:** Integration
- **Steps:** Create two requests in one organization and one in a second organization.
- **Expected Result:** numbers 1 and 2 in the first, 1 in the second; the unique index on
  `(organizationId, number)` holds.

### TC-01-INT-03

- **Level:** Integration (concurrency, serial)
- **Steps:** Fire ten `POST …/requests` concurrently in one organization.
- **Expected Result:** ten distinct numbers, 1–10, no gap and no duplicate; ten `created` events.

### TC-01-INT-04

- **Level:** Integration
- **Steps:** `POST …/requests` as a `viewer`.
- **Expected Result:** 403, `createForbidden`. No row written.

### TC-01-INT-05

- **Level:** Integration
- **Steps:** Post each invalid body of edge cases 5–8 and 21.
- **Expected Result:** 400 with the field and message named in each row; no row written in any
  case.

### TC-01-INT-06

- **Level:** Integration
- **Steps:** Create a request addressed to a membership in another organization; then to a
  soft-deleted membership in the caller's own.
- **Expected Result:** 404 for the first — never 403, so ids cannot be probed across
  organizations; 400 `assigneeInactive` for the second.

### TC-01-INT-07

- **Level:** Integration
- **Steps:** As the addressee, `POST …/answer`, then `POST …/answer` again.
- **Expected Result:** 200 then 409 `invalidTransition`; `answeredAt` written once and unchanged
  by the second call.

### TC-01-INT-08

- **Level:** Integration
- **Steps:** `POST …/grant` as the addressee; then as an unrelated manager; then as the
  requester.
- **Expected Result:** 403 `notYoursToGrant`; 403 `notYoursToGrant`; 200 with `granted`.

### TC-01-INT-09

- **Level:** Integration (concurrency, serial)
- **Steps:** Fire two `POST …/grant` concurrently as the requester.
- **Expected Result:** one 200 and one 409 `alreadyTerminal`; exactly one `status_changed` event;
  `resolvedAt` written once.

### TC-01-INT-10

- **Level:** Integration
- **Steps:** Grant a request, then attempt `answer`, `decline`, `cancel`, `PATCH` and
  `POST …/messages`.
- **Expected Result:** 409 for each; `alreadyTerminal` for the transitions and the edit,
  `threadClosed` for the message.

### TC-01-INT-11

- **Level:** Integration
- **Steps:** `POST …/decline` with a reason, as the addressee.
- **Expected Result:** 200; status `declined`; a `RequestMessage` exists whose body is the
  reason, written in the same transaction; one `status_changed` event.

### TC-01-INT-12

- **Level:** Integration
- **Steps:** `POST …/decline` with an empty reason, then with 1001 characters.
- **Expected Result:** 400 `declineReasonRequired`; 400 `declineReasonTooLong`. Status unchanged
  and no message written in either case.

### TC-01-INT-13

- **Level:** Integration
- **Steps:** Create a request with `neededBy` = tomorrow, then read it as an account whose
  timezone makes that date past.
- **Expected Result:** `overdue: true` with no scheduled job having run and no column containing
  the flag.

### TC-01-INT-14

- **Level:** Integration
- **Steps:** `PATCH …/requests/{id}` changing `title` and `blocking`; then attempting to change
  `type`; then after granting.
- **Expected Result:** 200 with two `field_changed` events; 400 `fieldImmutable`; 409
  `alreadyTerminal`.

### TC-01-INT-15

- **Level:** Integration
- **Preconditions:** An open request bound to an active project. (Edge case 13.)
- **Steps:** Archive the project. Read the request. Then create a new request naming it.
- **Expected Result:** the existing request keeps `projectId` and still serializes the project
  name; the new creation is rejected 400 `projectUnavailable`.

### TC-01-INT-16

- **Level:** Integration
- **Preconditions:** An open request raised by a `user`. (Edge case 12.)
- **Steps:** Soft-delete the **requester**. Read as an admin. Attempt `grant` as the addressee,
  then as an admin.
- **Expected Result:** still `open` and readable; 403 `notYoursToGrant` from the addressee; 200
  from the admin, because the requester can no longer act and requirement 24 names the admin as
  the only substitute.

### TC-01-INT-17

- **Level:** Integration
- **Steps:** Address a request to a member, then soft-delete that member (`removeMember`,
  `helpers.ts:1270`).
- **Expected Result:** still `open`, reads `assignee.inactive: true`, nothing cancelled.
  Reassignment by an admin succeeds and writes `assignee_changed` with both display-name
  snapshots.

### TC-01-INT-18

- **Level:** Integration
- **Steps:** `GET …/requests` as `user` with no query; then with `scope=all`; then as `manager`
  with `scope=all`.
- **Expected Result:** 200 with only their own rows **and no `vacation` key**; 403
  `scopeForbidden`; 200 including a `vacation` block.

### TC-01-INT-19

- **Level:** Integration
- **Steps:** `GET`, `PATCH` and every transition route against a request id from another
  organization, against a random uuid, and — as a member who is not party and lacks
  `view-all-requests` — against a real one in their own organization.
- **Expected Result:** 404 in every case, with the same body.

### TC-01-INT-20

- **Level:** Integration
- **Steps:** With a pending vacation request in the organization, call `GET …/requests` as admin
  and compare each `vacation.requests[]` object against the shape asserted by
  `e2e/tests/requests-page.spec.ts` today.
- **Expected Result:** every key and value type is unchanged; no key added, none removed.

### TC-01-INT-21

- **Level:** Integration
- **Preconditions:** The Nest testing module with `MailService` overridden by a recording double
  (`overrideProvider(MailService)` is the pattern 27 existing integration specs already use,
  e.g. `apps/api/test/clients.spec.ts:136`).
- **Steps:** Exercise create, message, answer, grant, decline, cancel and reassign. Assert
  against the double and against `MAIL_MESSAGE_TYPES`.
- **Expected Result:** the double recorded zero sends, and `MAIL_MESSAGE_TYPES` contains exactly
  the nine entries it contained before this spec (requirement 47, AC-13).

### TC-01-E2E-01

- **Level:** E2E
- **Preconditions:** An organization, an admin, and a `user`.
- **Steps:** As the `user`, open the Requests page and create a blocking `access` request
  addressed to the admin, with a description, a project, priority `high` and a needed-by date.
  Sign in as the admin, open it, post a message, click Answer. Sign back in as the `user`, click
  Grant.
- **Expected Result:** the row appears in both inboxes; the status reads `answered` then
  `granted`; after granting, the composer and all action controls are absent from the DOM.
- **Selectors:** `requests-page`, `requests-new-btn`, `request-new-modal`, `request-new-type`,
  `request-new-access-kind`, `request-new-title`, `request-new-description`,
  `request-new-project`, `request-new-priority`, `request-new-assignee-member`,
  `request-new-blocking`,
  `request-new-needed-by`, `request-new-submit`, `request-row-{id}`, `request-row-{id}-status`,
  `request-row-{id}-blocking-flag`, `request-detail-page`, `request-detail-title`,
  `request-detail-status`, `request-detail-composer`, `request-detail-composer-submit`,
  `request-detail-answer-btn`, `request-detail-grant-btn`, `request-detail-history`,
  `request-detail-composer` (asserted absent after granting), `request-detail-grant-btn`
  (asserted absent after granting).

### TC-01-E2E-02

- **Level:** E2E
- **Steps:** Open the new-request modal, select type `access`, leave the title empty and the
  access kind unchosen, and click Submit.
- **Expected Result:** the submit control was enabled before the click; both field errors are
  shown; focus lands on the title field.
- **Selectors:** `requests-new-btn`, `request-new-modal`, `request-new-type`,
  `request-new-submit`, `request-new-error-title`, `request-new-error-accessKind`,
  `request-new-title`.

### TC-01-E2E-03

- **Level:** E2E
- **Steps:** As a `viewer` addressed on one request, open the Requests page.
- **Expected Result:** the page renders and shows that request; the New Request control and the
  scope control are absent from the DOM.
- **Selectors:** `sidebar-requests-link`, `requests-page`, `request-row-{id}`,
  `requests-new-btn` (asserted absent), `requests-scope-toggle` (asserted absent).

### TC-01-E2E-04

- **Level:** E2E
- **Steps:** Seed three requests through the API — one blocking, one overdue, one `normal` — and
  open the page.
- **Expected Result:** the blocking row is first and shows its flag; the overdue row is second
  and shows its flag; the `normal` row is last.
- **Selectors:** `requests-page`, `request-row-{id}`, `request-row-{id}-blocking-flag`,
  `request-row-{id}-overdue-flag`.

### TC-01-E2E-05

- **Level:** E2E
- **Steps:** As the addressee, click Decline, submit an empty reason, then a real one.
- **Expected Result:** the empty submission shows the field error and changes no status; the real
  one closes the request, the reason appears as the last message in the thread, and the composer
  is absent.
- **Selectors:** `request-detail-decline-btn`, `request-detail-decline-reason`,
  `request-detail-decline-confirm`, `request-detail-thread`, `request-detail-status`,
  `request-detail-composer` (asserted absent).

### TC-01-E2E-06

- **Level:** E2E
- **Steps:** As the requester, cancel an open request; then sign in as the addressee and open it.
- **Expected Result:** status `cancelled`; the addressee sees no Answer, Decline or composer
  control.
- **Selectors:** `request-detail-cancel-btn`, `request-detail-status`,
  `request-detail-answer-btn` (asserted absent), `request-detail-composer` (asserted absent).

### TC-01-E2E-07

- **Level:** E2E
- **Steps:** Create a request, answer it, reassign it to another member, and open the History
  panel.
- **Expected Result:** the history lists creation, the status change and the reassignment, and
  the reassignment row names both the old and the new addressee.
- **Selectors:** `request-detail-reassign-btn`, `request-detail-history`,
  `request-detail-assignee`.

### TC-01-E2E-08

- **Level:** E2E
- **Steps:** With a pending vacation request in the organization, open the Requests page as an
  admin, then as a `user`.
- **Expected Result:** the admin sees the vacation section and the scope control; the `user` sees
  the page and neither.
- **Selectors:** `requests-page`, `requests-vacation-section`, `requests-scope-toggle`,
  `requests-vacation-section` (asserted absent for `user`), `requests-scope-toggle` (asserted
  absent for `user`).

### TC-01-E2E-09

- **Level:** E2E
- **Steps:** Address a request to a member, soft-delete that member through the members list, and
  reopen the request as an admin.
- **Expected Result:** the inactive-addressee banner is shown and the Reassign control is
  offered; the status is still `open`.
- **Selectors:** `request-detail-assignee-inactive-banner`, `request-detail-reassign-btn`,
  `request-detail-status`.

### TC-01-E2E-10

- **Level:** E2E
- **Steps:** Sign in as each of admin, manager, user and viewer and inspect the sidebar.
- **Expected Result:** the Requests row is present for all four. This is the regression witness
  for the change proven absent at spec time — the probe measured a count of `0` for a `user`
  before this spec.
- **Selectors:** `sidebar-requests-link`.

### TC-01-E2E-11

- **Level:** E2E
- **Preconditions:** An admin and a `user`, no vacation requests in the organization.
- **Steps:** Observe the admin's sidebar with nothing addressed to them. Have the `user` raise
  two requests addressed to the admin, and reload. Grant both, and reload again.
- **Expected Result:** no badge at first; then a badge reading 2; then no badge again. The
  Requests row itself is present throughout.
- **Selectors:** `sidebar-requests-link`, `sidebar-requests-badge` (asserted absent with nothing
  waiting, present at 2, asserted absent again once both are granted).

### TC-01-E2E-12

- **Level:** E2E
- **Steps:** With the list loaded, force the list request to fail, then retry.
- **Expected Result:** the error banner appears with a retry control and the previously loaded
  rows remain on screen; retrying restores the list.
- **Selectors:** `requests-error-banner`, `requests-error-retry-btn`, `request-row-{id}`,
  `requests-loading-skeleton`.

### TC-01-E2E-13

- **Level:** E2E
- **Steps:** Apply a status filter that matches nothing, then clear it on an account with no
  requests at all.
- **Expected Result:** the filtered empty state uses `emptyFiltered`; the unfiltered one uses
  `emptyMine`.
- **Selectors:** `requests-status-filter`, `requests-type-filter`, `requests-empty-state`.
