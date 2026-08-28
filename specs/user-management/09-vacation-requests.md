---
id: "09"
title: Vacation Requests
routes: ["Vacation tab on /org/{orgId}/members/{memberId}"]
api: ["POST .../vacation/requests", "PUT .../vacation/requests/{id}/review", "PUT .../vacation/requests/{id}/cancel"]
entities: [VacationRequest]
tags: [vacation-request, submit, approve, reject, cancel, debit, refund, pending-hold, overlap, working-days, self-approval]
depends-on: ["07", "08"]
---

# 09 — Vacation Requests

## Summary

Members submit vacation requests by choosing start and end dates. An `admin` or `manager` approves or rejects the request from the member's **Vacation tab**. Approved requests create a debit against the vacation reserve (spec 08). Cancelled approved requests create a compensating refund. Members earn up to **20 vacation days per calendar year** (configurable per member via spec 07). This spec covers the full request lifecycle — submission, review, cancellation — and the corresponding UI on the Vacation tab. A centralized Requests page for managers is covered in spec 10.

**Depends on:** Spec 07 (MemberFinancials), Spec 08 (VacationReserveTransaction, reserve balance).

## Actors & Preconditions

- **Actors:** `admin` and `manager` review (approve/reject/cancel) requests. `user` submits and cancels their own requests. `viewer` has no access.
- **Preconditions:** MemberFinancials must be configured (spec 07) and reserve balance must exist (spec 08) before requests can be submitted.

## Roles & Permission Matrix

Capabilities from specs 07–08 continue to apply. This spec introduces:

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| Submit vacation request (self only) | ✅ | ✅ | ✅ | ❌ |
| Approve / reject vacation requests | ✅ | ✅ | ❌ | ❌ |
| Cancel own pending request | ✅ | ✅ | ✅ | ❌ |
| Cancel any pending or approved request | ✅ | ✅ | ❌ | ❌ |

## Functional Requirements

### Vacation Requests

1. A member submits a vacation request by selecting a **start date** and **end date**. Both dates must be within the same calendar year. Cross-year requests are rejected with error "Start and end dates must be within the same calendar year".
2. **Working days** are calculated as the count of weekdays (Monday–Friday) within the date range, inclusive. Weekends (Saturday, Sunday) are excluded. Public holidays are not considered.
3. The start date must be today or later (no past-dated requests). The end date must be ≥ the start date.
4. The request must not exceed the member's `availableDays`. If it does, the request is rejected with error "Insufficient vacation balance. You have {availableDays} day(s) available."
5. The request must not **overlap** with any existing non-cancelled request for the same member (regardless of status: pending, approved). Overlap means the date ranges share at least one common date. Error: "This request overlaps with an existing vacation request ({startDate} – {endDate})."
6. The **deduction amount** is calculated at submission time: `workingDays × dailySalary`. This is the amount that will be debited from the reserve if approved, and it is the amount held against the balance for pending requests.
7. Upon submission the request status is `pending`.

### Available Days (updated from spec 08)

8. The available vacation balance now includes a **pending hold**:
   ```
   reserveBalance = SUM(amount) for all transactions of this membership in the current calendar year
   pendingHold = SUM(deductionAmount) for all pending requests of this membership in the current calendar year
   dailySalary = monthlySalary × 12 / 260
   availableDays = floor((reserveBalance − pendingHold) / dailySalary)
   ```
9. `availableDays` cannot exceed `vacationDaysPerYear − usedDays`, where `usedDays` is the count of working days across all **approved** requests in the current calendar year.
10. `availableDays` has a floor of `0`.

### Request Review

11. An `admin` or `manager` approves or rejects a pending request. Only `pending` requests can be reviewed.
12. **Approve:** creates a `debit` transaction in the ledger for the `deductionAmount`. The request status changes to `approved`. `ReviewedAt` and `ReviewedByAccountId` are recorded.
13. **Reject:** no ledger transaction is created. The request status changes to `rejected`. `ReviewedAt` and `ReviewedByAccountId` are recorded. An optional `ReviewerComment` (max 500 characters) may be provided.
14. A reviewer cannot approve their own request. Error: "You cannot approve your own vacation request." A different `admin`/`manager` must approve it.

### Request Cancellation

15. A member may cancel their own `pending` request. An `admin`/`manager` may cancel any `pending` or `approved` request.
16. Cancelling a **pending** request: status changes to `cancelled`. No ledger transaction is needed (no debit was created).
17. Cancelling an **approved** request: status changes to `cancelled`. A compensating **refund** transaction is created for the `deductionAmount`, effectively refunding the reserve. `CancelledAt` and `CancelledByAccountId` are recorded.
18. `rejected` and already `cancelled` requests cannot be cancelled.

