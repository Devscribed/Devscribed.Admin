---
id: "BUG-012"
title: The calendar grid keeps the last window that loaded, whatever the header says
severity: major
surface: ui
verdict: CODE-DEFECT
owning-spec: time-off/01
violates: REQ-01-049
regression-test: TC-01-E2E-11
introduced-in: the commit that shipped the calendar screen
affects: [admin, manager, user]
tags: [vacation-calendar, navigation, stale-state, scope, error-banner]
---

## Symptom

"Куда ни кликай вперёд назад — всё равно today показывает." On the Time off calendar, clicking
`‹` or `›` changes the date range printed beside the buttons but the grid underneath does not
move: the same days, the same weekday numbers and the same today marker stay on screen no
matter how many times the arrows are clicked. The header claims one window and the chart shows
another, with nothing on the page saying which one is real.

## Reproduction

1. Sign in as an admin and open `/org/{orgId}/time-off/calendar`. The grid paints on today's
   window.
2. Click **Teams** in the Scope control, and tick nothing in the Teams picker.
3. The banner "Choose at least one team." appears above the grid — and the grid stays.
4. Click `›`. The range label steps forward. **The grid does not.**
5. Click `›` and `‹` as many times as you like. The label keeps moving; the grid keeps showing
   the window from step 1, today marker included.

Deterministic. It needs no seeded absence and no particular date — an empty organization shows
it. The same stall happens with **People** and nothing ticked, and transiently on any window
whose fetch fails or is still in flight.

## Evidence

- The range label and the grid are drawn from **two different objects**: the label from `range`,
  computed on the client (`CalendarScreen.tsx:154`, read at `:317`), the grid from `data.days`,
  which is the server's answer (`:264`).
- In the reproduction the network tab shows **no request at all** after step 3. The label moves
  with no fetch behind it.
- The banner and the grid are siblings, both rendered: `calendar-error-banner` is present and
  `calendar-grid` is present, showing the earlier window's `calendar-day-header-{date}` cells.

## Root Cause

`apps/web/app/org/[orgId]/time-off/calendar/CalendarScreen.tsx:201-210` returns from `load`
before any request is made, and before `data` is touched:

```ts
if (scope === 'teams' && projectIds.length === 0) {
  setLoading(false);
  setError(TIME_OFF_CALENDAR_MESSAGES.teamsRequired);
  return;
}
if (scope === 'people' && memberIds.length === 0) {
  setLoading(false);
  setError(TIME_OFF_CALENDAR_MESSAGES.peopleRequired);
  return;
}
```

`data` is written in exactly one place, `:230`, on a `200`. So while a scope refusal is
standing, every re-run of `load` — and stepping the window re-runs it, because `range.startDate`
and `range.endDate` are in the callback's dependency list — takes this early return and leaves
`data` holding whatever window last answered `200`. That window is today's, because today's is
what the screen opens on.

The render then draws that stale object without qualification. `:394` chooses the skeleton only
when `loading && !data`; with `data` non-null from the first successful load the skeleton is
never shown again, so the grid has no state that says "this is not the window in the header".
The label, computed locally at `:154` from `anchor`, moves freely — which is why the two
disagree instead of both freezing.

The same mechanism produces the transient version with no scope refusal involved: a failed or
slow fetch also leaves `data` on the previous window while the label has already moved.

## Spec Verdict

`CODE-DEFECT`. `specs/time-off/01-vacation-calendar.md`, REQ-01-049, states where back and
forward land — "`Week` and `2 weeks` move one preset length, `Month` moves a whole calendar
month, so every range a step produces is a range the preset itself produces". The screen
produces the *label* of that range and not the *grid* of it. A control that moves the window is
a control that moves what is drawn; a header that names a window the chart is not showing is
the rule not being met, not a situation the rule fails to cover.

The helpers themselves are correct: `stepTimeOffCalendarAnchor`
(`packages/validation/src/time-off-calendar.ts:199-211`) and `timeOffCalendarWindowRange`
(`:177-192`) both return the right range, and their unit cases pass. The defect is entirely in
what the screen does with the answer.

## Fix Approach

`apps/web/app/org/[orgId]/time-off/calendar/CalendarScreen.tsx`, one file.

