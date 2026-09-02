# 02 — Client Participants — Test Cases

`Covers` names the requirements a case would fail for. `Asserts` names each observable outcome as
`METHOD /path → status [MESSAGES.key]`, which `scripts/spec-lint.mjs` joins against the Routes and
Error Messages tables of the contracts file — a status a case expects and the contract does not
declare is a lint error before anybody reads the document.

### TC-02-UNIT-01

- **Level:** Unit
- **Covers:** REQ-02-020, REQ-02-021
- **Steps:** Validate invitation shapes: (`user`, no clientId), (`client`, clientId),
  (`client`, no clientId), (`user`, clientId), (`nonsense`, clientId).
- **Expected Result:** valid; valid; `invitationShapeInvalid`; `invitationShapeInvalid`;
  `MESSAGES.role.invalid`.

### TC-02-UNIT-02

- **Level:** Unit
- **Covers:** REQ-02-032
- **Steps:** Validate addressee pairs: `member` with a membershipId; `client` with a
  clientMembershipId; `client` with a membershipId; both ids; neither.
- **Expected Result:** valid; valid; `assigneeInvalid`; `assigneeInvalid`; `assigneeInvalid`.

### TC-02-UNIT-03

- **Level:** Unit
- **Covers:** REQ-02-012
- **Steps:** Assert `CLIENT_CAPABILITIES`, and that `NormalizedRole` and `ROLE_CAPABILITIES` are
  unchanged by this spec.
- **Expected Result:** `CLIENT_CAPABILITIES` is exactly `['ViewOwnRequests']`; the staff roles and
  their capability lists are byte-identical to what they were, plus `ManageClientUsers` for admin
  and manager.

### TC-02-INT-01

- **Level:** Integration
- **Covers:** REQ-02-001, REQ-02-002, REQ-02-027
- **Asserts:** `POST /api/invitations` → 200; `POST /api/invitations/accept` → 200
- **Steps:** Invite a client user for an active client; read the mail sink for
  `client_invitation`; accept the token.
- **Expected Result:** the mail names the organization, the client and the inviter and carries the
  link; a `ClientMembership` exists with `status = 'active'` bound to that client and that
  organization; the invitation is `used`.

### TC-02-INT-02

- **Level:** Integration
- **Covers:** REQ-02-011, REQ-02-021, REQ-02-022, REQ-02-026
- **Asserts:** `POST /api/invitations` → 400 CLIENT_USER_MESSAGES.invitationShapeInvalid;
  `POST /api/invitations` → 400 CLIENT_USER_MESSAGES.clientArchived;
  `POST /api/invitations` → 400 INVITE_MESSAGES.alreadyMember;
  `POST /api/invitations` → 403 CLIENT_USER_MESSAGES.manageForbidden;
  `POST /api/invitations` → 403 INVITE_MESSAGES.permissionDenied
- **Steps:** As an admin: `role=client` with no `clientId`; `role=user` with a `clientId`;
  `role=client` for an archived client; `role=user` for an address already holding an active
  `Membership`. Then as a `user`: `role=client` with a valid `clientId`; `role=client` with **no**
  `clientId`; `role=user` with no `clientId`.
- **Expected Result:** the four admin bodies answer `invitationShapeInvalid`,
  `invitationShapeInvalid`, `clientArchived` and `alreadyMember`. The first two `user` bodies
  both answer
  `manageForbidden` — byte-identical to each other, so the permission refusal precedes the shape
  rule and a malformed client body from a caller without the capability is never answered
  `invitationShapeInvalid`. The third answers `permissionDenied`, the refusal for a body that is
  not a client invitation. No `Invitation` row is written in any of the six.

### TC-02-INT-03

- **Level:** Integration
- **Covers:** REQ-02-002, REQ-02-025, REQ-02-055
- **Asserts:** `POST /api/invitations` → 200;
  `POST /api/invitations/accept` → 409 CLIENT_USER_MESSAGES.accountIsStaff
