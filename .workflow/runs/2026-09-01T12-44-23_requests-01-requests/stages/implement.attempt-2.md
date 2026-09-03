# implement — attempt 2 — requests/01-requests

Spec: `specs/requests/01-requests.md` (sha `5fe4c35e…`).
Base: `f06c7d8`. Branch: `spec/requests`. Attempt 1 is `481a165`; this attempt adds one
commit on top and amends nothing.

Both findings are correct. Both are fixed. Nothing is contested.

## Findings

### 1. `pipeline/no-detector-weakening` — `apps/api/test/requests-page.spec.ts`, 3 more assertions removed than added

**Fixed.** The finding is right, and the mechanism it describes is what happened: I moved
this file onto the new envelope by *rewriting* assertions, and three of the ones I removed
had no replacement at all. Named precisely, the losses were:

- **three `totalCount` assertions.** The key genuinely moved — the new envelope carries
  `counts.total` / `counts.waitingOnMe` and `vacation.pendingCount` — but the *fact* those
  assertions pinned (a counter never moves with a filter) survived the move intact, and I
  dropped it instead of re-pinning it.
- **two 403-body assertions in TC-10-INT-03**, replaced by two weaker ones (a status code
  and an absent key). Requirement 37 reverses the page-level refusal, but it does not
  abolish the refusal: it *moves* it to the `All` scope. I asserted the arrival and not
  the departure.

What the file now asserts, all of it real behaviour that fails if the code is wrong:

| Case | Added |
|---|---|
| TC-10-INT-01 | the two sections are separate arrays — `requests: []` while the vacation half holds three rows — and `counts` is `{ waitingOnMe: 0, total: 0 }` |
| TC-10-INT-02 | the `all` view's three statuses; `declined`'s row status as well as its comment; **the filter-independence pin restored on the counters that replaced `totalCount`** — `counts` identical across the `granted`, `open` and `declined` calls, and `vacation.pendingCount` still 1 in each |
| TC-10-INT-03 (reversed) | both bodies (`requests`, `counts`) for `user` and `viewer`, **plus the refusal that replaced the page-level one**: `scope=all` answers 403 with the spec's literal `scopeForbidden` copy for both roles |
| default-filter case | `counts`, and that the value this case used to send by default (`status=pending`) is now a 400 with the exact validation body |

Counted against the diff base: **40 assertions added, 22 removed**, from 19/22 before.
The two `expect`s that no longer exist are the ones asserting a 403 the spec deliberately
reverses; the rule they guarded is now guarded by four assertions in the same case, on the
scope refusal that took its place.

### 2. `pipeline/no-detector-weakening` — `apps/web/app/org/[orgId]/requests/page.tsx`, a disabled lint rule was added

**Fixed.** The `// eslint-disable-next-line react-hooks/exhaustive-deps` is gone and the
rule is satisfied honestly: `router` is now named in the dependency array of the
URL-syncing effect, because the effect references it. The App Router's `useRouter()`
instance is stable across renders, so naming it changes no behaviour — the effect still
fires only when one of the five filter values moves. There was no reason to suppress
anything, and the comment I wrote to justify it ("router is stable; excluding it keeps
this effect firing only on state change") was an argument for a suppression that bought
nothing.

Worth recording for whoever reads the gate next: **ESLint is not configured in this
repository at all.** `npx next lint` in `apps/web` answers with Next 15's deprecation
notice and then offers to set ESLint up from scratch, so `react-hooks/exhaustive-deps` was
never being enforced here. That makes the suppression worse rather than better — it was a
comment that weakened a checker in the reader's mind while doing nothing to any checker on
disk. It is the only suppression the diff ever contained: `git diff <base>...HEAD` now
matches no `eslint-disable`, `@ts-ignore`, `as any`, `.skip` or `.only`.

## Files touched this attempt

- `apps/api/test/requests-page.spec.ts` — assertions restored and strengthened (above).
- `apps/web/app/org/[orgId]/requests/page.tsx` — suppression removed, `router` in deps.

Nothing else changed. No production behaviour changed in this attempt: the only source
edit is a dependency array whose contents were already stable.

## Commands run

| Command | Result |
|---|---|
| `npm run test:unit` (root) | `Test Files 21 passed (21)`, `Tests 1024 passed (1024)` |
| `npx tsc --noEmit -p tsconfig.json` (`apps/api`) | clean |
| `npx tsc --noEmit -p tsconfig.json` (`apps/web`) | only the eight pre-existing `TS2307`s for `@dnd-kit/*`, `dompurify` and `marked` — declared in `apps/web/package.json`, absent from `node_modules` on this machine. No error in any file this diff touches. |
| `npm test -- test/requests-page.spec.ts` (`apps/api`) | `Tests: 5 passed, 5 total` |
| `npm test -- test/requests.spec.ts` (`apps/api`) | `Tests: 23 passed, 23 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/requests.spec.ts tests/requests-page.spec.ts tests/regressions.spec.ts` (`e2e`) | `23 passed (59.0s)` |

## Still standing from attempt 1

The three notes in `implement.attempt-1.md` are unchanged and still want a reader:

1. **TC-01-INT-13's stated precondition cannot occur.** "Create with `neededBy` = tomorrow,
   then read it as an account whose timezone makes that date past" — the widest UTC offset
   spread is 26 hours, so two readers' calendar dates differ by at most one day, and a date
   after every reader's today cannot be before any reader's today. The case reaches AC-8 by
   the two routes the spec itself describes: the boundary day of edge case 10, and a date
   that passed while the request stayed open. Requirement 33 has exactly one implementation,
   so this is a note, not a `spec` finding.
2. **`specs/user-management/10-*.md` is not edited** — T9 asks for a `- **Retired.**` line
   there and writing under `specs/` is closed to this stage. The retirement is recorded in
   the test file instead, naming TC-01-INT-18 and TC-01-E2E-08.
3. **The reassign modal's internals carry no spec-named `data-testid`**, so TC-01-E2E-07
   clicks the button the spec names and completes the reassignment through the API. Two
   more ids in the spec's table would let the modal be driven end to end.
