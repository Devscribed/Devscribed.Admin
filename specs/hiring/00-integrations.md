---
id: "00"
title: Integrations
routes: []
api: []
entities: [CalendarProvider, Storage, MailService]
tags: [calendar, storage, mail, graph, provider, capability, tenant, mailbox]
depends-on: []
---

# 00 — Integrations

## Summary

Hiring depends on three things the application does not own: a calendar to read availability from
and write interviews into, somewhere to keep uploaded CVs, and a way to reach people by email.
Each is specified here as a **capability** — what the system needs done — with exactly one
implementation shipping in this release. No screen spec names a vendor, and no vendor name appears
outside its own module.

Devscribed is the only organization for now. Nothing in these specs assumes that is permanent:
every hiring table carries `organizationId` from its first migration, the way `Membership` already
does, because retrofitting a tenant key onto a populated table is the expensive version of this
decision.

## Actors & Preconditions

- **Actors:** none directly — this spec has no UI. It is consumed by 01, 02, and 04.
- **Preconditions:** a Microsoft 365 tenant with an app registration (see §02).

## Functional Requirements

### 01. The Capability Rule

1. Every external dependency is expressed as an interface owned by the application. Business specs
   reference the interface, never the implementation.
2. Exactly one implementation of each ships in this release. Additional providers are new classes
   behind the same interface, not changes to callers.
3. Provider-specific types (Graph SDK types, S3 SDK types) never cross the interface boundary. A
   caller that can name `microsoft-graph-types` is a bug.

| Capability | Ships in this release | Deferred alternative |
|---|---|---|
| `CalendarProvider` | `TenantAppOnlyProvider` — Microsoft Graph, client credentials | Per-user delegated OAuth |
| `Storage` | `LocalFsStorage` — development and tests only | `S3Storage` |
| `MailService` | none required — see §04 | Resend or SES |

### 02. Calendar

4. The capability is:

   ```
   interface CalendarProvider {
     resolveMailbox(email): Promise<MailboxRef | null>
     workingHours(mailbox): Promise<WorkingHours>
     busy(mailbox, fromUtc, toUtc): Promise<Interval[]>
     isFree(mailbox, startUtc, endUtc): Promise<boolean>
     createEvent(mailbox, event): Promise<EventId>
     cancelEvent(mailbox, eventId): Promise<void>
   }
   ```

5. **`TenantAppOnlyProvider`** authenticates with the client-credentials flow against a single
   Azure app registration. Application permissions required, admin-consented:

   | Permission | Used for |
   |---|---|
   | `Calendars.ReadWrite` | free/busy reads, event creation and cancellation |
   | `MailboxSettings.Read` | the interviewer's configured working hours |
   | `User.Read.All` | resolving an email address to a tenant mailbox |

   App-only auth has no signed-in user, so every call names the mailbox explicitly
   (`/users/{upn}/...`).

6. **Bookable hours come from the mailbox, not from configuration.** `workingHours` reads
   `mailboxSettings.workingHours`, giving `daysOfWeek`, `startTime`, `endTime`, and a time zone.
   There is no separate working-hours setting anywhere in the product.
7. **Zone identifiers must be translated.** Graph reports Windows zone ids (`"Pacific Standard
   Time"`), not IANA (`"America/Los_Angeles"`), in both mailbox settings and schedule items. The
   provider translates on the way out; the engine only ever sees IANA.
8. **Blocking statuses.** `busy` returns only intervals whose free/busy status is `busy`,
   `tentative`, or `oof`. Statuses `free` and `workingElsewhere` are **not** returned and therefore
   do not remove a slot.
9. An event marked `free` **does not create availability** outside working hours. Slots are
   generated only within working hours (see [02-booking-page.md](02-booking-page.md) §05); a `free`
   event merely fails to remove one.
10. **`createEvent` adds the candidate as an attendee.** Microsoft then delivers the calendar
    invite to both parties. This is why the release needs no mail transport (see §04).
11. The CV is attached to the created event: inline for files under 3 MB, via an upload session
    above that. Graph ignores an `attachments` array supplied at creation time, so the attachment
    is always added after the event exists.
12. **Interviewer eligibility is verified, never asserted.** An account is eligible to be assigned
    as an interviewer when `resolveMailbox(account.email)` returns a mailbox. It is not inferred
    from the email's domain, and it is not a flag an admin can set by hand. The result is cached on
    the account (`mailboxVerifiedAt`) and re-checked on assignment.

### 03. Storage

13. The capability is:

    ```
    interface Storage {
      put(key, bytes, contentType): Promise<void>
      get(key): Promise<StoredFile | null>
      delete(key): Promise<void>
    }
    ```

14. `LocalFsStorage` writes under a git-ignored directory and ships for development and the test
    suites. `S3Storage` is the production implementation and is not built in this release.
15. **Fail-fast at boot.** An application starting with `NODE_ENV=production` and a filesystem
    storage provider **must refuse to start**, with a message naming the variable to set. Vercel
    functions get a read-only filesystem except `/tmp`, and `/tmp` does not survive the invocation
    — so the alternative is accepting bookings and silently discarding every CV. This is
    deliberately stricter than the existing `SESSION_SECRET` behaviour, which falls back to a
    development key without complaint.
