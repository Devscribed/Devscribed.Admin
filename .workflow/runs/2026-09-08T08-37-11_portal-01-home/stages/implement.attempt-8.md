# implement — attempt 8 (orchestrated)

Spec `specs/portal/01-home.md`, branch `spec/portal-home`. Fix commit `e642bfd`.
Two review findings, **both fixed**, and both regressions attempt 7 introduced.

One child, **D**, on the whole set: the two findings are one mechanism, and splitting them
across two writers would have produced two guards instead of one rule. (Attempt 7 put two
children on one file; that is not repeated here.)

## Both findings, and the one rule that closes them

`Account.timezone` is checked for **non-emptiness alone** before it is stored —
`validateTimezone` is `if (value.length === 0) return fail(...); return ok(value)`
(`packages/validation/src/index.ts:1060-1064`) — and it is written by `PUT /api/account/settings`
and by the **public** `POST /api/invitations/accept` (`invitations.service.ts:286-287`). So the
column can hold `'Europe/Warszawa'`: a plausible typo the picker would never produce and both
routes accept. `new Intl.DateTimeFormat(…, { timeZone })` throws `RangeError` on it.

| # | Where | Fixed |
|---|---|---|
| F1 | `computePortalWindow` guarded only null and blank and passed the raw string to `zonedTimeToUtc` → `zoneOffsetMs` → `zonedParts` → `partsFormatter`, which builds the formatter with no `try/catch`. `GET .../portal/news` and **every** entry page answered 500 for that member. | ✅ |
| F2 | `PortalFeed.tsx` did `session.account.timezone ?? 'UTC'`, which passes a non-null unresolvable identifier through to `localYmd`'s `Intl` construction. `groupByDay` → `dayLabel` runs for every entry, so the component threw **during render** and React unwound to the nearest boundary — the whole `/org/{orgId}` screen, not the feed column, which is the opposite of the independence §States requires of Q1 and Q2. | ✅ |

**The fix is one resolver, not two guards.** The repository already answers this three times —
`todayInTimeZone` catches and falls back (`requests.ts:648-651`), `wallClockParts` catches and
falls back (`index.ts:2994-3016`), and `isValidTimeZone` (`hiring-time.ts:54-62`) *is* the
resolvability test, written for the same reason. What was missing was a resolver a caller can
reach. `resolvedTimeZone(id)` now sits beside `isValidTimeZone`, is built on it rather than on a
fourth `try/catch`, and answers a zone that is guaranteed constructible.

Both call sites ask it: `computePortalWindow` — which is shared by `portal-feed.service.ts:135`
and `portal-entry.service.ts:63`, so one change covers both routes — and `PortalFeed`'s single
`timeZone`, which flows into all three of its formatters.

## The sweep, checked rather than inherited

I ran the enumeration myself over `7a6e059…...HEAD` before dispatching, and checked the child's
list against mine. Every site this run's diff introduces that touches a zone:

| Site | Now |
|---|---|
| `computePortalWindow` (`portal-entry.types.ts`) | **fixed** — `resolvedTimeZone` |
| `PortalFeed.tsx` `timeZone`, feeding `localYmd`, `dayLabel`, `formatRelativeTime` | **fixed** — `resolvedTimeZone` |
| `portal-feed.service.ts:134`, `portal-entry.service.ts:62` — `todayInTimeZone` | already safe; it catches and answers the UTC date |
| `portal-home.service.ts` `tzOf` → `localDateInTz` | **already safe, and I checked it rather than assuming**: `localDateInTz` calls `wallClockParts`, which swallows any `Intl` failure. `GET .../portal/home` never had this defect — the same run had one route safe and two not, because two zone helpers exist and only one catches |
| `portal-types.ts` `formatGreetingDate`, `formatShortDate` | safe — literal `timeZone: 'UTC'` over a date the server already resolved |
| `news/[entryId]/page.tsx` `formatTimestamp` | safe from *this* mechanism — no `timeZone` option at all. See the note below |

## Proven falsifiable, not argued

The child could not run a suite, so I checked its new case can fail. Reverting `computePortalWindow`
to the old guard and running that case alone:

```
[Nest] ERROR [ExceptionsHandler] RangeError: Invalid time zone specified: Europe/Warszawa
    Expected: 200
    Received: 500
Tests: 1 failed, 19 skipped, 20 total
```

The resolver was restored immediately afterwards and re-verified in place. That is the reviewer's
witness reproduced end to end, and it is why this case is coverage rather than decoration.

## Test commands and their summary lines

| Command | Result |
|---|---|
| `npm run test:unit` | `Test Files 37 passed (37)` · `Tests 1476 passed (1476)` — one new unit case |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| `npm test -- test/portal.spec.ts` (from `apps/api`) | `Tests: 20 passed, 20 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/portal.spec.ts tests/client-participants.spec.ts tests/regressions.spec.ts` | `22 passed (1.7m)`, **exit 0**, no failures; 2 flaky |

The two flaky are `client-participants.spec.ts:167` and `:248` — the same pair that failed outright
in attempt 7 under the port contention recorded there, passing on retry here. Nothing in the diff
touches them; the machine still has a foreign listener on 5433 and the suites reach the database
through 5434.

## Considered and deliberately not changed

**The entry page formats its timestamp in the browser's zone** (`news/[entryId]/page.tsx:188`,
`Intl.DateTimeFormat('en-GB', {...})` with no `timeZone`). It cannot hit this mechanism — it never
touches `Account.timezone`, so nothing can throw. It is also not the UI-07 defect the last review
raised against the feed: that one blocked because *two* sources for one value disagreed **on one
screen**, and the entry page has a single clock and no server-resolved date beside it to
contradict. Changing it would be surface no finding asked for. Recorded in the verdict as a note
so the next reader can see it was examined and why it was left.
