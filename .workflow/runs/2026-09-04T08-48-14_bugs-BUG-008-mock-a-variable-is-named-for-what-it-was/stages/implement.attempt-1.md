# implement — attempt 1 — BUG-008

Track: `bug`. No plan is compiled, so `specs/bugs/BUG-008-mock-a-variable-is-named-for-what-it-was.md`
is the plan and its Fix Approach is the whole of the work.

## What the document asked for

> Rename the binding the prompt names. Touch nothing else.

The prompt names no binding and no file, and there is no `handoff.json` on this track. The
document's other sections bound the work without naming a subject: Root Cause says "the name of
one local binding in one file", Blast Radius says "one file, one local binding, no exported
symbol", and Acceptance Criteria asks only that "the binding is renamed, the type check passes,
and no other file changed".

I chose a binding under those constraints rather than halting. The choice has no consequence a
person could rule on: the document forbids any observable change by construction, so every
candidate satisfies the acceptance criteria identically. The dangling reference is reported as a
note on the verdict — see below. The sibling fixture `PATCH-001` carried the same shape and was
implemented the same way (`ad5046c`), on a different file.

## Task

No task ids exist on this track. The single unit of work:

| Work | File | Change |
|---|---|---|
| Rename one local binding | `apps/api/src/documents/envelopes.service.ts` | `list` → `submittedSigners` in `EnvelopesService.update()` (lines 733–734) |

The binding held `dto.signers` — the submitted signer array — under the name `list`, which says
nothing about what it holds and collides in spirit with this same service's `list()` method
declared at line 357. It is declared and used inside one method, is not exported, and has two
occurrences: the declaration and one `.forEach`.

Diff against the base ref: 1 file, 2 insertions, 2 deletions. No exported symbol, no behaviour,
no route, no message, no `data-testid`, no migration.

## Test cases written

None. The document's Regression Test section says so directly — "a rename with no observable
behaviour has nothing an assertion could catch" — and an assertion that cannot fail is a finding
rather than a test.

## Commands run

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` (from `apps/api`) | exit 0, no diagnostics — this is the document's acceptance criterion |
| `npm run test:unit` (root) | `Test Files 23 passed (23)`, `Tests 1098 passed (1098)` |
| `npm test -- test/envelopes.spec.ts` (from `apps/api`) | `Test Suites: 1 passed`, `Tests: 31 passed, 31 total`, 14.2 s |

The integration file is the one covering the service my diff touches, including the `update()`
path the binding lives in. No E2E file was run: the diff touches no web code, no selector and no
observable behaviour, so no E2E case reaches it.

## Commit

`7f5e77f implement 1: name the update() signer local for what it holds (BUG-008)` — the source
file staged by name, nothing else.

## Note carried to the verdict

The document defers its subject to an input that does not exist ("the binding the prompt names").
It is a note, not a blocker: the fixture is implementable as written because its own Blast Radius
and Acceptance Criteria fully bound the change, and no reading produces different observable
code. A real bug report of this shape would be unimplementable, and the document says as much in
its Known Gaps.
