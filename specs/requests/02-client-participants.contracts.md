# 02 — Client Participants — Contracts

Tables only. Every row here is checked by `node scripts/spec-lint.mjs` against the requirements
and the cases: a status a case expects and this file does not declare is a lint error, not a
judgement.

## Routes

| Route | Guards | Success | Errors |
|---|---|---|---|
| `GET /api/organizations/{orgId}/clients/{clientId}/users` | `SessionGuard` → `OrgScopeGuard` → service `manage-client-users` (REQ-02-011) | `200` | `403 CLIENT_USER_MESSAGES.manageForbidden`; `404` for a client outside the caller's organization |
| `PATCH /api/organizations/{orgId}/clients/{clientId}/users/{clientMembershipId}/remove` | `SessionGuard` → `OrgScopeGuard` → service `manage-client-users` (REQ-02-011) | `204` | `403 CLIENT_USER_MESSAGES.manageForbidden`; `404` for a row outside the caller's organization |
| `POST /api/invitations` | `SessionGuard`; service `manage-client-users` when `role = 'client'` | `200` | `403 CLIENT_USER_MESSAGES.manageForbidden`; `403 INVITE_MESSAGES.permissionDenied`; `400 CLIENT_USER_MESSAGES.invitationShapeInvalid`; `400 CLIENT_USER_MESSAGES.clientArchived`; `400 INVITE_MESSAGES.alreadyMember`; `400 MESSAGES.role.invalid` |
| `POST /api/invitations/accept` | none — the token is the credential | `200` | `409 CLIENT_USER_MESSAGES.accountIsStaff`; `409 CLIENT_USER_MESSAGES.accountIsClient`; `409 CLIENT_USER_MESSAGES.accountLinkedToAnotherClient`; `400 INVITE_MESSAGES.tokenInvalid` |
| `POST /api/login` | none | `200` | `400 AUTH_MESSAGES.deactivated` |
| `GET /api/me` | `SessionGuard` | `200` | `401` |
| `POST /api/organizations/{orgId}/requests` | `SessionGuard` → `OrgScopeGuard` → `CapabilityGuard` | `201` | `403 REQUEST_MESSAGES.createForbidden`; `400 REQUEST_MESSAGES.assigneeInvalid`; `400 REQUEST_MESSAGES.projectRequiredForClient`; `400 REQUEST_MESSAGES.contactProjectMismatch`; `400 REQUEST_MESSAGES.clientUserUnavailable` |
| `GET /api/organizations/{orgId}/requests` | `SessionGuard` → `OrgScopeGuard` | `200` | `403 REQUEST_MESSAGES.scopeForbidden` |
| `GET /api/organizations/{orgId}/requests/{requestId}` | `SessionGuard` → `OrgScopeGuard` | `200` | `404` |
| `PATCH /api/organizations/{orgId}/requests/{requestId}` | `SessionGuard` → `OrgScopeGuard` | `200` | `403 REQUEST_MESSAGES.editForbidden` |
| `POST /api/organizations/{orgId}/requests/{requestId}/messages` | `SessionGuard` → `OrgScopeGuard` | `201` | `400 REQUEST_MESSAGES.messageRequired`; `400 REQUEST_MESSAGES.messageTooLong`; `409 REQUEST_MESSAGES.threadClosed` |
| `POST /api/organizations/{orgId}/requests/{requestId}/answer` | `SessionGuard` → `OrgScopeGuard` | `200` | `409 REQUEST_MESSAGES.invalidTransition`; `409 REQUEST_MESSAGES.alreadyTerminal` |
| `POST /api/organizations/{orgId}/requests/{requestId}/decline` | `SessionGuard` → `OrgScopeGuard` | `200` | `400 REQUEST_MESSAGES.declineReasonRequired`; `400 REQUEST_MESSAGES.declineReasonTooLong`; `409 REQUEST_MESSAGES.alreadyTerminal` |
| `POST /api/organizations/{orgId}/requests/{requestId}/grant` | `SessionGuard` → `OrgScopeGuard` | `200` | `403 REQUEST_MESSAGES.notYoursToGrant` |
| `POST /api/organizations/{orgId}/requests/{requestId}/cancel` | `SessionGuard` → `OrgScopeGuard` | `200` | `403 REQUEST_MESSAGES.notYoursToCancel` |
| `POST /api/organizations/{orgId}/requests/{requestId}/reassign` | `SessionGuard` → `OrgScopeGuard` → `CapabilityGuard` | `200` | `403 TEMPLATE_MESSAGES.generic.forbidden`; `400 REQUEST_MESSAGES.clientUserUnavailable` |
| `GET /api/organizations/{orgId}/members` | `SessionGuard` → `OrgScopeGuard`; the service resolves its caller from `Membership` | `200` | `403` with the framework body `{"message":"Forbidden","statusCode":403}` |
| `GET /api/organizations/{orgId}/projects` | `SessionGuard` → `OrgScopeGuard`; the service resolves its caller from `Membership` | `200` | `403` with the framework body |
| `GET /api/organizations/{orgId}/clients` | `SessionGuard` → `OrgScopeGuard`; the service resolves its caller from `Membership` | `200` | `403` with the framework body |
| `GET /api/organizations/{orgId}/document-templates` | `SessionGuard` → `OrgScopeGuard` → `CapabilityGuard` | `200` | `403 TEMPLATE_MESSAGES.generic.forbidden` |

