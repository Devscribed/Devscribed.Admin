# 03 — Client Participants & Client-Addressed Requests · Verification & Cases

## Verification Plan

The rig below was walked before these cases were written, with a throwaway Playwright spec
that was deleted afterwards. Every cell is what happened. The half of it that cannot be walked
until the client principal exists says `not run` and is named in Known Gaps.

### Bringing it up

| Step | Command | Observed |
|---|---|---|
| 1 | `docker ps` | `devscribed-postgres` up 3 days (healthy), publishing the development and E2E database ports. |
| 2 | `cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 PW_WORKERS=1 npx playwright test tests/<file> --reporter=list` | The suite claimed its own pair, `e2e/global-setup.ts` migrated the E2E database, Next.js reported `Ready in 1781ms`, and `/login`, `/org/[orgId]/members` and `/org/[orgId]/requests` compiled and served. |
| 3 | The same run, API calls only | Every precondition route below answered, and the two refusals this spec must change were captured verbatim. |

No environment repair was needed at the checkout this was walked on.

### Reaching the states the cases need

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| An organization with an admin | `signupOrg` (`e2e/tests/helpers.ts`) | yes | yes |
| A client | `POST /api/organizations/{orgId}/clients` | yes | yes — `201` with `id`, `name`, `status: "active"` |
| A project bound to that client | `POST /api/organizations/{orgId}/projects` carrying `clientId` | yes | yes — `201` echoing `clientId` and `clientName` |
| A member assigned to that project | `assignProjectMembersViaApi` (`e2e/tests/helpers.ts`) | yes | yes — `200` |
| A second member holding `user` | `inviteAndAcceptViaApi` (`e2e/tests/helpers.ts`) | yes | yes |
| An invitation token, out of band | `latestInvitationToken` (`e2e/tests/helpers.ts`) | yes | yes — the sink answered `200` carrying `type`, `to`, `organizationName`, `organizationId`, `role`, `token` and `acceptUrl` |
| An account holding no principal | `createBareAccount` (`e2e/tests/helpers.ts`) | yes | yes — signing in answered `400 {"message":"Your account has been deactivated. Contact your administrator."}`, which is the refusal REQ-03-003 must stop applying to a contact |
| Today's refusal of a client addressee | `POST /api/organizations/{orgId}/requests` with `assigneeKind: "client"` | yes | yes — `400 {"error":"validation_error","fields":{"assigneeMembershipId":"Choose who this request is for"}}`, re-walked after the topic catalogue shipped and identical under a client topic and a staff one |
| A client-audience topic to raise the request under | `GET /api/organizations/{orgId}/request-topics?audience=client&status=active` | yes — seeded | yes — `200` with `Access` (`access`) and `Other` (`question`), so no case creates a topic |
| A client contact row | this spec's contacts route | created here | not run — the route is new |
| A signed-in client principal | accept a `client` invitation, then sign in | created here | not run — the principal does not exist yet |
| A request addressed to a client | this spec's amended create route | created here | not run |
| A notifier that fails | a double registered with `overrideProvider`, the way `apps/api/test/clients.spec.ts` already replaces the mail transport | pattern exists | the pattern is in daily use; this spec's use of it is not exercised |

Every state a case needs is reached through this spec's own product routes or through a
helper that already exists. **This spec owes no test fixture** and adds nothing under
`apps/api/src/test-support/`.

### Access this needs

| What | Name | Where the value lives | How the next agent gets it | Proven against |
|---|---|---|---|---|
| — | — | — | — | Nothing. The notifier that ships makes no outbound call, so this spec depends on no third-party system, no API key and no MCP server. There is no credential to obtain and none appears in any tracked file. |

### Observing each criterion