- **Steps:** Invite an address that already holds an active `Membership` as a client user of an
  active client, then accept that token.
- **Expected Result:** the invitation is minted rather than refused with `alreadyMember`, which
  this spec scopes to staff bodies; accepting it writes no `ClientMembership` and leaves the
  invitation `pending`.

### TC-02-INT-04

- **Level:** Integration
- **Covers:** REQ-02-003
- **Asserts:** `POST /api/invitations/accept` → 409 CLIENT_USER_MESSAGES.accountIsClient;
  `POST /api/invitations/accept` → 200
- **Steps:** Accept a staff invitation with an address that holds an active `ClientMembership`.
  Then remove that client user and accept a fresh staff invitation for the same address.
- **Expected Result:** the first answers `accountIsClient` and writes no `Membership`; the second
  succeeds and leaves the `removed` client row untouched, still bound to its client.

### TC-02-INT-05

- **Level:** Integration
- **Covers:** REQ-02-002
- **Steps:** Force the `ClientMembership` write to fail inside the accept transaction.
- **Expected Result:** no `ClientMembership`, no `Account` created for a new invitee, and the
  invitation still `pending` — nothing half-applied.

### TC-02-INT-06

- **Level:** Integration
- **Covers:** REQ-02-005, REQ-02-014, REQ-02-028
- **Asserts:** `GET /api/me` → 200;
  `PATCH /api/organizations/{orgId}/clients/{clientId}/users/{clientMembershipId}/remove` → 204;
  `GET /api/me` → 401; `POST /api/login` → 400 AUTH_MESSAGES.deactivated
- **Steps:** Sign a client user in, call the session endpoint, remove them, reuse the same cookie
  jar, then attempt a fresh login.
- **Expected Result:** the first call carries `principalKind: 'client'`, `role: null` and the
  organization of the `ClientMembership`; after removal the same jar is refused; the row is
  `removed` and the account's `securityStamp` differs from the value read before removal.

### TC-02-INT-07

- **Level:** Integration
- **Covers:** REQ-02-007, REQ-02-008
- **Asserts:** `POST /api/login` → 400 AUTH_MESSAGES.deactivated
- **Steps:** Log in for an account with no principal at all, one whose `ClientMembership` is
  `removed`, and one whose `Membership` is `removed` — each with a correct and then an incorrect
  password.
- **Expected Result:** all six answer the same body, byte for byte, so neither the cause nor the
  correctness of the password is distinguishable.

### TC-02-INT-08

- **Level:** Integration
- **Covers:** REQ-02-010, REQ-02-019, REQ-02-047, REQ-02-048
- **Asserts:** `GET /api/organizations/{orgId}/document-templates` → 403
  TEMPLATE_MESSAGES.generic.forbidden;
  `POST /api/organizations/{orgId}/requests/{requestId}/reassign` → 403
  TEMPLATE_MESSAGES.generic.forbidden;
  `GET /api/organizations/{orgId}/members` → 403;
  `GET /api/organizations/{orgId}/projects` → 403;
  `GET /api/organizations/{orgId}/clients` → 403;
  `GET /api/organizations/{orgId}/requests/{requestId}` → 404
- **Steps:** As a client user call the capability-gated staff routes, then the staff routes that
  resolve their caller from `Membership` in their own service, then one request they are not party
  to.
- **Expected Result:** the first group answers the guard's fixed body; the second group answers
  the framework body `{"message":"Forbidden","statusCode":403}`; the request answers `404`,
  identical to a non-existent id. No route returns data.

### TC-02-INT-09

- **Level:** Integration
- **Covers:** REQ-02-013
- **Steps:** In an organization holding staff and client users, call every surface that reads
  `Membership` — members list, project members, time entries, vacation balance, the accrual run,
  the requests feed, invitations, kanban assignee resolution — and compare row counts and ids
  against the same organization with no client users.
