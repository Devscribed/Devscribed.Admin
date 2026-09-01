---
id: "07"
title: Manage Booking — Reschedule & Cancel
routes: ["/manage/{slug}/{token}"]
api: ["GET /api/manage/{slug}/{token}", "GET /api/manage/{slug}/{token}/availability", "POST /api/manage/{slug}/{token}/reschedule", "POST /api/manage/{slug}/{token}/cancel", "POST /api/manage/{slug}/{token}/cv", "GET /api/organizations/{orgId}/hiring/applications/{applicationId}/availability", "POST /api/organizations/{orgId}/hiring/applications/{applicationId}/reschedule", "POST /api/organizations/{orgId}/hiring/applications/{applicationId}/cancel"]
entities: [Application, ApplicationScheduleEvent, ApplicationCv]
tags: [public, manage, reschedule, cancel, token, cv-replacement, no-auth, calendar]
depends-on: ["00", "01", "02", "04", "05"]
---

# 07 — Manage Booking

## Summary

An interview can be moved or called off after it is booked, by either side.

The **candidate** does it from a second public page, reached by a per-booking link carried in their
calendar invite. The **team** does it from the candidate card, and from a row of the candidate list.
Both sides get the same two actions, and the candidate can additionally replace the CV they
submitted.

This spec supersedes the deferral recorded in [02 §09.40](02-booking-page.md), which stated that a
candidate who books by mistake "must contact the organization," and in
[05 §07.24](05-board.md), which stated that nothing sets `Application.isCancelled`. Both are now
false; the amendments are listed in the README.

**No mail is introduced.** The release keeps [00 §04.18](00-integrations.md)'s posture: the only
thing hiring sends is the calendar event, and Microsoft's own machinery does every notification —
for a move as well as for a booking. See §12.

## Actors & Preconditions

- **Actors:** the anonymous candidate who holds the manage link; and, inside the app, an `admin`, a
  `manager`, or the account assigned as the vacancy's interviewer.
- **Preconditions:** an application whose `start` is in the future and whose `isCancelled` is false.
  The vacancy's `status` is deliberately **not** a precondition — see §13.

## Functional Requirements

### 01. What cancellation means

1. `Application.isCancelled` means **"this interview did not take place."** It says nothing about
   the candidate's standing in the hiring process, and no screen may present it as a verdict.
2. A cancelled candidate remains a **live applicant**. They may book the same vacancy again, which
   [02 §09](02-booking-page.md)'s duplicate rule already permits by excluding cancelled
   applications from its check.
3. The cancelled card **keeps its board column and every assessment already recorded on it**, marked
   with a badge ([05 §07.23](05-board.md)). It is not moved, not hidden, and not deleted.
4. **Cancellation is never retroactive.** The actions disappear once `start` has passed, and a
   no-show remains what [05 §07.24](05-board.md) always said it was: a drag to `Didn't pass`.
   `isCancelled` is a statement about an interview that will not happen, never a verdict on one that
   did not.
5. Cancelling is **not undoable**. Rebooking produces a new application (§02), not a restoration of
   this one, which is why both sides confirm before it commits (§06, §10).

### 02. What a reschedule is

6. A reschedule **updates the existing `Application` row** — `start`, `end`, and `timeZone` — and
   changes nothing else. Not the status, not the position, not the CV, not the notes, not the
   criteria, not the `submittedName`.
7. This is the whole point. `Application.position` is the hiring manager's own ordering: they
   dragged that card where it sits. A design that cancelled the old row and inserted a new one would
   let a candidate nudging their interview by thirty minutes silently delete that card and re-insert
   it at the top of `Scheduled` — reordering the team's board from outside the building.
8. **Reschedules are unlimited.** Neither side has a counter, a quota, or a cooling-off period.
9. **Rebooking after a cancellation is different, and deliberately so.** It goes through the public
   booking page and creates a **new application**. A reschedule is continuous intent — the same
   interview, a new time, the candidate never left. A rebooking is fresh intent — they walked away
   and came back, possibly weeks later, possibly after the team has formed a view. The two reach the
   product through visibly different doors and behave differently at the end of them.

### 03. The manage link

10. Every application carries a `manageToken`: `randomBytes(16).base64url`, unique, minted at
    booking, frozen for the life of the row, and stored in **plaintext**.
11. Plaintext follows `Vacancy.publicSlug` rather than `PasswordResetToken.tokenHash`, and the
    difference is not an oversight. Hashing protects a credential that grants account access; this
    token addresses one application row, which anyone holding the database already has. Hashing
    would buy nothing and would cost the candidate the ability to reopen a month-old invite.
12. The token has **no expiry of its own**. Access ends when the interview starts (§14). A token
    that died on a timer would strand a candidate whose interview is next month.
13. The manage URL pairs the token with the vacancy's public slug: `/manage/{slug}/{token}`. The
    slug is what lets every not-found state still render the organization's wordmark, the vacancy
    title, and a working "New booking" — see §04.
14. The link reaches the candidate in **the calendar event body**, and by **landing on it**: a
    completed booking navigates here rather than rendering a confirmation of its own
    ([02 §10](02-booking-page.md)). There is no other channel, because the release sends no mail
    (§12). The event body is the durable copy — a candidate who closes the tab still has the link
    in their calendar.

    This replaces an earlier arrangement in which the booking page rendered a confirmation
    carrying the link. That confirmation was component state, so a refresh discarded it and put an
    empty booking form in front of somebody who had already booked.
15. **The interviewer therefore receives the candidate's manage link too**, because one event has
    one body. This is a deliberate departure from [00 §04.19](00-integrations.md), recorded in the
    README. It grants the interviewer no capability they lack — they can already cancel and
    reschedule from the card — and the only real cost is attribution: an action taken through that
    link would be logged as the candidate's (§11). When a mail transport eventually lands, the email
    becomes the carrier, the body link is dropped, and §04.19 is restored without a migration.

### 04. Manage page states