| Acceptance criterion | Observer | Level | Proven at spec time |
|---|---|---|---|
| AC-1 | TC-03-INT-03, TC-03-E2E-01 | Integration + E2E | today's refusal captured verbatim; the sign-in screen was reached |
| AC-2 | TC-03-INT-08 | Integration | new |
| AC-3 | TC-03-INT-13, TC-03-E2E-02 | Integration + E2E | the members and projects routes answer `200` to staff today, which is the baseline |
| AC-4 | TC-03-INT-15, TC-03-INT-16, TC-03-INT-17 | Integration | the project, its client link and project membership are all reachable and proven |
| AC-5 | TC-03-INT-18 | Integration | new |
| AC-6 | TC-03-INT-20, TC-03-INT-21, TC-03-INT-22 | Integration | the transition routes exist and are exercised by `apps/api/test/requests.spec.ts` |
| AC-7 | TC-03-INT-19, TC-03-INT-23 | Integration | today's list shape captured, including the `vacation` member this principal must not receive |
| AC-8 | TC-03-INT-10, TC-03-E2E-03 | Integration + E2E | the stamp mechanism is proven by `apps/api/test/session-revocation.spec.ts` |
| AC-9 | TC-03-INT-24, TC-03-INT-25 | Integration | new |
| AC-10 | TC-03-INT-25 | Integration | new |
| AC-11 | TC-03-INT-26, TC-03-INT-27 | Integration | new |
| AC-12 | TC-03-INT-28 | Integration (concurrency) | new |
| AC-13 | TC-03-INT-29 | Integration | today's list and badge shape captured |
| AC-14 | TC-03-INT-14 | Integration | new |
| AC-15 | TC-03-INT-06, TC-03-INT-07 | Integration | the archive route exists and is exercised by `apps/api/test/clients.spec.ts` |
| AC-16 | TC-03-INT-11 | Integration | new |
| AC-17 | TC-03-INT-30 | Integration | new |

### Rehearsal

One throwaway spec, `e2e/tests/_probe-requests-topics-clients.spec.ts`, signed up an
organization, created a client, created a project bound to it, invited and accepted a member,
assigned them to the project, raised a request, read the mail sink, attempted a client
addressee, attempted a sign-in for an account with no principal, then signed in through the UI
and reached the requests screens. It was deleted afterwards; the command and what came back
are kept here.

```
cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 PW_WORKERS=1 \
  npx playwright test tests/_probe-requests-topics-clients.spec.ts --reporter=list

[probe] POST clients => 201 {"id":"…","name":"Acme …","status":"active", …}
[probe] POST projects (with clientId) => 201 {"id":"…","clientId":"…","clientName":"Acme …"}
[probe] assign project member => 200
[probe] POST requests assigneeKind=client => 400
        {"error":"validation_error","fields":{"assigneeMembershipId":"Choose who this request is for"}}
[probe] login with no membership => 400
        {"message":"Your account has been deactivated. Contact your administrator."}
[probe] mail sink => 200 type,to,organizationName,organizationId,role,token,acceptUrl
[probe] GET /api/me => 200 {"account":{…},"organization":{…},"role":"admin",
        "features":{"mailOutbox":true}}
  ✓  1 [chromium] › tests\_probe-requests-topics-clients.spec.ts (8.6s)
  1 passed (20.6s)
```

### Re-walked after the topic catalogue shipped

The rig above was walked while the create route still took `type` and `accessKind`. That
route now takes a topic, so a second throwaway spec, `e2e/tests/_probe-03-clients.spec.ts`,
re-walked the cells that could have moved: what the catalogue answers for the client audience,
and whether the two refusals this spec replaces still read the same. It was deleted
afterwards.

```
cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 PW_WORKERS=1 \
  npx playwright test tests/_probe-03-clients.spec.ts --reporter=list

[probe] GET request-topics?audience=client => 200 {"topics":[
        {"id":"…","audience":"client","type":"access","name":"Access","sortOrder":10,"status":"active", …},
        {"id":"…","audience":"client","type":"question","name":"Other","sortOrder":20,"status":"active", …}]}
[probe] GET request-topics?audience=staff => 200 9 topic(s)
[probe] POST requests assigneeKind=client, client topic => 400
        {"error":"validation_error","fields":{"assigneeMembershipId":"Choose who this request is for"}}
[probe] POST requests assigneeKind=client, staff topic => 400
        {"error":"validation_error","fields":{"assigneeMembershipId":"Choose who this request is for"}}
[probe] POST requests, pre-02 body => 400 {"error":"validation_error","fields":{
        "type":"The request kind is set by the topic and cannot be sent",
        "accessKind":"The request kind is set by the topic and cannot be sent",
        "topicId":"Choose what this request is about",
        "assigneeMembershipId":"Choose who this request is for"}}
[probe] login with no principal => 400
        {"message":"Your account has been deactivated. Contact your administrator."}
  ✓  1 [chromium] › tests\_probe-03-clients.spec.ts (980ms)
  1 passed (15.6s)
```

