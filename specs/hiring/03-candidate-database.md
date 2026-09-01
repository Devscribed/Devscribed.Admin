---
id: "03"
title: Candidate Database
routes: ["/org/{orgId}/hiring/candidates", "/org/{orgId}/hiring/my-interviews (redirect)"]
api: ["GET /api/organizations/{orgId}/hiring/candidates", "GET /api/organizations/{orgId}/hiring/my-interviews"]
entities: [Candidate, Application, ApplicationCriterion]
tags: [candidates, search, filters, criteria-filter, pagination, my-interviews, scope, ordering, rollup]
depends-on: ["01", "02", "04", "06"]
---

# 03 — Candidate Database

## Summary

Everyone who has ever booked an interview, in one filterable list. Its headline query is the one
the whole category and criteria machinery exists to answer: *find everyone who applied to a React
position and whose English is at least B1*.

Rows are **candidates**, one per person — not one per application. That is what the page is for:
finding people to contact. A person who applied to three vacancies is one row, and the application
detail is one click away on their card ([04](04-candidate-card.md)).

This spec also owns **My interviews** (§06), which is no longer a screen: it is this list's
`Assigned to me` **scope** (§08). One list, two questions — *who do I know?* and *what is next for
me?* — chosen by a tab rather than by a sidebar row.

## Actors & Preconditions

- **Actors:** `admin` and `manager` see the whole database; any member who is an assigned
  interviewer sees it narrowed to their own candidates. `viewer` has no access at all.
- **Preconditions:** at least one booking has been made, or the list shows its empty state.

## Functional Requirements

### 01. Rows

1. One row per **candidate**. Filters evaluate across **all** of that candidate's applications, so
   a candidate matches when any application satisfies a position or category clause.
2. Each row shows:
   - Full name and email.
   - **The application the row speaks for** — its vacancy title, interview date and time, and
     status. Which application that is depends on the scope (§08.44); in `All` it is the
     candidate's most recent one.
   - The number of applications, when more than one. Their whole history, in either scope.
   - The categories of the vacancies they have applied to, deduplicated.
3. **Each scope has its own order** (§08.42), because they answer different questions. In `All`,
   every candidate with a `scheduled` application precedes every candidate without one, most
   recently added first inside each group.
4. Times render in the viewing member's zone (`Account.timezone`), falling back to the
   organization's first-created interviewer mailbox zone when it is null. The zone is named once,
   above the table.
5. A row opens that candidate's card.

### 02. Search

6. A single search field filters **as the user types**, debounced **300 ms**, evaluated
   **server-side** — the same shape as the member search in user-management spec 04.
7. Search matches the candidate's **name** and **email** only. It does not search vacancy titles,
   interview notes, conclusions, or criteria values; those are narrowed by the filters instead.
8. Clearing the field restores the unfiltered list.

### 03. Filters

9. Three filter kinds, all optional, all composable:

   | Filter | Control | Semantics |
   |---|---|---|
   | Position | multi-select of vacancies | matches **any** selected (OR) |
   | Category | multi-select of categories | matches **any** selected (OR) |
   | Criterion | repeatable `criterion / operator / value` row | each row must hold (AND) |

10. Filters combine as **AND across kinds, OR within a multi-select**. So
    `(React OR Node) AND (Senior) AND (English ≥ B1) AND (AI Skills ≥ Good)`.
11. Search composes with every filter — the term narrows the already-filtered set.
12. A category filter matches a candidate when any of their applications is to a vacancy carrying
    that category.
13. Every applied filter is shown as a removable chip, with a "Clear all" when more than one is
    active.

### 04. Criteria Filters

14. A criterion filter row is `criterion`, `operator`, `value`. Available operators depend on the
    criterion's type:

    | Type | Operators | Compared by |
    |---|---|---|
    | `scale` | is · is not · at least · at most | the value's **position** in the scale |
    | `number` | = · ≠ · ≥ · ≤ | numeric value |
    | `boolean` | is yes · is no | boolean value |
    | `text` | contains · is | case-insensitive string |

