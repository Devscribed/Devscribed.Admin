---
id: "10"
title: Organization Requests Page
routes: ["/org/{orgId}/requests"]
api: ["GET /api/organizations/{orgId}/requests"]
entities: [ViewRequests]
tags: [requests-page, sidebar, badge, pending-requests, status-filter, organization-wide, approve, reject, cancel]
depends-on: ["09"]
---

# 10 — Organization Requests Page

## Summary

> **Amended by [requests spec 01](../requests/01-requests.md).** That spec turns this page into
> everyone's inbox, and two of its requirements overrule things stated below. **Requirement 37**
> opens the page to every signed-in member, so the `user`/`viewer` 403 and the redirect are gone;
> the org-wide **vacation section** keeps requiring `view-requests`, which is what this spec was
> really gating. **Requirement 42** retires this page's `status` vocabulary
> (`pending`/`approved`/`rejected`) in favour of `all`/`open`/`answered`/`granted`/`declined`/
> `cancelled`, makes an unknown value a 400 instead of a silent fallback, and changes the default
> from `pending` to `all`. **Requirement 44** redefines the badge, and the response envelope moves
> from a top-level `pendingCount`/`totalCount` to
> `{requests, vacation:{requests,pendingCount}, counts:{waitingOnMe,total}}`.
>
> Every statement this overrules is marked in place, each beside the text it corrects: the
> actors line, the permission matrix, the default filter, both badge descriptions, the screen
> mock's filter control, the endpoint's authentication line, its `status` and `type` parameters,
> the Summary's "currently only vacation" and default-filter clauses, functional requirement 1,
> the response block, both steps of the manager Flow, the empty-state copy in the alt flow, the
> Error Messages table and the States table, **both** statements of the card width, the screen
> heading, the `ViewRequests` capability note, the Out of Scope row about request types, the
> sidebar visibility rule, the filter dropdown, and TC-10-INT-01. Where a test case asserted a rule that no longer holds it is retired, naming
> what covers the surviving rule now.
>
> Two earlier drafts of this banner promised the same thing and left statements unmarked — nine
> the first time, five the second — each found by a pipeline run rather than by reading. The
> statements are named above rather than cited by line offset, because offsets rot on the next
> edit and a list that cannot be checked is what let this happen twice.

A dedicated **Requests** page accessible from the sidebar where `admin` and `manager` can see and act on all vacation requests across the organization — without opening each member's profile. The page shows rich request cards with member info, dates, balance, and action buttons. It defaults to pending requests and supports filtering by status. The page is designed as a generic "Requests" page — currently only vacation, but structured to accommodate future request types.

**Amended:** the page itself is now open to every role (requests/01 requirement 37) and the
default filter is `all`, not pending (requirement 42). What remains gated to `admin` and
`manager` is the org-wide vacation section described here. **"Currently only vacation" no
longer holds either:** requests/01 ships `access` and `question` as `Request` rows on this same
page, which is what the Out of Scope section below now records.

**Depends on:** Spec 09 (VacationRequest must exist). Also uses data from Spec 07 (MemberFinancials) and Spec 08 (reserve balance).

## Actors & Preconditions

- **Actors:** every signed-in member opens this page and sees the requests they raised or hold (**amended by requests/01 requirement 37**). `admin` and `manager` additionally see the org-wide vacation section, which keeps requiring `view-requests` — that capability is what this spec was really gating.
- **Preconditions:** vacation requests must exist (spec 09). The page is functional even if no requests exist (shows empty state).

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View Requests page | ✅ | ✅ | ✅ | ✅ |
| View org-wide vacation section (`view-requests`) | ✅ | ✅ | ❌ | ❌ |

> **Note:** approve/reject/cancel capabilities are defined in spec 09. This spec adds only the `ViewRequests` capability for page access. The action buttons on request cards use the same review/cancel APIs from spec 09.

### New Capabilities (extend `Capability` enum)

- `ViewRequests` — **amended by requests/01 requirements 37 and 40**: it no longer gates the page,
  which every member opens. It keeps its grants and moves inward, gating the org-wide vacation
  section; widening the scope needs `view-all-requests`.

## Functional Requirements

1. The Requests page shows vacation requests from **all active members** in the organization
   (**amended by requests/01 requirements 39 and 41:** it also shows `Request` rows — the
   caller's own by default, the organization's with `scope=all`. The two are separate sections
   and separate arrays; vacation rows are not `Request` rows in this release).