16. The page has exactly **three** renderings:

    | State | What it shows |
    |---|---|
    | **Live** | The booking, its CV, and the Reschedule and Cancel actions |
    | **Just cancelled** | A confirmation of what was just done, and "New booking" |
    | **Everything else** | "We couldn't find your booking." and "New booking" |

16a. The live state may additionally carry a **notice**, of which there are two: the **just-booked
    notice** — "A calendar invite is on its way to the address you gave." — and the **just-moved
    notice** (§05.27). Both are **modifiers on the live state, not a fourth rendering** — they draw
    only where `booking` is non-null, so no flag can make one appear over the blurred screen and
    confirm that a dead token was once real (§04.18). Only one is ever on screen at a time: a move
    supersedes the arrival that preceded it, and two notices stacked over one card would read as
    two things having happened.

    The just-booked notice states the one fact the record cannot state for itself. Everything else the old confirmation
    said — the title, the length, the time, the zone, the name, the email, the CV — is already on
    the card, and repeating it would read as a bug. It matters because the release sends no mail of
    its own (§12), so Microsoft's invite is the only thing the candidate ever receives, and
    somebody who does not know to expect it reads its absence as a failed booking.

    It is also the announcement [02 §12.48](02-booking-page.md) requires. A navigation announces
    nothing on its own — both routes render the same `<h1>` — so this notice carries the success
    into the page's polite live region.

    The notice is carried by a `?booked=1` flag on the URL the booking page navigates to. The flag
    is **bare**: the notice needs the candidate's email and the page already has it from the record
    it fetched, so nothing about the booking travels in a query string. The page **strips the flag
    from the address bar on its first paint**, so what the candidate is left holding is
    byte-identical to the link in their invite — one URL for this booking, not a variant of it in
    their history. A reload therefore shows the record without the notice, which is §04.19's rule
    applied to the other receipt: a receipt for an action, not a state of the record.

17. **"Everything else" is one screen, not four.** A revisited cancellation, a passed interview, a
    token that never existed, and a malformed token are indistinguishable to the visitor. This is
    chosen over clarity on purpose: the manage link travels in a calendar event that both parties
    hold and that can be forwarded onward, so a stale link must not confirm that a particular person
    booked a particular interview and later cancelled it.
18. The blur is enforced **at the API**, not in the client. `GET` answers with `booking: null` for
    every non-live case, and the four causes are indistinguishable in the response as well as on
    screen.
19. The **just-cancelled** confirmation is client-side state immediately after a successful cancel.
    Reloading that same URL yields the blurred screen, which is correct: the confirmation is a
    receipt for an action, not a state of the record.
20. Every state renders the organization wordmark and the vacancy title, because the slug resolves
    even when the token does not. Only an **unknown slug** is a bare `404`, matching
    [02 §02.5](02-booking-page.md).
21. The page **names nobody**, and no file. Not the interviewer, whose name and email
    [02](02-booking-page.md)'s public response already withholds — this is the same public surface
    under a different token. And **not the candidate**: not their name, not their email address,
    and not their CV's filename.

    The candidate's own details were shown here originally, on the reasoning that the page belongs
    to them. The link does not. It rides in a calendar event **both parties hold and can forward
    onward** (§03.15), which is the same fact §04.17 uses to justify blurring a dead link so it
    cannot confirm that a particular person booked an interview and later cancelled it. A live link
    that answered with a full name, an email address and `jane-doe-cv.pdf` gave away strictly more
    than the dead one was being protected from, to whoever the invite reached and whoever they sent
    it on to.

    Withheld **from the response**, not merely unrendered — the same standard this route already
    holds the interviewer's details to. `booking` carries `hasCv`, a boolean, so the page can offer
    a replacement (§07) without naming the document it would replace.
    This costs the candidate one thing, recorded rather than waved away: the page was their only
    chance to notice they had **mistyped their email address**, at the one moment the remedy —
    cancel, then book again — was still in front of them. A typo now sends the invite somewhere they
    will never see, and nothing on screen says so. The exposure withholding buys back is permanent
    and applies to every booking; the typo is rare and already unrecoverable by the time anyone
    notices. Editing an address after booking stays out of scope.

### 05. Candidate reschedule

22. Reschedule opens the same Calendar Control and Time Slot Picker the booking page uses, against
    the same availability rules ([02 §05](02-booking-page.md)).
23. The slot grid is anchored to **the application's own duration** — `end - start` — and never to
    `Vacancy.durationMinutes`. See §13.
24. Availability is read from **the mailbox that holds the event**, which is the interviewer
    recorded on the application, not necessarily the one currently assigned to the vacancy. See §13.
25. **The application's own event is excluded from the busy calculation.** Without this, a candidate
    trying to move thirty minutes later collides with themselves and every nearby slot reads as
    taken.
26. Picking a slot **is** the confirmation. There is no second dialog: a candidate who chose
    Thursday 14:00 does not need to be asked whether they meant Thursday 14:00, and the action is
    reversible at will (§02.8).
27. On success the page returns to the live state showing the new time. The old time is not shown,
    and a **just-moved notice** is drawn where the just-booked one is drawn (§04.16a): "Your
    interview has been moved. An updated calendar invite is on its way."

    A move is the only action on this page that leaves no trace of itself. Cancelling replaces the
    screen; booking arrives on a URL the candidate was not on a moment ago; a move rewrites one
    line of a card they were already looking at, and a candidate who was not watching that line has
    nothing to tell them it landed. The notice is the acknowledgement, and it carries the same fact
    the just-booked one does — an updated invite is coming, which matters because the release sends
    no mail of its own (§12) and Microsoft's update is the only thing the candidate receives.

    Like both other receipts it is client-side state, gone on reload, for §04.19's reason. The
    polite region gets a longer form of it that **names the new time**, because unlike the notice it
    has no card beneath it to lean on.

### 06. Candidate cancel

28. Cancel requires an explicit confirmation naming the interview being called off. It is
    destructive, it notifies the other party, and it cannot be undone (§01.5).
29. The candidate gives **no reason**. Asking a stranger to justify themselves at the moment they are
    withdrawing buys the organization nothing it can act on and costs the candidate something.