15. Scale comparison is by ordered position, never by label, so renaming a scale value never
    changes what a filter matches, and reordering a scale changes it deliberately.
16. **A candidate's value for a criterion is the assessment from their most recent interview.**
    Precisely: across all of that candidate's applications that carry an assessment for this
    criterion, the one whose application `start` is greatest wins; ties break on the assessment's
    `updatedAt`.
17. This rollup is what makes the headline query work across vacancies: English assessed during a
    .NET interview still counts when filtering React applicants. English is English.
18. A candidate with **no** assessment for a filtered criterion does not match that row, under any
    operator — including `is not` and `at most`. Absence is not a value.
19. Archived criteria may still be filtered on, so historical data stays reachable. They are marked
    as archived in the criterion picker and sorted below the active ones.

### 05. Volume & Empty States

20. The list is **paginated**, with a **visible result count** above it — "128 candidates" and,
    when narrowed, "12 of 128". Infinite scroll was rejected: "how many match?" is the question this
    page exists to answer, and it is the one pattern that cannot show it.
21. **Empty database** — "No candidates yet. Share a booking link to start."
22. **No results** — "No candidates match these filters", with a clear-filters action.
23. **Loading** — skeleton rows matching the table layout.
24. **Error** — a friendly message with a retry.

### 06. My Interviews

The screen is gone; every clause below survives it, restated against the `Assigned to me` scope
(§08). The route redirects, so nothing that was already sent out stops working.

25. The **`Assigned to me` scope** narrows the list to candidates with an application to a vacancy
    where the viewer is the assigned interviewer. `/org/{orgId}/hiring/my-interviews` redirects to
    `/org/{orgId}/hiring/candidates?scope=mine`.
26. It is **candidate-grain** like the rest of the list. The old screen was application-grain
    because it was a different screen; a person the interviewer has seen twice is one row here, and
    the row speaks about the interview that scope is sorted by (§08.44).
27. It exists because without it the candidate card would be reachable from nowhere but a calendar
    invite: a `user` interviewer has no vacancies, no board and no library. Losing the email would
    lose the access.
28. Ordering within the scope answers *what is next for me?* — the nearest upcoming interview on
    top, then past ones most-recent-first. Folded onto people (§08.42): the interviews are the
    **viewer's own**, a candidate appears once, and the one that placed them is the one their row
    speaks about. It is what the old screen's two groups carried, which is why they did not have to
    survive as groups.
29. Each row opens that candidate's card, scoped as [04 §01](04-candidate-card.md) describes — the
    interviewer sees only their own applications there.
30. The scope is available to `admin` and `manager` too, showing the same thing: their own
    assigned interviews.
31. Reaching the list at all is gated on **role or assignment**: a member who is the interviewer on
    at least one vacancy has it, whatever their role. The shell resolves the session before
    rendering so that gated rows never flash into view; this is that mechanism with a different
    predicate, now applied to `Candidates` rather than to a row of its own.
32. Search, filters and pagination serve both scopes. The old screen had none of them because it
    was short by construction; nothing is lost by an interviewer gaining them.

### 07. Access

33. The candidate database is **`admin`/`manager` or an assigned interviewer**. Everyone else — a
    `viewer`, and a `user` nobody has assigned anything — receives the not-found state, and the API
    returns `404`. `403` is never returned here.
34. A member with no assignment and no managing role receives the not-found state rather than an
    empty list, so the list's existence is not advertised to people it will never serve.

### 08. Scope

35. Two scopes, `all` and `mine`, chosen by a tab strip above the list. `all` is the default.
36. The scope is **navigation, not a filter**. It is not counted in the applied-filter badge, it
    survives "Clear all", and it does not decide between the two filter-shaped empty states.
37. It is addressable — `?scope=mine` — so a link, a bookmark and a Back from a candidate card all
    open the tab they left. Absent from the URL, the last choice is remembered per browser;
    absent that too, it is `all`.