- **Expected Result:** identical in every case. This is the case that pays for the schema
  decision, and it fails loudly if a later change moves clients into `Membership`.

### TC-02-INT-10

- **Level:** Integration
- **Covers:** REQ-02-033, REQ-02-034, REQ-02-035
- **Asserts:** `POST /api/organizations/{orgId}/requests` → 201;
  `POST /api/organizations/{orgId}/requests` → 400 REQUEST_MESSAGES.contactProjectMismatch;
  `POST /api/organizations/{orgId}/requests` → 400 REQUEST_MESSAGES.projectRequiredForClient;
  `POST /api/organizations/{orgId}/requests` → 400 REQUEST_MESSAGES.clientUserUnavailable
- **Steps:** Address a request to a client user with a matching project; with a project of another
  client; with no project; naming a removed client user; naming a client user of an archived
  client.
- **Expected Result:** the first is created with `assigneeKind = 'client'` and
  `assigneeClientMembershipId` set; the second, third, fourth and fifth are refused with
  `contactProjectMismatch`, `projectRequiredForClient`, `clientUserUnavailable` and
  `clientUserUnavailable`, and write no `Request`.

### TC-02-INT-11

- **Level:** Integration
- **Covers:** REQ-02-036, REQ-02-037, REQ-02-039, REQ-02-041, REQ-02-044
- **Asserts:** `POST /api/organizations/{orgId}/requests/{requestId}/messages` → 201;
  `POST /api/organizations/{orgId}/requests/{requestId}/answer` → 200;
  `POST /api/organizations/{orgId}/requests/{requestId}/grant` → 403
  REQUEST_MESSAGES.notYoursToGrant;
  `POST /api/organizations/{orgId}/requests/{requestId}/decline` → 200
- **Steps:** As the client addressee post a message, answer, then attempt to grant. On a second
  request, decline with a reason.
- **Expected Result:** the message carries `authorKind = 'client'` and
  `authorClientMembershipId`; the answer moves the request to `answered` and writes a
  `status_changed` event in the same transaction; the grant is refused and writes nothing; the
  decline moves the request to `declined` and stores its reason as a `RequestMessage` with
  `authorKind = 'client'` in the same transaction as the status.

### TC-02-INT-12

- **Level:** Integration
- **Covers:** REQ-02-030
- **Asserts:** `POST /api/organizations/{orgId}/requests/{requestId}/reassign` → 200
- **Steps:** On one client holding two active client users, address two requests to the first on a
  project of that client — both created while that user is active — then remove that user.
  Reassign the first to a member and the second to the client's other active client user.
- **Expected Result:** each request stays `open` and reads `assignee.inactive: true` while its
  addressee is removed. The first reassignment leaves `assigneeKind = 'member'`; the second leaves
  `assigneeKind = 'client'` with the other user's id. Both write an `assignee_changed`
  `RequestEvent` carrying both display names in `oldLabel` and `newLabel`.

### TC-02-INT-13

- **Level:** Integration
- **Covers:** REQ-02-027, REQ-02-053, REQ-02-054
- **Steps:** Trigger both mail types and read the sink. Then make the mail transport throw on each
  and repeat.
- **Expected Result:** `client_invitation` and `request_assigned_to_client` are present and
  neither body carries the request description nor any member email address. When the transport
  throws, the invitation and the request are both still committed, nothing retries, and no status
  claims a delivery that did not happen.

### TC-02-INT-14

- **Level:** Integration
- **Covers:** REQ-02-049, REQ-02-050, REQ-02-051
- **Asserts:** `GET /api/organizations/{orgId}/requests` → 200;
  `GET /api/organizations/{orgId}/requests` → 403 REQUEST_MESSAGES.scopeForbidden;
  `POST /api/organizations/{orgId}/requests` → 403 REQUEST_MESSAGES.createForbidden
- **Steps:** As a client user list requests with no query, then with `scope=all`, then create one.
- **Expected Result:** the list carries only requests addressed to them, with
  `counts.waitingOnMe` equal to the non-terminal ones among them and no `vacation` key; the wider
  scope and the creation are both refused.