### Year-End Side Effects (extends spec 08)

19. Pending requests that fall within the expired year are auto-cancelled (with compensating refunds if they were somehow approved).

### Member Removal Side Effects

20. When a member is removed (per spec 04), all their `pending` vacation requests are auto-cancelled. Approved requests for future dates are also auto-cancelled (with compensating refunds). Past approved requests remain unchanged.

## Data Model

### VacationRequest

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `MembershipId` | Guid (FK) | References `Membership.Id`. |
| `StartDate` | DateOnly | First day of vacation (inclusive). |
| `EndDate` | DateOnly | Last day of vacation (inclusive). |
| `WorkingDays` | int | Count of weekdays in the date range. |
| `DeductionAmount` | decimal(12,2) | `workingDays × dailySalary` computed at submission time. |
| `Status` | enum | `pending`, `approved`, `rejected`, `cancelled` |
| `RequestedAt` | DateTime | Submission timestamp. |
| `ReviewedAt` | DateTime? | When the request was approved or rejected. |
| `ReviewedByAccountId` | Guid? (FK) | Account that approved or rejected. |
| `ReviewerComment` | string(500)? | Optional comment from reviewer (typically on rejection). |
| `CancelledAt` | DateTime? | When the request was cancelled. |
| `CancelledByAccountId` | Guid? (FK) | Account that cancelled the request. |

### VacationReserveTransaction (extended from spec 08)

Two new transaction types added:

| Type | Description |
|---|---|
| `debit` | Subtracted when a vacation request is approved. Amount = `workingDays × dailySalary`. Linked to a `VacationRequestId`. |
| `refund` | Compensating credit when an approved vacation request is cancelled. Amount = the original `deductionAmount`. Linked to a `VacationRequestId`. |

### New Enums

- **`VacationRequestStatus`**: `Pending`, `Approved`, `Rejected`, `Cancelled`
- **`TransactionType`** (extended): adds `Debit`, `Refund` to existing `Credit`, `Expiry`

### New Capabilities (extend `Capability` enum)

- `SubmitVacationRequest` — submit own vacation request (admin, manager, user)
- `ReviewVacationRequests` — approve/reject requests (admin, manager)
- `CancelOwnVacationRequest` — cancel own pending request (admin, manager, user)
- `CancelAnyVacationRequest` — cancel any pending/approved request (admin, manager)

## Screens

### Vacation Tab — admin/manager view (with requests)

```
┌─────────────────────────────────────────────────────────────┐
│  About   [ VACATION ]   Projects   Roles   Payments        │
│          active          disabled   disabled  disabled      │
│                                                             │
│  ┌─ Financial Settings ──────────────────── [ Edit ] ─┐    │
│  │  Monthly salary     $3,000.00  USD                  │    │
│  │  Client hourly rate $40.00                          │    │
│  │  Reserve %          3.33% (auto)                    │    │
│  │  Days per year      20                              │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Vacation Balance ─────────────────────────────────┐    │
│  │                                                     │    │
│  │   12 days available   │  5 used  │  3 pending       │    │
│  │                                                     │    │
│  │   Reserve: $1,661.54 USD                            │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─ Vacation Requests ─────────────────────────────────┐   │
│  │                                                      │   │
│  │  Jul 14 – Jul 25, 2025  (10 days)  ● Pending        │   │
│  │  [$1,384.62]            [ Approve ] [ Reject ]       │   │
│  │                                                      │   │
│  │  Mar 3 – Mar 7, 2025   (5 days)   ✓ Approved        │   │
│  │  [$692.31]                         [ Cancel ]        │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─ Reserve Transactions ─────────────────────────────┐    │
│  │  Date        Type     Amount     Description        │    │
│  │  Jul 1       Credit   +$230.88   June 2025 accrual  │    │
│  │              (auto)                                  │    │
│  │  Mar 7       Debit    −$692.31   Vacation 3/3–3/7   │    │
│  │  ...                                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Vacation Tab — user view (own profile, with requests)

```
┌─────────────────────────────────────────────────────────────┐
│  About   [ VACATION ]   Projects   Roles   Payments        │
│          active          disabled   disabled  disabled      │
│                                                             │
│  ┌─ Vacation Balance ─────────────────────────────────┐    │
│  │                                                     │    │
│  │   12 days available   │  5 used  │  3 pending       │    │
│  │   out of 20 per year                                │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  [ Request vacation ]                                       │
│                                                             │
│  ┌─ My Requests ──────────────────────────────────────┐    │
│  │                                                     │    │
│  │  Jul 14 – Jul 25, 2025  (10 days)  ● Pending       │    │
│  │                                     [ Cancel ]      │    │
│  │                                                     │    │
│  │  Mar 3 – Mar 7, 2025   (5 days)   ✓ Approved       │    │
│  │                                                     │    │
│  │  Jan 6 – Jan 10, 2025  (5 days)   ✗ Rejected       │    │
│  │  "Team availability conflict"                       │    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Request Vacation Modal

