---
id: "BUG-010"
title: The New request modal draws the title error twice
severity: minor
surface: ui
verdict: SPEC-GAP
owning-spec: requests/01
violates: null
regression-test: TC-01-E2E-02
introduced-in: a390cf6 — "feat(requests): requests between members, and the page that becomes everyone's inbox", 2026-09-02; never merged to `main`, so never deployed
affects: all
tags: [requests, design-system, validation, field-error]
---

## Symptom

Requests, New request. A requester submits the form with the title empty. The modal stays open,
every other error appears, and the message "Enter a title" is printed **twice**, on two lines,
one under the other, both in the error colour, between the Title field and the Description
label.

## Reproduction

Deterministic. Every environment, every organization, every role that holds `create-request`,
and — as the Root Cause shows — for every title error, not only the empty one.

1. Sign in as any member holding `create-request`.
2. Open Requests and press New request.
3. Leave the Title field empty and press Create request.
4. Read the space between the Title field and the Description label.

No seed and no fixture beyond a signed-up organization: the empty title is refused before any
catalogue, project or addressee is read.

## Evidence

The failure was reproduced by adding one assertion to the existing E2E case, run against a
pair the suite claimed for itself (web 3100, api 4100):

```
$ cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 \
    npx playwright test tests/requests.spec.ts -g "an invalid new-request form" --reporter=line

Error: expect(locator).toHaveCount(expected) failed

Locator:  getByTestId('request-new-modal').getByText('Enter a title', { exact: true })
Expected: 1
Received: 2
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByTestId('request-new-modal').getByText('Enter a title', { exact: true })
    14 × locator resolved to 2 elements
       - unexpected value "2"

  1 failed
    [chromium] › tests\requests.spec.ts:277:7 › requests/01 — Requests
      › an invalid new-request form shows every error and focuses the first field
```

The accessibility tree Playwright captured at the failure, showing the two nodes and where
each sits — `e156` inside the `Input`'s own wrapper beside the textbox, `e157` its sibling:

```
- generic [ref=e152]:
  - generic [ref=e153]: Title
  - textbox [ref=e155]
  - generic [ref=e156]: Enter a title
- generic [ref=e157]: Enter a title
- generic [ref=e158]:
  - generic [ref=e159]: Description
  - textbox "Description" [ref=e160]
```

The existing assertion at `e2e/tests/requests.spec.ts:297` passes throughout. It selects
`request-new-error-title`, and only one of the two nodes carries that id — which is why the
suite has never seen this.

The temporary assertion was removed again; `e2e/tests/requests.spec.ts` is unchanged.

## Root Cause

`apps/web/app/org/[orgId]/requests/NewRequestModal.tsx:453-462` hands the message to the design
system *and* draws it again beside the control:

```tsx
<div ref={titleRef}>
  <Input
    label="Title"
    value={title}
    onChange={(event) => setTitle(event.target.value)}
    error={fieldErrors.title}                                   // ← the DS renders this
    data-testid="request-new-title"
  />
  {fieldErrors.title && <FieldError field="title" message={fieldErrors.title} />}  // ← and this
</div>
```

`@ds`'s `Input` renders its own `error` prop as a message node —
`1_DS for dev/components/forms/Input.jsx:44-50`:

```jsx
{(error || hint) && (
  <div style={{
    fontFamily: 'var(--font-text)', fontSize: 'var(--fs-12)',
    color: error ? 'var(--error-500)' : 'var(--text-muted)',
    marginTop: 5,
  }}>{error || hint}</div>
)}
```

So one string produces two nodes: the DS's untagged `div`, and the modal's `FieldError`
(`NewRequestModal.tsx:75-98`), which exists to carry the `request-new-error-title` id the spec
names — the DS exposes no way to tag the node it renders.

