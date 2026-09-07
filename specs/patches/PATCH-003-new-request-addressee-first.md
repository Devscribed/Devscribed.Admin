---
id: "PATCH-003"
title: The addressee is chosen first, and the project chooses the contact
surface: ui
supersedes: requests/03
requirement: null
cases: [TC-03-E2E-06, TC-01-E2E-01]
depends-on: ["PATCH-002"]
files: 1
---

## Why

The New request modal asks its questions in an order that contradicts what depends on what. The
addressee kind sits fifth, below About and Project, and both of those are read *from* it — the
topic catalogue is fetched per audience, and the project control is narrowed per addressee. So a
person fills the top of the form, reaches `To`, changes it, and watches their topic and project
be cleared. Worse, the two controls that a client request needs are wired backwards: today the
contact is chosen first and the project list is filtered by the contact's client, which leaves
`Project` empty and unexplained for anyone who works project-first. And the needed-by control
opens empty, so every request costs three typed segments before it can be created.

This note puts the addressee first, disables what depends on it until it is answered, reverses
the project-and-contact dependency, and seeds the date.

## The rule

The New request modal renders its fields in this order:

```
TO          [ Choose a recipient ▾ ]
ABOUT       [ Choose a topic     ▾ ]
TITLE       [                      ]
DESCRIPTION [                      ]
PROJECT     [ Any / Choose a project ▾ ]
FOR         [ Choose a person / Choose a project first ▾ ]
PRIORITY    [ Normal             ▾ ]
NEEDED BY   [ 2026-09-04           ]
☐ Work is stopped until this is done
                       [ Cancel ] [ Create request ]
```

**The addressee kind is first, and it starts unset.**

> WHEN the New request modal opens, THE SYSTEM SHALL render the `To` control first, above
> every other field, with no value selected and the placeholder `Choose a recipient`, offering
> `Colleague` and `Client`.
>
> WHILE no addressee kind is selected, THE SYSTEM SHALL render the `About`, `Title`,
> `Description`, `Project` and `For` controls disabled, and SHALL enable them when a kind is
> selected.
>
> IF the form is submitted while no addressee kind is selected, THEN THE SYSTEM SHALL render
> `REQUEST_MESSAGES.assigneeInvalid` under the `To` control, carrying
> `request-new-error-assignee-kind`, and SHALL move focus to the `To` control.

`Priority`, `Needed by`, the blocking checkbox, `Cancel` and `Create request` stay enabled
throughout: none of them reads the addressee, and the submit control is never disabled for
validation. That boundary is deliberate — the alternative, disabling the whole form body, was
rejected because it makes the modal open in a state where nothing at all can be typed and gives
no signal about which control is the way out.

**Nothing is read for an unset kind.** The topic catalogue is fetched per audience; while no
kind is selected no read is issued, the `About` control renders disabled with its placeholder,
and the empty-catalogue substitution — the copy that replaces the picker and withdraws the
submit control when an audience has no active topic — is not evaluated at all. It is evaluated
again from the moment a kind is selected, per audience, exactly as it is today.

**The project chooses the contact, not the reverse.**

> WHERE the addressee kind is `Client`, THE SYSTEM SHALL offer in `Project` only projects that
> belong to a client, and SHALL offer in `For` only the active contacts of the client that owns
> the selected project.
>
> WHILE the addressee kind is `Client` and no project is selected, THE SYSTEM SHALL offer no
> options in `For` and SHALL render the placeholder `Choose a project first`.
>
> WHEN the selected project changes, THE SYSTEM SHALL clear any selected contact.

Once a project is selected, the `For` placeholder reads `Choose a contact`; if that project's
client has no contact the requester may address, the control offers nothing and the placeholder
reads `No contacts on this project's client`. These are placeholders, not validation messages,
and they sit inline in the modal beside `Choose a topic`, `Choose a person` and `Any`, which is
where every other placeholder on this screen already lives.

