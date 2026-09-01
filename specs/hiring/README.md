# Hiring Specifications

Functional specifications for the hiring surface of Devscribed.Admin: open a vacancy, let
candidates book an interview against a real Microsoft 365 calendar, then run the interview and
track the outcome. Each spec is self-contained with requirements, UI, API contracts, and test
cases. Specs use YAML frontmatter (`tags`, `routes`, `api`, `entities`) for discoverability —
grep frontmatter to find relevant specs.

These specs **supersede** the earlier `hiring-process/02-booking-page/` documents. Where the two
disagree, this set wins; the six deliberate departures are recorded below.

## Spec Index

| # | Spec | Design | Tags |
|---|------|--------|------|
| 00 | [Integrations](00-integrations.md) | — | calendar, storage, mail, graph, provider, capability |
| 01 | [Vacancies](01-vacancies.md) | [design](01-vacancies.design.md) | vacancy, interviewer, duration, slug, open-closed, categories |
| 02 | [Booking Page](02-booking-page.md) | [design](02-booking-page.design.md) | public, booking, cv-upload, timezone, availability |
| — | [Calendar Control](controls/calendar-control.md) | — | control, date-grid, month-nav, availability |
| — | [Time Slot Picker](controls/time-slot-picker-control.md) | — | control, slots, 24h, timezone |
| 03 | [Candidate Database](03-candidate-database.md) | [design](03-candidate-database.design.md) | candidates, search, filters, criteria-filter, my-interviews |
| 04 | [Candidate Card](04-candidate-card.md) | [design](04-candidate-card.design.md) | candidate-detail, notes, conclusion, criteria, cv |
| 05 | [Board](05-board.md) | [design](05-board.design.md) | board, kanban, drag-drop, status, position |
| 06 | [Category & Criteria Libraries](06-libraries.md) | [design](06-libraries.design.md) | categories, criteria, autocomplete, archive |
| 07 | [Manage Booking](07-manage-booking.md) | [design](07-manage-booking.design.md) | manage, reschedule, cancel, token, cv-replacement |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Providers are capabilities, never vendors | 00 | 01, 02, 04 |
| `organizationId` on every hiring table, from the first migration | 00 | all |
| Interviewer eligibility = a resolvable tenant mailbox, verified not asserted | 00 | 01 |
| Public slug: `slugify(title)-randomBytes(9).base64url`, globally unique, frozen | 01 | 02 |
| Duration belongs to the vacancy; one booking link per vacancy | 01 | 02 |
| Availability = working hours − blocking events, duration-anchored | 02 | controls/* |
| `Application.status` **is** the board column — one field, not two | 05 | 03, 04 |
| Criteria values live on the Application; filters use latest-per-criterion | 04 | 03, 06 |
| Candidate name is overwritten by the latest booking; `submittedName` is frozen | 02 | 03, 04 |
| Hiring section visible to `admin`/`manager`; interviewers reach only their own vacancies | 01 | 03, 04, 05 |
| Last write wins; no optimistic concurrency (inherited from user-management 04) | 05 | 04 |
| `isCancelled` means the interview did not take place — never a verdict on the candidate | 07 | 04, 05 |
| A reschedule moves the existing application; a rebooking creates a new one | 07 | 02, 05 |
| Nothing hiring writes is ever deleted — CVs included | 00 | 04, 07 |

## Roles & Permission Matrix

The organization's four roles are defined in user-management spec 01. Hiring adds no roles.

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| See the Hiring section | ✅ | ✅ | ❌ | ❌ |
| Create / edit / close vacancies | ✅ | ✅ | ❌ | ❌ |
| Candidate database, boards, move cards | ✅ | ✅ | ❌ | ❌ |
| Manage category / criteria libraries | ✅ | ✅ | ❌ | ❌ |
| Be assigned as interviewer | ✅ | ✅ | ✅ | ❌ |
| My interviews, and cards for own vacancies | ✅ | ✅ | ✅ | ❌ |
| Reschedule / cancel an interview | ✅ | ✅ | ✅ | ❌ |

The last two rows are scoped by **assignment**, not role — they are the only non-uniform
permissions in the set, and they are what lets an engineer interview without becoming an org admin.
Both are enforced by `InterviewerScopeGuard`, which sits beside `OrgScopeGuard` and answers 404
(never 403) for a vacancy the caller does not interview for.

Rescheduling and cancelling therefore need **no new guard and no new role**: an interviewer may move
or call off the interviews they hold, exactly as they may read the cards for them. A third party —
the candidate — acts on the same interview through a token rather than a session, which is
[07 §03](07-manage-booking.md)'s whole subject and belongs to no row in this table.

## Departures from `hiring-process/02-booking-page/`

Recorded so a reader of the earlier documents does not mistake these for oversights.

| Departure | Superseded rule | Why |
|---|---|---|
| Per-vacancy interviewer | `booking-page.md §02.4` — one global hiring manager set in the Admin Dashboard | App-only Graph auth already reaches every mailbox in the tenant; the single address was that spec's own requirement, not a constraint of the auth model. Eligibility is now verified rather than asserted. |
| 12-hour toggle, 24-hour default | `time-slot-picker-control.md §02.6` — *"The 12-hour AM/PM format is not used."* | Candidates are strangers to internal convention. The toggle stops at the public page; admin screens and the event body stay 24-hour. |
| Honest duplicate-booking block | user-management `02 §7` / `TC-02-INT-05` enumeration-safe posture | Reaching this check costs an unguessable link, a name, a slot selection **and** a CV upload — not the cheap oracle a single-field form is. A neutral response would cost every honest candidate their on-page confirmation. See [02 §09](02-booking-page.md). |
| Manage / reschedule / cancel | `manage-booking-page.md`, `reschedule-booking-page.md` | Now specified as [07](07-manage-booking.md). The earlier documents' shape survives — a tokenised per-booking link, cancel with confirmation, unlimited reschedules, CV replacement — but cancellation is a **flag on the application**, not a sixth board column, and a reschedule **moves the existing application** rather than replacing it. |
| Candidate-only content in the calendar event body | `00 §04.19` — both parties receive identical content | With no mail transport, the event body is the only channel that reaches the candidate, so it carries their manage link and the interviewer receives it too. Forced rather than chosen; reverses itself when a transport lands. See [07 §03.15](07-manage-booking.md). |
| One dead-end screen for four different causes | The product's habit of distinguishing "closed", "not found", and "could not load" | A manage link travels in a calendar event both parties hold and can forward. A cancelled booking, a passed one, an unknown token and a malformed one therefore answer identically — security over clarity, in the one place the product makes that trade. See [07 §04.17](07-manage-booking.md). |

Two clauses of the source requirements also resolve differently: the candidate does **not** pick a
position from a list (the link carries it), and duration belongs to the vacancy rather than to the
link, so a vacancy has exactly one booking link. Multiple links per vacancy would imply interview
*rounds*, which the five board columns cannot express.

## Cross-Spec Side Effects

| Trigger | Source | Effect | Target |
|---------|--------|--------|--------|
| Booking submitted | 02 | Candidate upserted by email; name overwritten | 03 |
| Booking submitted | 02 | Application created in `scheduled`, top of the column | 05 |
| Booking submitted | 02 | Calendar event created with the candidate as attendee | 00 |
| Vacancy closed | 01 | Booking link stops accepting; scheduled interviews untouched | 02 |
| Interviewer reassigned | 01 | Availability + new bookings follow the new mailbox; existing events stay | 00, 02 |
| Duration changed | 01 | Future bookings only; scheduled interviews keep their length | 02 |
| Member removal attempted on an assigned interviewer | user-management 04 | **Blocked** until reassignment or closure | 01 |
| Criterion archived | 06 | Drops out of autocomplete; existing values and filters keep working | 03, 04 |
| Category deleted | 06 | Unassigned from every vacancy; vacancies themselves untouched | 01 |
| Booking submitted | 02 | `manageToken` minted; a `booked` scheduling event written | 07 |
| Interview rescheduled | 07 | The application's time moves in place; the card does **not** move column or position | 05 |
| Interview rescheduled | 07 | The calendar event is updated in place; Microsoft sends a meeting-updated notice | 00 |
| Interview cancelled | 07 | `isCancelled` set; the card keeps its column and its assessment, marked with who cancelled | 04, 05 |
| Interview cancelled | 07 | The candidate may book the vacancy again — the duplicate rule already excludes cancelled applications | 02 |
| CV replaced | 07 | The current CV changes; every prior version is retained; the event's attachment is swapped | 00, 04 |
| Interviewer reassigned | 01 | Existing applications keep the interviewer they were booked with, and reschedule against **that** mailbox | 07 |

## Dependency Graph

```
user-management 01 Organization Creation
└─► user-management 02 Authentication & Login
     └─► 00 Integrations
          └─► 01 Vacancies
               ├─► 02 Booking Page
               │    └─► controls/calendar-control · controls/time-slot-picker-control
               ├─► 05 Board
               │    └─► 04 Candidate Card
               │         └─► 03 Candidate Database
               ├─► 06 Category & Criteria Libraries
               └─► 07 Manage Booking          ← needs 02 (public page, slot picker),
                                                04 and 05 (the team's surfaces)
```

## Design Layer

Same split as user-management: business specs own behaviour, API contracts, and validation
messages; a paired `NN-name.design.md` owns visuals and references Teammerly Original DS
(`1_DS for dev/`) by component and token, never by hex value or pixel size. The reskin off the
earlier Meridian prototype is **complete** — every design spec in this set describes blue, and
[`specs/design-system/README.md`](../design-system/README.md) is the decision record behind them,
kept for the reasoning rather than as a checklist.

- **Light theme only** this release, matching user-management. The public booking page follows the
  same rule.
- **Copy ownership** — validation messages belong to the business spec; headings, placeholders,
  hints, and micro-labels belong to the design spec.
- **DS gaps** go into the design system, not into the screen, and every addition to the vendored
  copy is numbered in the [divergence ledger](../design-system/ledger.md). Five of this set's
  surfaces have no counterpart in the shipping product and are therefore *designed, not measured*:
  `BookingLayout` (the public shell — see [02 design](02-booking-page.design.md)), `FileInput`,
  `Calendar`, `BoardCard` and `BoardColumn`.
- **The signed-in shell** — every `/org/{orgId}/hiring/*` route renders inside the existing
  `AppShell` (user-management `00-app-shell.design.md`). The public booking page renders inside
  neither `AppShell` nor `AuthLayout`.

## Test Cases

Embedded in each spec, prefixed **`TC-H*`** so they never collide with user-management's
`TC-01`…`TC-10`. Levels are `UNIT` (Vitest), `INT` (Jest + Supertest against a disposable
Postgres), and `E2E` (Playwright), matching the existing suites.

## Future Improvements

Deliberately not in this release. Recorded here so the design decisions behind them are not
re-litigated from scratch.

| Item | Notes |
|---|---|
| Mail transport | Shipped nothing, again, and for the same reason: Microsoft delivers the invite, the update notice, and the cancellation notice, so hiring still sends no message of its own ([00 §04.18](00-integrations.md)). The first thing that needs a message which is **not** a calendar event builds it — as `MailService`, never as a transport reached for directly. It also unblocks `sendPasswordReset`, which has no working implementation either, so the choice is a platform one rather than a hiring one. |
| A durable manage link | Until mail exists, the candidate's manage link lives only in the calendar event. A candidate who deletes the invite is back to contacting the organization — the exact situation [07](07-manage-booking.md) exists to fix, surviving in one corner. |
| Notifying members who are not the interviewer | The calendar reaches the interviewer and the candidate. A manager watching a board learns of a reschedule by opening it. The product has no notification system and this feature did not justify inventing one — see [07 §12.59](07-manage-booking.md). |
| Rescheduling beyond the booking window | Internal callers are bound by the same today-to-one-month window as candidates, so an interviewer going on leave cannot be moved past it from inside the app. The workaround is to cancel and re-share the link. See [07 §09.44](07-manage-booking.md). |
| A cap on CV replacements | Unlimited, unauthenticated, 10 MB each, and nothing is ever deleted, so storage per booking is unbounded. Same posture as the booking endpoint's missing rate limit — recorded, not defended against. |
| Category merge | Rename cannot fix a duplicate once case-insensitive uniqueness is enforced, so `React` and `ReactJS` will coexist until this lands. Merge is: repoint assignments, delete the source, one confirmation naming the count. |
| Criteria merge | **Skipped permanently, not deferred.** Mapping `Basic/Good/Strong` onto `A1…C2` is a judgement no dialog makes well. Archive covers the real need. |
| Board archiving | After several hiring rounds `Didn't pass` holds dozens of cards. Columns scroll independently until then. |
| Organization logo | `Organization.logoKey` is reserved by 01's migration; the upload needs an org-settings surface that does not exist yet. |
| Migrating scheduled interviews on reassignment | A Graph event cannot move between mailboxes — moving them means cancel, recreate, re-invite. A real operation, not a dropdown side effect. [07](07-manage-booking.md) **routes around** this rather than resolving it: an application records the interviewer it was booked with, and reschedules stay in that mailbox even after the vacancy is reassigned. |
| Rate limiting | Per-IP throttling on the booking POST. See [02 §11](02-booking-page.md) for the exposure this leaves open. |
| Delegated OAuth | Needed the first time an interviewer sits outside the Devscribed tenant. [00](00-integrations.md) is written so this is a new provider, not a rewrite. |
| Multiple interview rounds per vacancy | Would need a `BookingLink` table and a board that understands rounds. |
| Expected criteria per vacancy | Pre-seeding a vacancy's card with the criteria it should be assessed on. |