38. Each tab's label carries **how many candidates that scope holds under the filters already
    applied**, so a tab answers what the other one would show before it is pressed.
39. Switching scope preserves the search and every filter, and returns to page 1.
40. **The scope is resolved on the server.** A caller who may not see the whole database is given
    `mine` however they ask, and the response states the scope that was applied. The client
    reflects that answer and never enforces it.
41. A caller who may not see the whole database gets **no tab strip at all** — not a disabled one,
    not a single-tab one — and no count for the scope they may not see.
42. **The two scopes read in two orders**, because they ask two questions and a tab that only
    filtered would be a filter.

    | Scope | Question | Order |
    |---|---|---|
    | `All` | *who do I know?* | every candidate with a `scheduled` application, then everyone without one; most recently added first inside each group |
    | `Assigned to me` | *what is next for me?* | the viewer's nearest upcoming interview ascending, then everyone else by their most recent past one, descending |

    **A cancelled interview still counts in both.** `isCancelled` says the interview did not take
    place and deliberately nothing about the candidate's standing
    ([07 §01.1](07-manage-booking.md)), so it neither drops a candidate out of `All`'s first group
    nor out of `Assigned to me`'s upcoming half — which is what the old screen did too, listing
    them where they fell and marking them, rather than hiding an appointment somebody may still
    have in their calendar.
43. Ordering is **stable across a page boundary** — page 2 never repeats or drops a row from page 1.
    The `Assigned to me` split between upcoming and past is read from **one instant per request**,
    so a single response is ordered against a single clock. Between two requests it moves, and an
    interview that ends in between changes group — the same way a candidate created in between
    moves the list, and no more preventable.
44. In `Assigned to me`, the application a row speaks for is the **viewer's own** nearest upcoming
    interview, or their most recent past one when they have nothing ahead — the same application
    the order placed them by, so the row can never disagree with the position it sits in. In `All`
    it is the candidate's most recent application, whoever is interviewing it. The column heading
    moves with it; the two readings are not the same claim.

## Screens

### Candidate database

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Candidates                                             Times in Europe/Minsk │
│                                                                               │
│  ┌ ALL (128) ┐ ASSIGNED TO ME (4)                                             │
│  ─────────────────────────────────────────────────────────────────────────────│
│                                                                               │
│  [🔍 Search name or email…]                                                   │
│  Position [ React Eng. ×] [+]   Category [ Senior ×] [+]                      │
│  Criteria [ English  ▾ ][ at least ▾ ][ B1 ▾ ] ×     [ + Add criteria filter ]│
│                                                                               │
│  12 of 128 candidates                                     [ Clear all ]       │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ Name          │ Email            │ Latest application     │ Status      │  │
│  ├───────────────┼──────────────────┼────────────────────────┼─────────────┤  │
│  │ Jane Doe      │ jane@example.com │ Senior React Eng.      │ Scheduled   │  │
│  │ React·Senior  │                  │ 26 Aug 2026, 14:00     │             │  │
│  ├───────────────┼──────────────────┼────────────────────────┼─────────────┤  │
│  │ Ivan Petrov   │ ivan@example.com │ Senior React Eng.      │ Maybe       │  │
│  │ React  ·2 apps│                  │ 20 Aug 2026, 09:00     │             │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                          ‹ 1  2  3 ›                          │
└───────────────────────────────────────────────────────────────────────────────┘
```

### Assigned to me

The same screen, with the second tab lit and no tab strip at all for a caller who may not see the
first. An interviewer's whole hiring navigation is `Members` and `Candidates`.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  Candidates                                             Times in Europe/Minsk │
│                                                                               │
│  ALL (128) ┌ ASSIGNED TO ME (4) ┐                                             │
│  ─────────────────────────────────────────────────────────────────────────────│
│                                                                               │
│  4 of 128 candidates                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ Name          │ Email            │ Interview              │ Status      │  │
│  ├───────────────┼──────────────────┼────────────────────────┼─────────────┤  │
│  │ Jane Doe      │ jane@example.com │ Senior React Eng.      │ Scheduled   │  │
│  │               │                  │ 26 Aug 2026, 14:00     │             │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────┘
```