**Only the Title field duplicates, and the reason is which primitive each field uses.** Title
is the modal's one `@ds` `Input`. Every other field that can carry an error is either a `Select`
— which takes `error` for the border and the label colour and renders no message at all
(`1_DS for dev/components/forms/Select.jsx:15,85,142`) — or a native element the modal styles
itself (the description `<textarea>`, the needed-by `<input type="date">`). For those,
`FieldError` is the only node that draws the message and is load-bearing; for Title it is one
node too many.

The repository already solved this, and this file is one of two places that does not use the
solution. `apps/web/src/field-error.tsx` builds a `<span>` carrying the id and hands it *into*
`error`, so the DS renders one node and that node is the tagged one; its own comment says why.
`ClientModal.tsx:191`, `ProjectModal.tsx:329`, `AccountSettingsScreen.tsx:306`,
`TimeEntryModal.tsx:399`, `templates/page.tsx:496` and `VacationFinancialsModal.tsx:274` all do
this. `NewRequestModal` passes the raw string and then adds the tagged node beside it.

The trigger in the report is the empty title, but the defect is in the render, not the
validation path: the duplication follows from `fieldErrors.title` being set at all, so the
under-3-character title and the over-200-character title print twice as well, and so does a
`titleRequired` returned by the server.

**This is the same defect as [BUG-007](BUG-007-request-topic-name-error-drawn-twice.md), in a
second file.** That report's Known Gaps says the rule it proposes is app-wide and that "every
other screen already keeps it". This screen does not, and the two are the complete set: they
are the only two files that pass a raw string to an `@ds` `Input`'s `error` and render the
message again themselves.

## Spec Verdict

`SPEC-GAP`. The owning spec is `specs/requests/01-requests`.

No requirement covers it. Requirement 3 (`01-requests.md`) governs the title's bounds and
`REQUEST_MESSAGES.titleRequired` is its message; neither says anything about how many times the
screen prints it. The row of the UI Description table that reaches this
(`01-requests.md:711`) is satisfied by the code as written:

> | Invalid submission | Every field error rendered; focus moves to the first invalid field; the submit control is never disabled for validation. |

That states a *presence*: every field error is rendered. It is true of the running code. Nothing
in the spec says a message is drawn once, and nothing forbids a second, untagged copy — which is
exactly why `TC-01-E2E-02`, written from that row, selects the tagged element and passes.

Filing this as a `CODE-DEFECT` would send the fix at a requirement that does not exist.

**Proposed row, UI Description table, `specs/requests/01-requests.md`:**

| State | Behaviour |
|---|---|
| A field's error message | Rendered exactly once. Where the control is an `@ds` primitive that renders `error` itself, the single node is the one handed to that prop, and it is also the node carrying the id the spec names. A field error is never drawn a second time beside its control. |

**Proposed row, DS gaps table, same file:**

| Gap | Where it bites | What ships instead | What closes it |
|---|---|---|---|
| `Input` exposes no id for the error node it renders, and `Select` renders no error node at all | Every field error the spec names by `data-testid` | For `Input`, the message is handed to `error` as a `<span>` carrying that id, built by `apps/web/src/field-error.tsx`; for `Select`, a sibling node beside the control, because the DS draws none | An `errorId` prop on `@ds` `Input`, and an error message node on `@ds` `Select` |

Independently of the spec, `CLAUDE.md` already condemns the implementation — "Anything missing
goes *into* the design system … never improvised per screen" — and `field-error.tsx` is where
the improvisation was collected. That is a convention, not a requirement, so it is the reason
the fix is obvious, not the routing.

## Fix Approach

Two files, or one if [BUG-007](BUG-007-request-topic-name-error-drawn-twice.md) has already
merged — the two fixes want the same helper and neither should write a second copy of it.