Three things this settles. Every organization is seeded with the two client topics
REQ-03-024's `client` rows need, so no case has to create one. The refusal of a client
addressee is **unchanged** and is unchanged *whichever* audience the topic has — the body
check refuses the kind before the topic row is read — which is why the client rows of
REQ-03-024's table cannot be observed until `client` is an accepted addressee kind, and why
TC-03-INT-18 has to raise a real client request to reach the audience comparison at all. And
the sign-in refusal REQ-03-003 replaces still reads verbatim as it did.

The `400`s and the `/api/me` body are quoted rather than described because the cases assert
against them.

## Test Cases

### TC-03-UNIT-01

- **Level:** Unit
- **Covers:** REQ-03-016
- **Steps:** Read the exported client capability list, and probe it for `read-own-requests`,
  `answer-request`, `decline-request`, `post-request-message`, `create-request`,
  `view-all-requests`, `view-own-requests` and `manage-clients`.
- **Expected Result:** The first four are held and the last four are not — including
  `view-own-requests`, which is a member capability that no client value is spelled as. The
  list is a flat readonly array with no role key anywhere in its shape, so there is no second
  row for a future author to populate by accident.

### TC-03-UNIT-02

- **Level:** Unit
- **Covers:** REQ-03-017
- **Steps:** Resolve rights for a principal of kind `client` carrying a role of `admin`, then
  for kind `client` with a role of `null`, then for kind `member` with a role of `admin`. Then
  call the staff helpers directly with the same absent role, to record what the ordering rule
  is protecting against.
- **Expected Result:** Both client cases return the client list and ignore the role entirely;
  the member case returns the admin capabilities. A role value can never widen a client
  principal, which is what makes the kind the first question. The direct calls show why: with
  a role of `null`, `hasCapability` answers `true` for `ViewOwnRequests` — the absent role
  normalizes to `viewer` — while `can` answers `false`. A client principal that reached either
  helper would be answered by a role it does not have, and one of the two would grant.

### TC-03-INT-01

- **Level:** Integration
- **Covers:** REQ-03-001, REQ-03-012, REQ-03-015
- **Asserts:** `POST /api/organizations/{orgId}/clients/{clientId}/contacts` → 201;
  `POST /api/invitations/accept` → 200
- **Steps:** As an admin, invite a contact to an active client. Read the token from the mail
  sink and accept it with a first name, a last name and a password.
- **Expected Result:** An active `ClientMembership` exists for the new account, carrying the
  organization and the client, and **no** `Membership` row exists for it. The accept answers
  with a `redirectTo` of the requests destination and sets the session cookie.

### TC-03-INT-02

- **Level:** Integration
- **Covers:** REQ-03-009
- **Asserts:** `POST /api/organizations/{orgId}/clients/{clientId}/contacts` → 201
- **Steps:** Invite a contact. Read the stored `Invitation` row and the message the sink
  received.
- **Expected Result:** The row carries the client's id, the role value `client`, a hashed
  token, and an expiry seven days out. The raw token is in the message and nowhere in the
  database.

### TC-03-INT-03

- **Level:** Integration
- **Covers:** REQ-03-003
- **Asserts:** `POST /api/login` → 200
- **Steps:** Invite and accept a contact, then sign in with that address and password.
- **Expected Result:** `200`, with the client's organization in the body and a session cookie
  set. The account holds no `Membership`, so this is exactly the case that answered
  `AUTH_MESSAGES.deactivated` before this spec.

### TC-03-INT-04

- **Level:** Integration
- **Covers:** REQ-03-004
- **Asserts:** `POST /api/login` → 400 AUTH_MESSAGES.deactivated
- **Steps:** Create an account holding no principal at all and sign in with the correct
  password. Repeat with the wrong password.
- **Expected Result:** The correct password answers `400` with the deactivated message; the
  wrong one answers `400` with `AUTH_MESSAGES.invalidCredentials`. The membership check runs
  before the password comparison, so neither answer tells a caller whether the password was
  right.

### TC-03-INT-05

- **Level:** Integration
- **Covers:** REQ-03-005
- **Asserts:** `GET /api/me` → 200
- **Steps:** As a signed-in client contact, call the identity endpoint. Repeat as an admin.
- **Expected Result:** The contact receives `principal: "client"`, a null role, the
  organization, and the client's id and name. The admin receives `principal: "member"`, their
  role, and a null client. Neither answer is `null`, which is what the endpoint returns today
  for an account with no staff membership.