```
┌─────────────── Request Vacation ──────────────────┐
│                                                    │
│  Start date *                                      │
│  [ 2025-07-14                         ]            │
│                                                    │
│  End date *                                        │
│  [ 2025-07-25                         ]            │
│                                                    │
│  Working days: 10                                  │
│  Available balance: 12 days                        │
│                                                    │
│            [ Cancel ]  [ Submit request ]           │
└────────────────────────────────────────────────────┘
```

### Reject Request Modal

```
┌──────────────── Reject Request ───────────────────┐
│                                                    │
│  Rejecting: Jul 14 – Jul 25, 2025 (10 days)       │
│  Requested by: Alex Kaminski                       │
│                                                    │
│  Comment (optional)                                │
│  [ Team availability conflict         ]            │
│                                                    │
│            [ Cancel ]  [ Reject ]                  │
└────────────────────────────────────────────────────┘
```

## Flows

### Flow: User submits vacation request

1. User navigates to their own Member Detail → Vacation tab.
2. User clicks "Request vacation".
3. System opens the Request Vacation modal showing the available balance.
4. User selects start date and end date.
5. System calculates and displays working days in real time.
6. User clicks "Submit request".
7. System sends `POST /api/organizations/{orgId}/members/{memberId}/vacation/requests`.
8. On success: modal closes, toast "Vacation request submitted" appears, request appears in the list with `pending` status.

### Flow: Manager approves request from Vacation tab

1. Manager views a member's Vacation tab and sees a pending request.
2. Manager clicks "Approve" on the request.
3. System sends `PUT /api/organizations/{orgId}/members/{memberId}/vacation/requests/{requestId}/review` with `{ "decision": "approved" }`.
4. On success: toast "Request approved" appears, request status updates to `approved`, balance recalculates (pending hold released, debit applied — net available days decrease by the working days of the request).

### Flow: Manager rejects request from Vacation tab

1. Manager clicks "Reject" on a pending request.
2. System opens the Reject Request modal.
3. Manager optionally enters a comment and clicks "Reject".
4. System sends `PUT .../vacation/requests/{requestId}/review` with `{ "decision": "rejected", "comment": "..." }`.
5. On success: modal closes, toast "Request rejected" appears, request status updates to `rejected`, pending hold is released (available days increase).

### Flow: User cancels own pending request

1. User clicks "Cancel" on their own pending request.
2. System shows a confirmation: "Cancel this vacation request?"
3. User confirms.
4. System sends `PUT .../vacation/requests/{requestId}/cancel`.
5. On success: toast "Request cancelled" appears, request status updates to `cancelled`, pending hold is released.

### Flow: Manager cancels an approved request

1. Manager clicks "Cancel" on an approved request (from Vacation tab).
2. System shows a confirmation: "Cancel this approved vacation? The reserve will be refunded."
3. Manager confirms.
4. System sends `PUT .../vacation/requests/{requestId}/cancel`.
5. On success: toast "Request cancelled and reserve refunded" appears, a compensating refund transaction is created, request status updates to `cancelled`, balance recalculates.

### Alt Flow: Insufficient balance (branches from User submits request, step 6)

6a. The API returns `400` with error "Insufficient vacation balance. You have {N} day(s) available."
6b. Modal stays open. Inline error displayed below the date fields.

### Alt Flow: Overlapping dates (branches from User submits request, step 6)

6a. The API returns `400` with error "This request overlaps with an existing vacation request ({startDate} – {endDate})."
6b. Modal stays open. Inline error displayed below the date fields.

### Alt Flow: Cross-year request (branches from User submits request, step 5)

5a. User selects dates spanning two calendar years. Client-side validation shows inline error: "Start and end dates must be within the same calendar year." Submit button is disabled.