**Two shapes of 403 for a client principal.** A route gated by `CapabilityGuard` answers
`TEMPLATE_MESSAGES.generic.forbidden` (REQ-02-010). A staff route that resolves its caller from
`Membership` inside its own service finds none and answers the framework body, which names no
resource and no capability. Under either shape the status is `403` and no route returns data.

### `GET /api/me` — response for a client principal

```json
{ "account": { "id": "…", "displayName": "J. Client", "email": "j.client@acme.example" },
  "organization": { "id": "…", "name": "Acme Agency" },
  "principalKind": "client",
  "role": null,
  "features": { "mailOutbox": false } }
```

### `GET …/clients/{clientId}/users` — response

```json
{ "users": [ { "id": "…", "displayName": "J. Client", "email": "j.client@acme.example",
               "status": "active", "joinedAt": "…" } ],
  "pendingInvitations": [ { "email": "r.ops@acme.example", "expiresAt": "…" } ] }
```

## Error Messages

New strings live in `CLIENT_USER_MESSAGES`; the request-side additions extend `REQUEST_MESSAGES`.
Every other row is text that exists in `packages/validation` today, restated here so a case author
asserting a body never leaves this bundle.

| Export | Route | Message | New |
|---|---|---|---|
| `CLIENT_USER_MESSAGES.accountIsStaff` | `POST /api/invitations/accept` | This email address already belongs to a team member | yes |
| `CLIENT_USER_MESSAGES.accountIsClient` | `POST /api/invitations/accept` | This email address already belongs to a client user | yes |
| `CLIENT_USER_MESSAGES.accountLinkedToAnotherClient` | `POST /api/invitations/accept` | This email address is already linked to a different client | yes |
| `CLIENT_USER_MESSAGES.invitationShapeInvalid` | `POST /api/invitations` | Choose a client for a client invitation, and none for a team invitation | yes |
| `CLIENT_USER_MESSAGES.clientArchived` | `POST /api/invitations` | You cannot invite people for an archived client | yes |
| `CLIENT_USER_MESSAGES.manageForbidden` | `GET /api/organizations/{orgId}/clients/{clientId}/users`, `PATCH /api/organizations/{orgId}/clients/{clientId}/users/{clientMembershipId}/remove`, `POST /api/invitations` | You do not have permission to manage client users | yes |
| `CLIENT_USER_MESSAGES.emptyUsers` | — drawn, never returned | Nobody from this client has been invited yet. | yes |
| `REQUEST_MESSAGES.clientUserUnavailable` | `POST /api/organizations/{orgId}/requests`, `POST /api/organizations/{orgId}/requests/{requestId}/reassign` | That client user is no longer available | yes |
| `REQUEST_MESSAGES.projectRequiredForClient` | `POST /api/organizations/{orgId}/requests` | Choose the project this client request is for | yes |
| `REQUEST_MESSAGES.contactProjectMismatch` | `POST /api/organizations/{orgId}/requests` | That person does not belong to this project's client | yes |
| `TEMPLATE_MESSAGES.generic.forbidden` | `POST /api/organizations/{orgId}/requests/{requestId}/reassign`, `GET /api/organizations/{orgId}/document-templates` | You do not have permission to manage templates | no |
| `REQUEST_MESSAGES.scopeForbidden` | `GET /api/organizations/{orgId}/requests` | You do not have permission to view other people's requests | no |
| `REQUEST_MESSAGES.createForbidden` | `POST /api/organizations/{orgId}/requests` | You do not have permission to create requests | no |
| `REQUEST_MESSAGES.notYoursToGrant` | `POST /api/organizations/{orgId}/requests/{requestId}/grant` | Only the person who asked can confirm this | no |
| `REQUEST_MESSAGES.notYoursToCancel` | `POST /api/organizations/{orgId}/requests/{requestId}/cancel` | Only the person who asked can cancel this | no |
| `REQUEST_MESSAGES.editForbidden` | `PATCH /api/organizations/{orgId}/requests/{requestId}` | You do not have permission to edit this request | no |
| `REQUEST_MESSAGES.assigneeInvalid` | `POST /api/organizations/{orgId}/requests` | Choose who this request is for | no |
| `REQUEST_MESSAGES.messageRequired` | `POST /api/organizations/{orgId}/requests/{requestId}/messages` | Write a message | no |
| `REQUEST_MESSAGES.messageTooLong` | `POST /api/organizations/{orgId}/requests/{requestId}/messages` | Message must be 5000 characters or fewer | no |
| `REQUEST_MESSAGES.threadClosed` | `POST /api/organizations/{orgId}/requests/{requestId}/messages` | This request is closed | no |
| `REQUEST_MESSAGES.alreadyTerminal` | `POST /api/organizations/{orgId}/requests/{requestId}/answer`, `POST /api/organizations/{orgId}/requests/{requestId}/decline` | This request has already been closed | no |
| `REQUEST_MESSAGES.invalidTransition` | `POST /api/organizations/{orgId}/requests/{requestId}/answer` | This request cannot move to that state | no |
| `REQUEST_MESSAGES.declineReasonRequired` | `POST /api/organizations/{orgId}/requests/{requestId}/decline` | Say why you cannot provide this | no |
| `REQUEST_MESSAGES.declineReasonTooLong` | `POST /api/organizations/{orgId}/requests/{requestId}/decline` | Reason must be 1000 characters or fewer | no |
| `MESSAGES.role.invalid` | `POST /api/invitations` | Invalid role | no |
| `INVITE_MESSAGES.tokenInvalid` | `POST /api/invitations/accept` | This invitation is no longer valid | no |
| `INVITE_MESSAGES.permissionDenied` | `POST /api/invitations` | You do not have permission to invite members | no |
| `INVITE_MESSAGES.alreadyMember` | `POST /api/invitations` | This person is already a member of your organization | no |
| `AUTH_MESSAGES.deactivated` | `POST /api/login` | Your account has been deactivated. Contact your administrator. | no |