30. On success the page shows the just-cancelled confirmation with "New booking" (§04.19).

### 07. CV replacement

31. The candidate may **replace their CV**, from the same page, at any time the booking is live.
    The page states only that one is attached, never its filename (§04.21) — a candidate replacing
    a document knows which one they submitted, and naming it would hand a forwarded link a name
    it otherwise withholds.
32. Replacement is **not gated behind rescheduling**. A candidate who spotted a typo in their CV must
    not have to move their interview to fix it, and a candidate who only wants a different Tuesday
    must not be interrogated about their CV. It is one optional field, present in the live state and
    carried into the reschedule flow, never a precondition of anything.
33. **Nothing is deleted.** Every version submitted is retained as an `ApplicationCv` row, because
    the record is permanent ([04 §07.34](04-candidate-card.md)) and because what the candidate
    submitted at booking is evidence the interviewer may have already read.
34. `Application.cvKey`, `cvFileName`, `cvContentType`, and `cvSizeBytes` continue to hold the
    **current** version, so [00 §03.16](00-integrations.md)'s authenticated CV endpoint and the
    candidate card are untouched.
35. New storage keys are `{cvId}{extension}` rather than `{applicationId}{extension}`, because the
    old shape is a single slot and cannot hold two versions. Both remain opaque and
    application-generated, never derived from user input. Existing files keep the keys they have;
    the migration back-fills one row per application and **moves no files**.
36. The calendar event's attachment is **replaced** with the current CV. Storage is the permanent
    record; the attachment is a convenience copy of what is current.
37. **Internal members still cannot replace or delete a CV.** [04 §07.34](04-candidate-card.md)
    stands for the team. "The candidate corrected their own CV" and "somebody in the organization
    swapped it" are very different facts about a hiring record, and only the first is available.
38. A replacement is visible to the team on the card timeline (§11.47). A CV that changed silently
    between booking and interview, after the interviewer read the first one, is a bad surprise.

### 08. Team surfaces

39. The team's home for both actions is the **candidate card's application section**
    ([04 §04](04-candidate-card.md)), beside the interview facts they change and above the
    scheduling history they write.
40. The **candidate list** ([03](03-candidate-database.md)) carries the same two actions in its
    row menu ([03 §10](03-candidate-database.md)), on a row whose interview still stands. For a
    `user` who interviews, that list — opened on its `Assigned to me` scope — is the whole of
    hiring, and it is the one they actually live on. **Reschedule opens the candidate card with
    the dialog already up** rather than mounting a second copy of the picker: the team never sends
    the candidate's own manage link (§01.5), so the card is the internal door, and a row action
    that merely opened it would be two presses for one intention. **Cancel confirms in the list**,
    in the same dialog the card mounts and over the same endpoint — one component, two hosts.
41. **Neither action appears on the board.** The board expresses pipeline stage. Mixing "move this
    candidate to Passed" with "move this interview to Thursday" on one card conflates two unrelated
    kinds of movement.
42. Both actions are available to `admin`, `manager`, and the **assigned interviewer** — exactly the
    candidate card's existing audience, enforced by the existing `InterviewerScopeGuard` beside
    `OrgScopeGuard`. No new guard, no new role.

### 09. Team reschedule

43. The team picks a new slot from the same availability the candidate would see: same engine, same
    mailbox rule (§05.24), same self-exclusion (§05.25), and **the same booking window**.
44. The window bound is a deliberate simplification. An interview that must move further out than a
    month is a conversation the team is already having with the candidate, and the team can cancel
    and re-share the booking link. Widening the window for internal callers is recorded in the
    README as a known limit rather than built here.
45. **Rescheduling on the candidate's behalf is safe precisely because the candidate holds a manage
    link.** It sets a default, not a decree: if Thursday 16:00 does not work, the candidate opens
    their own link and moves it again. Without §03 this requirement would be rude; with it, it is
    the shortest path to a time that works.

### 10. Team cancel

46. Cancel requires a confirmation naming the candidate and the interview, and offers an **optional
    reason**, at most 500 characters.
47. The reason is carried into the calendar cancellation notice, replacing the fixed string the
    compensating rollback uses today — *"This interview could not be completed and has been
    cancelled"* — which is correct for a failed booking and poor copy for a hiring manager
    cancelling on purpose. With no reason given, the notice states only that the interview has been
    cancelled.
48. The reason is stored on the scheduling event (§11) and shown to the team. It is **not** a
    reason the candidate is asked to accept or dispute.

### 11. Scheduling history

49. Every change is recorded in **`ApplicationScheduleEvent`**, append-only:

    | Field | |
    |---|---|
    | `type` | `booked` · `rescheduled` · `cancelled` |
    | `actor` | `candidate` · `member` |
    | `actorAccountId` | set when `actor = member`, null otherwise |
    | `fromStart` · `toStart` | both set on `rescheduled`; `toStart` only on `booked` |
    | `timeZone` | the zone the acting party was working in |
    | `reason` | team cancellations only (§10.48) |
    | `createdAt` | |

50. A `booked` event is written **at booking**, so the log is the whole story rather than only its
    deviations.
51. **`isCancelled` remains the flag the board queries.** Board and card state is never derived by
    replaying the log. Denormalized state plus an append-only record is the split; re-deriving a
    five-column kanban from an event stream is not.
52. **CV versions are not events.** They live in `ApplicationCv`, which carries a filename, a size,
    and a content type that have no place in an event row. The candidate card **merges both sources
    into one timeline** at render.
53. The history is **team-only**. It appears on the candidate card and nowhere else. The candidate
    already knows what they did, and showing them a tally of their own reschedules reads as a
    reprimand from a page whose entire purpose is to make changing an interview unremarkable.
54. The history renders **collapsed by default** — "Rescheduled twice", expanding to the sequence.
    A candidate who moved five times must not add five permanent lines to a card that is already
    dense enough to have needed collapsible sections.