### TC-03-INT-06

- **Level:** Integration
- **Covers:** REQ-03-010
- **Asserts:** `POST /api/organizations/{orgId}/clients/{clientId}/contacts` → 400
  CLIENT_MESSAGES.clientArchived
- **Steps:** Archive a client, then invite a contact to it. Restore the client and invite
  again.
- **Expected Result:** The first answers `400` and writes no `Invitation`; the second answers
  `201`.

### TC-03-INT-07

- **Level:** Integration
- **Covers:** REQ-03-013
- **Asserts:** `POST /api/organizations/{orgId}/clients/{clientId}/contacts` → 409
  CLIENT_USER_MESSAGES.alreadyLinked
- **Steps:** Invite and accept a contact, then invite the same address to the same client
  again. Then invite the same address to a **different** client of the same organization.
- **Expected Result:** The first repeat answers `409`. The second also answers `409`, because
  the account already holds its one client membership, and the message is the same so neither
  answer says which client the person belongs to.

### TC-03-INT-08

- **Level:** Integration
- **Covers:** REQ-03-002, REQ-03-014
- **Asserts:** `POST /api/invitations/accept` → 409
  CLIENT_USER_MESSAGES.principalConflict;
  `POST /api/login` → 200;
  `POST /api/login` → 400 AUTH_MESSAGES.deactivated
- **Steps:** Take an account holding an active staff membership and accept a `client`
  invitation with it. Then, for each row of the principal decision table that is reachable,
  build the account and sign in: no rows at all; an active client row alone; a removed client
  row alone; an active staff row alone; an active staff row with a removed client row; a
  removed staff row with an active client row; a removed staff row alone; both rows removed.
- **Expected Result:** The accept answers `409` and writes no `ClientMembership`, so the cell
  the table marks unreachable stays unreachable. Every other cell resolves the principal the
  table names, and every refusal carries the deactivated message.

### TC-03-INT-09

- **Level:** Integration
- **Covers:** REQ-03-007
- **Asserts:** `POST /api/login` → 400 AUTH_MESSAGES.deactivated
- **Steps:** Invite, accept and then remove a contact. Sign in as them with the correct
  password.
- **Expected Result:** `400` with the deactivated message, identical to the answer for a
  removed member of staff.

### TC-03-INT-10

- **Level:** Integration
- **Covers:** REQ-03-006
- **Asserts:** `DELETE /api/organizations/{orgId}/clients/{clientId}/contacts/{contactId}` → 200;
  `GET /api/me` → 401
- **Steps:** Sign in as a contact and hold the cookie. As an admin, remove them. Reuse the
  held cookie on the identity endpoint.
- **Expected Result:** The removal answers `200`, writes `removedAt` and
  `removedByAccountId`, and rotates the account's `securityStamp` in the same transaction. The
  held cookie answers `401` on its next use, with no window in which the row is removed and
  the stamp is not.

### TC-03-INT-11

- **Level:** Integration
- **Covers:** REQ-03-012
- **Asserts:** `POST /api/organizations/{orgId}/clients/{clientId}/contacts` → 201;
  `POST /api/invitations/accept` → 200
- **Steps:** Invite, accept, remove, then invite the same address to the same client again and
  accept.
- **Expected Result:** One `ClientMembership` row exists for the account, back at `active`
  with `removedAt` and `removedByAccountId` cleared. Requests addressed to that contact are
  theirs again, and no second row was written.

### TC-03-INT-12

- **Level:** Integration
- **Covers:** REQ-03-008
- **Asserts:** `POST /api/organizations/{orgId}/clients/{clientId}/contacts` → 403
  CLIENT_USER_MESSAGES.inviteForbidden;
  `DELETE /api/organizations/{orgId}/clients/{clientId}/contacts/{contactId}` → 403
  CLIENT_USER_MESSAGES.inviteForbidden;
  `GET /api/organizations/{orgId}/clients/{clientId}/contacts` → 403 CLIENT_MESSAGES.forbidden
- **Steps:** As a member holding `user`, call each of the three contacts routes. Repeat every
  call as a `manager`.
- **Expected Result:** Every `user` call is refused and nothing is written. Every `manager`
  call succeeds, so the capability is proven granted as well as withheld.

### TC-03-INT-13

