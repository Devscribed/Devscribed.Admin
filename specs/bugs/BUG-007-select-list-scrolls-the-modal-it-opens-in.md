---
id: "BUG-007"
title: A select's list scrolls and clips the modal it opens in
severity: major
surface: ui
verdict: SPEC-GAP
owning-spec: organization/03
violates: null
regression-test: TC-03-E2E-06
introduced-in: 9880f5b
affects: all
tags: [design-system, modal, select, overflow, portal]
---

# BUG-007 — A select's list scrolls and clips the modal it opens in

## Symptom

"Modal windows have scroll with opened selects." On the **Add holiday** dialog, opening the
**Country** select makes the dialog grow a vertical scrollbar; the list of countries is cut off
at the dialog's bottom edge and the person has to scroll the dialog to reach the options.

## Reproduction

Every time, on any viewport where the dialog fits the screen when closed.

1. Sign in as an `admin` of an organization with no holidays and open **Settings → Holidays**.
2. Press **Add holiday**. The dialog opens and fits its box: no scrollbar.
3. Press the **Country** field.

The dialog grows a scrollbar and the list is clipped at the dialog's bottom edge. The same
happens on every modal that hosts the design system's `Select` at or near its bottom: the
vacancy dialog's interviewer and categories fields, the criterion dialog, the invite, project,
task, time-entry and vacation-financials modals, and the document template dialogs.

## Evidence

- The regression case below, run alone against the current code on the agent's own ports
  (`E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1`), fails at the assertion that the open list adds
  nothing to the dialog's scroll box:

  ```
  Error: the open list adds nothing to the dialog scroll box
  expect(received).toBeLessThanOrEqual(expected)
  Expected: <= 421
  Received:    647
  ```

  The dialog's `clientHeight` is 421px closed and open; its `scrollHeight` is within that box
  while the list is closed and 647px once the list is open. Screenshot and DOM snapshot:
  `e2e/test-results/holidays-organization-03-—-e6f74-ot-scroll-or-clip-the-modal-chromium/`.

- The user's screenshot shows the same: the panel's scrollbar appears on the right, and the
  list's own scrollbar appears inside a list cut off after two rows.

## Root Cause

Two design-system components disagree about who owns the space under a field, and neither
knows about the other.

`packages/ds/src/components/forms/Select.tsx:356` renders the open list **inside the control's
own box**, absolutely positioned under it:

```tsx
style={{ position: 'absolute', top: '100%', left: 0, right: 0, ... zIndex: 1000 }}
```

inside the wrapper at `:252`, which is `position: 'relative'`.

`packages/ds/src/components/overlays/Modal.tsx:52` makes the dialog panel its own scroller so a
tall form scrolls inside the screen instead of past it:

```tsx
maxWidth: '70%', minWidth: 360, maxHeight: '98%', overflow: 'auto', outline: 'none',
```

An absolutely positioned box counts towards the scrollable overflow of the nearest ancestor
that scrolls, so the moment the list mounts under the last field its 226px are added to the
panel's `scrollHeight`, the panel draws a scrollbar, and everything below the panel's bottom
edge — most of the list — is clipped by that same `overflow: auto`. The list's own
`maxHeight: 300` (`Select.tsx:360`) does not help: it bounds the list, not the panel.

`Popover` met exactly this and solved it (decisions §55): its menu is a portal into
`document.body`, `position: fixed`, placed off the trigger's rectangle and re-placed on scroll
and resize (`packages/ds/src/components/overlays/Popover.tsx:109-135`). `Select` never got the
same treatment. `Card` met it too and solved it the other way, by turning its clipping off
(§12, `clip={false}`), which a scrolling dialog cannot do.

**When it started.** Both halves arrived together in `9880f5b` (2026-09-02), the commit that
brought the design system into this repository. The defect is as old as the system.

**Who it affects.** Every role, on every modal that hosts a `Select` — ten screens today
(`grep -rl "<Select" apps/web | xargs grep -l "<Modal"`). `MenuDrawer`'s body is a scroller too
(`packages/ds/src/components/overlays/MenuDrawer.tsx:93`), so the candidate database's filter
drawer clips a list opened near its bottom for the same reason.

## Spec Verdict

**SPEC-GAP.** No requirement covers a `Select`'s list inside a container that scrolls.

- [organization/03](../organization/03-holidays.md) §Add / Edit modal names the country
  `Select` inside the modal and says nothing about where its list is drawn; its UI notes say
  only that the modal traps focus and closes on `Esc`.
- [design-system decisions](../design-system/decisions.md) §8 (`Modal`) specifies the dialog's
  focus behaviour and nothing about content that overflows it; §21 (`Select`) makes it a real
  combobox and says nothing about where the listbox lives; §12 (`Card`) and §55 (`Popover`)
  each settle the same collision for their own component and neither reaches `Select`.