The third column is headed `Interview` rather than `Latest application`, and holds a different
interview: the viewer's own, nearest first (§08.44). Jane is at the top because 26 August is the
soonest thing this interviewer has, not because she booked most recently.

## Flows

### Main flow: the headline query

1. `admin` opens Candidates.
2. Selects the category `React` in the category filter.
3. Adds a criterion filter: `English`, `at least`, `B1`.
4. System sends one request with both clauses; the count updates to "12 of 128".
5. Opening a row lands on that candidate's card.

### Flow: search narrows an already-filtered set

1. With filters applied, the member types into search.
2. After 300 ms the request fires carrying the term **and** the filters; the count reflects both.

### Flow: an interviewer reaches their candidate without the invite

1. A `user` interviewer signs in and sees **Candidates** — their one hiring row.
2. They open it, land on their own candidates with no tab strip, find today's interview, and open
   the card.

### Alt flow: a criterion with no assessment

- A candidate never assessed on `English` is absent from the results of `English at least B1` and
  also from `English at most B1` — absence is not a value, and neither operator invents one.

## API Contracts

### GET /api/organizations/{orgId}/hiring/candidates

Query params:
- `search` (optional) — name or email, case-insensitive partial.
- `vacancyId` (optional, repeatable) — OR within.
- `categoryId` (optional, repeatable) — OR within.
- `criterion` (optional, repeatable) — `{criterionId}:{op}:{value}`, AND across. `op` is one of
  `is`, `not`, `gte`, `lte`, `contains`. `value` is a `CriterionValue` id for scales, a literal for
  the other types.
- `page` (optional, default 1), `pageSize` (optional, default 25, max 100).
- `scope` (optional, `all` | `mine`, default `all`) — **resolved server-side**. A caller with
  `canSeeAll: false` is given `mine` whatever they send. Unlike every other parameter here, an
  unrecognised value is not an error: the scope names no record this organization could fail to
  hold, so it falls back to the default rather than answering `422`.

Response `200`:
```json
{
  "total": 128,
  "matched": 12,
  "page": 1,
  "pageSize": 25,
  "canSeeAll": true,
  "scope": "all",
  "scopeCounts": { "all": 12, "mine": 3 },
  "viewerTimeZone": "Europe/Minsk",
  "candidates": [
    { "id": "uuid", "fullName": "Jane Doe", "email": "jane@example.com",
      "applicationCount": 1,
      "categories": [ { "id": "uuid", "name": "React" } ],
      "latestApplication": {
        "id": "uuid", "vacancyTitle": "Senior React Engineer",
        "startUtc": "2026-08-26T11:00:00.000Z", "status": "scheduled" } }
  ]
}
```

- `total` is the **org-wide, unfiltered** count and keeps that meaning in either scope; `matched`
  is the filtered one, for the scope that was applied. Both are shown.
- `scope` is what was **applied**, which may differ from what was asked. It also decides the order
  the `candidates` array arrives in (§08.42) and which application each `latestApplication` is
  (§08.44) — neither is negotiable from the query string, and there is no sort parameter.
- `latestApplication` keeps `All`'s name in both scopes: in `mine` it is the viewer's own nearest
  upcoming interview, or their most recent past one. Its `id` is always an application the row's
  candidate holds, so the card it opens is the same one either way.
- `scopeCounts` are computed under the filters already applied, and feed the tab labels.
  `scopeCounts.all` is **absent** when `canSeeAll` is false — a caller who may not see the whole
  database may not learn its size under an arbitrary filter either.
- `403` is never returned — a `viewer` and an unassigned `user` receive `404`.
- `422` `{ error: "invalid_filter" }` for a malformed `criterion` triple or an operator the
  criterion's type does not support.

### GET /api/organizations/{orgId}/hiring/my-interviews