### Alt Flow: Self-approval attempt (branches from Manager approves, step 3)

3a. The API returns `403` with error "You cannot approve your own vacation request."
3b. Toast shows the error. Request remains `pending`.

### Alt Flow: Network/server error (any mutation)

- System shows error toast "Something went wrong. Please try again."
- Modal/form retains values. Buttons re-enable.

## API Contracts

### GET /api/organizations/{orgId}/members/{memberId}/vacation (updated from spec 08)

The response now includes `requests`.

**Response `200` (admin/manager view):**
```json
{
  "financials": { "..." },
  "balance": {
    "reserveBalance": 1661.54,
    "availableDays": 12,
    "usedDays": 5,
    "pendingDays": 3,
    "totalDaysPerYear": 20
  },
  "requests": [
    {
      "id": "uuid",
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
      "cancelledBy": null
    }
  ],
  "transactions": [ "..." ],
  "canEdit": true,
  "canReviewRequests": true,
  "canSubmitRequest": false
}
```

**Response `200` (user viewing own profile):**
```json
{
  "financials": null,
  "balance": {
    "reserveBalance": null,
    "availableDays": 12,
    "usedDays": 5,
    "pendingDays": 3,
    "totalDaysPerYear": 20
  },
  "requests": [
    {
      "id": "uuid",
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
      "cancelledBy": null
    }
  ],
  "transactions": null,
  "canEdit": false,
  "canReviewRequests": false,
  "canSubmitRequest": true
}
```

### POST /api/organizations/{orgId}/members/{memberId}/vacation/requests

