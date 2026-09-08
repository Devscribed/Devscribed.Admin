# implement — attempt 6 (orchestrated)

Spec `specs/portal/01-home.md`, branch `spec/portal-home`, base
`7a6e059e2389ff0b34ee85001a0e6ecf450c8a84`. Implementation commit unchanged: `6bfa212`.

**No code changed in this attempt, and no child was dispatched.** The static gate returned one
blocker and one note. The blocker is a false positive and is contested; the note is a
duplication this spec records deliberately. There was nothing to fix.

## The blocker — contested

**`pipeline/no-detector-weakening` (apps/api/src/portal/portal-home.service.ts) — "an `as any`
cast was added".**

Contested, with this counter-witness:

```
node scripts/wf.mjs contest \
  --finding "pipeline/no-detector-weakening@apps/api/src/portal/portal-home.service.ts#-" \
  --reason "..."
```

There is no `as any` cast in the file. The gate's detector is a line-wise regex,
`/\bas\s+any\b/` at `scripts/static-gate.mjs:137`, run over added lines with no comment
awareness. The line it matched is `portal-home.service.ts:111`:

```ts
    if (!hasCapability(membership.role, 'ViewPortalHome')) {
      // Not a reachable state — every staff role holds this capability — but the
      // refusal discipline is "not-found, never forbidden" throughout this spec, so a
      // membership that somehow lacks it is answered the same as any other stranger.
      throw new NotFoundException();
    }
```

The words are the English *"the same as any other stranger"*, inside a `//` comment.

Four checks, each cheap to repeat:

1. `grep -n "as any" apps/api/src/portal/portal-home.service.ts` returns **exactly one** hit,
   line 111, and that line begins with `//`.
2. A TypeScript `as any` assertion needs an expression on its left. The token on the left here
   is the word `same`.
3. The file contains no `@ts-ignore`, no `@ts-expect-error`, no `eslint-disable` and no
   `as unknown as`, and `npx tsc --noEmit -p apps/api/tsconfig.json` is clean — nothing in it
   suppresses a type error.
4. `git diff <base>...HEAD | grep -E "^\+" | grep -E "as any|@ts-ignore|\.skip\(|\.only\(|eslint-disable"`
   over the whole change returns only that comment and the gate's own previously committed
   verdict JSON.

That fourth check is the argument for the mechanism rather than for this line. **The same regex
matches the gate's own output**: lines 2422–2467 of this run's `baseRef...HEAD` diff are a
committed `static_gate.verdict.json` quoting its own message, `"an \`as any\` cast was added"`.
A detector that flags its own prose is matching English, not code, and it will do so again for
any file that writes "as any other".

**Why this is contested rather than edited.** Rewording the comment would turn the gate green
in one word without the code being any more correct than it already is, and would leave the next
occurrence of those three words to fail in exactly the same way. The fix belongs in
`scripts/static-gate.mjs` — skip a match that falls inside a `//` or `/* */` comment — and that
is machinery, so it belongs on a `build/*` branch and not on this run's branch. It is also not
mine to make: an implementer editing the gate that judges it is the precise thing
`no-detector-weakening` exists to prevent, whichever branch the edit lands on.

## The note — expected, and by design

**`spec/message-duplicated` — `PORTAL_MESSAGES.noProject` is in `packages/validation` and also
written inline in `apps/api/src/reports/reports.service.ts`.**

Correct, and deliberate. `specs/portal/01-home.contracts.md` says so in its own words:

> `PORTAL_MESSAGES.noProject` is a **new export carrying a string the reports service already
> writes inline** — `ReportsService.buildTimeAndActivity` composes it where a time entry has no
> project. This spec does not change that call site; it declines to copy the literal a second
> time.

The handoff carries the same decision in `shippingSurfaces` ("This spec exports the string and
changes neither call site. The duplication is deliberate and recorded so whoever next edits
either finds the other"). Changing `reports.service.ts` would put a second area's screens inside
this run's blast radius for no requirement. Left as the document specifies; the note is the
record the document asked for, and it does not block.

## State of the work

Unchanged from attempt 5 and still green — nothing was touched, so nothing was re-run:

| Command | Result |
|---|---|
| `npm run test:unit` | `Test Files 37 passed (37)` · `Tests 1475 passed (1475)` |
| `npm test -- test/portal.spec.ts` (from `apps/api`) | `Tests: 18 passed, 18 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/portal.spec.ts tests/regressions.spec.ts` | `18 passed`, exit 0, no flakes |
| `npx tsc --noEmit` (api and web) | clean |

The run now halts for a person, which is what a contest is for. The decision in front of them is
one line of `scripts/static-gate.mjs`, not one line of the portal.