No query params. **No screen calls this any more** — the list it served is
`GET …/hiring/candidates?scope=mine`, at candidate grain. The endpoint is retained, unchanged and
still gated on assignment; it remains the only place that answers at application grain.

Response `200`:
```json
{
  "viewerTimeZone": "Europe/Minsk",
  "upcoming": [
    { "applicationId": "uuid", "candidateId": "uuid", "candidateName": "Jane Doe",
      "vacancyTitle": "Senior React Engineer",
      "startUtc": "2026-08-26T11:00:00.000Z", "status": "scheduled" }
  ],
  "past": []
}
```

`404` when the caller is the interviewer on no vacancy.

## Validation Rules

1. `pageSize` is clamped to 100; a larger request is not an error, it is clamped.
2. Every `vacancyId` and `categoryId` must belong to this organization; unknown ids are rejected
   rather than silently dropped, so a filter never appears to match more than it should.
3. A `criterion` triple must name a criterion in this organization and an operator its type
   supports — `gte` against a `boolean`, or `contains` against a `scale`, is `422`.
4. For a `scale`, `value` must be a `CriterionValue` id belonging to that criterion.
5. Search is parameterised; special characters are data, never syntax.
6. `scope` is the one parameter that is **clamped rather than refused**, in both directions: an
   unrecognised value becomes `all`, and `all` becomes `mine` for a caller who may not see it.

## Error Messages

| Context | Message |
|---|---|
| Empty database | "No candidates yet. Share a booking link to start." |
| No results | "No candidates match these filters" |
| Invalid filter | "That filter isn't valid for this criterion" |
| Load failed | "We couldn't load candidates. Try again." |
| `Assigned to me`, nothing filtered, nothing to show | "No upcoming interviews." |
| Criterion picker — archived marker | "Archived" |
| Scope tabs | "All (n)" · "Assigned to me (n)" |

The empty-database message is driven by `total` — org-wide and unfiltered — and never by a scoped
count. An interviewer with no interviews must not be told to share a booking link while 35
candidates sit in a list they cannot see.

## UI Notes

- The result count sits directly above the table and updates with every request.
- Filter chips are removable individually; "Clear all" appears with two or more active.
- The criterion filter's operator and value controls re-render when the criterion changes, and the
  value resets rather than carrying a meaningless leftover across types.
- Rows link to the card; the whole row is the target.
- Required `data-testid` attributes:
  - `candidates-list`, `candidates-search-input`, `candidates-count`, `candidates-timezone`
  - `candidates-filter-position`, `candidates-filter-category`, `candidates-filter-chip-{id}`,
    `candidates-clear-filters`
  - `candidates-criteria-filter-add`, `criteria-filter-row-{index}`,
    `criteria-filter-criterion-{index}`, `criteria-filter-op-{index}`,
    `criteria-filter-value-{index}`, `criteria-filter-remove-{index}`
  - `candidate-row-{id}`, `candidate-name-{id}`, `candidate-email-{id}`,
    `candidate-latest-{id}`, `candidate-status-{id}`, `candidate-app-count-{id}`
  - `candidates-pagination`, `candidates-page-{n}`
  - `candidates-scope-tabs`, `candidates-scope-all`, `candidates-scope-mine`
  - `candidates-empty-state`, `candidates-no-results`, `candidates-loading-skeleton`

## Out of Scope

- Exporting the list, to CSV or anything else.
- Saved filter sets or shareable filter URLs beyond the query string.
- Bulk actions on candidates.
- Deleting or merging candidates.
- Emailing candidates from this screen.
- Searching notes, conclusions, or criteria values as free text.
- Sorting by an arbitrary column, or any sort control at all — each scope's order is fixed by the
  question it answers (§08.42).

## Test Cases

### TC-H03-UNIT-01: Filters AND across kinds and OR within a multi-select
- **Level:** Unit
- **Preconditions:** candidates spanning two vacancies and two categories.
- **Steps:**
  1. Build the query for positions `[A, B]`.
  2. Build the query for positions `[A]` and categories `[Senior]`.
  3. Build the query for two criterion rows.
