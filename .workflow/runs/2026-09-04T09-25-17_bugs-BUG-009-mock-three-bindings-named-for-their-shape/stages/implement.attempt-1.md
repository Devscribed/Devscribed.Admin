# implement — attempt 1

Document: `specs/bugs/BUG-009-mock-three-bindings-named-for-their-shape.md` (bug track, no plan
compiled — the document is the plan, and its Fix Approach table is the file bound).

Variant: `orchestrated`. Three implementer children on sonnet, one per row of the Fix Approach
table, dispatched in parallel; the type check, the suites and the commit are the lead's.

## Tasks

| Task | File | Change | Child |
|---|---|---|---|
| T1 | `apps/api/src/holidays/holidays.service.ts` | `rows` → `holidays` in the list method | ok |
| T2 | `apps/api/src/kanban/activity.service.ts` | `rows` → `entries` | ok |
| T3 | `apps/api/src/kanban/comments.service.ts` | `rows` → `comments` | ok |

Each child was given exactly one file as its boundary and told the other two were being written
at that moment. All three returned `"status": "ok"` with `"blocked": []`.

## Integration read

`git diff ed35865...HEAD --stat` is three files, 6 insertions and 6 deletions — two lines per
file: the declaration and its single downstream use. No exported symbol, no signature, no
behaviour. The three sets of changed lines are disjoint, as the Blast Radius section says they
must be. Nothing outside the three files in the table is changed.

Two things the children were told to leave alone, and did: the doc-comment prose using the word
"rows" above the holidays list method (it is prose, not the binding), and the `.map((r) => …)`
callback parameters in the two kanban services (not named by the document). In
`comments.service.ts` the result is the shorthand-adjacent `{ comments: comments.map(…) }` —
legal, and the property name was already `comments` before the change.

## Test cases

None. The document's Regression Test section is `None`: a rename with no observable behaviour has
nothing an assertion could catch. No `TC-*` was written, and none was retired.

## Commands run

| Command | Summary |
|---|---|
| `npx tsc --noEmit` (from `apps/api`) | exit 0, no output — the document's acceptance criterion |
| `npm test -- test/holidays.spec.ts test/kanban.spec.ts` (from `apps/api`) | `Test Suites: 2 passed, 2 total` / `Tests: 120 passed, 120 total` — the integration suites this diff touches |
| `npm run test:unit` (root) | `Test Files 23 passed (23)` / `Tests 1098 passed (1098)` |

No E2E: the diff touches no web file and no server-visible behaviour, so no E2E file is touched by
it. Integration was filtered by positional path, never `--testPathPatterns`.

## Acceptance criteria

- Three bindings renamed as tabled — yes, verified in the diff.
- `npx tsc --noEmit` passes for the API — yes, exit 0.
- No file outside the three in the table changed — yes, `--stat` lists exactly those three.

## Commit

`f437e21 implement 1: name three bindings for what they hold, not their shape (BUG-009)`, on
`test/flow-check`. Paths staged by name; the untracked `.workflow/` run directories were not
staged. Not pushed.

## Contested

Nothing. No `spec` finding: the document is a fixture and says so, but nothing in it is
ambiguous or contradictory at the level of the work it asks for.