2. **Default filter:** `all` (**amended by requests/01 requirement 42**, was pending). The values are `all`, `open`, `answered`, `granted`, `declined`, `cancelled`; against the vacation section `open` selects `pending`, `granted` selects `approved` and `declined` selects `rejected`. An unknown value is a `400`, never a fallback.
3. **Sorting:** pending requests are sorted oldest-first (longest-waiting at the top). Other statuses are sorted newest-first.
4. Each request card displays: member avatar (initials), full name (clickable link to member detail), date range, working days count, available vacation days balance, deduction amount, status badge, and action buttons.
5. **Action buttons** follow the same rules as spec 09:
   - Pending requests: "Approve" and "Reject" buttons (not shown if the viewer is the request owner).
   - Approved requests: "Cancel" button.
   - Rejected/cancelled requests: no action buttons.
6. Approving, rejecting, or cancelling a request from this page calls the same API endpoints as spec 09. The card updates in place after a successful action.
7. The sidebar navigation item shows a **badge** counting the requests waiting on the caller (`counts.waitingOnMe`) plus, for a holder of `view-requests`, the pending vacation count (**amended by requests/01 requirement 44**). Badge is hidden when the count is 0.
8. The sidebar "Requests" item is **not visible** to `user` or `viewer`.
   **Amended by requests/01 requirement 38:** the row is now rendered for every signed-in member,
   because the destination is reachable by every role and the "no dead links" rule is satisfied
   by the destination existing, not by hiding the row.
9. Navigating directly to `/org/{orgId}/requests` as a `user` or `viewer` redirects to the members page (or shows 403).
   **Amended by requests/01 requirement 37:** the page renders for them instead, showing the
   requests they raised or hold. Neither the redirect nor the 403 remains.

## Screens