- **Expected Result:**
  1. Matches candidates with an application to A **or** B.
  2. Matches candidates with an application to A **and** carrying the Senior category.
  3. Both criterion rows must hold — they AND, they do not OR.

### TC-H03-UNIT-02: The criterion rollup takes the most recent interview
- **Level:** Unit
- **Preconditions:** a candidate assessed `English = A2` in a March interview and `English = B2` in an August one.
- **Steps:**
  1. Resolve their English value.
  2. Evaluate `English at least B1`.
- **Expected Result:**
  1. `B2` — the assessment from the later interview wins.
  2. Matches.

### TC-H03-UNIT-03: A missing assessment matches no operator
- **Level:** Unit
- **Preconditions:** a candidate with no English assessment at all.
- **Steps:**
  1. Evaluate `English at least B1`, `English at most B1`, `English is B1`, and `English is not B1`.
- **Expected Result:**
  1. All four exclude the candidate. Absence is never treated as a value, not even by the negative operators.

### TC-H03-UNIT-04: Operators are constrained by criterion type
- **Level:** Unit
- **Preconditions:** criteria of each type.
- **Steps:**
  1. Resolve the operator set for each type.
- **Expected Result:**
  1. `scale` offers is / is not / at least / at most; `number` offers = ≠ ≥ ≤; `boolean` offers is yes / is no; `text` offers contains / is.
  2. No type offers an operator outside its row.

### TC-H03-UNIT-05: The `Assigned to me` order folds interviews onto people
- **Level:** Unit
- **Preconditions:** one interviewer's applications, spanning several candidates, some of whom hold more than one.
- **Steps:**
  1. Order a set where every interview is ahead.
  2. Order a set where every interview is behind.
  3. Order a candidate holding a past interview, one on Tuesday, and one next month.
  4. Order two candidates whose interviews start at the same instant, both ways round.
- **Expected Result:**
  1. Nearest first.
  2. Most recent first.
  3. The candidate appears once, placed by Tuesday, and the entry names **Tuesday's** application — the order and the row it speaks about come out of one pass.
  4. The caller's own order decides, so a page boundary falls in the same place on two consecutive requests.

### TC-H03-INT-01: The headline query
- **Level:** Integration
- **Preconditions:** candidates across a React-categorised vacancy and a .NET one, with a spread of English assessments.
- **Steps:**
  1. `GET` with `categoryId=React` and `criterion=English:gte:B1`.
- **Expected Result:**
  1. Only candidates with an application to a React-categorised vacancy **and** a rolled-up English of B1 or better are returned.
  2. `matched` reflects that number and `total` the unfiltered count.

### TC-H03-INT-02: A cross-vacancy assessment still counts
- **Level:** Integration
- **Preconditions:** a candidate whose only English assessment was recorded on their .NET application, and who also has a React application.
- **Steps:**
  1. `GET` with `categoryId=React` and `criterion=English:gte:B1`.
- **Expected Result:**
  1. The candidate is returned — the rollup spans all their applications, not only the matching one.

### TC-H03-INT-03: One row per candidate regardless of application count
- **Level:** Integration
- **Preconditions:** a candidate with three applications, two of them to selected positions.
- **Steps:**
  1. `GET` with both positions selected.
- **Expected Result:**
  1. The candidate appears exactly once.
  2. `applicationCount` is 3 and `latestApplication` is the most recent by interview start.

### TC-H03-INT-04: Renaming a scale value does not change what a filter matches
- **Level:** Integration
- **Preconditions:** a saved result set for `English at least B1`.
- **Steps:**
  1. Rename the `B1` value to `B1 (intermediate)`.
  2. Re-run the same filter.
- **Expected Result:**
  1. The same candidates are returned — comparison is by position, never by label.