## Data Model

### ClientMembership — new table

| Field | Type | Description |
|---|---|---|
| `id` | `String` PK, uuid | |
| `accountId` | `String` `@unique` FK → `Account`, Cascade | Half of the staff-or-client rule (REQ-02-002). |
| `clientId` | `String` FK → `Client`, Cascade | Never written by a restore (REQ-02-023). |
| `organizationId` | `String` FK → `Organization`, Cascade | Denormalized so every scoping query has the key without a join. |
| `status` | `String` `@default("active")` | `active` or `removed`. |
| `invitedByMembershipId` | `String?` FK → `Membership`, SetNull | Rewritten by a restore to the sender of the accepted invitation. |
| `joinedAt` | `DateTime` `@default(now())` | Reset by a restore to the acceptance time. |
| `removedAt` | `DateTime?` | Cleared by a restore. |
| `removedByAccountId` | `String?` FK → `Account`, SetNull | Cleared by a restore. |

Indexes: `@@index([organizationId, status])`, `@@index([clientId, status])`.

### Columns added to existing tables

| Table | Column | Type | Description |
|---|---|---|---|
| `Invitation` | `clientId` | `String?` FK → `Client`, Cascade | Required when `role = 'client'` (REQ-02-021). Nullable, so every existing row stays valid. |
| `Request` | `assigneeClientMembershipId` | `String?` FK → `ClientMembership`, SetNull | Set when `assigneeKind = 'client'`. |
| `RequestMessage` | `authorClientMembershipId` | `String?` FK → `ClientMembership`, SetNull | Set when `authorKind = 'client'`. |
| `RequestEvent` | `actorClientMembershipId` | `String?` FK → `ClientMembership`, SetNull | Set when `actorKind = 'client'`. |