16. **CVs are served through an authenticated endpoint, never a direct URL.** The API checks the
    session and the interviewer scope, then streams the bytes from whichever provider is
    configured. Presigned URLs remain available later as an optimisation; they are not the security
    model.
17. Storage keys are opaque and application-generated (`{applicationId}{extension}`). A key is
    never derived from user input, and the filesystem implementation additionally rejects any
    character outside `[A-Za-z0-9._-]` before touching the disk.

### 04. Mail

18. **No mail implementation ships in this release.** The only message hiring sends is the
    interview invite, and Microsoft delivers that as a consequence of §02.10.
19. Both parties receive **identical content** — one event, one body. The body therefore carries no
    interviewer-only material beyond the deep link described in
    [02-booking-page.md](02-booking-page.md) §08.
20. When a later release needs to send something that is not an invite, it implements the existing
    `MailService` (user-management `apps/api/src/mail/`). Nothing in hiring should reach for a
    transport directly.

### 05. Failure Behaviour

21. Calendar reads that fail surface as an error state in the consuming control, never as an empty
    availability set — "no times available" and "we could not load times" must not look the same to
    a candidate. See [controls/calendar-control.md](controls/calendar-control.md) §08.
22. Calendar writes that fail abort the booking. No partial booking, no orphaned record, no
    orphaned event — see [02-booking-page.md](02-booking-page.md) §07.
23. Provider errors are logged with the mailbox and the operation, never with candidate personal
    data or CV bytes.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `GRAPH_TENANT_ID` | yes | Azure app registration |
| `GRAPH_CLIENT_ID` | yes | |
| `GRAPH_CLIENT_SECRET` | yes | |
| `STORAGE_PROVIDER` | yes | `fs` \| `s3`. `fs` is rejected at boot in production (§03.15) |
| `STORAGE_FS_ROOT` | when `fs` | git-ignored path |

There is no `HIRING_MANAGER_EMAIL`. The interviewer is a property of the vacancy
([01-vacancies.md](01-vacancies.md) §02).

## Out of Scope

- Per-user delegated OAuth, and any consent or reconnect flow.
- Calendar providers other than Microsoft 365.
- Webhook or subscription-based calendar sync — availability is read on demand.
- Recurring interviews, multi-attendee interviews, meeting-room booking.
- Any mail transport (see §04).

## Test Cases

### TC-H00-UNIT-01: Windows time-zone identifiers translate to IANA
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Translate `"Pacific Standard Time"`.
  2. Translate `"W. Europe Standard Time"`.
  3. Translate `"UTC"`.
  4. Translate an unrecognised identifier.
- **Expected Result:**
  1. `"America/Los_Angeles"`.
  2. `"Europe/Berlin"`.
  3. `"UTC"`.
  4. Falls back to `"UTC"` rather than throwing.

### TC-H00-UNIT-02: Only blocking free/busy statuses become busy intervals
- **Level:** Unit
- **Preconditions:** a schedule response containing one item of each status: `busy`, `tentative`, `oof`, `free`, `workingElsewhere`.
- **Steps:**
  1. Map the response to busy intervals.
- **Expected Result:**
  1. Exactly three intervals are returned — those from `busy`, `tentative`, and `oof`.
  2. The `free` and `workingElsewhere` items are absent, so they cannot remove a slot.

### TC-H00-UNIT-03: Storage keys reject traversal and unexpected characters
- **Level:** Unit
- **Preconditions:** filesystem storage rooted at a temporary directory.
- **Steps:**
  1. Put a file under key `"../../etc/passwd"`.
  2. Put a file under key `"a b/c.pdf"`.
- **Expected Result:**
  1. No file is written outside the configured root.
  2. Disallowed characters are replaced before the path is built; the read-back returns the same bytes.

### TC-H00-INT-01: Production plus filesystem storage refuses to boot
- **Level:** Integration
- **Preconditions:** `NODE_ENV=production`, `STORAGE_PROVIDER=fs`.
- **Steps:**
  1. Start the application.
- **Expected Result:**
  1. Startup fails with an error naming `STORAGE_PROVIDER`.
  2. No HTTP listener is opened — the process does not serve requests in a state where CVs would be lost.

### TC-H00-INT-02: Mailbox resolution decides interviewer eligibility
- **Level:** Integration
- **Preconditions:** a stub calendar provider where `pat@devscribed.com` resolves and `sam@example.com` does not.
- **Steps:**
  1. Resolve both addresses.
- **Expected Result:**
  1. `pat@devscribed.com` returns a mailbox reference and is eligible.
  2. `sam@example.com` returns `null` and is ineligible — no exception, no partial state.

### TC-H00-INT-03: CV download requires a session and the interviewer scope
- **Level:** Integration
- **Preconditions:** an application with a stored CV; callers as `admin`, as the assigned interviewer (`user`), as an unassigned `user`, and unauthenticated.
- **Steps:**
  1. Request the CV as each caller.
- **Expected Result:**
  1. `admin` and the assigned interviewer receive the bytes with the stored content type.
  2. The unassigned `user` receives 404.
  3. The unauthenticated caller receives 401.
  4. No response exposes the underlying storage key or a provider URL.