55. Attribution runs **both ways**. "The team moved this twice" is as much a fact as "the candidate
    did", and the log makes the first as visible as the second.

### 12. Notification

56. **The product sends no mail for any of these actions**, exactly as it sends none for a booking.
    Microsoft notifies both parties: `updateEvent` produces a meeting-updated notice, `cancelEvent`
    produces a cancellation notice. [00 §04.18](00-integrations.md) survives untouched.
57. A reschedule **updates the event in place** via `CalendarProvider.updateEvent`. It is never
    implemented as a cancellation followed by a fresh booking. Doing so would send the candidate a
    notice saying their interview is **cancelled** as the first half of moving it — under §01.1 the
    one message this feature must never send — while also re-uploading the CV attachment every time
    and leaving a tombstone in the interviewer's calendar for every move.
58. The event stays in **the same mailbox**. Nothing here moves an event between mailboxes; that
    remains deferred (README, *Migrating scheduled interviews on reassignment*).
59. **A manager who is not the interviewer is not notified.** The calendar reaches the interviewer
    and the candidate; everybody else learns of a change by opening the board or the card. There is
    no notification system in the product ([04](04-candidate-card.md) *Out of Scope*), and building
    one for this feature would be larger than this feature. The board badge and the card timeline
    are the whole answer, and this is recorded rather than solved.

### 13. When the world changed since booking

60. **The vacancy has been closed.** Both actions stay available and the manage page renders as
    live. Closing means "stop accepting new applicants"
    ([01](01-vacancies.md) cross-spec rule: *scheduled interviews untouched*); it is not a decision
    to renege on interviews already granted. A team that wants those gone has an explicit cancel
    button. After a cancellation on a closed vacancy, "New booking" lands on the closed-vacancy page
    ([02 §02.6](02-booking-page.md)) — the correct dead end, and an honest one.
61. **The vacancy's duration has changed.** The interview keeps the length it was booked at, per
    [01](01-vacancies.md)'s *future bookings only* rule. The slot grid is generated from
    `end - start` (§05.23).
62. **The interviewer has been reassigned.** The reschedule stays with the interviewer the
    application was booked with, whose mailbox holds the event. Silently moving a candidate to a
    stranger is a larger change than the one they came to make, and moving the event to the new
    mailbox is the deferred migration named in §12.58.
63. Requirement 62 needs a fact the schema did not previously record, so `Application` gains
    **`interviewerAccountId`**, stamped at booking. This additionally corrects a pre-existing defect:
    the candidate card resolves the interviewer live through `vacancy.interviewer`, so reassigning a
    vacancy today retroactively rewrites the interviewer shown on every past application, including
    interviews somebody else actually conducted.

    The migration back-fills it from each vacancy's **current** interviewer, which is the only
    answer available — and is wrong for any application booked before a reassignment that already
    happened. That history was never recorded and cannot be recovered. The column fixes the defect
    from its migration forward, and the limitation is stated here rather than discovered later by
    somebody who trusts the column further back than it goes.
64. **The original mailbox no longer resolves.** This is an availability failure, not a closed
    vacancy and not a missing booking: the page shows the controls' error state with a retry
    ([00 §05.21](00-integrations.md)), and the team resolves it.

### 14. Timing

65. There is **no lead-time cutoff** on either action, for either party. One rule governs both:
    `start > now`.
66. Booking itself has no minimum lead time — [02 §11](02-booking-page.md) records that every slot
    from now to the end of the window is bookable. A cutoff on cancelling but not on booking would be
    incoherent: a candidate could take a slot ten minutes out and then be told it is too late to
    release it.
67. **A late cancellation is strictly better than a no-show.** Forbidding it does not produce
    attendance; it produces an interviewer sitting alone in a meeting. The rule that returns the most
    interviewer time is the permissive one. The cost — a cancellation sixty seconds out that nobody
    reads in time — is smaller than the no-show it replaces.
68. Once `start` has passed the manage page blurs to §04's third state and the team's actions
    disappear from the card and from the candidate list.

### 15. Abuse exposure

69. Everything [02 §11](02-booking-page.md) says about the booking endpoint applies here: these
    routes are unauthenticated, unthrottled, and protected only by an unguessable token.
70. This spec adds one exposure. **CV replacement is unlimited**, so a holder of one manage link can
    upload 10 MB repeatedly, without authentication, and nothing is ever deleted (§07.33). Storage
    per booking is therefore unbounded. Recorded, deliberately, in the same posture as §11 — a
    per-IP limit on these POSTs is the mitigation when one is wanted, and nothing here should be read
    as claiming the endpoints are protected.
71. The token's 128 bits are twice the slug's 72, because it guards one named person's booking rather
    than a page meant to be shared, and because no rate limit stands behind it.

### 16. Responsiveness & Accessibility

72. The manage page inherits [02 §12](02-booking-page.md) in full: the calendar and slot picker keep
    their own accessibility contracts, the body never scrolls horizontally, and every state change is
    announced through a polite live region.
73. Both confirmations are real dialogs — focus trapped, `Escape` closes, focus returns to the
    invoking control — and the destructive action is never the initially focused one.

## Screens

### Manage page — live booking

Arrived at from the invite, straight from a completed booking, or straight from a move made on
this page — in the latter two cases the notice above the panel is drawn, in its booked or its moved
wording, and the next reload clears it (§04.16a, §05.27).