### TC-02-INT-15

- **Level:** Integration
- **Covers:** REQ-02-024
- **Asserts:** `POST /api/invitations/accept` → 400 INVITE_MESSAGES.tokenInvalid;
  `POST /api/invitations/accept` → 200
- **Steps:** Invite an address as a staff `user`, then invite the same address as a client user of
  an active client, keeping both tokens. Attempt the staff token, then the client token.
- **Expected Result:** the staff invitation is `invalidated` and the client one `pending`; the
  staff token writes no membership of either kind; the client token creates the
  `ClientMembership` and marks its invitation `used`.

### TC-02-INT-16

- **Level:** Integration
- **Covers:** REQ-02-024, REQ-02-025
- **Asserts:** `POST /api/invitations/accept` → 200;
  `POST /api/invitations/accept` → 400 INVITE_MESSAGES.tokenInvalid;
  `POST /api/invitations/accept` → 409 CLIENT_USER_MESSAGES.accountIsClient
- **Steps:** Mint a client invitation for an address and client, then a second for the same pair,
  keeping both tokens. Accept the surviving token, then the superseded one. Then mint a third for
  the same address, now an active client user, and accept it.
- **Expected Result:** the first acceptance creates exactly one `ClientMembership`; the superseded
  token creates nothing; the third invitation is minted, because invitation time inspects no
  `ClientMembership`, and its acceptance is refused. Exactly one `ClientMembership` exists for
  that address at the end. The number of `pending` rows left behind is not asserted — this spec
  makes no serialization guarantee at invitation time.

### TC-02-INT-17

- **Level:** Integration
- **Covers:** REQ-02-006, REQ-02-009, REQ-02-031, REQ-02-035
- **Asserts:** `POST /api/login` → 200; `GET /api/organizations/{orgId}/requests` → 200;
  `POST /api/organizations/{orgId}/requests` → 400 REQUEST_MESSAGES.clientUserUnavailable
- **Steps:** With an active client user holding requests addressed to them, archive their
  `Client`. Then log in as that user, list their requests, and address a new request to them.
- **Expected Result:** login succeeds and the session's `organizationId` is the one on the
  `ClientMembership`; their existing requests are returned; the row is still `active` and its
  session was never revoked; the new request is refused.

### TC-02-INT-18

- **Level:** Integration
- **Covers:** REQ-02-038, REQ-02-040, REQ-02-042, REQ-02-043, REQ-02-045, REQ-02-046
- **Asserts:** `POST /api/organizations/{orgId}/requests/{requestId}/cancel` → 403
  REQUEST_MESSAGES.notYoursToCancel;
  `PATCH /api/organizations/{orgId}/requests/{requestId}` → 403 REQUEST_MESSAGES.editForbidden;
  `POST /api/organizations/{orgId}/requests/{requestId}/decline` → 400
  REQUEST_MESSAGES.declineReasonRequired;
  `POST /api/organizations/{orgId}/requests/{requestId}/answer` → 409
  REQUEST_MESSAGES.invalidTransition;
  `POST /api/organizations/{orgId}/requests/{requestId}/messages` → 409
  REQUEST_MESSAGES.threadClosed;
  `POST /api/organizations/{orgId}/requests/{requestId}/answer` → 409
  REQUEST_MESSAGES.alreadyTerminal
- **Steps:** As the client addressee on an `open` request: cancel, edit, and decline with an empty
  reason. On the same request once `answered`: answer again. On a request in a terminal status:
  post a message, and answer.
- **Expected Result:** the six refusals above. After all of them the requests' statuses, fields and
  message counts are unchanged, and the terminal request is still readable by that client user.

### TC-02-INT-19

