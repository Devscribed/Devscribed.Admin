---
id: "04"
title: Candidate Card
routes: ["/org/{orgId}/hiring/candidates/{candidateId}"]
api: ["GET /api/organizations/{orgId}/hiring/candidates/{candidateId}", "PATCH /api/organizations/{orgId}/hiring/applications/{applicationId}", "PUT /api/organizations/{orgId}/hiring/applications/{applicationId}/criteria/{criterionId}", "DELETE /api/organizations/{orgId}/hiring/applications/{applicationId}/criteria/{criterionId}", "GET /api/organizations/{orgId}/hiring/applications/{applicationId}/cv"]
entities: [Candidate, Application, ApplicationCriterion]
tags: [candidate-detail, notes, conclusion, criteria, cv, autosave, interviewer-scope]
depends-on: ["01", "02", "05", "06"]
---

# 04 — Candidate Card

## Summary

One page per candidate, and the page the team works on **during** an interview: the candidate's own
details and CV on the left of the work, and on the right the things the team writes — interview
notes, a conclusion, and criteria assessments.

A candidate may have applied to more than one vacancy. The card shows a section per application;
in the common case there is exactly one. Everything the team writes belongs to an **application**,
not to the person, because it was formed in a specific interview by a specific interviewer.

This is the page the calendar invite links to ([02 §08.31](02-booking-page.md)), which is why it is
a real route and not a modal over the board.

## Actors & Preconditions

- **Actors:** `admin` and `manager` see every candidate. A `user` who is the assigned interviewer
  on at least one of that candidate's applications sees the candidate — and **only** the
  application sections for vacancies they interview for.
- **Preconditions:** a candidate in the caller's organization.

## Functional Requirements

### 01. Access

1. `admin` and `manager` may open any candidate in their organization and edit every application
   section.
2. A `user` may open a candidate only when they are the assigned interviewer on at least one of
   that candidate's applications. They see **only** those application sections; sections for other
   vacancies are absent from the response, not merely hidden in the UI.
3. `viewer` has no access at all.
4. A candidate the caller may not see returns **404**, never 403 — a permission error would confirm
   that the candidate exists.
5. Opening the deep link while signed out routes through sign-in first, then lands on the requested
   candidate, subject to the same rules.
6. An unknown candidate id shows the not-found state and reveals nothing.
7. `?application={applicationId}` opens the page with that application's section expanded and
   scrolled into view — this is the form the calendar invite uses.

### 02. Candidate Information

8. The card shows the candidate's **first name, last name, email**, and when they first appeared in
   the database.
9. These fields are **read-only**. They are what the candidate told us; the internal screens do not
   edit them. The name shown is the current one, which the latest booking overwrote
   ([02 §07.27](02-booking-page.md)).
10. When an application's `submittedName` differs from the candidate's current name, the
    application section shows it as "Applied as {submittedName}" — so a record of what actually went
    into that invite stays visible.

### 03. Per Application

11. Each application section shows, read-only:
    - The **vacancy** title, linking to it, and the interview **length**.
    - The interview **date and time**, in the viewing member's zone (`Account.timezone`, falling
      back to the interviewer's mailbox zone), with the zone named, plus the zone the candidate
      booked in when it differs.
    - The **interviewer**.
    - The candidate's **Note**, if they left one.
    - The **status**, which is the board column ([05](05-board.md)).
    - The cancelled mark, when set.
12. And editable:
    - **Interview notes** (§04).
    - **Conclusion** (§04).
    - **Criteria** (§05).
    - **Status** (§06).
13. Sections are ordered by interview date, most recent first.

### 04. Interview Notes & Conclusion

14. Two independent plain-text fields per application:
    - **Interview notes** — written live during the call.
    - **Conclusion** — the outcome, and the reason when someone did not pass.
15. Both are **plain text**. Rich formatting is not what is missing during an interview.
16. Both **autosave** roughly two seconds after typing stops, and both also offer an explicit
    **Save**. A "Saved 14:32" indicator shows the last successful write.
17. Autosave alone is the right default for someone typing during a live conversation who will
    forget to save; the visible indicator and the explicit button exist because silent autosave
    leaves people unsure whether it took.
18. Both are **shared, not per-author** — one field every permitted member sees and edits, last
    write wins. Per-author timestamped entries are a different product, and one person is on the
    call.
19. A failed save never discards the text in the editor. The indicator switches to an error with a
    retry, and the content stays.
20. Both are **internal**. Neither is ever shown to a candidate or included in any candidate-facing
    page or email.