- **Level:** Integration
- **Covers:** REQ-03-019
- **Asserts:** `GET /api/organizations/{orgId}/members` → 404;
  `GET /api/organizations/{orgId}/projects` → 404;
  `GET /api/organizations/{orgId}/clients/{clientId}/contacts` → 404;
  `GET /api/organizations/{orgId}/members` → 200
- **Steps:** As a signed-in client contact, call the members route, the projects route and the
  contacts route of their own client, each with their own organization's id in the path. Then
  call the members route as an admin of that organization.
- **Expected Result:** Every client call answers `404` with no message naming the resource —
  the same answer as for an organization the caller has no part in. The admin call answers
  `200`, so the `404` is about the principal and not about the route being broken.

### TC-03-INT-14

- **Level:** Integration
- **Covers:** REQ-03-027
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 403
  CLIENT_USER_MESSAGES.clientCannotCreate
- **Steps:** As a signed-in client contact, post a well-formed request body naming a
  client-audience topic and another contact as the addressee. Then post an empty body.
- **Expected Result:** Both answer `403` with `CLIENT_USER_MESSAGES.clientCannotCreate` and
  create nothing. The refusal is the principal's, not the body's, so a well-formed body cannot
  slip through and a malformed one is not answered as a validation error. The message is
  asserted to be that one and **not** `REQUEST_MESSAGES.createForbidden`, which is what a
  capability check reached first would answer.

### TC-03-INT-15

- **Level:** Integration
- **Covers:** REQ-03-021
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400
  REQUEST_MESSAGES.clientProjectRequired;
  `POST /api/organizations/{orgId}/requests` → 201
- **Steps:** As a member assigned to a project of the contact's client, raise a
  client-addressed request with no `projectId`. Then raise it with the project. Then raise a
  **member**-addressed request with no `projectId`.
- **Expected Result:** The first answers `400`; the second answers `201`; the third answers
  `201`, so the project stays optional for a staff request and is required only where the rule
  says.

### TC-03-INT-16

- **Level:** Integration
- **Covers:** REQ-03-022
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400
  REQUEST_MESSAGES.clientProjectMismatch
- **Steps:** Create two clients, each with a project, and assign the requester to both
  projects. Raise a request addressed to a contact of the first client naming the second
  client's project. Then name a project with no client link at all.
- **Expected Result:** Both answer `400` with the same message and create nothing. Neither
  answer says whether the project exists.

### TC-03-INT-17

- **Level:** Integration
- **Covers:** REQ-03-023
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400 REQUEST_MESSAGES.notOnProject;
  `POST /api/organizations/{orgId}/requests` → 201
- **Steps:** As a member **not** assigned to the client's project, raise a client-addressed
  request naming it. Repeat as an **admin** who is also not assigned. Then assign the admin to
  the project and repeat.
- **Expected Result:** The first two answer `400` — an admin is not carved out — and the third
  answers `201`.

### TC-03-INT-18

- **Level:** Integration
- **Covers:** REQ-03-024
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400
  REQUEST_MESSAGES.topicAudienceMismatch;
  `POST /api/organizations/{orgId}/requests` → 201
- **Steps:** Raise all four combinations of topic audience and addressee kind, under the two
  seeded client topics and a seeded staff one: a staff topic to a member, a staff topic to a
  client contact, a client topic to a member, and a client topic to a client contact. Then
  archive the client topic and raise the fourth combination again.
- **Expected Result:** The two matching combinations answer `201`; the two crossed ones answer
  `400` with `REQUEST_MESSAGES.topicAudienceMismatch` and create nothing. Every cell of the
  audience decision table is exercised. The archived repeat answers `400` with
  `REQUEST_MESSAGES.topicUnavailable` and not the mismatch, so an archived topic of either
  audience is refused by the same sentence and the audience of an unavailable topic is not
  disclosed.

### TC-03-INT-19

- **Level:** Integration
- **Covers:** REQ-03-028, REQ-03-034
- **Asserts:** `GET /api/organizations/{orgId}/requests/{requestId}` → 200;
  `GET /api/organizations/{orgId}/requests/{requestId}` → 404
- **Steps:** Raise one request addressed to contact A and one addressed to contact B of the
  same client, plus one between two members. As contact A, read each of the three.
- **Expected Result:** Their own answers `200` with the thread and the history. The other
  contact's and the staff-only one both answer `404`, identical to a request that does not
  exist.

### TC-03-INT-20

