# implement — attempt 5

Spec: `specs/requests/02-request-topics.md` (+ `.contracts.md`, `.cases.md`)
Branch: `spec/requests-02-client-participants` · Diff base: `225e843a`
Commit: `1c92fd9` (on top of `90e412f`)

Both findings **fixed**. Neither is contested.

---

## Why these two findings arrived three times

They did not come back because the fixes were wrong. They came back because **I never
committed them.** The code changes for CR-26 and CR-16 were written in attempt 3, verified
on disk in attempt 4, and both times the turn ended with `HEAD` still at `90e412f` —
attempt 1's commit. The reviewer reads `git diff 225e843a...HEAD`, so all three reviews read
attempt 1's code and produced the identical finding, down to the same line numbers
(`request-topics.spec.ts:982-989`, `page.tsx:113-127`) — line numbers that no longer exist
in the working tree and had not existed since attempt 3.

My agent definition says this in as many words: *"Then commit, on the working branch, in one
commit. Not optional: the reviewer reads `git diff <baseRef>...HEAD`, so work left
uncommitted makes that diff empty and the review silently falls back to the whole worktree."*
I read it as advice about finishing tidily and treated the test run as the finish line. It is
not: **an uncommitted fix is not a fix**, and the loop cannot tell the difference between
"the implementer did nothing" and "the implementer did the work and left it on the floor".
Two review attempts were spent on that distinction.

This attempt committed **first**, before re-running anything, and then verified that the
diff the reviewer will read actually contains both changes. That check is reproduced below,
because "I fixed it" is not evidence and `git diff <base>...HEAD` is.

```
$ git --no-pager diff 225e843a...HEAD -- apps/api/test/request-topics.spec.ts | grep '^+' | grep -E 'submitVacation|vacationStatuses\(|status=closed'
+  const submitVacation = (member: Signed, weekOffset = 0) =>
+    const stayPending = await submitVacation(holidaymaker, 0);
+    const toReject = await submitVacation(holidaymaker, 3);
+    const toCancel = await submitVacation(holidaymaker, 6);
+    expect(await vacationStatuses('?status=all')).toEqual(
+    expect(await vacationStatuses('?status=closed')).toEqual(['cancelled', 'rejected'].sort());
+    expect(await vacationStatuses('?status=open')).toEqual(['pending']);
+    expect(await vacationStatuses('?status=granted')).toEqual([]);

$ git --no-pager diff 225e843a...HEAD -- packages/validation/src/requests.test.ts | grep '^+.*closed'
+    expect(vacationStatusesFor('closed')).toEqual(['rejected', 'cancelled']);

$ git --no-pager diff 225e843a...HEAD -- 'apps/web/.../request-topics/page.tsx' | grep '^+' | grep -E 'response.ok|failure|setError'
+  const [error, setError] = useState<string | null>(null);
+      if (!response.ok) {
+        failure = answer?.message ?? REQUEST_MESSAGES.genericError;
+    if (failure) setError(failure);
```

---

## CR-26 — the `closed` → vacation mapping had no witness at any level

**Fixed.** The finding was exactly right on all three counts: no vacation row was ever
created in the file, `[].every(...)` is `true` for every candidate mapping, and the "no
pending one" half of the spec's Expected Result was never checked.

Two changes:

**1. `apps/api/test/request-topics.spec.ts` — TC-02-INT-17 builds the state the spec's Steps
require.** The vacation fixture helpers (`futureMonday`, `futureWorkingRange`,
`configureAndFund`, `submitVacation`) are ported from `apps/api/test/requests.spec.ts`, which
builds the same rows for the same reason. The case now creates a member, funds them, and
drives three vacation requests to **pending**, **rejected** and **cancelled** through the
product's own review and cancel routes — no seeded statuses.

```ts
// All three are there when nothing narrows the page — the precondition the two
// assertions below are measured against.
expect(await vacationStatuses('?status=all')).toEqual(['cancelled', 'pending', 'rejected'].sort());

// `closed` returns the rejected and the cancelled row and NO pending one.
expect(await vacationStatuses('?status=closed')).toEqual(['cancelled', 'rejected'].sort());

// And the neighbouring values still mean what spec 01 fixed them to mean.
expect(await vacationStatuses('?status=open')).toEqual(['pending']);
expect(await vacationStatuses('?status=granted')).toEqual([]);
```

