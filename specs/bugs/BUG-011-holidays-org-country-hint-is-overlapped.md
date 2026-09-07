---
id: "BUG-011"
title: The organization country hint is drawn under the filter below it
severity: minor
surface: ui
verdict: SPEC-GAP
owning-spec: time-off/01
violates: null
regression-test: TC-01-E2E-10
introduced-in: the commit that added the organization country picker to Settings › Holidays
affects: [admin, manager]
tags: [holidays, select, hint, layout, overlap, design-system]
---

## Symptom

On Settings › Holidays the sentence under the **Organization country** picker — "Members
without a country of their own get this country's holidays." — has its bottom sliced off. The
country filter below it is drawn over the last few pixels of the line, so the descenders of
`y`, `g` and `p` are missing and the text reads as though it were cut with a ruler. The hint
also starts further left than the label above it, so the two lines that describe one control do
not share a left edge.

## Reproduction

1. Sign in as an admin or a manager.
2. Open `/org/{orgId}/settings/holidays`.
3. Look at the block between the year tabs and the country filter.

Deterministic — it is pure layout and needs no data. It reproduces on an empty organization,
which is the state the screenshot was taken in.

## Evidence

- The hint is drawn, and drawn in the right place relative to its own control: the DOM carries
  it and the accessible name is intact. Only its last band of pixels is covered.
- The covering element is the second `Select`'s control box, which paints an opaque
  `background: var(--surface-card)` (`packages/ds/src/components/forms/Select.tsx:321`).
- The two left edges disagree by exactly the label's own inset: the label carries
  `padding: var(--space-4) 0 0 var(--space-4)` (`Select.tsx:302`), the hint carries `left: 0`
  (`Select.tsx:106`).

## Root Cause

Two independent numbers, in two files, that were never compared.

`packages/ds/src/components/forms/Select.tsx:105-106` — the message slot a hint shares with an
error is taken **out of flow**:

```ts
/* The message slot: absolute, under the control, and the same one a hint takes (§21). */
const messageSlot: React.CSSProperties = { position: 'absolute', left: 0, whiteSpace: 'nowrap' };
```

and `Select.tsx:480` places it at `bottom: formik ? -16 : -20`. This picker is the `dropdown`
variant, so the hint's box hangs from 8px to **20px** below the control wrapper's bottom edge
and contributes **no height** to it — by design, so that a hint being replaced by an error
never moves the field.

`apps/web/app/org/[orgId]/settings/holidays/page.tsx:372` — the row that holds the picker and
its Save button closes with:

```tsx
marginBottom: 'var(--space-6)',
```

`--space-6` is **16px** (`packages/ds/src/tokens/spacing.css:13`). The country filter's row
therefore begins 16px below a wrapper the hint hangs 20px below it, and the filter's opaque
control paints over the final 4px — the descender band of the line.

The left-edge disagreement is the same absolute slot seen from the other side: `left: 0` is the
wrapper's edge, and the label above it is inset by `--space-4` (10px), so the two lines can
never align while the hint is positioned against the wrapper and the label is padded inside it.

## Spec Verdict

`SPEC-GAP`. `specs/time-off/01-vacation-calendar.contracts.md:344-346` says the screen "gains
one control above the existing country filter: a `Select` labelled **Organization country**,
hinted from `TIME_OFF_CALENDAR_MESSAGES.orgCountryHint`" — the hint is required to be there and
the spec says nothing about how much room the thing under it must leave. No requirement is
violated: the hint is rendered, with the right text, from the right export.

The gap the owning spec should own is stated as a rule about the screen rather than about this
one control, because the next hinted filter placed above another control reproduces it exactly:

> **Edge case to add to `time-off/01`:** a `Select` in the `dropdown` variant carrying a `hint`
> hangs that hint 20px below its own box and contributes no height for it. Any element placed
> under such a control leaves at least `--space-7` (20px) of clearance, and the screen states
> that clearance where the control is composed rather than relying on the row gap it happens to
> inherit.

## Fix Approach

One file, `apps/web/app/org/[orgId]/settings/holidays/page.tsx`: raise the organization-country
row's `marginBottom` from `var(--space-6)` to a value that clears the hint — `var(--space-8)`
(24px) leaves the hint's 20px plus a 4px gap, and keeps the two blocks visually one group.

The left-edge disagreement is left alone deliberately. Aligning it means either padding the
hint or unpadding the label inside `Select`, and both change the geometry of every hinted
select in the app — that is the design system's decision, not this screen's, and it is recorded
in Known Gaps below rather than improvised here.

**Rejected:** giving the hint `position: static` on this screen. It would fix the overlap and
reintroduce exactly what the absolute slot was chosen to prevent — the field jumping every time
an error replaces the hint (`Select.tsx:474-476`).

**Rejected:** dropping the hint. It is the only sentence that says what the picker does, and
`specs/time-off/01-vacation-calendar.contracts.md:345` requires it.

## Blast Radius

| What the fix touches | Effect | Mitigation |
|---|---|---|
| The Holidays screen's vertical rhythm | The gap between the organization row and the filter row grows 16px → 24px | Both are `--space` tokens; no literal is introduced |
| Other screens composing a hinted `dropdown` Select | None — the change is one inline style on one row | `grep -rn "hint=" apps/web` finds the other call sites; none is edited |
| `packages/ds` | None — no design-system file is touched | |
| Shipped E2E | None — `org-country-select` and `holidays-country-filter` keep their positions in the DOM and their ids | |

## Backward Compatibility

Not applicable. No stored data, no API response and no URL changes.

## Regression Test

### TC-01-E2E-10

- **Level:** E2E
- **Covers:** the edge case proposed above
- **Steps:** Sign in as an admin and open `/org/{orgId}/settings/holidays`. Read the bounding
  boxes of the hint node — the element `org-country-select` describes through
  `aria-describedby` — and of `holidays-country-filter`.
- **Expected Result:** The hint's bottom edge is above the filter's top edge. No pixel of the
  two boxes overlaps.
- **Selectors:** `org-country-select`, `holidays-country-filter`.
- **Fails today:** the hint's bottom edge sits 4px below the filter's top edge, and the
  assertion reports the two boxes intersecting.

This is E2E and not integration because the assertion is a rendered geometry — two boxes and
where their edges fall — which no API test can reach.

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| 1 | The whole hint line is visible, descenders included, on Settings › Holidays | TC-01-E2E-10 |
| 2 | The hint and the country filter do not overlap at any viewport the screen supports | TC-01-E2E-10 |
| 3 | The hint still carries `TIME_OFF_CALENDAR_MESSAGES.orgCountryHint` and still describes `org-country-select` | TC-01-E2E-10 |
| 4 | No file under `packages/ds` is changed | the diff |

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| The hint's left edge is 10px left of its label's | It is legible and unambiguous; fixing it inside `Select` moves the hint on every screen at once | A design-system change that makes the message slot share the label's inset, judged across every hinted control |
| Every other hinted `dropdown` Select in the app is one 16px gap away from the same overlap | None is currently placed above another control at `--space-6` | The clearance rule this report proposes for `time-off/01`, applied when such a screen is next composed |
