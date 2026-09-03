# 02 — Request Topics & Vocabulary · Verification & Cases

## Verification Plan

The rig below was walked before these cases were written, with a throwaway Playwright spec
that was deleted afterwards. Every cell is what happened.

### Bringing it up

| Step | Command | Observed |
|---|---|---|
| 1 | `docker ps` | `devscribed-postgres` up 3 days (healthy), publishing the development and E2E database ports. |
| 2 | `cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 PW_WORKERS=1 npx playwright test tests/<file> --reporter=list` | The suite claimed its own pair, `globalSetup` migrated the E2E database, Next.js reported `Ready in 1781ms`, and `/login`, `/org/[orgId]/members`, `/org/[orgId]/requests` and `/org/[orgId]/settings/holidays` each compiled and served. |
| 3 | The same run, API calls only | `GET /api/me` → `200` with `account`, `organization`, `role: "admin"` and `features.mailOutbox: true`. |

No environment repair was needed: the Prisma client and the validation package's build were
both current at the checkout this was walked on.

### Reaching the states the cases need

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| An organization with an admin | `signupOrg` (`e2e/tests/helpers.ts`) | yes | yes — an organization id came back and every later call scoped to it |
| A second member holding `user` | `inviteAndAcceptViaApi` (`e2e/tests/helpers.ts`) | yes | yes — invited, accepted, and found again through the members list |
| A member holding `viewer` or `manager` | `setMembershipRole` (`e2e/tests/helpers.ts`) | yes | route in daily use by `e2e/tests/members-list.spec.ts`; this spec's use of it is not exercised |
| A project in the organization | `POST /api/organizations/{orgId}/projects` | yes | yes — `201`, with the client link echoed back |
| A request addressed to a member | `POST /api/organizations/{orgId}/requests` | yes | yes — `201`, carrying `type`, `accessKind`, `number`, `assignee` and `requester` |
| A request that predates this spec | any request created today | yes | yes — the `201` body carries no `topic` member, which is exactly the shape the fallback in edge case 8 must handle |
| A request in `declined` and in `cancelled` | the existing transition routes | yes | routes exist and are exercised by `apps/api/test/requests.spec.ts` |
| A topic in `active` and in `archived` | this spec's own routes | created here | no — the routes are new, and each case drives the real transition rather than seeding a status |
| An organization holding no topic rows | delete them directly, the state an organization predating this spec is in | yes | not run — the table is new, and the harness applies every migration before any test body, which is why REQ-02-016 puts the mechanism on the read path rather than in the migration |
| An organization with no active staff topic | archive every seeded staff topic through this spec's own route | created here | no — the route is new |

### Access this needs

| What | Name | Where the value lives | How the next agent gets it | Proven against |
|---|---|---|---|---|
| — | — | — | — | Nothing. This spec depends on no third-party system, no API key and no MCP server, and sends no mail. There is no credential to obtain and none appears in any tracked file. |

### Observing each criterion

| Acceptance criterion | Observer | Level | Proven at spec time |
|---|---|---|---|
| AC-1 | TC-02-INT-01 | Integration | `signupOrg` proven; the seed is new |
| AC-2 | TC-02-INT-02 | Integration | the seeded-then-emptied state is reachable with a direct delete; the read path that heals it is new |
| AC-3 | TC-02-INT-05 | Integration | new; the functional-unique device is the one `Client` already uses |
| AC-4 | TC-02-INT-07 | Integration | the `user` role is reachable — invited and accepted in the rehearsal |
| AC-5 | TC-02-INT-10 | Integration | today's `201` body shape captured in the rehearsal |
| AC-6 | TC-02-INT-11 | Integration | today's behaviour proven: a body carrying an unknown member is accepted with `201`, so the refusal is a real change |
| AC-7 | TC-02-INT-14 | Integration | new |
| AC-8 | TC-02-INT-15, TC-02-E2E-03 | Integration + E2E | the requests list and its filters were reached in the rehearsal |
| AC-9 | TC-02-INT-12 | Integration | new; the `member` addressee path is proven |
| AC-10 | TC-02-INT-17 | Integration | today's list response shape captured in the rehearsal |
| AC-11 | TC-02-UNIT-05, TC-02-E2E-04 | Unit + E2E | `requests-status-filter`, `request-row-{id}-status` and `request-detail-status` are drawn today |
| AC-12 | TC-02-E2E-04 | E2E | new |
| AC-13 | TC-02-INT-16 | Integration (concurrency) | new |
| AC-14 | TC-02-INT-13 | Integration | the cross-organization `404` convention is proven today by `apps/api/test/org-scope.spec.ts` |
| AC-15 | TC-02-INT-07, TC-02-E2E-05 | Integration + E2E | the Settings destination was reached as admin in the rehearsal |
| AC-16 | TC-02-E2E-06 | E2E | new |
| AC-17 | TC-02-INT-22, TC-02-E2E-01 | Integration + E2E | new |