### TC-H03-INT-05: An invalid filter is rejected, not ignored
- **Level:** Integration
- **Preconditions:** a `boolean` criterion and a vacancy in another organization.
- **Steps:**
  1. `GET` with `criterion={booleanId}:gte:true`.
  2. `GET` with a `vacancyId` from the other organization.
- **Expected Result:**
  1. `422` `invalid_filter`.
  2. `422` — the id is rejected rather than dropped, so the result can never be broader than the filter implies.

### TC-H03-INT-06: viewer and unassigned user receive 404 for the database
- **Level:** Integration
- **Preconditions:** callers as `viewer` and as a `user` nobody has assigned anything.
- **Steps:**
  1. As each, `GET` the candidates endpoint.
- **Expected Result:**
  1. Both receive `404`, never `403`.
  2. No candidate data appears in either response.

### TC-H03-INT-07: My interviews is scoped to assignment
- **Level:** Integration
- **Preconditions:** interviewer P on vacancy V; interviewer S on vacancy W; both vacancies have applications; member Q has no assignment.
- **Steps:**
  1. `GET` my-interviews as P, as S, and as Q.
- **Expected Result:**
  1. P sees only V's applications; S only W's.
  2. Q receives `404`, not an empty list.

### TC-H03-INT-08: the scope is resolved on the server
- **Level:** Integration
- **Preconditions:** interviewer I on vacancy V, with a candidate; a second vacancy W with a candidate I never sees; a candidate who booked both.
- **Steps:**
  1. `GET` candidates as I, with no `scope`.
  2. `GET` candidates as I, with `scope=all`.
  3. `GET` candidates as an `admin`, with and without `scope=mine`.
  4. `GET` candidates as the `admin` with `scope=nonsense`.
- **Expected Result:**
  1. `canSeeAll: false`, `scope: "mine"`, and only V's candidates — W's is absent, not unlisted.
  2. Identical to 1: hand-crafting the query widens nothing, and the response says `mine`.
  3. `canSeeAll: true`; `scope` echoes what was asked, and `matched` is that scope's own count.
  4. `200` with `scope: "all"` — an unrecognised scope is clamped, not refused.

### TC-H03-INT-09: scope counts are filtered, and `all` is withheld from an interviewer
- **Level:** Integration
- **Preconditions:** as TC-H03-INT-08.
- **Steps:**
  1. `GET` as the `admin`, unfiltered, then with a position filter.
  2. `GET` as I.
- **Expected Result:**
  1. `scopeCounts` carries both scopes, and both numbers narrow under the filter.
  2. `scopeCounts` carries `mine` only; `all` is absent, so the database's size under an arbitrary filter is never disclosed.
  3. `total` stays the org-wide unfiltered count in every case, including in `mine`.

### TC-H03-INT-10: `All` lists the people still in play first
- **Level:** Integration
- **Preconditions:** four candidates added on known days; two of their applications moved off `scheduled`, one of them cancelled rather than moved.
- **Steps:**
  1. `GET` candidates with no scope.
  2. `GET` page 1 and page 2 with a page size that cuts across the boundary between the two groups.
- **Expected Result:**
  1. Every candidate with a `scheduled` application precedes every candidate without one, most recently added first inside each group.
  2. The cancelled interview is still `scheduled` and its candidate is in the first group.
  3. The two pages hold the whole list once — the boundary falling inside a page repeats nothing and drops nothing.

### TC-H03-INT-11: `Assigned to me` answers what is next for me
- **Level:** Integration
- **Preconditions:** four candidates of the viewer's own, at +1 day, +5 days, −1 day and −30 days; and a candidate the viewer sees in two days whose *latest* application is a month away with somebody else.
- **Steps:**
  1. `GET` candidates with `scope=mine`.
  2. `GET` the same, paged in two.
  3. `GET` with no scope, and compare.
  4. Read the two-interviewer candidate's `latestApplication` in each scope.
- **Expected Result:**
  1. Nearest ahead first, then the rest by their most recent behind.
  2. Page 2 repeats and drops nothing.
  3. The same people, in a different order — the scopes are two orders, not one order behind a filter.
  4. In `mine` it is the viewer's own interview in two days; in `all` it is the other interviewer's, a month away. `applicationCount` is 2 in both — the scope narrows who is listed, not what is read about them.

