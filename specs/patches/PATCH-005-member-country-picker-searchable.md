---
id: "PATCH-005"
title: The member's country picker is searched by typing
surface: ui
supersedes: time-off/01
requirement: null
cases: [TC-01-E2E-13]
files: 1
---

## Why

The **Country** field on a member's About tab lists 250 rows and offers no way through them but
the scroll wheel, so setting a member to Poland means dragging past two hundred names. It is the
last country picker in the product without the search: [PATCH-004](PATCH-004-holiday-country-pickers-searchable.md)
turned it on for the three on Settings › Holidays and said in as many words that this one kept
what it had. This turns it on here, on the same terms.

## The rule

WHERE a member's country is chosen on the member detail screen's About tab, THE SYSTEM SHALL
render the control with a text input inside it, and SHALL show only the options whose label
contains what has been typed, matched case-insensitively on any part of the label.

WHEN the typed text matches no country, THE SYSTEM SHALL draw the control's own `No options` row
and SHALL leave the current selection unchanged.

WHEN an option is chosen, THE SYSTEM SHALL clear the typed text, close the list, and show the
chosen country's full name in the control.

**What stays untouched.** `MEMBER_COUNTRY_OPTIONS` keeps its leading
`TIME_OFF_CALENDAR_MESSAGES.memberCountryDefaultOption` row — *Use the organization's country* —
which submits `null`, and it is matched by typing like any other label. No country is added or
removed, the value submitted is unchanged, and neither `PUT .../members/{memberId}` nor the
`countryCode` field changes shape. Who may see the control is unchanged: it is drawn only for a
caller who may save it, never read-only, and the save is still the one button the role and the
job title already share.

**Where the test id goes, and why this patch moves it.** §21 puts the control's own attributes —
`data-testid` among them — on the inner `<input>` once the control is searchable, and the chosen
value then sits in a sibling span, so a searchable `Select` stops *carrying* the id a test reads
the value from. So `member-country-select` moves onto the element **wrapping** the control, which
still contains the shown value, and the inner input takes a new `-input` id of its own. Every
assertion that reads or clicks this control today keeps reading and clicking the id it uses
today. This is the shape PATCH-004 settled for the three pickers on Holidays, and copying it is
what keeps the four pickers one mechanism rather than two.

**Rejected:** teaching `Select` to keep `data-testid` on the control and tag the input
separately. It is the better shape and it is not this patch's to make — it changes the element
every searchable picker already shipped is addressed by, which is a spec.

## Contracts

| `data-testid` | Element | Notes |
|---|---|---|
| `member-country-select` | Country field on Member detail › About | Moves from the combobox to the wrapper around it; still contains the chosen country's name, and still absent for a caller who may not save it |
| `member-country-select-input` | Its search input | New |

No message changes. No route changes.

## Cases

### TC-01-E2E-13

- **Level:** E2E
- **Covers:** this patch
- **Preconditions:** an organization with a member whose country has never been stated, and a
  `manager` signed in — the fixture TC-01-E2E-08 already builds.
- **Steps:** Open that member's detail screen. Type `zzzz` into `member-country-select-input`,
  then clear it and type `pola`, and click the single row the list leaves.
- **Expected Result:** On `zzzz` the open list shows `No options` and `member-country-select`
  still contains *Use the organization's country*. On `pola` the list holds exactly one row,
  `Poland`. After the click `member-country-select-input` is empty and `member-country-select`
  contains `Poland`. Click `job-title-save-button`, reload the page, and it still does.
- **Selectors:** `member-country-select`, `member-country-select-input`,
  `job-title-save-button`.
- **Fails today:** `member-country-select-input` does not exist, so the first `fill` times out.

E2E and not integration: what changes is a control's own list and the id the DOM carries it on.
The server sees the same write it sees today, so no API test can observe this patch.

## Blast radius

- **One call site is the whole change.** `grep -rn "MEMBER_COUNTRY_OPTIONS" apps/web` returns
  only `apps/web/app/org/[orgId]/members/[memberId]/MemberDetailScreen.tsx`, where the list is
  declared and read by the one `Select`.
- **Shipped assertions that read this id.** `grep -rn "member-country-select" e2e/tests` returns
  three in `e2e/tests/time-off-calendar.spec.ts`, all inside TC-01-E2E-08: a `toContainText` for
  the default option, a `click()` that opens the list, and a `toHaveCount(0)` for a `user`. The
  id moving to the wrapper is what keeps all three passing unchanged — a `click()` on the
  wrapper lands on the control inside it, the wrapper contains the value the control shows, and
  the wrapper is inside the same `canEditJobTitle` guard the control was.
- **`packages/ds` is not edited.** `isSearchable` ships today and is passed by eight other call
  sites.
- **The server sees nothing.** No request body, query string or status code is touched.

## Not in this patch

- **The hidden selected-label span the Holidays pickers carry.** `Select` hides the chosen
  value's span while a query is typed, so those three added a visually hidden sibling to keep a
  mid-search `toContainText` readable. TC-01-E2E-13 reads the value only when the query is empty
  — before typing and after choosing — so nothing here needs it, and a third copy of that helper
  is drift rather than consistency. Lifting it into one shared place, for all four pickers, is a
  change to files this patch does not own.
- **Search on any other picker in the app.** Eight `Select`s already pass `isSearchable` and one
  declines it deliberately; none of them is on this screen.
- **Reordering the country list** by recently used or by where the members are. That is a
  ranking rule and it belongs with the sourcing spec that knows which countries have members.
- **Moving `data-testid` to the wrapper inside `Select` itself,** which would fix the
  value-containment problem for every caller at once. Named above as the rejected alternative.
