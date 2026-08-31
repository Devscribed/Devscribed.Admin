---
id: "BUG-004"
title: Field geometry is sent in PDF points and placed in CSS pixels, so every signature lands a third of a page too high
severity: blocker
surface: api
verdict: SPEC-GAP
owning-spec: documents/04
violates: null
regression-test: TC-04-INT-27
introduced-in: the execution-page grid, added for BUG-001
affects: all
tags: [signwell, execution-page, geometry, units, silent-failure]
---

## Symptom

A signer opens a SignWell envelope, signs, and the signature is drawn **on the execution
page's heading** — over the words "Signature page" — instead of on the line above
"Заказчик". Every field is one row too high.

Nothing reports an error. The document is `Sent`, the fields materialized, the widget worked,
the signature was captured. The only way to see it is to look at the page.

## Reproduction

Deterministic, on every SignWell envelope.

1. Send an envelope through SignWell.
2. Open the signer's link and sign.
3. Look at where the signature landed.

## Evidence

Measured off the rendered widget, and it settles to the pixel.

| observation | value |
|---|---|
| Page width as the widget draws it | **794 px** |
| A4 at 96 dpi (210 mm) | **794 px** |
| A4 in PDF points | 595.28 pt |
| Signature centre, from the page top | **154 px** |
| The field we sent | `y: 136.7`, `height: 36` — centre **154.7** |

The centre we asked for and the centre we got agree to within a pixel *when our number is read
as pixels*. Read as points it should have been at 154.7 pt = 206 px, seventy pixels lower.

The second row confirms it independently. Our grid puts the first signature line at
86.7 + 48 = 134.7 pt, ending at 174.7 pt. On screen the "Заказчик" rule sits exactly where
that row ends. So the page is being drawn at 96 dpi throughout, and only our coordinates are
in the other unit.

**The provider echoes back precisely what it was given.** `GET /documents/{id}` reports:

```json
{"api_id":"Signature_1","recipient_id":"1","page":1,"x":81.0,"y":136.7,"width":"240.0","height":"36.0"}
```

Those are our numbers, stored and returned unchanged. There is no validation, no warning and
no status to distinguish a coordinate that means something from one that does not.

The renderer's own geometry was verified separately and is right: the frozen document's first
element begins at **86.7 pt** from the page top, which is the `contentTop` the grid assumes —
20 mm print margin plus the document's 2.5 rem body margin.

## Root Cause

A unit mismatch at the boundary, in `signwell-signing-provider.ts`, where a box becomes a
field:

```ts
x: match.box.x,
y: match.box.y,
width: match.box.width,
height: match.box.height,
```

`EXECUTION_PAGE` in `signwell-text-tags.ts` is in **PDF points**, correctly: points are what
the renderer lays the page out in, what `format: 'A4'` and `margin: '20mm'` resolve to, and
the only unit in which the grid's arithmetic is checkable against the CSS.

SignWell places fields in **CSS pixels at 96 dpi**. Its viewer draws the A4 page 794 px wide.
Nothing converted between the two, so every coordinate arrives multiplied by 0.75 — and 0.75
of the way up a page is, for the first row, the heading.

## Spec Verdict

`SPEC-GAP`. Requirement 14e specifies the grid and tabulates every constant it rests on, all
in points, and that table is right — those are the renderer's units. It says nothing about
what unit the field list leaves in, because the requirement was written from arithmetic and
the CSS, without a live document to check against.

The row to add to 14e's constants table:

| Constant | Value | Where it comes from |
|---|---|---|
| Provider units | CSS pixels at 96 dpi — points × 96/72 | SignWell's viewer draws A4 at 794 px; the API neither documents nor validates the unit |

And an edge-case row:

| # | Situation | Behaviour |
|---|---|---|
| — | A coordinate leaves in the wrong unit | Nothing detects it. The provider stores and echoes any number, the field materializes, the document sends, and the signature lands somewhere else on the page. The conversion is asserted by `TC-04-INT-27` and by nothing else |

## Fix Approach

Convert at the boundary, not in the grid. The grid stays in points because the renderer does;
the adapter is the only place that knows what a particular provider wants.

`apps/api/src/signature/signwell/signwell-signing-provider.ts` — a `toProviderUnits` applied to
`x`, `y`, `width` and `height` as the field is built, rounded to two places so no coordinate
arrives as a long float.

| | before | after |
|---|---|---|
| row 1 `y` | 136.7 | **182.27** |
| row 2 `y` | 208.7 | 278.27 |
| row 3 `y` | 280.7 | 374.27 |
| `x` | 81 | 108 |
| box | 240 × 36 | 320 × 48 |

**Rejected:** holding the grid in pixels. The grid's constants are the renderer's — A4, a
20 mm margin, a 2.5 rem body margin — and every one of them is stated in millimetres or points
by the thing that produces them. Converting them at source would make the table in
requirement 14e uncheckable against the CSS it is derived from, to save one function.

## Blast Radius

| What | Effect | Mitigation |
|---|---|---|
| `executionPageRowBox` and its unit tests | Unchanged — still points, still checkable against the CSS | None needed |
| Any future provider placing fields by coordinate | Will have its own unit | The conversion lives in the adapter, which is where a second one would put its own |
| Documents already sent | Their fields are stored wrong at the provider | None. They cannot be corrected in place; a document sent before this fix has to be voided and re-sent |

## Backward Compatibility

None required. Coordinates are computed per send and never stored on our side.

## Regression Test

`TC-04-INT-27` — the field list leaves in the provider's units.

**Steps:** convert the grid's first row.

**Expected:** `toProviderUnits(136.7)` is `182.27`; `72 pt` is `96 px`; A4's 595.28 pt is
793.71 px; the box's width and height scale with its origin, so 240 × 36 becomes 320 × 48.

**Against the current code it fails**: the geometry is passed through unconverted.

It is a unit test in shape and an integration case in number, deliberately: it is the only
automated thing that can fail when this breaks, so it belongs with the cases a person reads
when the send path changes.

## Known Gaps

**Verified by measurement, not by the provider's documentation.** The unit appears in no API
reference we found, and was established from the rendered page: 794 px for A4, and a signature
centre landing within a pixel of the prediction. If SignWell changes its viewer's dpi the
conversion is wrong again, silently, and `TC-04-INT-27` will not notice because it asserts our
arithmetic rather than their behaviour.

**Nothing automated can catch the next one of these.** The provider accepts any number. The
double echoes what it is given, so it agrees with whatever we believe. A person looking at a
signed document is the only detector, which is what found this one — the third defect today
whose whole class is invisible to review and to tests, after BUG-001 and BUG-003.

**A cosmetic defect found alongside and not fixed:** the document's filename reaches SignWell
as `Р”РѕРіРѕРІРѕСЂ РїРѕРґСЂСЏРґР° BY.pdf` — UTF-8 read as CP1251. It affects the name of the
downloaded PDF and nothing else. It needs its own report.
