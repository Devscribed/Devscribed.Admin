# implement — attempt 1

Document: `specs/patches/PATCH-001-mock-rename-a-variable.md` (patch track — the note is the plan).

## What the rule asked for

> the implementer shall rename exactly one local variable in one file and change nothing else.
> No behaviour changes, no route changes, no message changes.

`files: 1`, `cases: []`, `supersedes: null`, `requirement: null`.

## What I changed

| task | file | change |
|---|---|---|
| (no task ids — no plan compiled) | `apps/api/src/clients/clients.service.ts` | renamed the local `q` to `searchTerm` inside `ClientsService.listClients` |

The note does not name the file, so I chose one against its own blast-radius sentence — a binding
"declared and used inside a single function and is not exported". `q` in `listClients` is declared
at one line and read on the three that build `searchFilter`; it is not exported, not a field, and
not part of any signature. The `?q=` query parameter itself is untouched: the read stays
`typeof query.q === 'string' ? query.q : ''`, so the route's contract is byte-identical.

Diff is 3 insertions, 3 deletions, one file. No `data-testid`, no user-facing message, no route,
no schema, no migration, no test edited or added.

## Test cases written

None. The note's Cases section says so, and a rename with no observable behaviour has no
assertion that could fail.

## Commands run

| command | summary |
|---|---|
| `npm run test:unit` (root) | `Test Files 23 passed (23)`, `Tests 1098 passed (1098)` |
| `npx tsc --noEmit -p tsconfig.json` (from `apps/api`) | exit 0, no output |
| `npm test -- test/clients.spec.ts` (from `apps/api`) | `Test Suites: 1 passed, 1 total`, `Tests: 30 passed, 30 total` |

`clients.spec.ts` is the integration suite over the touched file, including its `?q=` search
cases — it is the suite that would catch a botched rename. No E2E file is touched by this diff
and no E2E was run: the change is internal to one API service and reaches no screen.

## Findings

None. Nothing contested; no `spec` finding — the rule is implementable as written.