**The grid never outlives the window it belongs to.** Both early returns clear the answer
(`setData(null)`) as well as setting the banner, so a refused scope shows the banner and no
grid rather than the banner and somebody else's grid. The banner is what the screen has to say
in that state and it already says it.

**A window whose answer has not arrived is not drawn as though it had.** The skeleton condition
at `:394` becomes a test on whether `data` describes the window now being asked for — compare
`data.range.startDate` and `data.range.endDate` against `range` — so an in-flight or failed step
shows the loading grid, not the previous fortnight.

**Rejected:** keeping the last grid and dimming it. It is the friendlier shape for a slow
network and it is what produced this report — a chart that is 90% right about the wrong dates is
read as right, and dimming is not a legend.

**Rejected:** freezing the label until the answer arrives. It makes the header lie in the other
direction, and it disables the one thing that tells a reader the click registered.

## Blast Radius

| What the fix touches | Effect | Mitigation |
|---|---|---|
| The refused-scope state (Teams/People with nothing ticked) | The grid disappears where it used to persist | This is the intended change; the banner already explains the state. Note that [`time-off/03`](../time-off/03-calendar-range-and-scope.md) removes the refusal itself — this fix is still correct after it, because it is about the *answer*, not about the refusal |
| The loading state | The skeleton is drawn on window steps, not only on first paint | `GridSkeleton` already draws in the grid's own geometry (`:73-115`), which is why it was built |
| `calendar-empty-state` | Unchanged — it still requires `data` and zero rows | |
| Shipped E2E in `e2e/tests/time-off-calendar.spec.ts` | Any case that steps the window and immediately asserts a cell now waits for the new answer | Playwright's auto-waiting covers it; the cases assert `calendar-day-header-{date}` for the new window, which is what appears |
| The API | Nothing. No request shape, status or body changes | |

## Backward Compatibility

Not applicable. No stored data, no API response and no URL changes — the window is deliberately
not in the URL (`specs/time-off/01-vacation-calendar.contracts.md`, §Screens).

## Regression Test

### TC-01-E2E-11

- **Level:** E2E
- **Covers:** REQ-01-049
- **Steps:** Sign in as an admin and open the calendar. Click `calendar-window-week`. Record the
  text of `calendar-range-label` and the set of `calendar-day-header-{date}` ids on screen.
  Click `calendar-next` once. Then click `calendar-scope-teams`, tick nothing, and click
  `calendar-next` once more.
- **Expected Result:** After the first `calendar-next`, `calendar-range-label` has changed and
  the `calendar-day-header-{date}` ids are the seven days of the following week — none of the
  recorded ids is still on screen. After the scope switch, `calendar-error-banner` carries
  `TIME_OFF_CALENDAR_MESSAGES.teamsRequired` and `calendar-grid` is absent; no
  `calendar-day-header-{date}` is present.
- **Selectors:** `calendar-window-week`, `calendar-range-label`, `calendar-next`,
  `calendar-day-header-{date}`, `calendar-scope-teams`, `calendar-error-banner`,
  `calendar-grid` (absent).
- **Fails today:** the second half fails first and loudest — `calendar-grid` is present with the
  previous window's day headers while the banner is showing. Playwright reports the `toBeHidden`
  on `calendar-grid` timing out with the element visible.

E2E and not integration: the defect is entirely in which of two client objects a screen draws.
The server answered correctly every time it was asked, and in the reproduction it was not asked
at all — there is no request an API test could make that fails.

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| 1 | Clicking `‹` or `›` changes the day columns, not only the range label | TC-01-E2E-11 |
| 2 | While a scope refusal is standing, no grid is drawn | TC-01-E2E-11 |
| 3 | A window whose answer has not arrived draws the skeleton, not the previous window | TC-01-E2E-11 |
| 4 | The reproduction above no longer reproduces | TC-01-E2E-11 |

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| A failed fetch shows the skeleton beneath the error banner rather than a retry control | The banner names the failure and every control above it still works, so the way out is one click on any of them | A retry affordance on the calendar's banner, the shape `holidays-error-retry-btn` already has on the Holidays screen |
| The header controls still shift as the range label's width changes | A separate defect with a separate cause | [BUG-013](BUG-013-calendar-header-shifts-with-the-range-label.md) |