1. `apps/web/src/field-error.tsx` — add a sibling to `errorNode` for the case where the spec
   names the id itself rather than the `field-error-{field}` scheme, matching `hintNode`'s
   shape, which already takes an explicit id:

   ```tsx
   /** The same node where the spec names the id itself, not the `field-error-*` scheme. */
   export function errorNodeById(id: string, message: string) {
     return (<span id={id} data-testid={id}>{message}</span>) as unknown as string;
   }
   ```

   **This is verbatim what BUG-007's Fix Approach adds.** Whichever of the two ships first
   writes it; the second imports it and touches one file only.

2. `apps/web/app/org/[orgId]/requests/NewRequestModal.tsx` — for the Title field only, drop the
   sibling `<FieldError field="title" …>` and pass the tagged node to the control:

   ```tsx
   error={fieldErrors.title ? errorNodeById('request-new-error-title', fieldErrors.title) : undefined}
   ```

   `FieldError` stays, unchanged, for every other field: they are `Select`s and native elements,
   where it is the only node that draws the message.

*Rejected:* keeping `FieldError` for the title and dropping `error={fieldErrors.title}`. It
removes the duplicate and keeps the id, but it also removes the error state from the control —
the DS colours the border, the label and the focus glow from that same prop, so the field would
stop turning red.

*Rejected:* deleting `FieldError` outright and passing tagged nodes everywhere. `Select` renders
no message node, so every `Select` error in this modal would become invisible. That is the DS
gap named above, and closing it is a change to the design system for every screen, not a
one-file bug fix.

*Rejected:* changing `FieldError` to skip the title. It leaves two components deciding one
thing, and the next field to move from `Select` to `Input` reintroduces the bug silently.

## Blast Radius

| What the fix touches | Risk | Mitigation |
|---|---|---|
| `apps/web/src/field-error.tsx` — shared by every form in the app | A new export only; no existing export changes | `errorNode`, `hintNode` and `focusByTestId` are untouched, so no other caller sees a difference. If BUG-007 shipped first the export already exists and this row is empty |
| The rendered id `request-new-error-title` | It moves from a `div` beside the control to a `span` inside the control's own error slot | The id, the testid and the text are unchanged; `e2e/tests/requests.spec.ts:297` selects it by testid and passes either way |
| `request-new-error-topic` and `request-new-error-assignee` | Not touched — both are `Select` errors and keep their `FieldError` node | Established by reading the file: only the Title field is an `@ds` `Input`. `grep -n "<Input" apps/web/app/org/[orgId]/requests/NewRequestModal.tsx` returns one hit |
| `focusFirstInvalid` (`NewRequestModal.tsx:281-294`) | None — it looks up the `input` inside `titleRef`, not the error node | The wrapping `<div ref={titleRef}>` stays, because focus management reads it |
| The message's spacing | The DS slot uses `marginTop: 5`; the deleted `FieldError` used `var(--sp-2)` | Both are 8px-scale gaps under the field, and the font, size and colour are identical (`var(--font-text)`, `var(--fs-12)`, `var(--error-500)`) — the remaining line lands where the first of the two lines is today |
| Every other form in the app | None | The two files that carry this defect are this one and `RequestTopicModal.tsx` (BUG-007). Established by `grep -rn "error={fieldErrors\.\|error={errors\." apps/web --include=*.tsx \| grep -v errorNode` and reading each of the fourteen hits: `RequestVacationModal.tsx:325,340` and `HolidayModal.tsx:361` pass a local `DateInput`, not an `@ds` `Input`; `TimeEntryModal.tsx:329`, `FieldModal.tsx:250` and every remaining hit in this file are `Select`s, which render no message node. Every other `Input` call site in the app already passes `errorNode(...)` |

No API behaviour changes, no stored data is involved, and nothing else imports
`NewRequestModal`.

## Backward Compatibility

Not applicable. No stored data, no API response and no URL changes.

## Regression Test

**`TC-01-E2E-02`, extended** — not a new case. The invalid-submission mechanism already has an
E2E case on the cheapest page that exercises it, and `CLAUDE.md` is explicit that one mechanism
gets one E2E test; a new case would buy one assertion for a second sign-up and a second sign-in.

