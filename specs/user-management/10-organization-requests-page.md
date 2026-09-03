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

A dedicated **Requests** page accessible from the sidebar where `admin` and `manager` can see and act on all vacation requests across the organization — without opening each member's profile. The page shows rich request cards with member info, dates, balance, and action buttons. It defaults to pending requests and supports filtering by status. The page is designed as a generic "Requests" page — currently only vacation, but structured to accommodate future request types.

**Depends on:** Spec 09 (VacationRequest must exist). Also uses data from Spec 07 (MemberFinancials) and Spec 08 (reserve balance).

## Actors & Preconditions

- **Actors:** `admin` and `manager` view and act on requests. `user` and `viewer` have no access to this page.
- **Preconditions:** vacation requests must exist (spec 09). The page is functional even if no requests exist (shows empty state).

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| View Requests page | ✅ | ✅ | ❌ | ❌ |

> **Note:** approve/reject/cancel capabilities are defined in spec 09. This spec adds only the `ViewRequests` capability for page access. The action buttons on request cards use the same review/cancel APIs from spec 09.

### New Capabilities (extend `Capability` enum)

- `ViewRequests` — view the Requests page (admin, manager)

## Functional Requirements

1. The Requests page shows vacation requests from **all active members** in the organization.
2. **Default filter:** pending requests (requests needing action). The status filter can be changed to show approved, rejected, cancelled, or all statuses.
3. **Sorting:** pending requests are sorted oldest-first (longest-waiting at the top). Other statuses are sorted newest-first.
4. Each request card displays: member avatar (initials), full name (clickable link to member detail), date range, working days count, available vacation days balance, deduction amount, status badge, and action buttons.
5. **Action buttons** follow the same rules as spec 09:
   - Pending requests: "Approve" and "Reject" buttons (not shown if the viewer is the request owner).
   - Approved requests: "Cancel" button.
   - Rejected/cancelled requests: no action buttons.
6. Approving, rejecting, or cancelling a request from this page calls the same API endpoints as spec 09. The card updates in place after a successful action.
7. The sidebar navigation item shows a **badge** with the count of pending requests (e.g., `Requests 3`). Badge is hidden when the count is 0.
8. The sidebar "Requests" item is **not visible** to `user` or `viewer`.
9. Navigating directly to `/org/{orgId}/requests` as a `user` or `viewer` redirects to the members page (or shows 403).

## Screens

### Requests Page — admin/manager view

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────┐                                               │
│  │ Members  │     Requests                                  │
│  │ Requests●│                                               │
│  │          │     [ Pending ▾ ]  (filter dropdown)          │
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
2. System loads the Requests page showing pending vacation requests across all org members.
3. Each request card shows member avatar, name, date range, working days, available days, and deduction amount.
4. **To approve:** Manager clicks "Approve" on a request card. System sends `PUT /api/organizations/{orgId}/members/{memberId}/vacation/requests/{requestId}/review` with `{ "decision": "approved" }`. On success: toast "Request approved", card updates to show `approved` status, action buttons removed.
5. **To reject:** Manager clicks "Reject" on a request card. System opens the Reject Request modal (spec 09). Manager optionally enters a comment and clicks "Reject". System sends the review API with `{ "decision": "rejected", "comment": "..." }`. On success: modal closes, toast "Request rejected", card updates.
6. **To cancel approved:** Manager changes filter to "Approved" or "All", clicks "Cancel" on an approved request. Confirmation dialog with refund notice. On success: toast "Request cancelled and reserve refunded", card updates.

### Alt Flow: No pending requests

2a. System shows empty state: "No pending requests." centered on the page.

### Alt Flow: User/viewer navigates to Requests page

1a. A `user` or `viewer` navigates directly to `/org/{orgId}/requests`.
1b. System redirects to the members page (or shows 403).

## API Contracts

### GET /api/organizations/{orgId}/requests

**Authentication:** required. Caller must be `admin` or `manager` with `active` membership.