**Authentication:** required. Caller must have `SubmitVacationRequest` capability. Caller can only submit for their own membership (`memberId` must match caller's membership).

**Request:**
```json
{
  "startDate": "2025-07-14",
  "endDate": "2025-07-25"
}
```

**Success `201`:**
```json
{
  "id": "uuid",
  "workingDays": 10,
  "deductionAmount": 1384.62,
  "status": "pending"
}
```

**Errors:**
- `400 Bad Request` (validation): `{ "errors": { "startDate": "Start date must be today or later" } }`
- `400 Bad Request` (cross-year): `{ "error": "cross_year", "message": "Start and end dates must be within the same calendar year" }`
- `400 Bad Request` (insufficient balance): `{ "error": "insufficient_balance", "message": "Insufficient vacation balance. You have 2 day(s) available." }`
- `400 Bad Request` (overlap): `{ "error": "overlap", "message": "This request overlaps with an existing vacation request (2025-07-14 – 2025-07-25)" }`
- `400 Bad Request` (no financials): `{ "error": "financials_not_configured", "message": "Financial settings must be configured before requesting vacation" }`
- `403 Forbidden`: caller is `viewer`, or caller is submitting for a different member — `{ "error": "forbidden", "message": "You can only submit vacation requests for yourself" }`
- `404 Not Found`: member not found.

### PUT /api/organizations/{orgId}/members/{memberId}/vacation/requests/{requestId}/review

**Authentication:** required. Caller must be `admin` or `manager` with `active` membership.

**Request:**
```json
{
  "decision": "approved",
  "comment": null
}
```

`decision` must be `"approved"` or `"rejected"`. `comment` is optional (max 500 characters), typically used with rejections.

**Success `200`:**
```json
{
  "success": true,
  "status": "approved"
}
```

**Errors:**
- `400 Bad Request` (not pending): `{ "error": "invalid_status", "message": "Only pending requests can be reviewed" }`
- `400 Bad Request` (invalid decision): `{ "error": "invalid_decision", "message": "Decision must be 'approved' or 'rejected'" }`
- `403 Forbidden` (self-approval): `{ "error": "self_approval", "message": "You cannot approve your own vacation request" }`
- `403 Forbidden` (permission): `{ "error": "forbidden", "message": "You do not have permission to review vacation requests" }`
- `404 Not Found`: request not found.

### PUT /api/organizations/{orgId}/members/{memberId}/vacation/requests/{requestId}/cancel

**Authentication:** required. Caller must be the request owner (for pending) or `admin`/`manager` (for pending or approved).

**Success `200`:**
```json
{
  "success": true,
  "refunded": true,
  "refundAmount": 1384.62
}
```

`refunded` is `true` only when cancelling an approved request (compensating refund was created). `false` when cancelling a pending request.

**Errors:**
- `400 Bad Request` (invalid status): `{ "error": "invalid_status", "message": "Only pending or approved requests can be cancelled" }`
- `403 Forbidden` (permission): `{ "error": "forbidden", "message": "You do not have permission to cancel this request" }` — `user` trying to cancel another member's request, or `user` trying to cancel an approved request.
- `404 Not Found`: request not found.

## Validation Rules

1. **StartDate**: required, must be today or later. Error: "Start date must be today or later".
2. **EndDate**: required, must be ≥ start date. Error: "End date must be on or after start date".
3. **Cross-year check**: start and end must be in the same calendar year. Error: "Start and end dates must be within the same calendar year".
4. **Balance check**: working days ≤ available days. Error: "Insufficient vacation balance. You have {N} day(s) available."
5. **Overlap check**: no date overlap with non-cancelled requests. Error: "This request overlaps with an existing vacation request ({startDate} – {endDate})."
6. **ReviewerComment**: optional, max 500 characters. Error: "Comment must be at most 500 characters".
7. **Self-approval**: reviewer cannot be the request owner. Error: "You cannot approve your own vacation request."

Client-side validation: field-level validation on blur/submit for date fields. Working days preview updates on date change. Balance check displayed as a warning before submission.

Server-side validation: all rules enforced regardless of UI state.

## Error Messages

| Context | Message |
|---|---|
| Request — start date in past | "Start date must be today or later" |
| Request — end before start | "End date must be on or after start date" |
| Request — cross-year | "Start and end dates must be within the same calendar year" |
| Request — insufficient balance | "Insufficient vacation balance. You have {N} day(s) available." |
| Request — overlap | "This request overlaps with an existing vacation request ({startDate} – {endDate})" |
| Request — no financials | "Financial settings must be configured before requesting vacation" |
| Request — for another member | "You can only submit vacation requests for yourself" |
| Review — not pending | "Only pending requests can be reviewed" |
| Review — self-approval | "You cannot approve your own vacation request" |
| Review — invalid decision | "Decision must be 'approved' or 'rejected'" |
| Review — comment too long | "Comment must be at most 500 characters" |
| Cancel — invalid status | "Only pending or approved requests can be cancelled" |
| Cancel — no permission | "You do not have permission to cancel this request" |
| Review — forbidden | "You do not have permission to review vacation requests" |
| Network/server error | "Something went wrong. Please try again." |
| Toast — request submitted | "Vacation request submitted" |
| Toast — request approved | "Request approved" |
| Toast — request rejected | "Request rejected" |
| Toast — request cancelled (pending) | "Request cancelled" |
| Toast — request cancelled (approved) | "Request cancelled and reserve refunded" |
| Empty state — no requests | "No vacation requests yet." |

## UI Description

### New Components on Vacation Tab

**Vacation Requests list (`vacation-requests-list`):**
- Lists all requests for the current year, newest first.
- Each row (`vacation-request-row-{id}`): date range, working days count, status badge, deduction amount (admin/manager only).
- Status badges: `● Pending` (yellow), `✓ Approved` (green), `✗ Rejected` (red), `○ Cancelled` (gray).
- Action buttons per row:
  - Pending request + admin/manager viewer: "Approve" (`vacation-request-approve-{id}`) and "Reject" (`vacation-request-reject-{id}`)
  - Pending request + owner: "Cancel" (`vacation-request-cancel-{id}`)
  - Approved request + admin/manager viewer: "Cancel" (`vacation-request-cancel-{id}`)
- Rejected requests show reviewer comment (if any) below the row.

**"Request vacation" button (`vacation-request-btn`):**
- Visible to `admin`/`manager`/`user` on own profile.
- Disabled when `availableDays` is 0, with tooltip "No vacation days available".
- Opens the Request Vacation modal.

### Updated Components

**Vacation Balance card (`vacation-balance-card`):**
- `pendingDays` now shows actual pending request days.
- `usedDays` now shows actual approved request days.

**Reserve Transactions table (`vacation-transactions-table`):**
- Now includes `debit` and `refund` transaction types.
- Debits show "−" prefix (red), refunds show "+" prefix (green).

### Modal Components

**Request Vacation modal (`vacation-request-modal`):**
- Fields: Start date picker (`vacation-start-date-input`), End date picker (`vacation-end-date-input`).
- Working days display (`vacation-working-days-preview`): computed in real time from date range.
- Available balance display (`vacation-available-days-preview`).
- Submit button (`vacation-request-submit-btn`). Cancel button (`vacation-request-cancel-btn`).
- Inline errors beneath date fields (`field-error-startDate`, `field-error-endDate`, `vacation-request-error`).

**Reject Request modal (`vacation-reject-modal`):**
- Displays: date range, working days, requester name.
- Field: Comment textarea (`vacation-reject-comment-input`), optional, max 500 chars.
- Reject button (`vacation-reject-confirm-btn`). Cancel button (`vacation-reject-cancel-btn`).

### Interactions

- **Date picker change (request modal):** working days recalculates in real time. Shows warning if insufficient balance.
- **Approve click:** immediate API call (no confirmation modal). Toast on success.
- **Reject click:** opens reject modal with optional comment.
- **Cancel click (pending):** confirmation dialog, then API call.
- **Cancel click (approved):** confirmation dialog with refund notice, then API call.

### States (additions)

| State | Behavior |
|---|---|
| **No requests yet** | Requests list shows "No vacation requests yet." |
| **Saving (any modal)** | Save/submit button disabled with loading indicator. Fields read-only during submission. |

## Required `data-testid` Attributes (additions)

**Vacation tab content:**
- `vacation-request-btn`
- `vacation-requests-list`, `vacation-request-row-{id}`
- `vacation-request-approve-{id}`, `vacation-request-reject-{id}`, `vacation-request-cancel-{id}`
- `vacation-request-status-{id}`, `vacation-request-dates-{id}`, `vacation-request-days-{id}`
- `vacation-request-reviewer-comment-{id}`
- `vacation-no-requests`

**Request Vacation modal:**
- `vacation-request-modal`
- `vacation-start-date-input`, `vacation-end-date-input`
- `vacation-working-days-preview`, `vacation-available-days-preview`
- `vacation-request-submit-btn`, `vacation-request-cancel-btn`
- `field-error-startDate`, `field-error-endDate`, `vacation-request-error`

**Reject Request modal:**
- `vacation-reject-modal`
- `vacation-reject-comment-input`
- `vacation-reject-confirm-btn`, `vacation-reject-cancel-btn`
- `field-error-reviewerComment`

**Toasts:**
- `toast-request-submitted`
- `toast-request-approved`, `toast-request-rejected`, `toast-request-cancelled`

## Out of Scope

- Organization Requests page — centralized request management (spec 10).
- Manual credit entry (credits are auto-generated monthly per spec 08).
- Public holiday calendar (working days = weekdays only).
- Half-day or partial-day vacation requests.
- Sick leave, personal days, or other leave types.
- Notification system (email/push) for request status changes.
- Bulk operations (approve/reject multiple requests at once).
- Historical year views (only current calendar year is shown).

## Test Cases

### TC-09-UNIT-01: Working days calculation

- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Calculate working days for 2025-07-14 (Mon) to 2025-07-25 (Fri).
  2. Calculate working days for 2025-07-14 (Mon) to 2025-07-14 (Mon) — single day.
  3. Calculate working days for 2025-07-12 (Sat) to 2025-07-13 (Sun) — weekend only.
  4. Calculate working days for 2025-12-29 (Mon) to 2026-01-02 (Fri) — cross-year (should be rejected at validation, but if called, returns 5).
- **Expected Result:**
  1. 10 working days (2 full weeks, Mon-Fri × 2).
  2. 1 working day.
  3. 0 working days.
  4. 5 working days (calculation still works, but request validation rejects cross-year).

### TC-09-UNIT-02: Available days with pending hold

- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. reserveBalance=1661.54, pendingHold=1384.62, dailySalary=138.46, vacationDaysPerYear=20, usedDays=5. Calculate availableDays.
  2. reserveBalance=1661.54, pendingHold=0, dailySalary=138.46, vacationDaysPerYear=20, usedDays=5. Calculate availableDays.
  3. reserveBalance=2769.23, pendingHold=0, dailySalary=138.46, vacationDaysPerYear=20, usedDays=18. Calculate availableDays.
- **Expected Result:**
  1. floor((1661.54−1384.62)/138.46) = floor(2.0) = 2. Cap: min(2, 20−5) = 2. **availableDays = 2**.
  2. floor(1661.54/138.46) = 12. Cap: min(12, 20−5) = 12. **availableDays = 12**.
  3. floor(2769.23/138.46) = 20. Cap: min(20, 20−18) = 2. **availableDays = 2** (capped by annual limit).

### TC-09-UNIT-03: Overlap detection

- **Level:** Unit
- **Preconditions:** existing request A: 2025-07-14 to 2025-07-18.
- **Steps:**
  1. Check overlap with B: 2025-07-18 to 2025-07-25 (shares last day of A).
  2. Check overlap with C: 2025-07-21 to 2025-07-25 (no overlap).
  3. Check overlap with D: 2025-07-10 to 2025-07-16 (overlaps start of A).
  4. Check overlap with E: 2025-07-15 to 2025-07-17 (fully inside A).
- **Expected Result:**
  1. **Overlap** (Jul 18 is shared).
  2. **No overlap**.
  3. **Overlap** (Jul 14–16 shared).
  4. **Overlap** (fully inside).

### TC-09-INT-01: Submit vacation request — happy path

- **Level:** Integration
- **Preconditions:** user M with financials and reserve balance covering 10 days.
- **Steps:**
  1. As M, `POST .../vacation/requests` with `{ "startDate": "2025-08-04", "endDate": "2025-08-08" }` (5 working days).
  2. `GET .../vacation` and check pending hold and available days.
- **Expected Result:**
  1. HTTP 201, `workingDays: 5`, `status: "pending"`.
  2. `pendingDays: 5`, `availableDays` reduced by 5.

### TC-09-INT-02: Submit vacation request — insufficient balance

- **Level:** Integration
- **Preconditions:** user M with financials and 2 available days.
- **Steps:**
  1. As M, `POST .../vacation/requests` with dates spanning 5 working days.
- **Expected Result:**
  1. HTTP 400 with `{ "error": "insufficient_balance", "message": "Insufficient vacation balance. You have 2 day(s) available." }`.

### TC-09-INT-03: Submit vacation request — overlap

- **Level:** Integration
- **Preconditions:** user M with an existing pending request for 2025-08-04 to 2025-08-08.
- **Steps:**
  1. As M, `POST .../vacation/requests` with `{ "startDate": "2025-08-06", "endDate": "2025-08-12" }`.
- **Expected Result:**
  1. HTTP 400 with `{ "error": "overlap" }`.

### TC-09-INT-04: Submit vacation request — cross-year

- **Level:** Integration
- **Preconditions:** user M with sufficient balance.
- **Steps:**
  1. As M, `POST .../vacation/requests` with `{ "startDate": "2025-12-29", "endDate": "2026-01-02" }`.
- **Expected Result:**
  1. HTTP 400 with `{ "error": "cross_year" }`.

### TC-09-INT-05: Submit vacation request — only for own membership

- **Level:** Integration
- **Preconditions:** user U and admin A in same org.
- **Steps:**
  1. As U, `POST /api/organizations/{orgId}/members/{A.membershipId}/vacation/requests` with valid dates.
- **Expected Result:**
  1. HTTP 403 with `{ "error": "forbidden", "message": "You can only submit vacation requests for yourself" }`.

### TC-09-INT-06: Approve request — happy path

- **Level:** Integration
- **Preconditions:** user M has a pending request R. Admin A in same org.
- **Steps:**
  1. As A, `PUT .../vacation/requests/{R.id}/review` with `{ "decision": "approved" }`.
  2. `GET .../vacation` and check balance and transactions.
- **Expected Result:**
  1. HTTP 200, `status: "approved"`.
  2. A `debit` transaction exists for the deduction amount. `usedDays` increased. `pendingDays` decreased. Reserve balance decreased.

### TC-09-INT-07: Approve request — self-approval rejected

- **Level:** Integration
- **Preconditions:** admin A has a pending request R (submitted by A).
- **Steps:**
  1. As A, `PUT .../vacation/requests/{R.id}/review` with `{ "decision": "approved" }`.
- **Expected Result:**
  1. HTTP 403 with `{ "error": "self_approval" }`. Request remains `pending`.

### TC-09-INT-08: Reject request — with comment

- **Level:** Integration
- **Preconditions:** user M has a pending request R. Manager G in same org.
- **Steps:**
  1. As G, `PUT .../vacation/requests/{R.id}/review` with `{ "decision": "rejected", "comment": "Team capacity" }`.
  2. `GET .../vacation` as admin.
- **Expected Result:**
  1. HTTP 200, `status: "rejected"`.
  2. Request shows `reviewerComment: "Team capacity"`. No debit transaction. Pending hold released.

### TC-09-INT-09: Cancel pending request — by owner

- **Level:** Integration
- **Preconditions:** user M has a pending request R.
- **Steps:**
  1. As M, `PUT .../vacation/requests/{R.id}/cancel`.
  2. `GET .../vacation`.
- **Expected Result:**
  1. HTTP 200, `refunded: false`.
  2. Request status `cancelled`. Pending hold released. No new transactions.

### TC-09-INT-10: Cancel approved request — by manager (refund)

- **Level:** Integration
- **Preconditions:** user M has an approved request R with deductionAmount=692.31. Manager G in same org.
- **Steps:**
  1. As G, `PUT .../vacation/requests/{R.id}/cancel`.
  2. `GET .../vacation`.
- **Expected Result:**
  1. HTTP 200, `refunded: true, refundAmount: 692.31`.
  2. Request status `cancelled`. A compensating `refund` transaction of 692.31 exists. Reserve balance increased by 692.31.

### TC-09-INT-11: Cancel request — user cannot cancel approved request

- **Level:** Integration
- **Preconditions:** user M has an approved request R.
- **Steps:**
  1. As M, `PUT .../vacation/requests/{R.id}/cancel`.
- **Expected Result:**
  1. HTTP 403 with `{ "error": "forbidden" }`. Request remains `approved`.

### TC-09-INT-12: Concurrent approval race condition

- **Level:** Integration
- **Preconditions:** user M has exactly 5 available days. Two pending requests R1 (3 days) and R2 (3 days). Admin A and manager G.
- **Steps:**
  1. Simultaneously: A approves R1 and G approves R2.
- **Expected Result:**
  1. Exactly one approval succeeds. The second fails with `insufficient_balance` (because the first approval consumed days that the second also needs). This must be enforced atomically — no double-debit.

### TC-09-INT-13: Member removal auto-cancels pending requests

- **Level:** Integration
- **Preconditions:** user M has a pending request R1 and an approved future-dated request R2.
- **Steps:**
  1. As admin, remove member M (per spec 04).
  2. Query M's vacation requests.
- **Expected Result:**
  1. R1 status → `cancelled` (no refund needed). R2 status → `cancelled` with compensating refund transaction.

### TC-09-E2E-01: User submits vacation request

- **Level:** E2E
- **Preconditions:** logged in as user "Alex Kaminski"; financials configured; 10 available days (credits accrued).
- **Steps:**
  1. Open own member detail → Vacation tab.
  2. Verify balance card shows 10 available days. No financial settings card visible.
  3. Click "Request vacation".
  4. Select start date 2025-08-04, end date 2025-08-08.
  5. Verify working days shows "5".
  6. Click "Submit request".
  7. Verify toast "Vacation request submitted". Request appears in list with "Pending" status.
  8. Verify available days decreased to 5 (pending hold applied).
- **Selectors:** `member-detail-tab-vacation`, `vacation-balance-card`, `vacation-available-days`, `vacation-financials-card` (asserted absent), `vacation-request-btn`, `vacation-request-modal`, `vacation-start-date-input`, `vacation-end-date-input`, `vacation-working-days-preview`, `vacation-request-submit-btn`, `toast-request-submitted`, `vacation-request-row-{id}`, `vacation-request-status-{id}`.

### TC-09-E2E-02: Manager approves request from Vacation tab

- **Level:** E2E
- **Preconditions:** logged in as manager; member Alex has a pending request R1.
- **Steps:**
  1. Open Alex's member detail → Vacation tab.
  2. Click "Approve" on R1. Verify toast "Request approved". Status changes to ✓ Approved.
  3. Verify balance: used days increased, pending days decreased.
- **Selectors:** `member-detail-tab-vacation`, `vacation-request-approve-{R1.id}`, `toast-request-approved`, `vacation-request-status-{R1.id}`, `vacation-used-days`, `vacation-pending-days`.

### TC-09-E2E-03: User cancels own pending request
- **Retired.** Covered by TC-09-INT-09, which additionally asserts that cancelling an own pending request writes no transaction.

### TC-09-E2E-04: Manager cancels approved request (refund)
- **Retired.** Covered by TC-09-INT-10 (the reserve is refunded). The case also existed verbatim as TC-10-E2E-04 in the requests-page suite: one rule, two browsers.

### TC-09-E2E-05: Insufficient balance blocks request submission
- **Retired.** Covered by TC-09-INT-02, which asserts the `insufficient_balance` refusal. That the modal stays open on a rejected submit is the shared form-error mechanism TC-02-E2E-02 keeps.

### TC-09-E2E-06: Self-approval blocked in UI
- **Retired.** Covered by TC-09-INT-07 — self-approval is refused and the request stays pending. Hiding the control is the same role-gated rendering rule proved once by TC-01-E2E-07 in the documents area.