```
┌─────────────────────────────────────────────────────────────────┐
│                        Teammerly●                               │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ℹ  A calendar invite is on its way to the address you    │  │
│  │     gave.                                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│                  Senior React Engineer                          │
│                       60 minutes                                │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  YOUR INTERVIEW                                           │  │
│  │                                                           │  │
│  │  Tuesday, 25 August 2026 at 14:00                         │  │
│  │  (UTC+03:00) Minsk                                        │  │
│  │                                                           │  │
│  │  CV attached                    [ Replace ]               │  │
│  │                                                           │  │
│  │        [ Reschedule ]      [ Cancel interview ]           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Manage page — rescheduling

```
┌─────────────────────────────────────────────────────────────────┐
│                        Teammerly●                               │
│                  Senior React Engineer                          │
│                                                                 │
│   Currently Tuesday, 25 August 2026 at 14:00                    │
│                                                                 │
│  ┌── DATE ──────────────┐   ┌── TIME ──────────────────────┐   │
│  │   ‹  August 2026  ›  │   │ Thursday, 27 August 2026     │   │
│  │   M  T  W  T  F  S  S│   │ ┌──────┐ ┌──────┐ ┌──────┐   │   │
│  │  24 25 26[27]28 29 30│   │ │ 09:00│ │ 10:00│ │ 16:00│   │   │
│  └──────────────────────┘   └──────────────────────────────┘   │
│    🌐 (UTC+03:00) Minsk  ▾          24h ●━━ 12h                │
│                                                                 │
│              [ Keep current time ]  [ Move interview ]          │
└─────────────────────────────────────────────────────────────────┘
```

### Manage page — just cancelled

```
┌─────────────────────────────────────────────────────────────────┐
│                        Teammerly●                               │
│                  Senior React Engineer                          │
│                                                                 │
│   ⚠  Your interview has been cancelled.                         │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    [   New booking   ]                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Manage page — everything else

```
┌─────────────────────────────────────────────────────────────────┐
│                        Teammerly●                               │
│                  Senior React Engineer                          │
│                                                                 │
│   ⚠  We couldn't find your booking.                             │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    [   New booking   ]                    │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Candidate card — application section, team actions

```
┌───────────────────────────────────────────────────────────────┐
│  Senior React Engineer · 60 minutes            [Scheduled ▾]  │
│  Tue 25 Aug 2026, 14:00 Europe/Minsk · Pat Silva              │
│                                                               │
│     [ Reschedule ]   [ Cancel ]                               │
│                                                               │
│  ▸ Rescheduled twice · booked 12 Aug                          │
│                                                               │
│  CV: jane-doe-cv.pdf (240 KB)          [ View ] [ Download ]  │
└───────────────────────────────────────────────────────────────┘
```

### Candidate card — history expanded

```
│  ▾ Scheduling history                                         │
│     25 Aug 14:00  ← 24 Aug 11:00   Jane Doe        22 Aug     │
│     24 Aug 11:00  ← 21 Aug 09:00   Pat Silva       19 Aug     │
│     CV replaced · jane-doe-cv-v2.pdf               18 Aug     │
│     Booked  21 Aug 09:00           Jane Doe        12 Aug     │
```

## Flows

### Main flow: the candidate moves their interview

1. Candidate opens `/manage/{slug}/{token}` from the invite.
2. System resolves the token, confirms the interview is live, and renders it.
3. Candidate presses Reschedule; the calendar and slot list load against the application's duration,
   the booked interviewer's mailbox, and the booking window, with the application's own event
   excluded from the busy calculation.
4. Candidate picks a date and a time and presses Move interview.
5. System re-checks that the slot was offered and is free, updates the calendar event in place, then
   writes the new time and a `rescheduled` event in one transaction.
6. Page returns to the live state showing the new time, under a notice confirming the move.
   Microsoft sends both parties a meeting-updated notice.

### Main flow: the candidate cancels

1. Steps 1–2 as above.
2. Candidate presses Cancel interview and confirms.
3. System cancels the calendar event, then in one transaction sets `isCancelled` and writes a
   `cancelled` event with `actor: "candidate"`.
4. Page shows the just-cancelled confirmation. Microsoft sends the cancellation notice.
5. Reloading the URL now yields the blurred state.

### Main flow: the team cancels

1. Member opens the candidate card.
2. Member presses Cancel, optionally gives a reason, and confirms.
3. System cancels the event with the reason in the notice, then writes `isCancelled` and a
   `cancelled` event with `actor: "member"` and the acting `actorAccountId`.
4. The card renders the cancelled badge; the board card does the same on next load.

### Alt flow: the slot was taken between selection and submission

- Step 5 fails re-validation. The slot is removed from the list, the selection is cleared, and the
  visitor picks another time. **The existing booking is untouched** — nothing is cancelled in order
  to attempt a move.

### Alt flow: the calendar cannot be reached

- Availability renders the controls' error state with a retry; Move interview stays disabled.
  A failure during the write returns `503` and changes nothing.

### Alt flow: the database write fails after the calendar succeeded

- The request returns `503` and logs the divergence. **Both operations are idempotent**: a retry
  re-issues the same update or the same cancellation — a calendar that reports the event already
  cancelled is treated as success — and then completes the write. No compensating "un-cancel" is
  attempted, because a notification cannot be recalled.

### Alt flow: the visitor's interview has already started

- Step 2 answers `booking: null`. The blurred state renders. No action is offered and none is
  reachable by calling the API directly.

## API Contracts

### GET /api/manage/{slug}/{token}

Public. Response `200`:

```json
{
  "organizationName": "Devscribed",
  "vacancy": { "title": "Senior React Engineer", "durationMinutes": 60, "status": "open" },
  "booking": {
    "startUtc": "2026-08-25T11:00:00.000Z",
    "durationMinutes": 60,
    "timeZone": "Europe/Minsk",
    "hasCv": true
  }
}
```

- `booking` is `null` for **every** non-live case — cancelled, passed, unknown token, malformed
  token — and the four are indistinguishable in the response (§04.18).
- `durationMinutes` on `booking` is the application's own length, which may differ from the
  vacancy's (§13.61).
- **No person is named.** The interviewer's name and email are absent, as they are from
  [02](02-booking-page.md)'s public response — and so are the candidate's own name, email and CV
  filename (§04.21). `hasCv` says a CV is on file without saying which.
- `404` only for an unknown **slug**.

### GET /api/manage/{slug}/{token}/availability

Public. Query params as [02](02-booking-page.md): `timeZone` required, `month` optional. Response is
byte-for-byte the shape of `GET /api/book/{slug}/availability`, generated against the application's
duration, the booked interviewer's mailbox, and with the application's own event excluded.

- `404` when `booking` would be `null`.
- `503` `{ "error": "availability_unavailable" }` when the calendar cannot be reached.

### POST /api/manage/{slug}/{token}/reschedule

Public. `application/json`: `{ "startUtc": "…", "timeZone": "…" }`.

Success `200` — the same body as `GET`, carrying the new time.

Errors:
- `404` — not live.
- `409` `{ "error": "slot_taken", "message": "That time was just booked. Please choose another." }`
- `422` `{ "error": "validation", "fields": { "startUtc": "Choose a time" } }`
- `400` `{ "error": "invalid_time_zone" }`
- `503` `{ "error": "reschedule_failed", "message": "We couldn't move your interview. Please try again." }`

### POST /api/manage/{slug}/{token}/cancel

Public. No body.

Success `200`:
```json
{ "organizationName": "Devscribed",
  "vacancy": { "title": "Senior React Engineer", "status": "open" },
  "cancelled": true }