**Query parameters:**
- `status` — `pending` (default), `approved`, `rejected`, `cancelled`, `all`
- `type` — `vacation` (default). Reserved for future request types.

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
  ],
  "pendingCount": 2,
  "totalCount": 15
}
```

**Sorting:** pending requests first (oldest `requestedAt` first — longest-waiting at the top), then other statuses (newest `requestedAt` first).

**Errors:**
- `401 Unauthorized`: not authenticated.
- `403 Forbidden`: caller is `user` or `viewer` — `{ "error": "forbidden", "message": "You do not have permission to view requests" }`.

## Error Messages

| Context | Message |
|---|---|
| Requests page — forbidden | "You do not have permission to view requests" |
| Empty state — no requests (pending filter) | "No pending requests." |
| Empty state — no requests (other filters) | "No {status} requests." |

## UI Description

### Sidebar Navigation

- New **"Requests"** item in the main sidebar navigation, positioned after "Members".
- Visible to `admin` and `manager` only. Not visible to `user` or `viewer`.
- Shows a **badge** with the count of pending requests (e.g., `Requests ●3`). Badge hidden when count is 0.

### Page Layout

- Route: `/org/{orgId}/requests`.
- Page title: "Requests" (static).
- Status filter dropdown (`requests-status-filter`): options are "Pending" (default), "Approved", "Rejected", "Cancelled", "All". Changing the filter reloads the list.
- Request cards stacked vertically, max-width ~700px, centered.

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
| **Empty (pending filter)** | "No pending requests." centered message. |
| **Empty (other filters)** | "No {status} requests." centered message. |
| **Default** | List of request cards sorted by pending-first (oldest first), then other statuses (newest first). |
| **After action** | Card updates in place (status change, buttons removed). Toast notification. |

### Responsive Behavior

- Max-width ~700px, centered on desktop.
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
- Other request types besides vacation (extensible but not implemented).
- Notification system (email/push) for new requests.
- Search or member-name filtering on the Requests page.

## Test Cases

### TC-10-INT-01: Requests page — returns pending requests for all org members

- **Level:** Integration
- **Preconditions:** org with admin A, user M1 with 1 pending request, user M2 with 2 pending requests.
- **Steps:**
  1. As A, `GET /api/organizations/{orgId}/requests?status=pending`.
- **Expected Result:**
  1. HTTP 200. Returns 3 requests across M1 and M2, each with member info, balance, and dates. `pendingCount: 3`.

### TC-10-INT-02: Requests page — status filter

- **Level:** Integration
- **Preconditions:** org with admin A, user M with 1 pending, 1 approved, 1 rejected request.
- **Steps:**
  1. As A, `GET .../requests?status=all` → returns 3 requests.
  2. As A, `GET .../requests?status=approved` → returns 1 request.
  3. As A, `GET .../requests?status=pending` → returns 1 request.
- **Expected Result:**
  1–3. Each returns the correct filtered set.

### TC-10-INT-03: Requests page — forbidden for user/viewer

- **Level:** Integration
- **Preconditions:** org with user U and viewer V.
- **Steps:**
  1. As U, `GET /api/organizations/{orgId}/requests`.
  2. As V, `GET /api/organizations/{orgId}/requests`.
- **Expected Result:**
  1–2. HTTP 403 with `{ "error": "forbidden" }`.

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
- **Retired.** Covered by TC-10-INT-02 for the filtering, plus the endpoint’s default-to-pending and oldest-first ordering. The filter control itself is a DS `Select`, and the regressions suite proves that component opens and selects.

### TC-10-E2E-03: Requests page — user and viewer cannot access
- **Retired.** Covered by TC-10-INT-03 (a user and a viewer are forbidden). That the sidebar row is not rendered for them is the repository-wide navigation rule, proved in the browser once by TC-01-E2E-07 in the documents area.

### TC-10-E2E-04: Requests page — cancel approved request
- **Retired.** Duplicate. The identical case exists as TC-09-E2E-04 in the vacation-requests suite, and the rule is TC-09-INT-10.