This replaces, in full, the two sentences of `specs/requests/03-client-participants.contracts.md`
that describe the modal — "The field order is the one the modal already has, with the addressee
kind inserted above the addressee itself" and "narrows the project control to projects the
requester is assigned to **and** that belong to the chosen contact's client". The narrowing runs
the other way now. It is still a convenience and the server still decides: a request addressed to
a client must name a project, that project must belong to the addressee's client, and the
requester must hold a `ProjectMember` row on it. Those three refusals are unchanged, and the
picker no longer promises the third — an admin may select a project they are not assigned to,
find the contact picker empty because the contacts route answers only for projects they work on,
and be refused by the server with `REQUEST_MESSAGES.notOnProject` if they get past it another
way.

Where the addressee kind is `Colleague`, `Project` offers every project the page loaded and
keeps its `Any` placeholder, and `For` offers the organization's active members. Unchanged.

**The needed-by control opens on today and is bounded.**

> WHEN the New request modal opens, THE SYSTEM SHALL seed the `Needed by` control with today in
> the caller's timezone.
>
> THE SYSTEM SHALL render `min` of today and `max` of five years after today on that control,
> both in the caller's timezone.

**Decided, with the consequence known:** seeding the date means every request created without
touching that control carries a deadline of the day it was raised, and from the next day every
one of them that is still open reads `overdue: true`. Overdue is derived from `neededBy` and
status, so the blocking-and-overdue register — the reason this area exists — fills with rows
nobody set a deadline on. *Rejected:* leaving the field empty and relying on the native picker
already opening its calendar on today, which keeps `neededBy` genuinely optional and the
register meaningful. *Rejected:* seeding a date some days out, which keeps the prefill without
the overnight effect. Seeding today is what was asked for after both alternatives and their
costs were put side by side, and it is recorded here so the next person reading the overdue
counts knows where they came from.

The `max` value comes from `requestNeededByMax(today)` in `packages/validation`, which
[PATCH-002](PATCH-002-needed-by-upper-bound.md) adds along with the server rule it mirrors. This
note does not restate that rule and does not enforce it alone: the control's bound is a
convenience over a rule the server holds, which is why PATCH-002 ships first.

**What stays untouched.** Every `data-testid` on the existing controls. Every message. The
create request body and every field in it. Switching the addressee kind still clears the chosen
topic and project and keeps the title, description, priority, needed-by and blocking values. The
per-audience empty-catalogue behaviour. The submit control's in-flight disable. Focus still
moves to the first invalid field on an invalid submission and every error is still shown at
once.

## Contracts

| `data-testid` | Element | Notes |
|---|---|---|
| `request-new-assignee-kind` | The `To` select | Moves to the top of the modal, above `request-new-topic`. Starts with no value |
| `request-new-error-assignee-kind` | The error under the `To` select | **New.** Carries `REQUEST_MESSAGES.assigneeInvalid` when the form is submitted with no addressee kind chosen |
| `request-new-topic` | The `About` select | Rendered `disabled` while no addressee kind is chosen |
| `request-new-title` | The `Title` input | Rendered `disabled` while no addressee kind is chosen |
| `request-new-description` | The `Description` textarea | Rendered `disabled` while no addressee kind is chosen |
| `request-new-project` | The `Project` select | Rendered `disabled` while no addressee kind is chosen. For the `Client` kind it offers only projects that belong to a client, and is no longer narrowed by the chosen contact |
| `request-new-assignee-client` | The `For` select, client kind | Rendered `disabled` while no addressee kind is chosen; offers no options until a project is chosen |
| `request-new-assignee-member` | The `For` select, colleague kind | Rendered `disabled` while no addressee kind is chosen |
| `request-new-needed-by` | The `Needed by` date input | Seeded with today on open; carries `min` of today and `max` of five years after today |