```

- `404` — not live. Cancelling an already-cancelled booking is not an error the visitor can
  distinguish from a bad token.
- `503` `{ "error": "cancel_failed", "message": "We couldn't cancel your interview. Please try again." }`

### POST /api/manage/{slug}/{token}/cv

Public. `multipart/form-data`: `cv`.

Success `200` — the same body as `GET`. The response does not name the file that was just
uploaded, for the same reason `GET` does not (§04.21); `hasCv` is all it carries about the CV.

Errors: `404`; `422` `{ "error": "validation", "fields": { "cv": "…" } }` using
[02](02-booking-page.md)'s CV rules unchanged; `503`
`{ "error": "cv_replace_failed", "message": "We couldn't replace your CV. Please try again." }`

### GET /api/organizations/{orgId}/hiring/applications/{applicationId}/availability

`SessionGuard` + `OrgScopeGuard` + `InterviewerScopeGuard`. Same response shape and same generation
rules as the public availability route. `404` — never `403` — for an application the caller may not
see, matching the guard's existing posture.

### POST /api/organizations/{orgId}/hiring/applications/{applicationId}/reschedule

Same guards. Body `{ "startUtc": "…", "timeZone": "…" }`. Success `200` with the updated application
as the candidate card already shapes it. Errors as the public reschedule route, plus `404` for an
application outside the caller's scope.

### POST /api/organizations/{orgId}/hiring/applications/{applicationId}/cancel

Same guards. Body `{ "reason": "…" }` — optional, at most 500 characters. Success `200` with the
updated application. Errors as the public cancel route.

## Validation Rules

1. **`token`** — must match an application exactly. Any mismatch, and every non-live application,
   answers identically (§04.18).
2. **`startUtc`** — must be one of the currently generated slots for this application: a working
   day, inside working hours, on the application's own duration anchor, within the booking window,
   and not in the past. A start that was never offered is `slot_taken`, never accommodated.
3. **`startUtc`** equal to the current start is accepted and is a no-op: the calendar is not touched
   and no `rescheduled` event is written. Moving an interview to the time it already has is not a
   reschedule.
4. **`timeZone`** — a valid IANA identifier. Machine-supplied, so an invalid one is `400`, not a
   candidate-facing message.
5. **CV** — unchanged from [02](02-booking-page.md): extension in `.pdf`, `.doc`, `.docx`, `.rtf`,
   `.txt`; larger than zero and at most 10 MB.
6. **`reason`** — optional, trimmed, at most 500 characters. Team cancellations only.
7. `Application.start` must be in the future and `isCancelled` false at the moment of submission,
   re-checked server-side on every action.
8. `Vacancy.status` is **not** validated. A closed vacancy changes nothing here (§13.60).

## Error Messages

| Context | Message |
|---|---|
| Just booked | "A calendar invite is on its way to the address you gave." |
| Just moved | "Your interview has been moved. An updated calendar invite is on its way." |
| Just moved — announced, not drawn | "Your interview has been moved to {date} at {time}." |
| Booking not resolvable — any cause | "We couldn't find your booking." |
| Just cancelled | "Your interview has been cancelled." |
| Slot taken | "That time was just booked. Please choose another." |
| No time selected | "Choose a time" |
| Reschedule failed | "We couldn't move your interview. Please try again." |
| Cancel failed | "We couldn't cancel your interview. Please try again." |
| CV replace failed | "We couldn't replace your CV. Please try again." |
| Availability failed | "We couldn't load available times. Try again." |
| Cancel confirmation — candidate | "Cancel your interview on {date} at {time}? This can't be undone." |
| Cancel confirmation — team | "Cancel {candidateName}'s interview on {date} at {time}? The candidate is notified by Microsoft. Notes and conclusion are kept." |
| Reason too long | "Please keep this under 500 characters" |
| Unknown link | "This link doesn't lead anywhere." |

CV validation messages are [02](02-booking-page.md)'s and must match its table exactly.

## UI Notes

- Reschedule and Cancel are absent — not disabled — once `start` has passed. A disabled control
  invites a reader to work out why.
- Cancel is a `danger` action on both sides; Reschedule is secondary. Neither is the primary action
  of the live state, which has none: the page's default posture is that nothing needs to change.
- The team's actions sit in the application section's header row, never inside the notes area, so a
  destructive control is never adjacent to a field that autosaves.
- Required `data-testid` attributes:
  - `manage-page`, `manage-org-wordmark`, `manage-vacancy-title`, `manage-duration`
  - `manage-booked`, `manage-moved`
  - `manage-booking-when`, `manage-booking-zone`, `manage-cv-present`
  - `manage-reschedule-button`, `manage-cancel-button`, `manage-cv-replace-input`
  - `manage-reschedule-submit`, `manage-reschedule-cancel`, `manage-current-time`
  - `manage-cancel-dialog`, `manage-cancel-confirm`, `manage-cancel-dismiss`
  - `manage-cancelled`, `manage-not-found`, `manage-new-booking-button`
  - `manage-error-banner`
  - `application-reschedule-{applicationId}`, `application-cancel-{applicationId}`
  - `application-cancel-reason-{applicationId}`, `application-cancel-confirm-{applicationId}`
  - `application-history-{applicationId}`, `application-history-toggle-{applicationId}`
  - `application-history-entry-{eventId}`
  - control test ids are owned by the control specs.

## Out of Scope

- **Any mail.** No transport, no templates, no message of our own — see §12.
- Notifying members who are not the interviewer — §12.59.
- Moving an event between mailboxes when a vacancy is reassigned — §13.62.
- Rescheduling beyond the booking window from inside the app — §09.44.
- Rate limiting, CAPTCHA, or a cap on CV replacements — §15.
- Undo of a cancellation; rebooking is a new application — §01.5.
- Retroactive cancellation of a past interview — §01.4.
- A team-side CV replacement — §07.37.
- A candidate-facing view of the scheduling history — §11.53.
- Editing a name, email, or note after booking. The booking's `submittedName` is frozen by
  [02](02-booking-page.md) and stays frozen.
- Changing the interview's duration or its interviewer from either side.

## Test Cases

### TC-H07-UNIT-01: A reschedule preserves everything except the time
- **Level:** Unit
- **Preconditions:** an application in `maybe`, position 3000, with interview notes, a conclusion, and two criteria assessed.
- **Steps:**
  1. Apply a reschedule to a new start.
- **Expected Result:**
  1. `start`, `end`, and `timeZone` change.
  2. `status`, `position`, `submittedName`, `cvKey`, `note`, `interviewNotes`, `conclusion`, and both assessments are byte-identical.
  3. No new `Application` row exists.

### TC-H07-UNIT-02: Slot generation uses the application's duration, not the vacancy's
- **Level:** Unit
- **Preconditions:** an application booked at 60 minutes; the vacancy has since been changed to 30.
- **Steps:**
  1. Generate reschedule slots for a working day 09:00–17:00.
- **Expected Result:**
  1. Eight 60-minute slots, `09:00 … 16:00` — the vacancy's current 30 is not used anywhere.

### TC-H07-UNIT-03: The application's own event does not block its own reschedule
- **Level:** Unit
- **Preconditions:** working hours 09:00–17:00; the only busy block is this application's own 14:00–15:00 event.
- **Steps:**
  1. Generate reschedule slots for that day.
- **Expected Result:**
  1. `14:00` is offered. Every other slot is offered. The candidate does not collide with themselves.

### TC-H07-UNIT-04: Rescheduling to the current start is a no-op
- **Level:** Unit
- **Steps:**
  1. Submit a reschedule whose `startUtc` equals the application's current start.
- **Expected Result:**
  1. Accepted. No calendar call is made and no `rescheduled` event is written.

### TC-H07-INT-01: Every non-live cause answers identically
- **Level:** Integration
- **Preconditions:** four requests against one vacancy — a cancelled application's token, a passed application's token, a well-formed token matching nothing, and `not-a-token`.
- **Steps:**
  1. `GET` each.
- **Expected Result:**
  1. All four return `200` with `booking: null` and identical bodies apart from nothing.
  2. The organization name and vacancy title are present in all four.
  3. No response distinguishes the causes by status, body, or timing class.

### TC-H07-INT-02: Cancelling flags the application and leaves the board alone
- **Level:** Integration
- **Preconditions:** an application in `maybe` at position 2000 with one criterion assessed.
- **Steps:**
  1. `POST /cancel` with the candidate's token.
  2. Read the board.
- **Expected Result:**
  1. `isCancelled` is true; `status` is still `maybe`; `position` is still 2000; the assessment survives.
  2. The card is in `Maybe`, marked cancelled, not moved and not removed.
  3. One `cancelled` event exists with `actor: "candidate"` and a null `actorAccountId`.

### TC-H07-INT-03: A cancelled application does not block rebooking
- **Level:** Integration
- **Steps:**
  1. Cancel an application.
  2. Book the same vacancy again with the same email through `POST /api/book/{slug}`.
- **Expected Result:**
  1. The booking succeeds — no `already_booked`.
  2. Two applications exist for that candidate and vacancy: one cancelled, one `scheduled`.
  3. The cancelled one keeps its column and its assessment.

### TC-H07-INT-04: Reschedule updates the event rather than replacing it
- **Level:** Integration
- **Steps:**
  1. Reschedule an application.
- **Expected Result:**
  1. `updateEvent` was called once; `cancelEvent` and `createEvent` were not called at all.
  2. `Application.graphEventId` is unchanged.
  3. The CV attachment was not re-uploaded.

### TC-H07-INT-05: A closed vacancy still permits both actions
- **Level:** Integration
- **Preconditions:** an application on a vacancy whose status is `closed`.
- **Steps:**
  1. `GET` the manage route.
  2. Reschedule.
  3. Cancel.
- **Expected Result:**
  1. `booking` is present; `vacancy.status` reads `closed`.
  2. Both actions succeed.
  3. `GET /api/book/{slug}` still refuses new bookings, so "New booking" reaches the closed state.

### TC-H07-INT-06: Reschedule follows the booked interviewer, not the current one
- **Level:** Integration
- **Preconditions:** an application booked with Pat; the vacancy has since been reassigned to Sam.
- **Steps:**
  1. Request reschedule availability.
  2. Reschedule.
- **Expected Result:**
  1. Availability was read from **Pat's** mailbox.
  2. The event was updated in **Pat's** mailbox; Sam's mailbox was never addressed.
  3. `Application.interviewerAccountId` still names Pat.

### TC-H07-INT-07: A past interview is unreachable from either side
- **Level:** Integration
- **Preconditions:** an application whose `start` is one minute in the past.
- **Steps:**
  1. `GET` the manage route.
  2. `POST /reschedule` directly.
  3. `POST /cancel` directly, as an admin, on the authenticated route.
- **Expected Result:**
  1. `booking: null`.
  2. `404`.
  3. `404`. There is no retroactive cancellation from any surface.

### TC-H07-INT-08: CV replacement keeps every version
- **Level:** Integration
- **Steps:**
  1. Replace a `.pdf` CV with a `.docx`.
- **Expected Result:**
  1. Two `ApplicationCv` rows exist; both files are still in storage.
  2. `Application.cvKey`, `cvFileName`, `cvContentType`, and `cvSizeBytes` name the `.docx`.
  3. The authenticated CV endpoint serves the `.docx`.
  4. The calendar event's attachment is the `.docx`.

### TC-H07-INT-09: A team cancellation is attributed and carries its reason
- **Level:** Integration
- **Steps:**
  1. Cancel as a manager with the reason "Role filled internally."
- **Expected Result:**
  1. The `cancelled` event has `actor: "member"`, the manager's `actorAccountId`, and the reason.
  2. The reason was passed to `cancelEvent` as the notice comment.
  3. The candidate-facing surfaces never render the reason.

### TC-H07-INT-10: Slot contention leaves the existing booking intact
- **Level:** Integration
- **Preconditions:** the target slot becomes busy between the availability read and the submit.
- **Steps:**
  1. `POST /reschedule` at that slot.
- **Expected Result:**
  1. `409 slot_taken`.
  2. `start`, `end`, and `graphEventId` are unchanged — nothing was cancelled in order to attempt a move.
  3. No `rescheduled` event was written.

### TC-H07-INT-11: An interviewer may act; a member with no assignment may not
- **Level:** Integration
- **Preconditions:** a `user` assigned as the vacancy's interviewer; a second `user` assigned nothing.
- **Steps:**
  1. Both call the authenticated reschedule route.
- **Expected Result:**
  1. The assigned interviewer succeeds.
  2. The unassigned member gets `404`, never `403`.

### TC-H07-INT-12: A calendar failure changes nothing
- **Level:** Integration
- **Preconditions:** `updateEvent` is armed to fail.
- **Steps:**
  1. `POST /reschedule`.
- **Expected Result:**
  1. `503 reschedule_failed`.
  2. `start`, `end`, and `graphEventId` are unchanged; no `rescheduled` event exists.

### TC-H07-INT-13: The migration back-fills every application that predates it
- **Level:** Integration
- **Preconditions:** three applications created before this release — two on one vacancy, one on another whose interviewer has since been reassigned.
- **Steps:**
  1. Run the migration.
  2. Read all three applications and the scheduling log.
- **Expected Result:**
  1. Every application has a `manageToken`; all three differ; each resolves its own application and no other.
  2. Every application has an `interviewerAccountId` naming its vacancy's **current** interviewer — including the reassigned one, whose original interviewer is unrecoverable and is documented as such (§13.63).
  3. Exactly one `booked` event exists per application, with `actor: "candidate"`, a null `actorAccountId`, `toStart` equal to the application's `start`, and the application's `timeZone`.
  4. No application has more than one `booked` event, and re-running the migration adds none.

### TC-H07-INT-14: The CV back-fill moves no files
- **Level:** Integration
- **Preconditions:** two applications with CVs stored under the old `{applicationId}{extension}` keys; one application with no CV.
- **Steps:**
  1. Run the migration.
  2. Read every `ApplicationCv` row and fetch each CV through the authenticated endpoint.
- **Expected Result:**
  1. One `ApplicationCv` row per application **that has a CV** — two rows, not three.
  2. Each row's `key` is byte-identical to the `Application.cvKey` it was built from; no key was rewritten to the `{cvId}` shape.
  3. Both files are still readable at their original keys, with their original bytes and content types. Nothing was copied, renamed, or deleted.
  4. A CV replaced **after** the migration writes a new row under a `{cvId}{extension}` key, and the original row and its file both remain.

### TC-H07-INT-15: An application booked before this release is fully manageable
- **Level:** Integration
- **Preconditions:** an application created before the migration, with a future start.
- **Steps:**
  1. `GET` its manage route using the back-filled token.
  2. Reschedule it.
  3. Cancel it.
- **Expected Result:**
  1. `booking` is present and carries the correct time, duration, and CV filename.
  2. The reschedule succeeds and reads availability from the back-filled `interviewerAccountId`'s mailbox.
  3. The cancellation succeeds, and the scheduling log reads `booked` → `rescheduled` → `cancelled` in order despite the first entry having been manufactured by the migration.

### TC-H07-E2E-01: A candidate moves their interview
- **Level:** E2E
- **Steps:**
  1. Open the manage link, press Reschedule, pick another date and time, press Move interview.
- **Expected Result:**
  1. The page returns to the live state naming the new time and zone, under a notice confirming the
     move.
  2. Reloading shows the new time, and no notice — it is a receipt for an action, not a state of the
     record.
  3. The candidate card shows the new time and a history entry reading old → new, attributed to the candidate.

### TC-H07-E2E-02: A candidate cancels, then books again
- **Level:** E2E
- **Steps:**
  1. Open the manage link, press Cancel interview, confirm.
  2. Reload the same URL.
  3. Press New booking and book a new slot.
- **Expected Result:**
  1. "Your interview has been cancelled." with New booking.
  2. "We couldn't find your booking." — the confirmation is not a state of the record.
  3. The new booking succeeds; the board shows a cancelled card in its original column and a fresh card at the top of `Scheduled`.

### TC-H07-E2E-03: The interviewer reschedules from their own candidate
- **Level:** E2E
- **Steps:**
  1. As the assigned interviewer, open `Candidates → Assigned to me`, open the candidate, and reschedule the application.
- **Expected Result:**
  1. The application section shows the new time without a reload of the page.
  2. The scheduling history attributes the move to that member by name.

### TC-H07-E2E-04: Scheduling history is team-only and collapsed
- **Level:** E2E
- **Preconditions:** an application rescheduled twice, with one CV replacement.
- **Steps:**
  1. Open the candidate card.
  2. Expand the history.
  3. Open the manage page as the candidate.
- **Expected Result:**
  1. A single collapsed summary line, not four rows.
  2. Expanded: both moves, the CV replacement, and the original booking, newest first, each attributed.
  3. The manage page shows no history of any kind.