### Rehearsal

One throwaway spec, `e2e/tests/_probe-requests-topics-clients.spec.ts`, signed up an
organization, created a client and a project bound to it, invited and accepted a `user`,
assigned them to the project, raised a request, listed requests, signed in through the UI,
reached the requests screens and opened the Settings destination. It was deleted afterwards;
the command and what came back are kept here.

```
cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 PW_WORKERS=1 \
  npx playwright test tests/_probe-requests-topics-clients.spec.ts --reporter=list

[probe] POST requests => 201 {"id":"…","number":1,"type":"access","accessKind":"vpn",
        "title":"VPN profile for the new hire","status":"open","priority":"high",
        "blocking":true,"overdue":false,"project":{…},"requester":{…},
        "assignee":{"kind":"member",…},"messageCount":0}
[probe] GET requests => 200 {"requests":[…],"counts":{"waitingOnMe":1,"total":1},
        "vacation":{"requests":[],"pendingCount":0}}
[probe] POST requests with topicId => 201   ← an unknown body member is accepted today
[probe] /requests reached; status filter visible: true
[probe] assignee picker present: true
[probe] settings/holidays reached
  ✓  1 [chromium] › tests\_probe-requests-topics-clients.spec.ts (8.6s)
  1 passed (20.6s)
```

The third line is the one this spec turns into a refusal, and TC-02-INT-11 is what pins it.

## Test Cases

### TC-02-UNIT-01

- **Level:** Unit
- **Covers:** REQ-02-005
- **Steps:** Call the topic-name validator with `""`, `"   "`, `"  VPN   profile "`, and a
  61-character string.
- **Expected Result:** The first two fail with `REQUEST_TOPIC_MESSAGES.nameRequired`; the
  third succeeds with the value `VPN profile`; the fourth fails with
  `REQUEST_TOPIC_MESSAGES.nameTooLong`. A 60-character string succeeds.

### TC-02-UNIT-02

- **Level:** Unit
- **Covers:** REQ-02-002
- **Steps:** Call the audience validator with `staff`, `client`, `Staff`, `""` and
  `partner`.
- **Expected Result:** `staff` and `client` succeed; every other input fails with
  `REQUEST_TOPIC_MESSAGES.audienceUnknown`. The check is exact, not case-insensitive, because
  the value is sent by our own screens and never typed by a person.

### TC-02-UNIT-03

- **Level:** Unit
- **Covers:** REQ-02-003
- **Steps:** Call the topic-type validator with `access`, `question`, `vacation` and `""`.
- **Expected Result:** The first two succeed; the last two fail with
  `REQUEST_TOPIC_MESSAGES.typeUnknown`.

### TC-02-UNIT-04

- **Level:** Unit
- **Covers:** REQ-02-009
- **Steps:** Sort a list holding `(20, "beta")`, `(10, "zulu")`, `(20, "Alpha")` and
  `(20, "alpha")` with the exported comparator.
- **Expected Result:** `zulu`, then the two spellings of alpha adjacent to each other, then
  `beta`. Case never decides the order between two different names.