- **Level:** Integration
- **Covers:** REQ-03-030
- **Asserts:** `POST /api/organizations/{orgId}/requests/{requestId}/answer` → 200;
  `POST /api/organizations/{orgId}/requests/{requestId}/answer` → 403
  REQUEST_MESSAGES.notYoursToAnswer;
  `POST /api/organizations/{orgId}/requests/{requestId}/answer` → 409
  REQUEST_MESSAGES.alreadyTerminal
- **Steps:** As the addressee contact, answer their request. Then as the requester, attempt to
  answer it. Then cancel it as the requester and attempt to answer again as the contact.
- **Expected Result:** The first answers `200`, writes `answeredAt` once and one
  `status_changed` event whose actor kind is `client`. The requester's attempt answers `403`.
  The attempt after the cancellation answers `409`.

### TC-03-INT-21

- **Level:** Integration
- **Covers:** REQ-03-031
- **Asserts:** `POST /api/organizations/{orgId}/requests/{requestId}/decline` → 200;
  `POST /api/organizations/{orgId}/requests/{requestId}/decline` → 400
  REQUEST_MESSAGES.declineReasonRequired;
  `POST /api/organizations/{orgId}/requests/{requestId}/decline` → 403
  REQUEST_MESSAGES.notYoursToDecline
- **Steps:** As the addressee contact, decline with an empty reason, then with a reason. As
  the requester, attempt to decline another request of theirs.
- **Expected Result:** The empty reason answers `400` and changes nothing. The reason answers
  `200`, and the request holds a `RequestMessage` carrying that reason with an author kind of
  `client`, written in the same transaction as the status. The requester's attempt answers
  `403`.

### TC-03-INT-22

- **Level:** Integration
- **Covers:** REQ-03-032
- **Asserts:** `POST /api/organizations/{orgId}/requests/{requestId}/grant` → 403
  REQUEST_MESSAGES.notYoursToGrant;
  `POST /api/organizations/{orgId}/requests/{requestId}/grant` → 200
- **Steps:** As the addressee contact, attempt to grant the request addressed to them. Then as
  the requester, grant it.
- **Expected Result:** The contact answers `403` and the status is unchanged. The requester
  answers `200`, so the refusal is about who is asking and not about the transition.

### TC-03-INT-23

- **Level:** Integration
- **Covers:** REQ-03-029
- **Asserts:** `GET /api/organizations/{orgId}/requests` → 200
- **Steps:** In an organization holding requests addressed to two contacts, requests between
  members, and a pending vacation request, list as contact A with no query, then with
  `scope=all`.
- **Expected Result:** Both answers hold only the requests addressed to contact A. The
  response carries no `vacation` member at all, and `counts.waitingOnMe` counts the
  non-terminal ones addressed to them. `scope=all` widens nothing.

### TC-03-INT-24

- **Level:** Integration
- **Covers:** REQ-03-035, REQ-03-038
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 201;
  `POST /api/organizations/{orgId}/requests/{requestId}/messages` → 201;
  `POST /api/organizations/{orgId}/requests/{requestId}/answer` → 200
- **Steps:** Raise a client-addressed request, post a message on it, and answer it. Read the
  outbox rows and their events.
- **Expected Result:** Each of the three writes produced its outbox rows, each carrying the id
  of the event written by the same transaction, and every row was handled by the shipped
  notifier: `status` `skipped`, `channel` `none`, `handledAt` set, `attempts` at one. No mail
  message of any type reached the sink.

### TC-03-INT-25

- **Level:** Integration
- **Covers:** REQ-03-036
- **Asserts:** `POST /api/organizations/{orgId}/requests/{requestId}/messages` → 201
- **Steps:** On a request with a member requester and a client addressee, post a message as the
  requester and read the outbox rows for that event. Post one as the contact and read again.
- **Expected Result:** The requester's message produced exactly one row, addressed to the
  contact. The contact's produced exactly one, addressed to the requester. Neither event
  produced a row addressed to the principal who caused it.

### TC-03-INT-26

- **Level:** Integration
- **Covers:** REQ-03-037
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 201
- **Steps:** Register a notifier double that records whether a transaction is open when it is
  called and blocks until released. Raise a client-addressed request.
- **Expected Result:** The route answers before the double is released, the outbox row is
  already committed when the double is called, and no database transaction is open at that
  moment. A notifier that never returns therefore holds no row lock on the request.

### TC-03-INT-27