No message is added, removed or altered. `REQUEST_MESSAGES.assigneeInvalid` — "Choose who this
request is for" — already exists and is what `validateNewRequest` returns for an unset kind
today; this note only changes which control draws it.

## Cases

### TC-03-E2E-06

- **Level:** E2E — every assertion here is DOM state: field order, the `disabled` attribute, and
  which options a control offers. None is reachable from an API test.
- **Preconditions:** An organization with an admin; one client with one active contact; one
  project belonging to that client with the admin assigned to it; one project with no client;
  the seeded `client`-audience topic catalogue.
- **Steps:**
  1. Sign in as the admin, open Requests, press New request.
  2. Read the modal's controls in document order. Assert `request-new-assignee-kind` precedes
     `request-new-topic`.
  3. Assert `request-new-topic`, `request-new-title`, `request-new-description`,
     `request-new-project` and `request-new-assignee-member` are all disabled, and that
     `request-new-submit`, `request-new-priority` and `request-new-needed-by` are not.
  4. Press `request-new-submit`.
  5. Choose `Client` in `request-new-assignee-kind`.
  6. Read `request-new-assignee-client` before choosing a project.
  7. Read the options of `request-new-project`.
  8. Choose the client's project, then read the options of `request-new-assignee-client`.
- **Expected Result:** step 3 as asserted; step 4 shows `request-new-error-assignee-kind` with
  "Choose who this request is for" and leaves focus on `request-new-assignee-kind`, and the
  submit control is still enabled; step 5 enables all five controls; step 6 offers no options;
  step 7 offers the client's project and not the project with no client; step 8 offers the
  client's active contact.
- **Selectors:** `requests-new-btn`, `request-new-modal`, `request-new-assignee-kind`,
  `request-new-error-assignee-kind`, `request-new-topic`, `request-new-title`,
  `request-new-description`, `request-new-project`, `request-new-assignee-member`,
  `request-new-assignee-client`, `request-new-priority`, `request-new-needed-by`,
  `request-new-submit`.
- **Fails against the current code:** yes, at step 2 — `request-new-topic` precedes
  `request-new-assignee-kind` today, and every control is enabled from the first paint.

### TC-01-E2E-01, extended

- **Level:** E2E. The existing end-to-end creation case, which already opens the modal and fills
  the needed-by control.
- **Covers:** the seeded date and its bounds, in addition to everything the case already asserts.
- **Preconditions:** unchanged.
- **Steps:** unchanged up to opening the modal. Then, before touching any field, read the value
  of `request-new-needed-by` and its `min` and `max` attributes. The case then chooses
  `Colleague` in `request-new-assignee-kind` before filling the rest, which it does not do today
  because the kind was defaulted.
- **Expected Result:** the value equals today in the signed-in account's timezone; `min` equals
  the same day; `max` equals five years after it. Everything the case already asserts still
  holds.
- **Selectors:** `request-new-needed-by` and `request-new-assignee-kind`, both already in the
  case's selector list.
- **Fails against the current code:** yes. The control's value is the empty string today and it
  carries no `max`.

**Every other E2E case that drives this modal needs the same one-line addition** — choosing the
addressee kind before filling anything, because it is no longer defaulted. `TC-01-E2E-02`
(`e2e/tests/requests.spec.ts:277`) is the exception and must *not* choose it: that case submits
an invalid form, and the unset kind is now one of the errors it should see. Establishing the
full list is a `grep -ln "request-new-modal" e2e/tests/*.spec.ts` away — it returns
`requests.spec.ts`, `client-participants.spec.ts` and `request-topics.spec.ts`, and nothing
else. The third of those asserts only that the modal is present or absent and which topics its
picker offers (`request-topics.spec.ts:196,214,260,390`); the one case there that reads the
picker must now choose an addressee kind first, since the catalogue is no longer read until it
is chosen.

## Blast radius