`Invitation.role` gains the accepted value `client`; `assigneeKind`, `authorKind` and `actorKind`
gain `client`. Each is a free-form `String` validated in `packages/validation`, so no column type
changes and every migration here is additive.

### Capabilities

| Constant | Value |
|---|---|
| `MemberCapability` / `Capability` | gains `manage-client-users` / `ManageClientUsers`, held by admin and manager |
| `CLIENT_CAPABILITIES` | `readonly Capability[] = ['ViewOwnRequests']` |
| `NormalizedRole`, `ROLE_CAPABILITIES` | unchanged; no row is added |

## Validation Rules

| # | Field | Constraint | Message | Server-only |
|---|---|---|---|---|
| 1 | `role` | one of `admin`, `manager`, `user`, `viewer`, `client` | `MESSAGES.role.invalid` | no |
| 2 | `clientId` | required when `role = 'client'`, absent otherwise | `CLIENT_USER_MESSAGES.invitationShapeInvalid` | no |
| 3 | `clientId` | names an active client of the caller's organization | `CLIENT_USER_MESSAGES.clientArchived` | yes |
| 4 | `assigneeKind` | one of `member`, `client`, with the matching id set | `REQUEST_MESSAGES.assigneeInvalid` | no |
| 5 | `assigneeClientMembershipId` | an active client user of an active client of the organization | `REQUEST_MESSAGES.clientUserUnavailable` | yes |
| 6 | `projectId` | required when `assigneeKind = 'client'`; its `clientId` matches the addressee's | `REQUEST_MESSAGES.projectRequiredForClient`, `REQUEST_MESSAGES.contactProjectMismatch` | yes |

The client's copy of the four client-side rules is a convenience; the server re-validates all six.
Submit controls are never disabled for validation.

## Required `data-testid` Attributes

| id | Screen | Asserted |
|---|---|---|
| `client-users-section` | client detail, People | present |
| `client-users-invite-btn` | client detail, People | present |
| `client-users-empty-state` | client detail, People | present |
| `client-user-row-{id}` | client detail, People | present |
| `client-user-row-{id}-status` | client detail, People | present |
| `client-user-row-{id}-remove-btn` | client detail, People | present |
| `client-user-pending-row-{email}` | client detail, People | present |
| `client-user-invite-modal` | client detail, invite | present |
| `client-user-invite-email` | client detail, invite | present |
| `client-user-invite-submit` | client detail, invite | present |
| `client-user-invite-error-email` | client detail, invite | present |
| `request-new-assignee-kind` | new request | present |
| `request-new-assignee-client` | new request | present |
| `request-new-assignee-client-empty` | new request | present |
| `request-new-project` | new request | present |
| `request-new-error-assigneeClientMembershipId` | new request | present |
| `requests-page` | requests list | present |
| `request-row-{id}` | requests list | present |
| `requests-scope-toggle` | requests list | present for staff, absent for a client principal |
| `requests-new-btn` | requests list | present for staff, absent for a client principal |
| `request-detail-page` | request detail | present |
| `request-detail-thread` | request detail | present |
| `request-detail-composer` | request detail | present |
| `request-detail-composer-submit` | request detail | present |
| `request-detail-answer-btn` | request detail | present |
| `request-detail-decline-btn` | request detail | present |
| `request-detail-decline-reason` | request detail | present |
| `request-detail-decline-confirm` | request detail | present |
| `request-detail-history` | request detail | present for staff, absent for a client principal |
| `request-detail-grant-btn` | request detail | present for staff, absent for a client principal |
| `nav-members` | sidebar | present for staff, absent for a client principal |
| `sidebar-requests-link` | sidebar | present |
| `sidebar-requests-badge` | sidebar | present at a non-zero count, absent at zero |

