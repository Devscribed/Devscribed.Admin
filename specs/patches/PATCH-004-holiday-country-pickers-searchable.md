---
id: "PATCH-004"
title: The holiday country pickers are searched by typing
surface: ui
supersedes: organization/03
requirement: null
cases: [TC-03-E2E-10, TC-01-E2E-09]
files: 2
---

## Why

Every country picker on the Holidays screen lists 250 rows and offers no way through them but
the scroll wheel. Choosing Poland from the organization picker means dragging past two hundred
names; choosing it in the Add holiday form means the same drag inside a modal. The design
system's `Select` already has the search — `isSearchable` (§21) draws a text input inside the
control and filters the list case-insensitively — and these three controls simply never asked
for it. This turns it on.

## The rule

WHERE a country is chosen on the Holidays screen — the organization country picker, the list's
country filter, and the country field of the Add/Edit holiday form — THE SYSTEM SHALL render
the control with a text input inside it, and SHALL show only the options whose label contains
what has been typed, matched case-insensitively on any part of the label.

WHEN the typed text matches no country, THE SYSTEM SHALL draw the control's own `No options`
row and SHALL leave the current selection unchanged.

WHEN an option is chosen, THE SYSTEM SHALL clear the typed text, close the list, and show the
chosen country's full name in the control.

**What stays untouched.** The option lists themselves — `ORG_COUNTRY_OPTIONS` keeps its
leading `No country — global holidays only` row and `HOLIDAY_COUNTRY_OPTIONS` keeps its
leading `All countries` row, both of which are matched by typing like any other label. No
country is added or removed from either list, the values submitted are unchanged, and neither
the `PUT .../settings/country` body nor the holiday form's `countryCode` field changes shape.
Nothing outside the Holidays screen changes: the phone-country picker, the member About tab's
country field and every other `Select` in the app keep the searchability they have today.

**Where the test ids go, and why this patch moves them.** §21 puts the control's own
attributes — `data-testid` among them — on the inner `<input>` once the control is searchable,
and the chosen value then sits in a sibling span, so a searchable `Select` stops *containing*
the name it is showing. This is recorded in the code at
`apps/web/app/org/[orgId]/projects/[projectId]/tasks/[taskId]/TaskDetailScreen.tsx:1077`, where
a picker declines the search for exactly that reason. So each of the three shipped ids —
`org-country-select`, `holidays-country-filter`, `holiday-country-select` — moves onto the
element **wrapping** its control, which is where the shown value can still be read, and the
inner input takes a new `-input` id of its own. Every assertion that reads a chosen country
today keeps reading it from the id it reads it from today.

**Rejected:** teaching `Select` to keep `data-testid` on the control and tag the input
separately. It is the better shape and it is not this patch's to make — it changes the element
every one of the eight searchable pickers already shipped is addressed by, which is a spec.

## Contracts

| `data-testid` | Element | Notes |
|---|---|---|
| `org-country-select` | Organization country picker | Moves from the combobox to the wrapper around it; still contains the chosen country's name |
| `org-country-select-input` | Its search input | New |
| `holidays-country-filter` | The list's country filter | Moves from the combobox to the wrapper around it; still contains the chosen country's name |
| `holidays-country-filter-input` | Its search input | New |
| `holiday-country-select` | Country field of the Add/Edit holiday form | Moves from the combobox to the wrapper around it; still contains the chosen country's name |
| `holiday-country-select-input` | Its search input | New |

No message changes. No route changes.

## Cases

### TC-03-E2E-10

- **Level:** E2E
- **Covers:** this patch
- **Steps:** Sign in as an admin and open Settings › Holidays. Click
  `holidays-add-btn`. Type `pola` into `holiday-country-select-input`.
- **Expected Result:** The open list holds exactly one row and its text is `Poland`. Click it:
  `holiday-country-select-input` is empty and `holiday-country-select` contains `Poland`.
  Then type `zzzz` into `holiday-country-select-input` — the list shows `No options` and
  `holiday-country-select` still contains `Poland`.
- **Selectors:** `holidays-add-btn`, `holiday-country-select`, `holiday-country-select-input`.
- **Fails today:** `holiday-country-select-input` does not exist, so the first `fill` times out.

### TC-01-E2E-09

- **Level:** E2E
- **Covers:** this patch
- **Steps:** Sign in as an admin and open Settings › Holidays. Type `united k` into
  `org-country-select-input` and choose the single row the list leaves.
- **Expected Result:** `org-country-select` contains `United Kingdom`. Click
  `org-country-save`, reload the page, and it still does.
- **Selectors:** `org-country-select`, `org-country-select-input`, `org-country-save`.
- **Fails today:** `org-country-select-input` does not exist.

## Blast radius

- **The three call sites are the whole change.** `grep -rn "HOLIDAY_COUNTRY_OPTIONS\|ORG_COUNTRY_OPTIONS" apps/web`
  returns `settings/holidays/page.tsx`, `settings/holidays/HolidayModal.tsx` and
  `settings/holidays/country-options.ts` — the third is the list itself and is not edited.
- **Shipped assertions that read these ids.** `grep -rn "org-country-select\|holidays-country-filter\|holiday-country-select" e2e/tests`
  returns four assertions in `e2e/tests/time-off-calendar.spec.ts` and two in
  `e2e/tests/holidays.spec.ts`. All six read the id with `click()` or `toContainText()`; the
  id moving to the wrapper is what keeps all six passing unchanged. A `click()` on the wrapper
  lands on the control inside it, which opens the list exactly as before.
- **`packages/ds` is not edited.** `isSearchable` and `SelectOption.testId` both ship today.
- **The server sees nothing.** No request body, query string or status code is touched, so no
  integration test can observe this patch.

## Not in this patch

- **Search on any other picker in the app.** Eight `Select`s already pass `isSearchable` and
  one declines it deliberately; none of them is on this screen.
- **Reordering the country lists,** by recently used or by where the members are. That is a
  ranking rule and it belongs with the sourcing spec that knows which countries have members.
- **Moving `data-testid` to the wrapper inside `Select` itself,** which would fix the
  value-containment problem for every caller at once. Named above as the rejected alternative.
- **The layout defect visible under the organization picker.** That is
  [BUG-011](../bugs/BUG-011-holidays-org-country-hint-is-overlapped.md), a defect rather than a
  decision, and it changes no rule this patch states.