- **Level:** Integration
- **Covers:** REQ-03-040
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 201;
  `POST /api/organizations/{orgId}/requests/{requestId}/answer` → 200;
  `GET /api/organizations/{orgId}/requests/{requestId}` → 200
- **Steps:** Register a notifier double that throws on every call. Raise a client-addressed
  request and answer it. Read the request back.
- **Expected Result:** Both writes answer normally, the request is `answered` with its events
  intact, and the outbox rows sit at `failed` with `lastError` set and no recipient address
  anywhere in it. The read path is identical to a run with the shipped notifier.

### TC-03-INT-28

- **Level:** Integration
- **Covers:** REQ-03-039
- **Asserts:** `POST /api/organizations/{orgId}/requests/{requestId}/messages` → 201
- **Steps:** Post a message, then dispatch its event a second time by hand, then attempt to
  insert a second outbox row for the same event and recipient directly.
- **Expected Result:** Exactly one row exists for that event and recipient. The direct insert
  is rejected by the uniqueness constraint, and the second dispatch delivers the existing row
  at most once more rather than creating another.

### TC-03-INT-29

- **Level:** Integration
- **Covers:** REQ-03-041
- **Asserts:** `GET /api/organizations/{orgId}/requests` → 200;
  `GET /api/organizations/{orgId}/requests/{requestId}` → 200
- **Steps:** Register a notifier double that never returns, so every row stays `pending`.
  Raise, message and answer a client-addressed request, then list and read it as both parties.
- **Expected Result:** The list, the detail, the counts and the badge number are exactly what
  they are when every row is handled. No read path consults the outbox.

### TC-03-INT-30

- **Level:** Integration
- **Covers:** REQ-03-038
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 201
- **Steps:** Register a double returning `delivered` with a channel of `email`, a provider key
  and a provider reference. Raise a client-addressed request and read the outbox row.
- **Expected Result:** The row stores all three values and reads back `delivered`. No
  migration, no column and no rule in this bundle changed to allow it, which is what makes the
  port a port.

### TC-03-INT-31

- **Level:** Integration
- **Covers:** REQ-03-011
- **Asserts:** `POST /api/organizations/{orgId}/clients/{clientId}/contacts` → 201;
  `POST /api/invitations/accept` → 400 INVITE_MESSAGES.tokenInvalid
- **Steps:** Invite an address as a client contact, keep the token, then invite the same
  address again — first as a client contact, then as a member of staff. Attempt to accept the
  first token.
- **Expected Result:** Each new invitation invalidates the previous pending one, whichever kind
  it is, in the same transaction that writes it. The first token answers `400` when accepted.

### TC-03-INT-32

- **Level:** Integration
- **Covers:** REQ-03-020
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400
  REQUEST_MESSAGES.assigneeInvalid;
  `POST /api/organizations/{orgId}/requests` → 404
- **Steps:** Raise a client-addressed request with no `assigneeClientMembershipId`, then with
  one naming a contact of a **different organization**, then with `assigneeKind: "client"` and
  a `assigneeMembershipId` instead.
- **Expected Result:** The first and third answer `400` with the named message. The
  cross-organization contact answers `404`, identical to an id that does not exist, so contact
  ids cannot be probed across organizations.

### TC-03-INT-33

- **Level:** Integration
- **Covers:** REQ-03-025
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 400
  REQUEST_MESSAGES.assigneeInactive
- **Steps:** Remove a contact, then raise a request addressed to them.
- **Expected Result:** `400` with the named message, and nothing is created. The message is the
  one a removed member of staff already produces, because the fact is the same.

### TC-03-INT-34

- **Level:** Integration
- **Covers:** REQ-03-026
- **Asserts:** `GET /api/organizations/{orgId}/requests/{requestId}` → 200
- **Steps:** Raise a request addressed to a contact, then remove the contact, then read the
  request as its requester.
- **Expected Result:** The request is still `open`, its assignee reads `inactive: true` with
  the contact's name and their client, and no status changed. Nothing was cancelled and nothing
  was reassigned.

### TC-03-INT-35

- **Level:** Integration
- **Covers:** REQ-03-033
- **Asserts:** `POST /api/organizations/{orgId}/requests/{requestId}/messages` → 201;
  `POST /api/organizations/{orgId}/requests/{requestId}/messages` → 409
  REQUEST_MESSAGES.threadClosed
