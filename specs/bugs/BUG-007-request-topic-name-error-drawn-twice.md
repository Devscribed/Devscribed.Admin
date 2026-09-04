---
id: "BUG-007"
title: The Add topic modal draws the name error twice
severity: minor
surface: ui
verdict: SPEC-GAP
owning-spec: requests/02
violates: null
regression-test: TC-02-E2E-01
introduced-in: 90e412f — "implement 1: request topics — the catalogue, the picker, and the four words (requests/02)", 2026-09-03; never merged to `main`, so never deployed
affects: [admin, manager]
tags: [requests, request-topics, design-system, validation, field-error]
---

## Symptom

Settings › Request topics, Add topic. A curator types a name another topic of that audience
already holds and submits. The modal stays open, the typed value is intact, and the message
"A topic with this name already exists for this audience" is printed **twice**, on two lines,
one under the other, both in the error colour.

## Reproduction

Deterministic. Every environment, every organization, both audiences, and — as the Root Cause
shows — for every name error, not only the duplicate one.

1. Sign in as an `admin` or a `manager`.
2. Open Settings › Request topics.
3. Press Add topic, type a name that no staff topic holds, press Add topic. The topic is created.
4. Press Add topic again, type the same name in any case, press Add topic.
5. Read the space under the Name field.

The seeded catalogue is enough on its own: step 3 is unnecessary if step 4 uses a seeded name.

## Evidence

The failure was reproduced by adding one assertion to the existing E2E case, run against a
pair the suite claimed for itself (web 3100, api 4100, `e2e/.last-ports.json`):

```
$ cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 \
    npx playwright test tests/request-topics.spec.ts --reporter=line

Error: expect(locator).toHaveCount(expected) failed
    Expected: 1
    Received: 2
      - waiting for getByTestId('request-topic-modal')
          .getByText('A topic with this name already exists for this audience', { exact: true })
        14 × locator resolved to 2 elements

  1 failed
    [chromium] › tests\request-topics.spec.ts:77:7 › requests/02 — Request topics & vocabulary
      › an admin curates the catalogue from the Settings row
  5 passed (34.4s)
```

The accessibility tree Playwright captured at the failure, showing the two nodes and where
each sits — `e194` inside the `Input`'s own wrapper, `e195` its sibling:

```
- textbox [ref=e193]: figma SEAT
- generic [ref=e194]: A topic with this name already exists for this audience
- generic [ref=e195]: A topic with this name already exists for this audience
- generic [ref=e197]:
  - generic [ref=e198]: Audience
```

The existing assertion at `e2e/tests/request-topics.spec.ts:124` passes throughout. It selects
`request-topic-error-name`, and only one of the two nodes carries that id — which is why the
suite has never seen this.

The temporary assertion was removed again; `e2e/tests/request-topics.spec.ts` is unchanged.

## Root Cause

`apps/web/app/org/[orgId]/settings/request-topics/RequestTopicModal.tsx:204-213` hands the
message to the design system *and* draws it again beside the control:

```tsx
<Input
  label="Name"
  value={name}
  onChange={…}
  data-testid="request-topic-name"
  error={errors.name}            // ← the DS renders this
/>
{errors.name && <NameError message={errors.name} />}   // ← and this renders it again
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

So one string produces two nodes: the DS's untagged `div`, and the modal's `NameError`
(`RequestTopicModal.tsx:35-50`), which exists only to carry the `request-topic-error-name` id
the spec names — the DS exposes no way to tag the node it renders.

The repository already solved that, and this file is the only place that does not use the
solution. `apps/web/src/field-error.tsx` builds a `<span>` carrying the id and hands it *into*
`error`, so the DS renders one node and that node is the tagged one; its own comment says why.
Every other form in the app does this — `ClientModal.tsx:191`, `ProjectModal.tsx:329`,
`AccountSettingsScreen.tsx:306`, `TimeEntryModal.tsx:399`, `templates/page.tsx:496`,
`VacationFinancialsModal.tsx:274`. `RequestTopicModal` passes the raw string instead and then
adds the tagged node beside it, which is one node too many.

The trigger in the screenshot is the `409` at `RequestTopicModal.tsx:150`, but the defect is in
the render, not the failure path: the duplication follows from `errors.name` being set at all,
so the empty name and the over-60-character name print twice as well.

## Spec Verdict

`SPEC-GAP`. The owning spec is `specs/requests/02-request-topics`.

No requirement covers it. `REQ-02-006` (`02-request-topics.md:103-107`) governs the server —
"THE SYSTEM SHALL answer `409` with `REQUEST_TOPIC_MESSAGES.nameDuplicate`" — and says nothing
about the screen. The two rows of the UI Description table that reach the screen
(`02-request-topics.contracts.md:441-443`) are satisfied by the code as written:

> | Invalid submission | Every field error is rendered and focus moves to the first invalid field; the submit control is never disabled for validation. |
> | Duplicate name | The modal stays open with `request-topic-error-name` under the field and the typed value intact. |

Both state a *presence*: the error is rendered, the tagged element is under the field. Both are
true of the running code. Neither says the message is drawn once, and nothing anywhere in the
spec forbids a second, untagged copy — which is exactly why the E2E case, written from those
rows, selects the tagged element and passes.

Filing this as a `CODE-DEFECT` would send the fix at a requirement that does not exist. What is
missing is the rule, and it is missing for every screen, not for this one:

**Proposed row, UI Description table, `specs/requests/02-request-topics.contracts.md`:**

| Surface | Behaviour |
|---|---|
| A field's error message | Rendered exactly once, as the node handed to the DS control's `error` prop — which is also the node carrying the id the spec names. A field error is never drawn a second time beside its control. |

**Proposed row, DS gaps table, same file:**

| Gap | Where it bites | What ships instead | What closes it |
|---|---|---|---|
| `Input` exposes no id for the error node it renders | Every field error the spec names by `data-testid` | The message is handed to `error` as a `<span>` carrying that id, built by `apps/web/src/field-error.tsx` | An `errorId` prop on `@ds` `Input` and `Select` |

Independently of the spec, `CLAUDE.md` already condemns the implementation — "Anything missing
goes *into* the design system … never improvised per screen" — and `field-error.tsx` is the
place the improvisation was collected. That is a convention, not a requirement, so it is the
reason the fix is obvious, not the routing.

## Fix Approach

One file, plus one shared helper.

1. `apps/web/src/field-error.tsx` — add a sibling to `errorNode` for the case where the spec
   names the id itself rather than the `field-error-{field}` scheme, matching `hintNode`'s
   shape, which already takes an explicit id:

   ```tsx
   /** The same node where the spec names the id itself, not the `field-error-*` scheme. */
   export function errorNodeById(id: string, message: string) {
     return (<span id={id} data-testid={id}>{message}</span>) as unknown as string;
   }
   ```

2. `apps/web/app/org/[orgId]/settings/request-topics/RequestTopicModal.tsx` — delete the
   `NameError` component and its call site, and pass the tagged node to the control:

   ```tsx
   error={errors.name ? errorNodeById('request-topic-error-name', errors.name) : undefined}
   ```

   The wrapping `<div>` at line 204 then holds only the `Input` and can go with it.

*Rejected:* keeping `NameError` and dropping `error={errors.name}`. It removes the duplicate
and keeps the id, but it also removes the error state from the control — the DS colours the
border, the label and the focus glow from that same prop, so the field would stop turning red.

*Rejected:* adding an `errorId` prop to `@ds` `Input` and passing it here. It is the right end
state and it is what the DS-gaps row proposes, but it changes the design system for every
screen and it belongs to whoever closes that gap for all of them, not to a one-file bug fix.

## Blast Radius

| What the fix touches | Risk | Mitigation |
|---|---|---|
| `apps/web/src/field-error.tsx` — shared by every form in the app | A new export only; no existing export changes | `errorNode`, `hintNode` and `focusByTestId` are untouched, so no other caller sees a difference |
| The rendered id `request-topic-error-name` | It moves from a `div` beside the control to a `span` inside the control's own error slot | The id, the testid and the text are unchanged; `e2e/tests/request-topics.spec.ts:124` selects it by testid and passes either way |
| The message's spacing | The DS slot uses `marginTop: 5`; the deleted `NameError` used `var(--sp-2)` | Both are 8px-scale gaps under the field, and the font, size and colour are identical (`var(--font-text)`, `var(--fs-12)`, `var(--error-500)`) — the remaining line lands where the first of the two lines is today |
| The rename modal, which shares this component | None — it renders the same name field | Covered by the same case: `TC-02-E2E-01` opens the rename modal after the duplicate submission |

Nothing else imports `RequestTopicModal`, no API behaviour changes, and no stored data is
involved.

## Backward Compatibility

Not applicable. No stored data, no API response and no URL changes.

## Regression Test

**`TC-02-E2E-01`, extended** — not a new case. The duplicate-name mechanism already has an E2E
case, and `CLAUDE.md` is explicit that one mechanism gets one E2E test; a new case would buy
one assertion for a second sign-in and a second catalogue.

- **Level:** E2E — the assertion is about what is drawn, which no API test can reach.
- **Covers:** the proposed UI Description row above, in addition to the case's existing
  `REQ-02-006`, `REQ-02-009`, `REQ-02-010`, `REQ-02-012`, `REQ-02-030`.
- **Preconditions:** unchanged — the case's own admin, organization and seeded catalogue.
- **Steps:** unchanged. After the second submission is refused, count the nodes inside
  `request-topic-modal` whose text is exactly `REQUEST_TOPIC_MESSAGES.nameDuplicate`.
- **Expected Result:** exactly one, in addition to everything the case already asserts.
- **Selectors:** `request-topic-modal`, `request-topic-error-name`, `request-topic-name`,
  `request-topic-submit` — all already in the case's selector list.

The assertion, placed after the existing `request-topic-error-name` check at
`e2e/tests/request-topics.spec.ts:124`:

```ts
await expect(
  page.getByTestId('request-topic-modal').getByText(COPY.nameDuplicate, { exact: true }),
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

1. Submitting a duplicate name in the Add topic modal draws
   `REQUEST_TOPIC_MESSAGES.nameDuplicate` exactly once under the Name field.
2. The same holds for every other name error the field can carry — empty, and over 60
   characters after trimming — and in the Rename topic modal as well as Add topic.
3. `request-topic-error-name` is still present on the one node that carries the message, still
   under the field, with the text unchanged.
4. The Name control still renders its error state: the border, the label and the focus glow
   are still `var(--error-500)`.
5. The modal still stays open with the typed value intact, and the refused create still writes
   nothing.
6. The extended `TC-02-E2E-01` passes, and the reproduction above no longer reproduces.
7. `apps/web/app/org/[orgId]/settings/request-topics/RequestTopicModal.tsx` renders no field
   error of its own; the DS control renders every one.

## Known Gaps

- **`@ds` `Select` accepts an `error` prop and never renders the message.**
  `1_DS for dev/components/forms/Select.jsx:15,85,142` uses `error` for the border and the
  label colour only, so `errors.audience` and `errors.type` — set at
  `RequestTopicModal.tsx:109,111` and passed at `:228,:241` — reach no reader. It is not
  reachable through the UI today: the audience is seeded from the mode and the kind from a
  two-option `Select` that defaults to `access`, so neither can be made invalid by a person.
  It is the same DS gap from the other side, and closing that gap closes both. Left out of
  this fix deliberately, so the fix stays in one file.
- **The name field sets neither `aria-invalid` nor `aria-describedby`,** where
  `ClientModal.tsx:189-190` and `ProjectModal.tsx:327-328` set both. The fix gives the error
  node a stable id inside the control, which is what `aria-describedby` would point at, but
  wiring it is a change no requirement asks for and it is not what was reported.
- **The rule proposed above is written into `requests/02` alone,** because that is the spec
  this defect belongs to. The convention it states is app-wide and every other screen already
  keeps it — collecting it somewhere it governs all of them is a larger edit than a bug fix,
  and the DS-gaps row is where that would start.