### TC-02-UNIT-05

- **Level:** Unit
- **Covers:** REQ-02-028, REQ-02-029
- **Steps:** Read the exported status-label map for each of `open`, `answered`, `granted`,
  `declined` and `cancelled`.
- **Expected Result:** Pending, In progress, Completed, Closed, Closed. The closure sub-label
  is absent for the first three, `declined` for the fourth and `cancelled` for the fifth. The
  map has an entry for every stored status, so no status can render as a raw column value.

### TC-02-UNIT-06

- **Level:** Unit
- **Covers:** REQ-02-027
- **Steps:** Expand the status filter values `all`, `open`, `closed`, `declined` and
  `nonsense`.
- **Expected Result:** `closed` expands to the pair `declined`, `cancelled`; `open` expands to
  itself; `all` expands to every stored status; `declined` expands to itself; `nonsense` is
  rejected rather than defaulted.

### TC-02-INT-01

- **Level:** Integration
- **Covers:** REQ-02-015, REQ-02-001
- **Asserts:** `GET /api/organizations/{orgId}/request-topics` → 200
- **Steps:** Sign up a new organization. Immediately read the catalogue as the founding
  admin, once with `audience=staff` and once with `audience=client`. Read it again as an
  admin of a second, separately signed-up organization.
- **Expected Result:** The staff read returns the seeded staff topics in `sortOrder` order,
  each `active`, each with `createdByAccountId` null; the client read returns the seeded
  client topics. The second organization sees its own rows and none of the first's. The seed
  rows and the `Organization` row share a creation timestamp from the same transaction.

### TC-02-INT-02

- **Level:** Integration
- **Covers:** REQ-02-016
- **Asserts:** `GET /api/organizations/{orgId}/request-topics` → 200
- **Steps:** Sign up an organization and raise a request under a seeded topic. Delete every
  `RequestTopic` row of that organization directly, which is the state an organization
  predating this spec is in before anything materializes its catalogue. Read the catalogue,
  then read it again.
- **Expected Result:** The first read answers with the full seeded catalogue for both
  audiences, written before it answered. The second read writes nothing further. The request
  raised earlier still carries its `topicLabel` and its stored `type`, and its `topicId` now
  names no row — the response's `topic.name` is the snapshot and `topic.status` is null, which
  is the shape a screen must render. No `Request` row is rewritten by the seeding.

  The harness applies every migration before any test body runs and offers no way back, so a
  test cannot observe the migration itself. It does not need to: REQ-02-016 makes the read path
  the mechanism and the migration a materialization of it, and this case observes the
  mechanism.

### TC-02-INT-03

- **Level:** Integration
- **Covers:** REQ-02-009
- **Asserts:** `POST /api/organizations/{orgId}/request-topics` → 201;
  `GET /api/organizations/{orgId}/request-topics` → 200
- **Steps:** As an admin, create a staff topic with no `sortOrder`. Create a second with
  `sortOrder: 5`. Read the catalogue.
- **Expected Result:** The first lands last, with a `sortOrder` ten above the highest seeded
  value. The second lands first, before every seeded row. Both are `active`.

### TC-02-INT-04

- **Level:** Integration
- **Covers:** REQ-02-002, REQ-02-003
- **Asserts:** `POST /api/organizations/{orgId}/request-topics` → 400
  REQUEST_TOPIC_MESSAGES.audienceUnknown;
  `POST /api/organizations/{orgId}/request-topics` → 400 REQUEST_TOPIC_MESSAGES.typeUnknown;
  `GET /api/organizations/{orgId}/request-topics` → 400
  REQUEST_TOPIC_MESSAGES.audienceUnknown
- **Steps:** As an admin, create a topic with `audience: "partner"`, then one with
  `type: "vacation"`. Then read the catalogue with `audience=partner`.
- **Expected Result:** Each answers `400` with the named message and writes no row. The read
  refuses rather than returning everything, so a typo in a query string cannot look like an
  empty catalogue.