Every place that renders or drives this modal, established by
`grep -rn "NewRequestModal\|request-new-" apps e2e specs`:

- **`apps/web/app/org/[orgId]/requests/NewRequestModal.tsx`** — the only file this note
  changes. It holds the field order, the per-audience catalogue read, the contact read, the
  project narrowing, the seeded state and the date control.
- **`apps/web/app/org/[orgId]/requests/page.tsx:585-590`** — the modal's only call site. It
  passes `orgId`, `open`, `projects`, `onClose` and `onCreated`; none of those props changes
  shape, so the page is not edited. `grep -rn "NewRequestModal" apps/web/app apps/web/src`
  returns the definition, that import and that render, and nothing else.
- **`POST …/requests`** — unchanged. The body this modal sends carries the same fields with the
  same names; the reordering and the disabling are presentation.
- **`GET …/request-contacts`** — unchanged, and already carries `clientId` and `clientName` per
  contact (`apps/api/src/requests/requests.dto.ts:115-120`), which is what makes the reversed
  narrowing a client-side filter over a read that already exists rather than a new route.
- **`GET …/projects?status=active`** — unchanged. For a `user` it already answers only the
  projects they are assigned to (`apps/api/src/projects/projects.service.ts:131-137`); for an
  admin or manager it answers all of them, which is why an admin can select a project the
  contacts route will offer no contact for.
- **`e2e/tests/requests.spec.ts` and `e2e/tests/client-participants.spec.ts`** — every case that
  fills this form gains the addressee-kind choice, as set out under Cases. Tests, not product
  files.
- **The request detail and edit screens** — they do not render this modal and do not read
  `assigneeKind` as a form control. Not touched.

## Not in this patch

- **The needed-by rule itself.** The ceiling and its message are [PATCH-002](PATCH-002-needed-by-upper-bound.md),
  which must merge first: this note reads `requestNeededByMax` from `packages/validation` and
  puts no rule on the control that the server does not also hold.
- **The duplicated title error.** The `Title` field draws its error twice; that is
  [BUG-010](../bugs/BUG-010-new-request-title-error-drawn-twice.md), a defect with its own
  verdict, owned by a different spec. It touches the same file, which is a merge order and not
  a dependency: neither note needs the other's change to compile or to pass, so BUG-010 is
  deliberately absent from this note's `depends-on`. Concurrency is not a risk either —
  `wf init` refuses to start while another run holds `.workflow/lock` (`scripts/wf.mjs:505`),
  so runs are serialised whatever order they are queued in. Whichever merges second rebases on
  the first.
- **A `DateField` in `@ds`.** `Needed by` stays a native `<input type="date">` styled with
  tokens, which is what `specs/requests/01-requests.md`'s DS-gaps table already records. Its
  `mm/dd/yyyy` placeholder is the browser's own, is set by the viewer's locale, and cannot be
  changed from the page; only a design-system date field with its own text input can change it,
  and that is a spec — a new DS component is outside a patch's entry condition. Two further
  local copies of a date input already exist, in `RequestVacationModal.tsx:64` and
  `HolidayModal.tsx:72`, and that spec should adopt all three at once.
- **Disabling `Priority`, `Needed by`, the blocking checkbox or the submit control** while the
  addressee kind is unset. Stated above as a decision, not an oversight.
- **A narrowing of `Project` to projects the requester is assigned to.** The list the page
  loads is already exactly that for a `user`; changing it for an admin or manager would mean a
  second projects read with a different scope, and the server already refuses what the picker
  would have hidden.
- **Letting a chosen addressee kind be un-chosen.** Once selected there is no way back to the
  placeholder, because the placeholder is not an option. Reopening the modal is the way to
  start over, which is what the reseed on open already does.
- **The `For` control for the colleague kind.** It offers the organization's active members and
  is not narrowed by the project. Nothing in the server rules ties a colleague to a project, and
  inventing that tie here would refuse requests the API accepts.