### TC-H03-E2E-01: Filter by category and criterion, and read the count
- **Level:** E2E
- **Preconditions:** logged in as `admin`; seeded candidates with categories and English assessments.
- **Steps:**
  1. Open Candidates and note the count.
  2. Add the category filter `React`.
  3. Add a criterion filter `English / at least / B1`.
  4. Remove the category chip.
- **Expected Result:**
  1. The count shows the unfiltered total.
  2. It narrows after each filter and reads "n of total".
  3. Removing a chip widens the result set and updates the count.
- **Selectors:** `candidates-count`, `candidates-filter-category`, `candidates-criteria-filter-add`, `criteria-filter-criterion-0`, `criteria-filter-op-0`, `criteria-filter-value-0`, `candidates-filter-chip-{id}`.

### TC-H03-E2E-02: Search debounces and composes with filters
- **Level:** E2E
- **Preconditions:** logged in as `admin`; a filter already applied.
- **Steps:**
  1. Type five characters quickly into search.
  2. Wait for the debounce.
- **Expected Result:**
  1. No request fires during the burst.
  2. One request fires afterwards carrying both the term and the existing filter; the count reflects both.
- **Selectors:** `candidates-search-input`, `candidates-count`.

### TC-H03-E2E-03: A user interviewer sees only their own candidates
- **Level:** E2E
- **Preconditions:** logged in as a `user` who is the interviewer on one vacancy with candidates, in an organization holding another interviewer's candidates too.
- **Steps:**
  1. Inspect the sidebar.
  2. Open Candidates and open a row.
  3. Navigate to `…/hiring/candidates?scope=all` by hand.
  4. Navigate directly to the vacancies and board URLs.
- **Expected Result:**
  1. Opening the Hiring group shows Candidates alone; Vacancies, Libraries and any My interviews row are not there, and none flashes during load.
  2. No tab strip is drawn; only their own candidates are listed; the row opens the card, showing only their own vacancy's application.
  3. The list is unchanged — the other interviewer's candidate is absent from the page.
  4. Each renders the not-found state.
- **Selectors:** the `Hiring` group title by accessible name, `nav-candidates`, `nav-vacancies` · `nav-hiring-settings` · `nav-my-interviews` (all asserted absent), `candidates-scope-tabs` (asserted absent), `candidates-list`, `candidate-card`.

### TC-H03-E2E-04: Candidates is absent for a member with no assignment
- **Level:** E2E
- **Preconditions:** logged in as a `user` who interviews for nothing.
- **Steps:**
  1. Inspect the sidebar.
  2. Navigate directly to `/org/{orgId}/hiring/candidates`, with and without `?scope=mine`.
- **Expected Result:**
  1. No Hiring group exists, so there is no Candidates row and nothing to open in search of one.
  2. Both navigations render the not-found state, not an empty list.
- **Selectors:** the `Hiring` group title by accessible name (asserted absent), `nav-candidates` (asserted absent), `candidates-list` (asserted absent).

### TC-H03-E2E-05: The scope is navigation, and it survives
- **Level:** E2E
- **Preconditions:** logged in as an `admin` who interviews for one of two vacancies, each with a candidate.
- **Steps:**
  1. Open Candidates and read both tab labels.
  2. Switch to `Assigned to me`.
  3. Reload.
  4. Open a candidate and go back.
  5. Open `/org/{orgId}/hiring/my-interviews`.
- **Expected Result:**
  1. `All (2)` and `Assigned to me (1)`, with `All` selected.
  2. Only their own candidate is listed, and the address carries `?scope=mine`.
  3. The same tab is selected.
  4. The same tab is selected, with the same rows.
  5. It redirects to `…/hiring/candidates?scope=mine`.
- **Selectors:** `candidates-scope-all`, `candidates-scope-mine`, `candidates-list`.