### Requests Page — every member sees it; the vacation section needs `view-requests`

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────┐                                               │
│  │ Members  │     Requests                                  │
│  │ Requests●│                                               │
│  │          │     [ All statuses ▾ ] [ All types ▾ ]        │
│  │          │                                               │
│  │          │     ┌─────────────────────────────────────┐   │
│  │          │     │  ┌──┐  Alex Kaminski                │   │
│  │          │     │  │AK│  Jul 14 – Jul 25, 2025        │   │
│  │          │     │  └──┘  10 working days               │   │
│  │          │     │        12 days available              │   │
│  │          │     │        [$1,384.62]                    │   │
│  │          │     │                                      │   │
│  │          │     │        [ Approve ]  [ Reject ]       │   │
│  │          │     └─────────────────────────────────────┘   │
│  │          │                                               │
│  │          │     ┌─────────────────────────────────────┐   │
│  │          │     │  ┌──┐  Jane Smith                   │   │
│  │          │     │  │JS│  Aug 1 – Aug 5, 2025          │   │
│  │          │     │  └──┘  5 working days                │   │
│  │          │     │        8 days available               │   │
│  │          │     │        [$692.31]                      │   │
│  │          │     │                                      │   │
│  │          │     │        [ Approve ]  [ Reject ]       │   │
│  │          │     └─────────────────────────────────────┘   │
│  │          │                                               │
│  │          │     ┌─────────────────────────────────────┐   │
│  │          │     │  ┌──┐  Bob Lee           ✗ Rejected │   │
│  │          │     │  │BL│  Jun 2 – Jun 6, 2025          │   │
│  │          │     │  └──┘  5 working days                │   │
│  │          │     │        "Team availability conflict"  │   │
│  │          │     │        Reviewed by Jane Smith         │   │
│  │          │     └─────────────────────────────────────┘   │
│  │          │                                               │
│  └──────────┘                                               │
└─────────────────────────────────────────────────────────────┘
```

## Flows

### Flow: Manager reviews requests from Requests page

1. Manager clicks "Requests" in the sidebar.
2. System loads the Requests page showing every status across all org members
   (**amended by requests/01 requirement 42:** the default view is all statuses, not pending
   only; the vacation section is present for a holder of `view-requests`).
3. Each request card shows member avatar, name, date range, working days, available days, and deduction amount.
4. **To approve:** Manager clicks "Approve" on a request card. System sends `PUT /api/organizations/{orgId}/members/{memberId}/vacation/requests/{requestId}/review` with `{ "decision": "approved" }`. On success: toast "Request approved", card updates to show `approved` status, action buttons removed.
5. **To reject:** Manager clicks "Reject" on a request card. System opens the Reject Request modal (spec 09). Manager optionally enters a comment and clicks "Reject". System sends the review API with `{ "decision": "rejected", "comment": "..." }`. On success: modal closes, toast "Request rejected", card updates.
6. **To cancel approved:** Manager changes filter to "Granted" or "All statuses"
   (**amended by requests/01 requirement 42:** was "Approved" or "All" — neither label is drawn
   any more), clicks "Cancel" on an approved request. Confirmation dialog with refund notice. On success: toast "Request cancelled and reserve refunded", card updates.

### Alt Flow: No pending requests

2a. System shows empty state: "No pending requests." centered on the page.
    **Amended by requests/01 requirement 46:** the copy is now `REQUEST_MESSAGES.emptyMine`
    ("Nothing is waiting on you.") with no filters, and `emptyFiltered` ("No requests match
    these filters.") with any.

### Alt Flow: User/viewer navigates to Requests page

1a. A `user` or `viewer` navigates directly to `/org/{orgId}/requests`.
1b. System redirects to the members page (or shows 403).
    **Amended by requests/01 requirement 37:** the page renders with their own requests and no
    vacation section. This alternate flow no longer occurs.

## API Contracts

### GET /api/organizations/{orgId}/requests

**Authentication:** required. Every `active` member of the organization may call it (**amended by requests/01 requirement 37**); the `vacation` block is present only for a caller holding `view-requests`, and `scope=all` still requires `view-all-requests`.

**Query parameters:**
- `status` — `all` (default), `open`, `answered`, `granted`, `declined`, `cancelled`. An unknown value is a `400` (**amended by requests/01 requirement 42**).
- `type` — `all` (default), `access`, `question`, `vacation` (**amended by requests/01
  requirement 42**; was `vacation` only, reserved for future types — those types now exist).
  `type=vacation` selects the vacation section alone and returns `requests: []`.

**Response `200`:**
```json
{
  "requests": [
    {
      "id": "uuid",
      "type": "vacation",
      "member": {
        "membershipId": "uuid",
        "firstName": "Alex",
        "lastName": "Kaminski",
        "initials": "AK",
        "avatarUrl": null
      },
      "startDate": "2025-07-14",
      "endDate": "2025-07-25",
      "workingDays": 10,
      "deductionAmount": 1384.62,
      "status": "pending",
      "requestedAt": "2025-06-20T10:00:00Z",
      "reviewedAt": null,
      "reviewedBy": null,
      "reviewerComment": null,
      "cancelledAt": null,
      "cancelledBy": null,
      "memberBalance": {
        "availableDays": 12,
        "usedDays": 5,
        "pendingDays": 3,
        "totalDaysPerYear": 20
      }
    }
  ]
}
```

**Amended by requests/01 requirements 41 and 42.** The card above is unchanged byte for byte —
that identity is `AC-12`, witnessed by TC-01-INT-20 — but it now sits inside `vacation.requests`,
because vacation rows are not `Request` rows in this release. The envelope is:

```json
{
  "requests": [ /* spec-01 Request rows; shape in specs/requests/01-requests.md */ ],
  "vacation": { "requests": [ /* the card above, unchanged */ ], "pendingCount": 2 },
  "counts": { "waitingOnMe": 0, "total": 3 }
}
```

`vacation` is present only for a caller holding `view-requests`. The retired top-level
`totalCount` appears nowhere in the codebase; `counts.total` replaces it and counts the active
scope alone, so an empty list can tell "you have none" from "none match these filters".

**Sorting:** pending requests first (oldest `requestedAt` first — longest-waiting at the top), then other statuses (newest `requestedAt` first).

**Errors:**
- `401 Unauthorized`: not authenticated.
- `403 Forbidden`: caller is `user` or `viewer` — `{ "error": "forbidden", "message": "You do not have permission to view requests" }`.
  **Amended by requests/01 requirements 37 and 40:** this endpoint answers `200` to every member.
  The 403 moves inward and narrows to `scope=all` without `view-all-requests`, carrying
  `REQUEST_MESSAGES.scopeForbidden`; a caller without `view-requests` gets `200` with no
  `vacation` key rather than a refusal. An unknown `status` or `type` is now `400`
  (requirement 42).

## Error Messages

| Context | Message |
|---|---|
| ~~Requests page — forbidden~~ | **Retired by requests/01 requirement 37** — the endpoint answers `200` to every member. The refusal that survives is `REQUEST_MESSAGES.scopeForbidden`, on `scope=all` without `view-all-requests`. `REQUESTS_PAGE_MESSAGES.viewForbidden` (`packages/validation/src/index.ts:1983`) is now emitted by no route and its only reader is the assertion at `packages/validation/src/requests-page.test.ts:80`. The export is kept for now rather than removed as a side effect of a documentation fix; removing it, with that assertion, is a separate deliberate change. |
| ~~Empty state — no requests (pending filter)~~ | **Retired by requests/01 requirement 46** — the page renders `REQUEST_MESSAGES.emptyMine`, "Nothing is waiting on you." |
| ~~Empty state — no requests (other filters)~~ | **Retired by requests/01 requirement 46** — the page renders `REQUEST_MESSAGES.emptyFiltered`, "No requests match these filters." |

## UI Description

### Sidebar Navigation

- New **"Requests"** item in the main sidebar navigation, positioned after "Members".
- Rendered for every signed-in member (**amended by requests/01 requirement 38**), positioned after "Members". The "no dead links" rule holds because the destination is now reachable by every role.
- Shows a **badge** counting the requests waiting on the caller plus, for a holder of `view-requests`, the pending vacation count (**amended by requests/01 requirement 44**). Badge hidden when count is 0.

### Page Layout

- Route: `/org/{orgId}/requests`.
- Page title: "Requests" (static).
- Status filter dropdown (`requests-status-filter`): options are "All statuses" (default), "Open", "Answered", "Granted", "Declined", "Cancelled" (**amended by requests/01 requirement 42**). A type filter (`requests-type-filter`) sits beside it. Changing either reloads the list.
- Request cards stacked vertically, centered, max-width **820px** (**amended by requests/01**;
  was ~700px — the page carries two sections now).

### Request Card (`requests-card-{id}`)

Each card contains:
- **Member info row:** initials avatar (`requests-card-avatar-{id}`), full name (`requests-card-member-name-{id}`, clickable link to `/org/{orgId}/members/{membershipId}`).
- **Request details:** date range (e.g., "Jul 14 – Jul 25, 2025"), working days count (e.g., "10 working days").
- **Balance info:** member's available vacation days (e.g., "12 days available").
- **Deduction amount** (e.g., "[$1,384.62]") — visible to admin/manager.
- **Status badge** (`requests-card-status-{id}`): `● Pending` (yellow), `✓ Approved` (green), `✗ Rejected` (red), `○ Cancelled` (gray).
- **Action buttons** (pending requests only):
  - "Approve" (`requests-card-approve-{id}`)
  - "Reject" (`requests-card-reject-{id}`)
- **Action buttons** (approved requests, admin/manager):
  - "Cancel" (`requests-card-cancel-{id}`)
- **Reviewer comment** (rejected requests): shown below the card content.
- **Reviewed by** (reviewed requests): "Reviewed by {name}" line.

### States

| State | Behavior |
|---|---|
| **Loading** | Skeleton cards while GET request is in flight. |
| **Empty, no filters** | `REQUEST_MESSAGES.emptyMine` centered (**amended by requests/01 requirement 46**; was "No pending requests."). |
| **Empty, filters active** | `REQUEST_MESSAGES.emptyFiltered` centered, with a control to clear them (**amended by requests/01 requirement 46**; was "No {status} requests."). |
| **Default** | List of request cards sorted by pending-first (oldest first), then other statuses (newest first). |
| **After action** | Card updates in place (status change, buttons removed). Toast notification. |

### Responsive Behavior

- Max-width **820px**, centered on desktop (**amended by requests/01**; was ~700px — this is the
  second place the width was stated, and the Page Layout one was corrected first).
- On narrow viewports, full width with horizontal padding.
- Cards stack vertically.

## Required `data-testid` Attributes

**Sidebar:**
- `sidebar-requests-link`
- `sidebar-requests-badge`

**Requests page:**
- `requests-page`
- `requests-status-filter`
- `requests-card-{id}`, `requests-card-avatar-{id}`, `requests-card-member-name-{id}`
- `requests-card-status-{id}`, `requests-card-dates-{id}`, `requests-card-days-{id}`
- `requests-card-balance-{id}`, `requests-card-deduction-{id}`
- `requests-card-approve-{id}`, `requests-card-reject-{id}`, `requests-card-cancel-{id}`
- `requests-card-reviewer-comment-{id}`, `requests-card-reviewed-by-{id}`
- `requests-empty-state`
- `requests-loading-skeleton`

## Out of Scope

- Pagination on the Requests page (all requests loaded at once for now).
- Bulk operations (approve/reject multiple requests at once).
- ~~Other request types besides vacation (extensible but not implemented).~~ **No longer out of
  scope:** requests/01 ships `access` and `question` as `Request` rows on this page.
- Notification system (email/push) for new requests.
- Search or member-name filtering on the Requests page.

## Test Cases

### TC-10-INT-01: Requests page — returns pending requests for all org members

- **Level:** Integration
- **Preconditions:** org with admin A, user M1 with 1 pending request, user M2 with 2 pending requests.
- **Steps:**
  1. As A, `GET /api/organizations/{orgId}/requests?status=open`.
     (**Amended by requests/01 requirement 42:** was `?status=pending`, which now answers 400.
     `open` is the value that maps to vacation `pending`.)
- **Expected Result:**
  1. HTTP 200. `vacation.requests` holds the 3 rows across M1 and M2, each with member info, balance and dates, and `vacation.pendingCount` is 3. `requests` is `[]` and `counts` is `{ waitingOnMe: 0, total: 0 }` — nobody raised a spec-01 request in this fixture, and vacation rows are not `Request` rows (**amended by requests/01 requirements 41 and 42**; was a top-level `pendingCount: 3`).

### TC-10-INT-02: Requests page — status filter

- **Level:** Integration
- **Preconditions:** org with admin A, user M with 1 pending, 1 approved, 1 rejected request.
- **Steps:**
  1. As A, `GET .../requests?status=all` → returns 3 requests.
  2. As A, `GET .../requests?status=granted` → returns 1 request.
  3. As A, `GET .../requests?status=open` → returns 1 request.
- **Expected Result:**
  1–3. Each returns the correct filtered set.

**Amended by requests/01 requirement 42:** steps 2 and 3 were `status=approved` and
`status=pending`, which now answer 400. `granted` and `open` are the values that map to vacation
`approved` and `pending`. TC-01-INT-22 covers the full mapping and the 400 on every retired
value; this case keeps proving that the vacation rows themselves still filter correctly.

### TC-10-INT-03: Requests page — forbidden for user/viewer

- **Retired.** The rule it asserted no longer exists: requests/01 requirement 37 opens this
  endpoint to every member, so the same two calls now answer `200`. What survives of the rule —
  that a `user` sees no vacation section and cannot widen the scope — is covered by
  **TC-01-INT-18** (200 with only their own rows and no `vacation` key; 403 `scopeForbidden` on
  `scope=all`) and **TC-01-E2E-08** (the section absent in the browser). The endpoint's own
  refusals are pinned by TC-01-INT-19.

### TC-10-E2E-01: Manager reviews requests from Requests page

- **Level:** E2E
- **Preconditions:** logged in as manager; members Alex (1 pending request R1, 5 days) and Jane (1 pending request R2, 3 days).
- **Steps:**
  1. Click "Requests" in sidebar. Verify badge shows "2".
  2. Verify 2 request cards displayed with member avatars, names, dates, and action buttons.
  3. Click "Approve" on Alex's request R1. Verify toast "Request approved". Card updates to ✓ Approved status.
  4. Click "Reject" on Jane's request R2. Enter comment "Team availability conflict". Click "Reject".
  5. Verify toast "Request rejected". Card updates to ✗ Rejected with comment visible.
  6. Verify sidebar badge updates to "0" (or disappears).
- **Selectors:** `sidebar-requests-link`, `sidebar-requests-badge`, `requests-page`, `requests-card-{R1.id}`, `requests-card-avatar-{R1.id}`, `requests-card-member-name-{R1.id}`, `requests-card-approve-{R1.id}`, `toast-request-approved`, `requests-card-status-{R1.id}`, `requests-card-reject-{R2.id}`, `vacation-reject-modal`, `vacation-reject-comment-input`, `vacation-reject-confirm-btn`, `toast-request-rejected`, `requests-card-status-{R2.id}`, `requests-card-reviewer-comment-{R2.id}`.

### TC-10-E2E-02: Requests page — status filter
- **Retired.** Covered by TC-10-INT-02 for the filtering, plus the endpoint’s oldest-first ordering. The filter control itself is a DS `Select`, and the regressions suite proves that component opens and selects. (**Amended by requests/01 requirement 42:** this note previously also cited "the endpoint's default-to-pending", which is no longer a rule — the default is `all`. The filtering half of the coverage claim stands, and TC-01-INT-22 pins the new default.)

### TC-10-E2E-03: Requests page — user and viewer cannot access
- **Retired.** Its rule is gone rather than moved: requests/01 requirements 37 and 38 give a `user` and a `viewer` both the page and the sidebar row. What replaces it is **TC-01-INT-18** and **TC-01-E2E-08**, which prove the narrower rule that survived — those roles see the page but no vacation section and no scope control. (**Amended by requests/01:** this note previously read "Covered by TC-10-INT-03 (a user and a viewer are forbidden)", which cited a rule that no longer holds and a case that is itself now retired.)

### TC-10-E2E-04: Requests page — cancel approved request
- **Retired.** Duplicate. The identical case exists as TC-09-E2E-04 in the vacation-requests suite, and the rule is TC-09-INT-10.

