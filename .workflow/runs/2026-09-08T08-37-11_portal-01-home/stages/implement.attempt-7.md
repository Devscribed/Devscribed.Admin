# implement — attempt 7 (orchestrated)

Spec `specs/portal/01-home.md`, branch `spec/portal-home`. Fix commit `838b66a` on top of
`6bfa212`. Thirteen review findings, all addressed: **twelve fixed, one withdrawn as stale.**

Four children on disjoint file sets: **A** (API + its suite), **A2** (one test, dispatched to
correct A's brief mid-flight), **B** (validation + the five web screens), **C** (the two e2e
files).

## Every finding, and what happened to it

| # | Finding | Outcome |
|---|---|---|
| F1 | the window ends in the wrong instant (REQ-01-026) | **fixed** — `computePortalWindow` now takes the caller's zone and resolves the true start and end instants of that local day, calling the zoned helper at both ends so a DST boundary inside the 365 days is handled. Both call sites pass `caller.timezone`. A new integration case seeds `America/Los_Angeles` and a vacancy created after the UTC day rolled over but inside the caller's own today; it fails against the old arithmetic and passes now. A UTC-run suite could not have caught this, which is why the case names the zone. |
| F2 | the roster is nulled where the spec says omitted (REQ-01-056) | **fixed** — `members` is `PortalEntryMemberRefDto[] \| undefined` and never assigned `null`, so the key is genuinely absent. The DTO comment now contrasts it with REQ-01-055's deliberately-null `clientName` instead of claiming a behaviour the code did not have. `portal.spec.ts` asserted `toBeNull()` — the requirement's negation — and now asserts absence. |
| F3 | TC-01-INT-09 contradicts REQ-01-026 | **withdrawn — the witness was stale.** See below. |
| F4 | six failure sentences inline (CR-07) | **fixed** — five keys added to `PORTAL_MESSAGES` in the flat shape this module already used, wired at all seven sites. The settings save also stops discarding the server's own message: it reads `fields.groups` from a failed `PUT` and falls back to the shared text only when the response carried none. |
| F5 | the feed reads the day from the device clock (UI-07) | **fixed** — `dayLabel` and `formatRelativeTime` take a `timeZone`, resolved from `session.account.timezone` (UTC when null) — the same `Account.timezone` the server resolved `month.today` in. Deliberately taken from the session, not from Q1's body, because F13 requires the feed not to depend on Q1. |
| F6 | the empty feed draws no invite control | **fixed** — the control is inside the `EmptyState`, gated by `can(session.role, 'invite')`, the same mechanism the members screen uses. The paired site (the empty month's timer control) was already right. |
| F7 | neither wait is announced or findable | **fixed** — `role="status"` and a name on all of Q1's three panel waits, the feed's skeleton rows, the entry page's wait and the settings page's. The comment claiming `Preloader` supplied the role is deleted; it does not, and its own source says so. |
| F8 | a failed settings load waits forever | **fixed** — the three loose booleans became a `loading \| error \| ready` union. A failed load draws the banner and a **Try again**, with no wait beneath it; a save failure is tracked separately so it never drops the screen out of `ready`. |
| F9 | ellipsis declared on an inline element (CR-18) | **fixed** — `display: block` on the title, as the mock's own rule has it. The other two truncating cells on these screens are direct grid children and are blockified already; the `<b>` was one level deeper, which is why it alone was dead. |
| F13 | a Q1 failure removes the settings link | **fixed** — `canManageSettings` comes from `hasCapability(session.role, 'ManagePortalSettings')`, as `Sidebar.tsx` gates every row, so the feed no longer depends on Q1 at all. The docstring that claimed this was already true now is. |
| F10 | three required ids asserted nowhere | **fixed** — `portal-month-days` in TC-01-E2E-02; `portal-entry-back` and `portal-entry-fact` in TC-01-E2E-04, the latter as a count of **2**, grounded in the case's own seeded vacancy and REQ-01-042's two facts rather than `toBeGreaterThan(0)`. |
| F11 | `nav-portal` absent for a contact asserted nowhere | **fixed** — added to the rail enumeration in `client-participants.spec.ts` that already counts `nav-members`, `nav-projects` and `nav-clients` at zero. No product code changed: the behaviour was correct and unguarded. |
| F12 | TC-01-E2E-08 cannot fail for its own defect | **fixed** — the case seeded one request per organization and compared two single rows carrying the same badge, so a badge-first layout would have passed. It now seeds three requests in one organization filling REQ-01-020's cap, differing in title length, due date and badge (`Overdue`, `Waiting on you`, `Open` — three widths), and asserts the shared left edge across those rows and the shared right edge of the trailing cells. It is the probe that would have caught F9. |

## F3 — withdrawn, because the document moved under the finding

The review quoted TC-01-INT-09 as requiring *"two `member-anniversary` entries with `detail.years`
1 and 2"* and a `member-joined` for a member backdated 731 days — unreachable under REQ-01-026,
and therefore a contradiction only a person could settle.

That text no longer exists. Hashing the bundle against the one the plan was compiled from:

```
UNCHANGED specs/portal/01-home.contracts.md
CHANGED   specs/portal/01-home.cases.md     bf9ec62e9257… → a03bcc846697…
```

`specs/portal/01-home.md` is unchanged, and the current TC-01-INT-09 reads: *"No `member-joined`
entry whose subject is the backdated member — its joining is 731 days ago, outside REQ-01-026's
window — and exactly one `member-anniversary` entry for it, with `detail.years` 2."* The case was
repaired to agree with REQ-01-026 and is implementable exactly as written.

So there was nothing for a person to settle, and the right answer was not a halt but a rewrite.
I had already dispatched a child on the review's framing; I withdrew that instruction in flight
and dispatched **A2** with the current text. The test now seeds three members plus the admin's
own, backdates one by two years and a day, and asserts the four things the case names — asserting
about **subjects**, never a total, because the admin's own membership always draws a
`member-joined` of its own.

Two shards edited `apps/api/test/portal.spec.ts` as a result, which was my dispatch error. I
checked afterwards that all three edits survived — the timezone case, the roster assertion and
the rewritten TC-01-INT-09 — and none had been clobbered.

## Test commands and their summary lines

| Command | Result |
|---|---|
| `npm run test:unit` | `Test Files 37 passed (37)` · `Tests 1475 passed (1475)` |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| `npm test -- test/portal.spec.ts` (from `apps/api`) | `Tests: 19 passed, 19 total` — 18 plus the new zone case |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/portal.spec.ts tests/client-participants.spec.ts tests/regressions.spec.ts` | **`24 passed (1.3m)`, exit 0, no failures, no flakes** |
| `npm run ui:check -- "apps/web/app/org/[orgId]"` | one finding on these files, answered below |

## Answered, not silenced

**`ui:check` — `uc/index-key` at `news/[entryId]/page.tsx:303`.** The key is the index of a
paragraph in `entry.body.split('\n')`. The register's own caveat is "correct only where order and
length never change": the body is an immutable string for the life of the render, the paragraphs
hold no state, and two identical paragraphs would collide under any content-derived key.
Unchanged, deliberately — as in attempt 5.

**Five new `PORTAL_MESSAGES` keys are not in §Error Messages.** F4 required failure text to leave
the screens, and the contracts' table enumerates ten rows, none of them a failure sentence. The
keys were added because a blocking finding demanded it; the table not listing them is a
documentation gap this fix creates, and it is in the verdict as a note rather than papered over.

## What I broke, and what it cost

Chasing an unattributed `client-participants` failure I created a throwaway worktree and
symlinked the repository's `node_modules` into it. `git worktree remove --force` followed that
symlink: **42 tracked files under `apps/api/` were deleted from the main checkout** — every
migration, the schema, `package.json`, `jest.config.js` — along with the untracked
`apps/api/.env`. Nothing under `apps/api/src/` and none of the attempt-7 edits were touched.

Repaired: the 42 tracked files from `HEAD`; `apps/api/.env` from `.env.example`; and the two
machinery edits the restore reverted (`forceExit` in `jest.config.js`, `--runInBand --forceExit`
in the `test` script) rewritten from the diff, since they were uncommitted and belonged to
somebody else. **Never symlink a repository's `node_modules` into a worktree you intend to
remove** — that is worth an ADR.

## The failure that was never in the code

`client-participants.spec.ts` failed two to three of its tests across several runs, always as a
30-second timeout on `page.goto` / `waitForURL`, never as an assertion, while the dev server
logged `200 in 202ms` for the very URL that "timed out". It was not attributable to the diff, and
it was not in the diff:

```
netstat -ano | grep ":5433" | grep LISTENING   →   two different PIDs
node -e "…pg connect…"  127.0.0.1:5433  →  FAIL (auth)
                        127.0.0.1:5434  →  OK   (devscribed)
```

A foreign Postgres had taken **5433**, the port every suite here is configured for, while the
project's own container also publishes **5434**. The API could not reach its database, so its
calls hung while Next's shell still answered; that is exactly the shape the symptom had. It also
took the integration suite down mid-session — the same suite that had passed 19/19 an hour
earlier.

Fixed without killing anything and without touching a tracked file: `apps/api/.env`, which is
untracked and which both suites fall back to, now points at `5434` — the same container, its
other published port. Integration returned to 19/19 and the full targeted E2E to **24 passed**.
Both `apps/api/test/database-url.ts` and `e2e/environment.ts` also honour `TEST_DATABASE_URL` and
`E2E_DATABASE_URL`, which is the cleaner lever for a person who wants the original port back.