- **Level:** Integration
- **Covers:** REQ-02-011
- **Asserts:** `GET /api/organizations/{orgId}/clients/{clientId}/users` → 200;
  `GET /api/organizations/{orgId}/clients/{clientId}/users` → 403
  CLIENT_USER_MESSAGES.manageForbidden;
  `GET /api/organizations/{orgId}/clients/{clientId}/users` → 404;
  `PATCH /api/organizations/{orgId}/clients/{clientId}/users/{clientMembershipId}/remove` → 403
  CLIENT_USER_MESSAGES.manageForbidden;
  `PATCH /api/organizations/{orgId}/clients/{clientId}/users/{clientMembershipId}/remove` → 404
- **Steps:** On one client holding an active client user, a removed one and a pending client
  invitation, call the People list as an admin, as a `user`, as a `user` for a `clientId` that
  does not exist, and as an admin for a client of another organization. Then call the remove route
  as a `user`, and as an admin for a row of another organization.
- **Expected Result:** the admin call carries both rows with `id`, `displayName`, `email`,
  `status` and `joinedAt`, and the pending address with its `expiresAt`. The two `user` refusals
  are byte-identical to each other, so an absent client is not distinguishable from one the caller
  may not see. No `ClientMembership` changes status in any refused call.

### TC-02-INT-20

- **Level:** Integration
- **Covers:** REQ-02-002, REQ-02-023
- **Asserts:** `POST /api/invitations/accept` → 409
  CLIENT_USER_MESSAGES.accountLinkedToAnotherClient;
  `POST /api/invitations/accept` → 200
- **Steps:** With a client user of client A holding a request addressed to them, note their
  `ClientMembership.id` and remove them. Invite the same address for a second client B of the same
  organization and accept. Then invite the same address for client A and accept.
- **Expected Result:** the invitation for B is minted and its acceptance writes nothing — the row
  keeps its original `clientId` and `status = 'removed'`, and that invitation stays `pending`.
  Accepting the invitation for A leaves exactly one `ClientMembership` for the account: the
  original `id`, `status = 'active'`, `removedAt` and `removedByAccountId` `null`, `joinedAt`
  later than the removal, `invitedByMembershipId` the second inviter, and its invitation `used`.
  The request addressed to them resolves through that same id and reads
  `assignee.inactive: false`.

### TC-02-INT-21

- **Level:** Integration
- **Covers:** REQ-02-029
- **Asserts:** `PATCH /api/organizations/{orgId}/clients/{clientId}/users/{clientMembershipId}/remove` → 204
- **Steps:** Remove an active client user, note the row and the account's `securityStamp`, then
  call the remove route again for the same row.
- **Expected Result:** the second call answers `204`; `status`, `removedAt`,
  `removedByAccountId` and the account's `securityStamp` are all unchanged from after the first.

### TC-02-INT-22

- **Level:** Integration
- **Covers:** REQ-02-004
- **Asserts:** `GET /api/me` → 200
- **Steps:** Sign a client user in and keep the cookie. Read the session endpoint. Then, without
  issuing a new cookie, flip their `ClientMembership` to `removed` and back to `active` directly
  in the database, reading the session endpoint after each.
- **Expected Result:** the cookie's payload is `{ accountId, organizationId, securityStamp }` and
  carries no principal kind; the endpoint reports `principalKind: 'client'`, then a `null` body,
  then `principalKind: 'client'` again — the principal is read from the database on each request
  rather than from the cookie.

### TC-02-E2E-01

- **Level:** E2E
- **Covers:** REQ-02-015, REQ-02-016, REQ-02-017, REQ-02-018
- **Steps:** Open the invite modal and submit a malformed email, then a valid one; accept through
  the invitation screen; sign out and sign in at the ordinary login screen; then, signed in as the
  client user, type `/org/{orgId}/members`.