`toEqual` on the sorted status list, not `.every(...)`: an exact set is what makes "and no
pending one" a real assertion. The `?status=all` line above it is the precondition that
proves the three rows exist, so the `closed` assertion cannot pass by the section being
empty — which is precisely how the old one passed.

**2. `packages/validation/src/requests.test.ts` — the sibling assertion the branch was
missing.** The block enumerated the other six query values and stopped short of the new one:

```ts
expect(vacationStatusesFor('closed')).toEqual(['rejected', 'cancelled']);
```

**Mutation-checked, not assumed.** I broke the arm (`case 'closed': return null;`), rebuilt
the validation package, and ran both levels:

| Level | Command | With the arm broken |
|---|---|---|
| Unit | `npm run test:unit` | `Tests 1 failed | 1083 passed (1084)` |
| Integration | `npm test -- test/request-topics.spec.ts` | `× answers status=closed with both closures…` — `1 failed, 21 passed` |

Both now fail on a wrong mapping, which is the property the old assertion lacked. The arm
was then restored and both are green again.

## CR-16 — every write on the catalogue screen swallowed its failure

**Fixed.** The witness was accurate: `write()` awaited the fetch and discarded it entirely,
so the 409 `statusUnchanged` that REQ-02-013, edge case 12 and AC-13 exist to produce was
invisible, as were 403 `manageForbidden` and every 5xx. Only a thrown fetch set the error
state.

`apps/web/app/org/[orgId]/settings/request-topics/page.tsx`:

- `error` changed from `boolean` to `string | null` — it now carries the message to show
  rather than a flag meaning "show the generic one". The read path sets
  `REQUEST_MESSAGES.genericError`, which is what it always displayed.
- `write()` reads `response.ok`, parses the body on failure, and takes the server's own
  `message` — so the banner renders `statusUnchanged` and `manageForbidden` verbatim,
  falling back to the generic copy for an unparseable body or a thrown fetch.
- The banner renders `{error}` instead of a hardcoded constant.

One ordering detail that is load-bearing, and is commented as such in the file: the failure
message is applied **after** `await load()`, not before. `load()` clears the banner on
success, so setting the error first would have it erased by the re-read a fraction of a
second later — the failure would have been reported and then silently withdrawn. The re-read
still happens either way, so curator B in the finding's scenario now sees both true things at
once: the row moved to Archived (A's write) **and** a banner saying "This topic is already in
that state".

**This fix has no test, and that is a spec gap rather than a choice.** The behaviour is
web-only, so integration cannot see it, and the spec's `data-testid` table names no id for
the catalogue banner or its retry control — I removed the three ids I had invented for them
in attempt 2, correctly, because an id the spec does not name is not mine to add. With no
named selector there is no way to drive it from E2E without reaching past a testid into a
role or a text match, which the conventions forbid. Raised as a note on the verdict; the spec
would need a `request-topics-error-banner` row in its testid table for this to be assertable.

---

## Commands run

| Command | Summary line |
|---|---|
| `npm run test:unit` | `Test Files 23 passed (23) · Tests 1084 passed (1084)` |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| `npx tsc --noEmit -p packages/validation/tsconfig.json` | clean |
| `apps/api: npm test -- test/request-topics.spec.ts test/requests.spec.ts` | `Test Suites: 2 passed · Tests: 45 passed, 45 total` |
| `e2e: … playwright test tests/request-topics.spec.ts tests/requests.spec.ts tests/requests-page.spec.ts tests/regressions.spec.ts` | `29 passed (1.3m)` |
| `npm run gate` | `static-gate: pass (diff against 225e843a)` |

E2E held ports 3100/4100. Integration and E2E were run targeted, never whole.

---

## Two notes for a person, neither blocking

**The static gate's 14 false findings from attempt 2 are gone, fixed upstream.** Attempt 2
was sent back with 17 `spec/testid-unnamed` blockers; three were genuinely mine (ids I had
invented for the banner, the retry control and the skeleton — removed, and they stay removed)
and fourteen were the gate reading only `<name>.md` and never the bundle members that name
those ids. `scripts/static-gate.mjs` has since been changed to read the whole bundle, and its
comment records the same diagnosis. Nothing was needed from me; the gate now passes.

**`scripts/` carries somebody else's uncommitted work in this worktree** —
`refine-read.mjs`, `run-report.mjs`, `spec-index.mjs`, `static-gate.mjs` modified and
`run-tail.mjs` untracked. It is not mine and is outside this handoff's globs, so I staged my
three files by name rather than with `git add -A` and left all of it untouched. It is still
uncommitted in the worktree.