### TC-02-INT-05

- **Level:** Integration
- **Covers:** REQ-02-006
- **Asserts:** `POST /api/organizations/{orgId}/request-topics` → 201;
  `POST /api/organizations/{orgId}/request-topics` → 409
  REQUEST_TOPIC_MESSAGES.nameDuplicate
- **Steps:** As an admin, create a staff topic named `Figma seat`. Create a second staff topic
  named `  figma   SEAT `. Then create a **client** topic named `Figma seat`.
- **Expected Result:** The first succeeds. The second is `409` and writes no row — trimming
  and whitespace collapsing happen before the comparison, and the comparison ignores case.
  The third succeeds: uniqueness is per audience.

### TC-02-INT-06

- **Level:** Integration
- **Covers:** REQ-02-004
- **Asserts:** `PATCH /api/organizations/{orgId}/request-topics/{topicId}` → 200;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}` → 400
  REQUEST_TOPIC_MESSAGES.audienceImmutable
- **Steps:** As an admin, rename a seeded staff topic. Then send the same route
  `audience: "staff"`, then `audience: "client"`, then `sortOrder: 999`.
- **Expected Result:** The rename succeeds and `updatedAt` moves. Sending the stored audience
  succeeds and changes nothing. Sending the other audience answers `400` and leaves the row
  untouched. The `sortOrder` is ignored and the row's order is unchanged — a rename can never
  reorder, because ordering has its own route.

### TC-02-INT-07

- **Level:** Integration
- **Covers:** REQ-02-007, REQ-02-008
- **Asserts:** `GET /api/organizations/{orgId}/request-topics` → 200;
  `POST /api/organizations/{orgId}/request-topics` → 403
  REQUEST_TOPIC_MESSAGES.manageForbidden;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}` → 403
  REQUEST_TOPIC_MESSAGES.manageForbidden;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` → 403
  REQUEST_TOPIC_MESSAGES.manageForbidden;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore` → 403
  REQUEST_TOPIC_MESSAGES.manageForbidden
- **Steps:** Invite and accept a member at `user`. As that member, read the catalogue, then
  attempt each of the four write routes. Repeat the read as a member at `viewer`. Repeat every
  write as a member at `manager`.
- **Expected Result:** Both reads answer `200` with the full catalogue. Every `user` write
  answers `403` and changes nothing. Every `manager` write succeeds, so the capability is
  proven granted as well as withheld.

### TC-02-INT-08