## Screens

### Client's inbox — `/org/{orgId}/requests`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Devscribed                                              J. Client ▾         │
│  ▸ Requests  (2)                   ← the only row in the sidebar             │
├──────────────────────────────────────────────────────────────────────────────┤
│ Requests                                                                      │
│ Status [ Open ▾ ]                          (no Mine/All, no + New request)    │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⛔ #14  Staging DB access                     Acme redesign                   │
│         access · blocked · needed by 2 Sep (overdue)              open       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Client's request detail

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Requests                                                                    │
│ #14  Staging DB access                                       [ open ]        │
│ access · repository · needed by 2 Sep          Project: Acme redesign        │
│ From: Sam Dev                                                                 │
│                        [ I have provided this ]  [ I cannot provide this ]   │
├──────────────────────────────────────────────────────────────────────────────┤
│ Conversation                                                                  │
│  Sam Dev · 1 Sep    We need read access to the staging database.             │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │ Write a message…                                          [ Send ]   │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────────┘
```

No History panel, no Grant, no Reassign, no Cancel, no Edit.

### Client users, on the client detail — `/org/{orgId}/clients/{clientId}`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Acme Corp                                                     [ active ]     │
├──────────────────────────────────────────────────────────────────────────────┤
│ People                                              [ + Invite a person ]    │
│  J. Client      j.client@acme.example      active        [ Remove ]          │
│  R. Ops         r.ops@acme.example         invited                           │
└──────────────────────────────────────────────────────────────────────────────┘
```

## UI Description

| Surface | Behaviour |
|---|---|
| Client user, sidebar | One row, Requests. Every other navigation id the sidebar can draw is absent from the DOM. Nothing is drawn from a role lookup, so a navigation row added later is absent here without this rule being edited (REQ-02-015). |
| Client user, Requests badge | `sidebar-requests-badge` counts the non-terminal requests addressed to that client user and nothing else. Absent at zero, as it is for staff. **Decided:** the badge is drawn for a client principal; rejected: suppressing it, which would hide the work waiting on the caller whose whole surface is that inbox. |
| Client user, request list | No scope control, no New Request; status filter only. |
| Client user, request detail | No History panel; Answer and Decline only (REQ-02-052). |
| Client user, terminal request | Composer absent, both action controls absent, thread readable. |
| Staff, client detail, People | Drawn only for a caller holding `manage-client-users`, always with the invite control. **Decided:** there is no read-only rendering — one capability gates the section and the control, and `manage-client-users` and `view-clients` are held by the same two roles. |
| Pending invitation row | `client-user-pending-row-{email}`, showing the address and the status `invited`, with no control. **Decided:** a pending invitation is not revoked from this screen — re-inviting supersedes it (REQ-02-024) and it expires on its own. Rejected: a Remove control, which would need a route and a refusal this spec does not define. |
| Empty People list | `client-users-empty-state` carrying `CLIENT_USER_MESSAGES.emptyUsers`. |
| New-request modal, addressee kind `client` | The person picker is filtered to active users of the selected project's client. When that client has none the picker is empty and `request-new-assignee-client-empty` is drawn with `CLIENT_USER_MESSAGES.emptyUsers`. |

## Security

- A client principal cannot appear in any query that reads `Membership` (REQ-02-013), so no
  existing surface can leak to them through an omission. This is what the schema choice buys.
- Cross-organization access answers `404`, never `403`.
- A client user's list is scoped in the query, not by filtering a wider result.
- Removal rotates the security stamp, so revocation is immediate (REQ-02-028).
- This spec adds no unauthenticated surface: no token, no public route, no rate limiter.
- The login refusal for an account with no active principal is byte-identical whichever cause it
  has, so it distinguishes nothing about which kind of account an address is (REQ-02-007).
- Neither new mail type carries a request description or a member email address.