The rule to add, as a numbered decision on `Select`: **the list is a portal.** Drawn into
`document.body`, `position: fixed`, placed off the control's rectangle, re-placed on scroll and
resize, and flipped upward when it would run off the bottom — §55's placement, applied to the
listbox. It stays a portal inside a `Modal`, unlike `Popover`'s menu (§55 turns the portal off
there to stay inside the focus trap), because a listbox never takes focus: focus stays on the
combobox and the active option is named through `aria-activedescendant`, so the trap is never
asked to hold something outside the panel. §12's clause about a card hosting a `Select` popover
becomes unnecessary and is amended with it.

## Fix Approach

`packages/ds/src/components/forms/Select.tsx` only, plus the two decision entries:

1. Render the listbox through `createPortal(list, document.body)` with `position: 'fixed'`,
   `left`/`width` from the control's `getBoundingClientRect()`, `top` under it or `bottom`
   above it when it would not fit below and does above, re-placed on capture-phase `scroll`
   and on `resize` — the same code shape as `Popover`'s `place()`. `zIndex` above the modal's
   1001, as `Popover` already sits (3001).
2. The outside-click handler (`Select.tsx:146`) asks the list's ref as well as the wrapper's,
   since the list is no longer inside it.
3. `aria-controls` and `aria-activedescendant` keep working unchanged: both name ids, and ids
   are document-global.

Rejected: `overflow: visible` on the modal panel — a dialog taller than the viewport must
scroll, and the list is clipped again the moment it does. Rejected: a smaller `maxHeight` on
the list — it hides the symptom on tall dialogs only, and a list that shows four countries is
not a country picker.

## Blast Radius

| Touches | Effect | Mitigation |
|---|---|---|
| Every `Select` in the app, not only those in modals | The list is drawn in `document.body` instead of under the field | Placement is measured off the control and re-placed on scroll, so it opens in the same place; verified by the E2E suites that choose options (hiring, holidays, members, projects) |
| `Card clip={false}` call sites and §12's clause | No longer needed for a `Select`; harmless where left | Amend §12; leave call sites, which still serve a `Popover` with `portal={false}` |
| E2E locators scoped to a dialog or a card that then look for an option | Would stop finding the option, which is outside that subtree now | None scoped that way today: option lookups go through `page.getByTestId` and the shared `chooseInSelect` helper |
| `Modal`'s scrim closes on click | A click on a portalled option must not reach the scrim | React events bubble through the React tree, not the DOM: the panel's `stopPropagation` still sits between the list and the scrim |
| `MenuDrawer` filter selects (candidate database) | Fixed by the same change | Covered by the candidate filter cases, which open every select in the drawer |
| `Select` inside a `Popover` or another fixed layer | A portalled list needs a `zIndex` above it | 3001, the value `Popover` already uses for the same reason |

## Backward Compatibility

Not applicable: no stored data, API response or URL changes.

## Regression Test

**TC-03-E2E-06 — opening the country select does not scroll or clip the modal.**
`e2e/tests/holidays.spec.ts`, written and run before any fix.

- **Preconditions:** logged in as `admin`; an organization with no holidays.
- **Steps:**
  1. Open Holidays and press **Add holiday**.
  2. Read the dialog's `scrollHeight` and `clientHeight`.
  3. Press the **Country** field.
  4. Read both again, and the list's bounding box.
- **Expected Result:**
  1. Closed, the dialog fits its box: `scrollHeight <= clientHeight`.
  2. Open, the same holds — the list adds nothing to the dialog's scroll box — the list's bottom
     is inside the viewport, and the option `Afghanistan` is visible.
- **Selectors:** `holidays-empty-primary-cta`, `holiday-modal`, `holiday-country-select`, the
  listbox named `Country`.
- **Against the current code it fails** at step 4's first assertion with `Expected: <= 421,
  Received: 647`.

## Acceptance Criteria

- TC-03-E2E-06 passes.
- Opening the Country select on the Add holiday dialog adds no scrollbar to the dialog and the
  whole list is visible over it, on a 1280×720 viewport.
- The same holds for the vacancy dialog's interviewer and categories fields, which the hiring
  E2E suite opens.
- The existing cases that choose an option in a select — hiring, holidays, members, projects —
  still pass.
- `decisions.md` carries the new numbered entry on `Select`, and §12 no longer asks a card to
  turn clipping off for a select.

## Known Gaps

- A `Select` whose control is itself inside a scrolling box that scrolls *while the list is
  open* is re-placed on every scroll event, like `Popover`'s menu; a list that visibly tracks a
  fast scroll is accepted, as it is for the menu.
- The list keeps its 300px cap, so a long list still scrolls inside itself. That is the
  list's own rule and not this defect.