- **Level:** Integration
- **Covers:** REQ-02-010, REQ-02-011, REQ-02-012
- **Asserts:** `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` → 200;
  `GET /api/organizations/{orgId}/request-topics` → 200;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore` → 200
- **Steps:** As an admin, archive a seeded staff topic. Read the catalogue with
  `status=active`, then with `status=archived`, then with `status=all`. Restore it and read
  `status=active` again.
- **Expected Result:** After the archive the row carries `archivedAt` and
  `archivedByAccountId`, is absent from the active read, present in the archived read and
  present in the `all` read. After the restore both audit fields are null and the row is back
  in the active read.

### TC-02-INT-09

- **Level:** Integration
- **Covers:** REQ-02-013
- **Asserts:** `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` → 200;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` → 409
  REQUEST_TOPIC_MESSAGES.statusUnchanged;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore` → 409
  REQUEST_TOPIC_MESSAGES.statusUnchanged
- **Steps:** As an admin, archive a topic twice in sequence. Then restore it twice in
  sequence.
- **Expected Result:** The first call of each pair answers `200`; the second answers `409` and
  writes nothing, leaving `archivedAt` as the first call set it. Restoring an already-active
  topic answers `409` for the same reason.

### TC-02-INT-10

- **Level:** Integration
- **Covers:** REQ-02-021, REQ-02-023
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 201
- **Steps:** As an admin, raise a request choosing the seeded `VPN` topic and sending no
  `type`. Read the created row, then rename the topic to `VPN access` and read the row again.
- **Expected Result:** The stored `type` is `access`, taken from the topic. `topicLabel` is
  `VPN`, written in the same transaction as the request. After the rename the request still
  reads `VPN` while the catalogue reads `VPN access`.

### TC-02-INT-11

- **Level:** Integration
- **Covers:** REQ-02-022
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400
  REQUEST_MESSAGES.classifierNotAccepted
- **Steps:** As an admin, raise a request carrying a valid `topicId` **and** `type: "access"`.
  Repeat with a valid `topicId` and `accessKind: "vpn"`. Repeat with both. Count the requests
  in the organization afterwards.
- **Expected Result:** Each answers `400` with the named message and creates no request. The
  count is unchanged. This is the case that pins the retirement: before this spec the same
  body was accepted with `201`.

### TC-02-INT-12

- **Level:** Integration
- **Covers:** REQ-02-020
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400
  REQUEST_MESSAGES.topicAudienceMismatch;
  `POST /api/organizations/{orgId}/requests` → 201
- **Steps:** As an admin, raise a request addressed to a member choosing the seeded **client**
  topic `Access`. Then raise the same request choosing the seeded **staff** topic `VPN`.
- **Expected Result:** The first answers `400` and creates nothing; the second answers `201`.
  Both cells of the audience decision table are exercised by this one case.

### TC-02-INT-13

- **Level:** Integration
- **Covers:** REQ-02-019
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400
  REQUEST_MESSAGES.topicUnavailable
- **Steps:** Sign up two organizations. As an admin of the first, raise a request whose
  `topicId` is a topic of the second. Then archive a topic of the first and raise a request
  under it. Then raise one whose `topicId` is a well-formed id that names no row.
- **Expected Result:** All three answer `400` with the same message and the same body, so an
  id belonging to another organization is not distinguishable from an archived one or from
  one that never existed. No request is created in either organization.

### TC-02-INT-14

- **Level:** Integration
- **Covers:** REQ-02-025
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 201;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}` → 200;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` → 200;
  `GET /api/organizations/{orgId}/requests` → 200
- **Steps:** Raise a request under a topic. Rename the topic, then archive it. List the
  requests.
- **Expected Result:** The request's `topic.name` is the name it was raised under after both
  writes. `topic.status` reads `archived` after the archive, so a screen can mark it without
  the label changing.

### TC-02-INT-15

- **Level:** Integration
- **Covers:** REQ-02-026, REQ-02-010
- **Asserts:** `GET /api/organizations/{orgId}/requests` → 200;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` → 200
- **Steps:** Raise one request under `VPN` and one under `Question`. List with
  `topicId` set to the `VPN` topic. Archive the `VPN` topic and list again with the same
  filter. List with a `topicId` from another organization.
- **Expected Result:** The first list returns only the `VPN` request. After the archive the
  same filter returns the same row — archiving hides a topic from the picker and not from the
  list. The cross-organization filter returns an empty array rather than another
  organization's rows.

### TC-02-INT-16