### 05. Criteria

21. Criteria are assessments recorded against **this application**: a criterion from the org-wide
    library ([06](06-libraries.md)) plus a value.
22. **Add criterion** offers an autocomplete over the library's non-archived criteria. Selecting one
    reveals the value control for its type:

    | Type | Value control | Stored as |
    |---|---|---|
    | `scale` | select over the criterion's ordered values | `valueId` |
    | `boolean` | yes/no | `valueBool` |
    | `number` | numeric input | `valueNumber` |
    | `text` | free text, at most 500 characters | `valueText` |

23. Exactly one value column is populated, and it must match the criterion's type. This is enforced
    by a database constraint, so every filter in [03](03-candidate-database.md) stays a plain
    indexed comparison rather than a JSON cast.
24. A criterion may be assessed **at most once per application**. Re-adding one already present
    edits the existing value.
25. A criterion may be **removed** from an application, which deletes that assessment. Removing an
    assessment does not touch the criterion in the library.
26. A criterion not yet in the library can be created from here, through the same inline flow as
    [06 §04](06-libraries.md) — including defining its type and, for a scale, its ordered values.
    This is the one moment of friction in the design and it is deliberate: inferring a scale's order
    from the order values happen to be used in would leave every filter quietly wrong until someone
    fixed it.
27. Values save immediately on change; there is no separate save for criteria.
28. Criteria are internal and never shown to a candidate.

### 06. Status

29. The status control on an application section writes the same `Application.status` the board
    column writes. Changing it here moves the card on the board.
30. A change made here places the card at the **top** of the target column. Fine-grained ordering is
    the board's job.
31. Changing status to `didnt_pass` or `offer` focuses the Conclusion field, matching the board's
    behaviour ([05 §06](05-board.md)) — prompted, never required.

### 07. CV

32. The CV is shown by original filename with **view and download**.
33. It is served through the authenticated endpoint of [00 §03.16](00-integrations.md); the page
    never renders a storage URL.
34. Internal members **cannot replace or delete** a CV. Nothing in this release can — the candidate
    has no reschedule flow to replace it with, and the record is permanent.

### 08. States

35. **Loading** — a non-interactive treatment while the record is fetched.
36. **Error** — a friendly message with a retry; unsaved note text is never silently lost.
37. **Not found** — for an unknown candidate, or one this caller may not see.

### 09. Accessibility

38. Fully operable by keyboard and screen reader: the CV actions, both text editors, the criteria
    autocomplete and its value controls, and the status control are all properly labelled.
39. Save outcomes and errors are announced via a polite live region — including autosaves, which
    must not announce so often that they become noise.