- **Level:** E2E — the assertion is about what is drawn, which no API test can reach.
- **Covers:** the proposed UI Description row above, in addition to everything the case already
  asserts about requirement 3 and the never-disabled submit control.
- **Preconditions:** unchanged — the case's own admin and organization.
- **Steps:** unchanged. After the empty submission is refused, count the nodes inside
  `request-new-modal` whose text is exactly `REQUEST_MESSAGES.titleRequired`.
- **Expected Result:** exactly one, in addition to everything the case already asserts.
- **Selectors:** `request-new-modal`, `request-new-error-title`, `request-new-title`,
  `request-new-submit` — all already in the case's selector list.

The assertion, placed after the existing `request-new-error-title` check at
`e2e/tests/requests.spec.ts:297`:

```ts
await expect(
  page.getByTestId('request-new-modal').getByText('Enter a title', { exact: true }),
).toHaveCount(1);
```

**It fails against the current code**, and this was observed, not predicted — the run is quoted
in full under Evidence. It reports:

```
Error: expect(locator).toHaveCount(expected) failed
    Expected: 1
    Received: 2
        14 × locator resolved to 2 elements
```

## Acceptance Criteria

1. Submitting the New request form with an empty title draws `REQUEST_MESSAGES.titleRequired`
   exactly once under the Title field.
2. The same holds for every other title error the field can carry — under 3 characters, over
   200 characters — and for a `titleRequired` returned by the server rather than the client.
3. `request-new-error-title` is still present on the one node that carries the message, still
   under the field, with the text unchanged.
4. The Title control still renders its error state: the border, the label and the focus glow are
   still `var(--error-500)`.
5. `request-new-error-topic` and `request-new-error-assignee` are still rendered, still exactly
   once each, and still under their own controls.
6. Focus still lands on the Title input when the title is the first invalid field.
7. The extended `TC-01-E2E-02` passes, and the reproduction above no longer reproduces.

## Known Gaps

- **`@ds` `Select` accepts an `error` prop and never renders the message.** This is why
  `FieldError` must stay in the file rather than being deleted with the title's copy. It is the
  same DS gap from the other side; closing it closes both, and it would then be `FieldError`
  that becomes the duplicate for every `Select` in this modal. Whoever adds the message node to
  `Select` must delete `FieldError` in the same change. Left out here deliberately, so the fix
  stays out of the design system.
- **The title field sets neither `aria-invalid` nor `aria-describedby`,** where
  `ClientModal.tsx:189-190` and `ProjectModal.tsx:327-328` set both. The fix gives the error
  node a stable id inside the control, which is what `aria-describedby` would point at, but
  wiring it is a change no requirement asks for and is not what was reported.
- **The rule proposed above is written into `requests/01` alone,** because that is the spec this
  defect belongs to, and BUG-007 proposes the same rule into `requests/02`. Two specs will then
  state one app-wide convention. Collecting it somewhere it governs every screen is a larger
  edit than a bug fix, and the DS-gaps row is where that would start.
- **The two reports are not merged into one.** They are separate defects in separate files
  owned by separate specs, and a single report would have to carry two owning specs and two
  regression tests.
- **This report declares no `depends-on`, and that is deliberate.** It shares
  `apps/web/src/field-error.tsx` with BUG-007 and
  `apps/web/app/org/[orgId]/requests/NewRequestModal.tsx` with
  [PATCH-003](../patches/PATCH-003-new-request-addressee-first.md), but a shared file is a merge
  order, not a dependency: this fix compiles and its regression test passes whether either of
  the other two has landed or not. The Fix Approach above is written to hold in both directions
  — whichever of BUG-007 and this one runs first writes `errorNodeById`, and the second imports
  it and touches one file. Concurrency is not a risk: `wf init` refuses to start while another
  run holds `.workflow/lock` (`scripts/wf.mjs:505`), so runs are serialised however they are
  queued.