- **Level:** Integration
- **Covers:** REQ-02-013
- **Asserts:** `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` → 200;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` → 409
  REQUEST_TOPIC_MESSAGES.statusUnchanged
- **Steps:** Fire two archive calls at one active topic concurrently, from two sessions,
  without awaiting the first.
- **Expected Result:** Exactly one answers `200` and one answers `409`. The row has one
  `archivedAt` and one `archivedByAccountId`, both from the winner. The guard is evaluated on
  the row the transaction locked, so the outcome does not depend on which call arrived first.

### TC-02-INT-17

- **Level:** Integration
- **Covers:** REQ-02-027
- **Asserts:** `GET /api/organizations/{orgId}/requests` → 200
- **Steps:** Build one request in each of the five statuses by driving the real transitions.
  List with `status=closed`, then `status=declined`, then `status=cancelled`, then
  `status=open`, then `status=all`. As an admin holding the vacation capability, repeat
  `status=closed` in an organization that also has a rejected and a cancelled vacation
  request.
- **Expected Result:** `closed` returns exactly the declined and the cancelled request;
  `declined` and `cancelled` each return their one row, so a saved link still resolves;
  `open` returns the open one; `all` returns all five. In the vacation section `closed`
  returns the rejected and cancelled rows and no pending one.

### TC-02-INT-18

- **Level:** Integration
- **Covers:** REQ-02-018
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400 REQUEST_MESSAGES.topicRequired
- **Steps:** Raise a request with no `topicId`, then with `topicId: null`, then with
  `topicId: ""`.
- **Expected Result:** Each answers `400` with the named message against the `topicId` field
  and creates nothing.

### TC-02-INT-19

- **Level:** Integration
- **Covers:** REQ-02-024
- **Asserts:** `PATCH /api/organizations/{orgId}/requests/{requestId}` → 400
  REQUEST_MESSAGES.fieldImmutable;
  `PATCH /api/organizations/{orgId}/requests/{requestId}` → 200
- **Steps:** Raise a request. As its requester, patch it with a different `topicId`. Then
  patch it with a new `title` and `priority`.
- **Expected Result:** The first answers `400` and leaves `topicId` and `topicLabel` as they
  were. The second answers `200`, so the immutability is scoped to the topic and has not
  frozen the fields that were editable.

### TC-02-INT-20

- **Level:** Integration
- **Covers:** REQ-02-014
- **Steps:** Enumerate the routes the topics controller registers.
- **Expected Result:** There is no `DELETE` handler on any topics path. A `DELETE` to
  `/api/organizations/{orgId}/request-topics/{topicId}` is answered by the framework's
  not-found handler, and no service method removes a `RequestTopic` row.

### TC-02-INT-21

- **Level:** Integration
- **Covers:** REQ-02-001
- **Asserts:** `GET /api/organizations/{orgId}/request-topics` → 404;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}` → 404;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive` → 404;
  `PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore` → 404
- **Steps:** Sign up two organizations. As an admin of the first, call each topic route with
  the second organization's `orgId` in the path, then with the first organization's `orgId`
  and a `topicId` belonging to the second.
- **Expected Result:** Every call answers `404` with no message naming the resource, identical
  to the answer for a path id that never existed. Nothing is read and nothing is written.

### TC-02-INT-22

- **Level:** Integration
- **Covers:** REQ-02-031
- **Asserts:** `PATCH /api/organizations/{orgId}/request-topics/order` → 200;
  `PATCH /api/organizations/{orgId}/request-topics/order` → 400
  REQUEST_TOPIC_MESSAGES.orderIncomplete;
  `PATCH /api/organizations/{orgId}/request-topics/order` → 403
  REQUEST_TOPIC_MESSAGES.manageForbidden;
  `GET /api/organizations/{orgId}/request-topics` → 200
- **Steps:** As an admin, archive one staff topic so the audience holds both statuses. Send the
  staff audience's ids reversed. Read the catalogue. Then send a list omitting one id, one
  naming an id twice, one naming a client topic among the staff ids, and one naming a topic of
  another organization. Send a valid list as a member holding `user`. Finally send a valid list
  and force the transaction to fail partway.
- **Expected Result:** The reversal answers `200` and the catalogue reads back in the new order,
  archived row included. Each malformed list answers `400` and writes no `sortOrder` at all.
  The `user` call answers `403`. The failed transaction leaves every `sortOrder` as the last
  successful reorder set them, so no order the curator did not choose is ever visible.

### TC-02-E2E-01

- **Level:** E2E
- **Covers:** REQ-02-006, REQ-02-010, REQ-02-012, REQ-02-030, REQ-02-031
- **Steps:** Sign in as an admin. Follow the Settings › Request topics navigation row. Switch
  to the client audience and back. Add a staff topic, then attempt to add a second with the
  same name in a different case. Move the second staff row up with its move control, then
  reload the page. Archive a topic from its row, then restore it from the archived list.
- **Expected Result:** The page renders the seeded staff topics in order. The duplicate
  submission keeps the modal open, draws the duplicate message under the name field, and
  leaves the typed value in place. The move swaps the row with the one above it and survives
  the reload, and the first row draws no move-up control. The archive moves the row to the
  archived list and the restore moves it back. The audience control is drawn when adding and
  not when renaming.
- **Selectors:** `settings-tab-request-topics`, `request-topics-page`,
  `request-topics-audience-staff`, `request-topics-audience-client`, `request-topics-add-btn`,
  `request-topic-modal`, `request-topic-name`, `request-topic-audience`, `request-topic-type`,
  `request-topic-submit`, `request-topic-error-name`, `request-topic-row-{id}`,
  `request-topic-row-{id}-archive-btn`, `request-topic-row-{id}-restore-btn`,
  `request-topic-row-{id}-move-up-btn`, `request-topic-row-{id}-move-down-btn`

### TC-02-E2E-02

- **Level:** E2E
- **Covers:** REQ-02-021
- **Steps:** Sign in as a member holding `create-request`. Open the requests list, open the
  new-request modal, submit it with a title and an addressee and **no** topic chosen, then
  choose the `Claude` topic and submit. Open the created request.
- **Expected Result:** The first submission shows the topic error, focuses the picker, and
  leaves the submit control enabled. The second creates the request. The list row and the
  detail header both show `Claude`, and no control for a request kind or an access kind is
  drawn anywhere in the modal.
- **Selectors:** `requests-page`, `requests-new-btn`, `request-new-modal`, `request-new-topic`,
  `request-new-error-topic`, `request-new-submit`, `request-row-{id}-topic`,
  `request-detail-topic`

### TC-02-E2E-03

- **Level:** E2E
- **Covers:** REQ-02-011
- **Steps:** As an admin, raise a request under a staff topic. Archive that topic in Settings.
  Return to the requests list, open the new-request modal, then close it and filter the list
  by the archived topic. Open the request.
- **Expected Result:** The picker no longer offers the archived topic. The topic filter still
  offers it and still returns the request. The detail screen shows the snapshot name with the
  archived marker beside it.
- **Selectors:** `request-new-topic`, `requests-topic-filter`, `request-row-{id}-topic`,
  `request-detail-topic`

### TC-02-E2E-04

- **Level:** E2E
- **Covers:** REQ-02-028, REQ-02-029
- **Steps:** Build four requests and drive them to `open`, `answered`, `granted` and
  `cancelled`. Open the requests list, read each row's status, open the status filter, select
  Closed, then open the cancelled request.
- **Expected Result:** The rows read Pending, In progress, Completed and Closed. The filter
  offers exactly those four words plus an all-statuses entry, and selecting Closed leaves the
  cancelled request in the list. The detail header reads Closed with `cancelled` beside it.
- **Selectors:** `requests-status-filter`, `request-row-{id}-status`, `request-detail-status`

### TC-02-E2E-05

- **Level:** E2E
- **Covers:** REQ-02-030
- **Steps:** Sign in as a member holding `user`. Read the sidebar. Navigate directly to the
  Settings › Request topics address.
- **Expected Result:** The navigation row is not rendered. The direct navigation renders no
  topics page and no add control — a destination the caller cannot use is not drawn, and the
  routes behind it refuse independently.
- **Selectors:** `settings-tab-request-topics` (absent), `request-topics-page` (absent),
  `request-topics-add-btn` (absent)

### TC-02-E2E-06

- **Level:** E2E
- **Covers:** REQ-02-017
- **Steps:** As an admin, archive every active staff topic in Settings. Open the requests
  list and the new-request modal.
- **Expected Result:** The picker is replaced by the empty-catalogue copy naming who can add
  one, and no submit control is drawn — the form says why it cannot be used instead of failing
  when it is used.
- **Selectors:** `requests-new-btn`, `request-new-modal`, `request-new-topic-empty`,
  `request-new-submit` (absent), `request-new-topic` (absent)