## Screens

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Jane Doe                                                                  │
│  jane@example.com · first seen 12 Aug 2026                                 │
│                                                                            │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ Senior React Engineer · 60 minutes          Status: [ Scheduled  ▾ ]   │ │
│ │ Tue 26 Aug 2026, 14:00 Europe/Minsk · Pat Owner                        │ │
│ │ Applied as "Jane M. Doe"                                               │ │
│ │ 📄 jane-doe-cv.pdf                              [ View ]  [ Download ] │ │
│ │                                                                        │ │
│ │ CANDIDATE'S NOTE                                                       │ │
│ │ I'm available from September.                                          │ │
│ │                                                                        │ │
│ │ CRITERIA                                    [ + Add criteria ]         │ │
│ │  English         [ B2      ▾ ]  ×                                      │ │
│ │  AI Skills       [ Strong  ▾ ]  ×                                      │ │
│ │  Late hours      [ Yes / No  ]  ×                                      │ │
│ │                                                                        │ │
│ │ INTERVIEW NOTES                                    Saved 14:32         │ │
│ │ ┌────────────────────────────────────────────────────────────────────┐ │ │
│ │ │ Strong on hooks. Walked through a real migration…                  │ │ │
│ │ └────────────────────────────────────────────────────────────────────┘ │ │
│ │                                                          [ Save ]      │ │
│ │                                                                        │ │
│ │ CONCLUSION                                                             │ │
│ │ ┌────────────────────────────────────────────────────────────────────┐ │ │
│ │ │                                                                    │ │ │
│ │ └────────────────────────────────────────────────────────────────────┘ │ │
│ │                                                          [ Save ]      │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│                                                                            │
│ ┌ .NET Engineer · 45 minutes · 3 Jul 2026 · Didn't pass         [ open ] ┐ │
│ └────────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────┘
```

Additional application sections are collapsed by default; the most recent is expanded.

## Flows

### Main flow: take notes during an interview

1. Interviewer opens the deep link from the calendar event.
2. System signs them in if needed, then opens the card with that application expanded.
3. Interviewer types into Interview notes; after a two-second pause the text autosaves and the
   indicator updates.
4. Interviewer adds criteria: activate Add criteria, find "English" in the autocomplete, choose
   `B2`. The value saves immediately.
5. Interviewer writes a Conclusion and changes the status.

### Flow: add a criterion that does not exist yet

1. Interviewer types a name that matches nothing.
2. System offers `Create "…"`, which asks for the type and, for a scale, its ordered values.
3. On confirm the criterion joins the org library and is assessed on this application in one step.

### Alt flow: a save fails

- The indicator becomes an error with a retry. The text stays in the editor, unchanged, and no
  further autosave fires until the retry succeeds or the member edits again.

### Alt flow: a `user` interviewer opens a candidate with two applications

- Only the application for their own vacancy is present. The other vacancy's section is absent from
  the API response entirely, so it cannot be recovered from the page.

## API Contracts

### GET /api/organizations/{orgId}/hiring/candidates/{candidateId}

Response `200`:
```json
{
  "candidate": { "id": "uuid", "firstName": "Jane", "lastName": "Doe",
                 "email": "jane@example.com", "createdAt": "2026-08-12T…" },
  "viewerTimeZone": "Europe/Minsk",
  "applications": [
    { "id": "uuid", "status": "scheduled", "isCancelled": false,
      "submittedName": "Jane M. Doe",
      "vacancy": { "id": "uuid", "title": "Senior React Engineer", "durationMinutes": 60 },
      "interviewer": { "accountId": "uuid", "fullName": "Pat Owner" },
      "startUtc": "2026-08-26T11:00:00.000Z", "bookedTimeZone": "Europe/Minsk",
      "note": "I'm available from September.",
      "cv": { "fileName": "jane-doe-cv.pdf", "sizeBytes": 184320 },
      "interviewNotes": "…", "conclusion": "",
      "criteria": [
        { "criterionId": "uuid", "name": "English", "type": "scale",
          "valueId": "uuid", "valueLabel": "B2" }
      ] }
  ]
}
```

- For a `user` interviewer, `applications` contains only their own vacancies' applications.
- `404` when the candidate is not visible to this caller, for any reason.

### PATCH /api/organizations/{orgId}/hiring/applications/{applicationId}

Request: any subset of `{ "interviewNotes": "…", "conclusion": "…", "status": "passed" }`.

Success `200`: `{ "savedAt": "2026-08-26T11:32:04.000Z", "status": "passed", "position": 0 }`

Errors:
- `404` — application not visible to this caller.
- `422` — `{ error: "invalid_status" }`.
- `422` — `{ error: "too_long", fields: { interviewNotes: "…" } }`.

Side effects: a `status` change places the application at the top of the target column.

### PUT /api/organizations/{orgId}/hiring/applications/{applicationId}/criteria/{criterionId}

Request, exactly one of:
```json
{ "valueId": "uuid" } | { "valueBool": true } | { "valueNumber": 7 } | { "valueText": "…" }
```

Success `200`: the stored assessment.

Errors:
- `404` — application or criterion not visible.
- `422` — `{ error: "type_mismatch", message: "That value doesn't match this criterion" }`.
- `422` — `{ error: "archived_criterion" }` when assessing an archived criterion.

### DELETE /api/organizations/{orgId}/hiring/applications/{applicationId}/criteria/{criterionId}

Success `200`: `{ "success": true }`. Removes the assessment only; the criterion stays in the
library.

### GET /api/organizations/{orgId}/hiring/applications/{applicationId}/cv

Streams the file with its stored content type and the original filename in
`Content-Disposition`. `404` when not visible to this caller.

## Validation Rules

1. `interviewNotes` — at most 20 000 characters.
2. `conclusion` — at most 5 000 characters.
3. `status` — one of the five board statuses.
4. A criterion assessment must populate exactly one value column, matching the criterion's type.
5. `valueId` must belong to that criterion.
6. `valueText` — at most 500 characters.
7. `valueNumber` — a finite number.
8. Archived criteria may not be newly assessed; existing assessments against them remain readable
   and editable.
9. Candidate fields are never writable through any endpoint on this page.

## Error Messages

| Context | Message |
|---|---|
| Save failed | "Couldn't save. Retry" |
| Notes too long | "Notes must be at most 20,000 characters" |
| Conclusion too long | "Conclusion must be at most 5,000 characters" |
| Criterion type mismatch | "That value doesn't match this criterion" |
| Archived criterion | "This criterion is archived and can't be added" |
| Criterion already present | "Already assessed — edit the existing value" |
| Not found | "We couldn't find that candidate." |
| CV unavailable | "This CV couldn't be loaded." |
| No criteria yet | "No criteria recorded yet." |

## UI Notes

- The most recent application is expanded on load, or the one named by `?application=`.
- The saved-at indicator shows a relative time under a minute ("Saved just now"), then a clock time.
- Autosave is suppressed while a save is in flight and coalesces intervening keystrokes into the
  next one.
- Required `data-testid` attributes:
  - `candidate-card`, `candidate-name`, `candidate-email`, `candidate-not-found`
  - `application-section-{applicationId}`, `application-vacancy-{applicationId}`,
    `application-when-{applicationId}`, `application-interviewer-{applicationId}`,
    `application-submitted-as-{applicationId}`, `application-status-select-{applicationId}`
  - `card-cv-name`, `card-cv-view`, `card-cv-download`
  - `card-notes-input`, `card-notes-save`, `card-notes-saved-at`,
    `card-conclusion-input`, `card-conclusion-save`, `card-conclusion-saved-at`
  - `card-criteria-list`, `card-criteria-add`, `card-criteria-autocomplete`,
    `card-criterion-{criterionId}`, `card-criterion-value-{criterionId}`,
    `card-criterion-remove-{criterionId}`, `card-criteria-empty`
  - `card-save-error`, `card-save-retry`, `card-loading-skeleton`

## Out of Scope

- Editing candidate-provided fields, including the name, email, and the candidate's Note.
- Replacing or deleting a CV.
- Per-author or timestamped note entries; note history of any kind.
- Rich text, attachments, or images in notes.
- Comments, mentions, or notifications between members.
- Emailing the candidate from this page.
- Deleting a candidate or an application.

## Test Cases

### TC-H04-UNIT-01: Exactly one value column matches the criterion's type
- **Level:** Unit
- **Preconditions:** criteria of each of the four types.
- **Steps:**
  1. Validate a `scale` assessment carrying `valueId`, then one carrying `valueText`.
  2. Validate a `boolean` assessment carrying `valueBool`, then one carrying `valueNumber`.
  3. Validate an assessment carrying two value columns at once.
- **Expected Result:**
  1. The first passes; the second fails with the type-mismatch error.
  2. The first passes; the second fails.
  3. Fails — exactly one column may be populated.

### TC-H04-UNIT-02: Autosave debounces and coalesces
- **Level:** Unit
- **Preconditions:** none.
- **Steps:**
  1. Simulate continuous typing for 5 seconds with no pause longer than 500 ms.
  2. Stop, and wait 2 seconds.
  3. Type again while a save is in flight.
- **Expected Result:**
  1. No save fires during the burst.
  2. Exactly one save fires after the pause.
  3. The in-flight save is not interrupted; the later keystrokes are coalesced into one following save.

### TC-H04-UNIT-03: Scale values compare by position, not by label
- **Level:** Unit
- **Preconditions:** a scale `A1 A2 B1 B2 C1 C2` with positions 0–5.
- **Steps:**
  1. Compare `B2` against a `>= B1` threshold.
  2. Compare `A2` against the same threshold.
  3. Rename `B1` to `B1 (intermediate)` and repeat both.
- **Expected Result:**
  1. Matches.
  2. Does not match.
  3. Both results are unchanged — comparison never touches the label.

### TC-H04-INT-01: A user interviewer sees only their own vacancy's applications
- **Level:** Integration
- **Preconditions:** candidate C has applications to vacancy V (interviewer P, a `user`) and vacancy W (interviewer S).
- **Steps:**
  1. `GET` candidate C as P.
  2. `GET` candidate C as an `admin`.
  3. As P, `PATCH` the application for W directly by id.
- **Expected Result:**
  1. Exactly one application is returned — the one for V. W's id, title, notes, and criteria appear nowhere in the body.
  2. Both applications are returned.
  3. Rejected `404`, not `403`.

### TC-H04-INT-02: A candidate a user cannot see returns 404
- **Level:** Integration
- **Preconditions:** candidate C with no application to any of P's vacancies; P is a `user` interviewer elsewhere.
- **Steps:**
  1. `GET` candidate C as P.
  2. `GET` candidate C as a `viewer`.
- **Expected Result:**
  1. `404` — the response does not confirm the candidate exists.
  2. `404` as well; `viewer` has no hiring access at all.

### TC-H04-INT-03: Notes and conclusion are shared, last write wins
- **Level:** Integration
- **Preconditions:** one application; two callers, an `admin` and the assigned interviewer.
- **Steps:**
  1. As the interviewer, save notes "first".
  2. As the admin, save notes "second".
  3. Read as each.
- **Expected Result:**
  1. Both writes succeed.
  2. Both callers read "second" — one shared field, no per-author copies.

### TC-H04-INT-04: A criterion is assessed once per application
- **Level:** Integration
- **Preconditions:** an application; criterion "English" with a scale.
- **Steps:**
  1. `PUT` English = `B1`.
  2. `PUT` English = `B2`.
  3. Read the application's criteria.
- **Expected Result:**
  1. Created.
  2. Updated, not duplicated.
  3. Exactly one English assessment exists, valued `B2`.

### TC-H04-INT-05: Removing an assessment leaves the library untouched
- **Level:** Integration
- **Preconditions:** two applications, both assessed on "English".
- **Steps:**
  1. `DELETE` the English assessment from the first application.
  2. Read the criteria library and the second application.
- **Expected Result:**
  1. Success.
  2. "English" still exists in the library with its full scale, and the second application's assessment is unchanged.

### TC-H04-INT-06: Status changed from the card moves the board card to the top
- **Level:** Integration
- **Preconditions:** an application in `scheduled`; the `passed` column already holds two cards.
- **Steps:**
  1. `PATCH` the application to `passed`.
  2. Read the board.
- **Expected Result:**
  1. Success.
  2. The application is first in `passed`; the existing two keep their relative order.

### TC-H04-INT-07: An archived criterion cannot be newly assessed but stays readable
- **Level:** Integration
- **Preconditions:** criterion "Legacy skill", already assessed on application A, then archived.
- **Steps:**
  1. `GET` application A.
  2. `PUT` the same criterion on application B.
- **Expected Result:**
  1. A's existing assessment is returned and remains editable.
  2. Rejected `422` `archived_criterion`.

### TC-H04-E2E-01: Notes autosave, then survive a reload
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a candidate with one application.
- **Steps:**
  1. Open the card and type into Interview notes.
  2. Stop typing and wait for the indicator.
  3. Reload.
- **Expected Result:**
  1. No save indicator appears while typing.
  2. "Saved …" appears after the pause, without pressing Save.
  3. The text is intact after the reload.
- **Selectors:** `card-notes-input`, `card-notes-saved-at`.

### TC-H04-E2E-02: Add a criterion through the autocomplete and set a value
- **Level:** E2E
- **Preconditions:** logged in as `admin`; the library already has "English" with `A1…C2`.
- **Steps:**
  1. Open a card and activate Add criteria.
  2. Type "Eng" and choose English.
  3. Choose `B2`.
  4. Reload.
- **Expected Result:**
  1. The autocomplete offers the existing criterion rather than a create option.
  2. The value control is a select over the scale's ordered values.
  3. The assessment persists across the reload.
- **Selectors:** `card-criteria-add`, `card-criteria-autocomplete`, `card-criterion-{criterionId}`, `card-criterion-value-{criterionId}`.

### TC-H04-E2E-03: The deep link opens the right application
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a candidate with two applications.
- **Steps:**
  1. Open `/org/{orgId}/hiring/candidates/{id}?application={olderId}`.
- **Expected Result:**
  1. The older application's section is expanded and scrolled into view; the newer one is collapsed.
- **Selectors:** `application-section-{applicationId}`.

### TC-H04-E2E-04: A failed save keeps the text and offers a retry
- **Level:** E2E
- **Preconditions:** logged in as `admin`; the save endpoint made to fail.
- **Steps:**
  1. Type into Conclusion and wait for the autosave.
  2. Restore the endpoint and press Retry.
- **Expected Result:**
  1. An error with a retry appears; the typed text is still in the editor.
  2. After the retry the indicator shows a successful save.
- **Selectors:** `card-conclusion-input`, `card-save-error`, `card-save-retry`, `card-conclusion-saved-at`.

### TC-H04-E2E-05: The CV downloads through the authenticated endpoint
- **Level:** E2E
- **Preconditions:** logged in as `admin`; an application with a stored CV.
- **Steps:**
  1. Open the card and inspect the CV control.
  2. Trigger the download.
- **Expected Result:**
  1. The original filename is shown and the control points at the API endpoint, not a storage URL.
  2. The download returns the file with its stored content type.
- **Selectors:** `card-cv-name`, `card-cv-download`.