- **Steps:** As the addressee contact, post a message on an open request. Have the requester
  cancel it, then post again.
- **Expected Result:** The first answers `201` with an author kind of `client` and a
  `message_posted` event in the same transaction. The second answers `409`.

### TC-03-E2E-01

- **Level:** E2E
- **Covers:** REQ-03-003
- **Steps:** As an admin, open a client's detail screen, invite a contact, and read the token
  from the mail sink. Invite the same address a second time. Accept the first invitation
  through the accept screen, then sign in as the new contact. Raise a request addressed to
  them as an assigned member beforehand, so the list has a row.
- **Expected Result:** The contacts section lists the invited address before acceptance and the
  contact afterwards. The second invitation keeps the modal open with the already-a-contact
  error under the address field. Signing in lands on the requests screen, showing the one
  request addressed to them and no control for raising one.
- **Selectors:** `client-contacts-section`, `client-contact-invite-btn`,
  `client-contact-invite-modal`, `client-contact-invite-email`, `client-contact-invite-submit`,
  `client-contact-invite-error-email`, `client-contact-row-{id}`, `requests-page`,
  `requests-new-btn` (absent)

### TC-03-E2E-02

- **Level:** E2E
- **Covers:** REQ-03-018, REQ-03-019
- **Steps:** Signed in as a client contact, read the sidebar. Then navigate directly to the
  members address, the projects address and the clients address of their own organization.
- **Expected Result:** The requests entry is the only organization navigation entry drawn. Each
  direct navigation renders no screen behind it, because the route the page reads answers
  `404` — a destination the caller cannot use is neither drawn nor reachable by typing.
- **Selectors:** `sidebar-requests-link`, `nav-members` (absent), `nav-projects` (absent),
  `nav-clients` (absent)

### TC-03-E2E-03

- **Level:** E2E
- **Covers:** REQ-03-006
- **Steps:** Sign in as a contact in one browser context and open a request. In an admin
  context, open the client's detail screen and remove that contact from its row. In the
  contact's context, reload the request.
- **Expected Result:** The removal control is drawn while the contact is active. The reload
  lands on the sign-in screen and no request content is drawn from a stale response. This case
  mutates the contact's session state and is marked serial.
- **Selectors:** `client-contact-row-{id}`, `client-contact-row-{id}-remove-btn`,
  `request-detail-page` (absent after removal), `requests-page` (absent after removal)

### TC-03-E2E-04

- **Level:** E2E
- **Covers:** REQ-03-020
- **Steps:** As a member assigned to a project of a client with a contact, open the
  new-request modal and read the topic control. Choose the client addressee kind and read it
  again. Submit with no contact chosen, then choose the contact and the project and submit.
- **Expected Result:** The addressee control offers colleagues and clients, and the member
  picker gives way to the contact picker when the client kind is chosen. The topic control
  offers the staff catalogue before the switch and the two seeded client topics after it, with
  any previously chosen topic cleared. The empty submission shows the addressee error, focuses
  the control, and leaves the submit control enabled. Once chosen, the project control offers
  only projects of that contact's client that the requester is assigned to, and the submission
  creates the request. Finally, archive both client topics from Settings and reopen the modal:
  choosing the client kind replaces the topic control with the empty-catalogue copy and draws
  no submit control, while choosing the colleague kind restores both — the state is per
  audience, not per modal.
- **Selectors:** `request-new-assignee-kind`, `request-new-assignee-client`,
  `request-new-assignee-member` (absent after the switch), `request-new-topic`,
  `request-new-topic-empty`, `request-new-submit` (absent on the empty audience),
  `request-new-error-assignee`, `request-new-project`

### TC-03-E2E-05

- **Level:** E2E
- **Covers:** REQ-03-030, REQ-03-032
- **Steps:** As the addressee contact, open the request addressed to them, post a message,
  mark it answered, then open a second request addressed to them and decline it with a reason.
- **Expected Result:** The answer and decline controls are drawn and the grant control is not.
  The thread shows the posted message, the header reads In progress after the answer, and the
  declined request reads Closed with the reason in the thread.
- **Selectors:** `request-detail-page`, `request-detail-assignee`, `request-detail-thread`,
  `request-detail-composer`, `request-detail-answer-btn`, `request-detail-decline-btn`,
  `request-detail-decline-reason`, `request-detail-decline-confirm`,
  `request-detail-grant-btn` (absent), `client-contacts-empty-state` (absent)