- **Expected Result:** the malformed address shows the inline field error and the submit control
  stays enabled; the valid one draws the invited address as a pending row with the status
  `invited` and no control. Accepting lands on `/org/{orgId}/requests` without a second sign-in,
  and signing in afterwards lands on the same route. On both arrivals the sidebar holds one row,
  `nav-members` is absent from the DOM, the Requests row carries no badge because nothing is
  addressed to that user yet, and neither the scope control nor New Request is drawn. Typing the
  members URL lands on `/org/{orgId}/requests` with no members screen drawn.
- **Selectors:** `client-users-section`, `client-users-invite-btn`, `client-user-invite-modal`,
  `client-user-invite-email`, `client-user-invite-error-email`, `client-user-invite-submit`,
  `client-user-pending-row-{email}`, `client-user-row-{id}`, `client-user-row-{id}-status`,
  `sidebar-requests-link`, `requests-page`, `nav-members` (absent),
  `sidebar-requests-badge` (absent), `requests-scope-toggle` (absent),
  `requests-new-btn` (absent)

### TC-02-E2E-02

- **Level:** E2E
- **Covers:** REQ-02-032, REQ-02-034
- **Steps:** As a `user`, start a new request addressed to a client user, choosing the addressee
  kind and then the project: first a project whose client has no client users, then a project of
  the wrong client, then the right one. Open the created request.
- **Expected Result:** the client with no users leaves the person picker empty and draws the hint
  carrying `emptyUsers`; the wrong client shows the inline error and the submit control stays
  enabled; the right one creates the request. On the created request the History panel and the
  Grant control are drawn for the requester — the staff half of the ids TC-02-E2E-03 asserts
  absent for a client principal.
- **Selectors:** `requests-new-btn`, `request-new-assignee-kind`, `request-new-project`,
  `request-new-assignee-client`, `request-new-assignee-client-empty`,
  `request-new-error-assigneeClientMembershipId`, `request-detail-page`,
  `request-detail-history`, `request-detail-grant-btn`

### TC-02-E2E-03

- **Level:** E2E
- **Covers:** REQ-02-039, REQ-02-041, REQ-02-052
- **Steps:** As the client user open a request from the inbox row, post a reply and click **I have
  provided this**; then on a second request click **I cannot provide this** and submit a reason.
- **Expected Result:** on arriving at the inbox the Requests row carries its badge reading the two
  open requests addressed to them; the first request reaches `answered`, the second `declined`
  with the reason last in the thread; on both, the History panel and the Grant control are absent
  throughout.
- **Selectors:** `requests-page`, `sidebar-requests-badge`, `request-row-{id}`,
  `request-detail-page`, `request-detail-thread`, `request-detail-composer`,
  `request-detail-composer-submit`, `request-detail-answer-btn`, `request-detail-decline-btn`,
  `request-detail-decline-reason`, `request-detail-decline-confirm`,
  `request-detail-history` (absent), `request-detail-grant-btn` (absent)

### TC-02-E2E-04

- **Level:** E2E
- **Covers:** REQ-02-028
- **Steps:** With a client user signed in, have an admin remove them from the People section; then
  have the client user act in their still-open tab.
- **Expected Result:** they are returned to the login screen, and logging in again is refused.
- **Selectors:** `client-user-row-{id}-remove-btn`, `requests-page`

### TC-02-E2E-05

- **Level:** E2E
- **Covers:** REQ-02-016
- **Steps:** Sign in as each of admin, manager, user and viewer and inspect the sidebar. As the
  admin, open the requests page, then a client's detail, then a client with nobody invited.
- **Expected Result:** `nav-members` is present for every staff role — the regression witness that
  the fix of REQ-02-016 did not over-reach; the scope control is drawn for the admin, whose role
  holds `view-all-requests`; the People section renders for the admin with its invite control, and
  the empty client draws its empty state. What a `user` sees of the People section is not asserted
  here — a `user` reaches no client detail — and the refusal that gating rests on is
  TC-02-INT-19's.
- **Selectors:** `nav-members`, `sidebar-requests-link`, `requests-page`,
  `requests-scope-toggle`, `client-users-section`, `client-users-invite-btn`,
  `client-users-empty-state`
