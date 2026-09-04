# pre_implement — time-off/01 Vacation Calendar (replan, round 2)

The spec compiles. Ten tasks, one additive migration, no blocking finding. Three notes at the
bottom, each with a witness.

This is a **replan**, not a first compile. The run halted at review on a contradiction in the
document; a person settled it in the document at `40eedaa` and resumed into this stage. The plan
on disk was compiled from the spec as it read at `4a5b88…`, which is the rule that changed, so it
had to be rebuilt. `handoff.json` now names `90275255…`, the settled document.

## What the document now says, and what it said before

The disagreement was about a code with the right shape and no country — `XX`.

| | Before (`4a5b88…`) | After (`90275255…`) |
|---|---|---|
| Validation Rule 9 | Empty, or exactly 2 uppercase letters | Empty, or exactly 2 uppercase letters **naming an assigned country** |
| Its message | `HOLIDAY_MESSAGES.countryCodeInvalid` | `PROFILE_MESSAGES.country.invalid` |
| REQ-01-036 / REQ-01-051 | "neither empty nor a valid alpha-2 value" against a rule that accepted `XX` | both writes test the assigned list, `422` and `400` respectively |
| TC-01-INT-21 | `POL`, `1`, `pl`, `PL` | `POL`, `1`, `pl`, **`XX`**, `PL`, with a read-back after `XX` |
| TC-01-INT-25 | ends at `pl` | ends at `pl` **and `XX`**, both `400`, stored country still `null` |

Neither shipped validator answers the new rule on its own — `validateHolidayCountryCode`
(`packages/validation/src/holidays.ts:93`) accepts `XX`, and `validateCountryCode`
(`packages/validation/src/autofill.ts:683`) upcases `pl` to `PL`, which Edge case 11 forbids. So
rule 9 becomes one export of its own, `validateStatedCountryCode`, in this spec's own validation
module: shape first, then the assigned list **through** `validateCountryCode`. It composes the
shipped list rather than copying it — two copies of the 249-code table is how the rule would
drift. A holiday **row's** country keeps the shape-only validator and its own message, untouched,
and `apps/api/test/holidays.spec.ts:607` keeps pinning that message, which is what catches one
validator being swapped for the other.

## What sent this back — each answered

**F1 (`spec`, blocker) — the country-write rule was stated twice and the two statements
disagreed. Fixed, and not by me.** The judgement is right and it is not a pre-implementer's to
settle either: the document said both, and a pipeline that picks a side implements a decision
nobody made. The person settled it at `40eedaa` — the writes refuse `XX` — and the plan is
rebuilt against that. Concretely: T2 gains `validateStatedCountryCode`; T4's and T5's validator
and message sentences are **replaced**, not annotated, so no task carries the old instruction
beside the new one; T9 names the two rewritten cases and the assertion at
`apps/api/test/time-off-calendar.spec.ts:1131` that still pins the old text; the `messages` table
row for the two writes now names `PROFILE_MESSAGES.country.invalid`.

**F2 (`code`, blocker) — the anchor came from the browser clock while the today marker came from
`Account.timezone`. Fixed in the plan, T7.** The witness holds: `todayISO()` at
`CalendarScreen.tsx:31` builds its string from `new Date()` in browser-local time, it seeds the
anchor and it is what `calendar-today` sets, while `range.today` is resolved server-side from
`Account.timezone` — so under `Pacific/Kiritimati` from a UTC browser at 23:00 the Today control
lands on the month before the one holding the caller's today and `is-today` matches no column.
The value is already on the client (`session.account.timezone`) and the helper already ships:
`todayInTimeZone` (`packages/validation/src/requests.ts:639`) is exported from the package root,
falls back to UTC for a null, empty or unrecognized zone — REQ-01-018's own fallback — and is
already read this way from a client screen at `NewRequestModal.tsx:133`. T7 now says nothing about
today on this screen is computed from `new Date()`.

**F3 (`code`, blocker) — a failed read was reported as an empty scope. Fixed in the plan, T7.**
The witness holds: the catch at `CalendarScreen.tsx:187` sets `emptyStateBody`, and the contracts
give that string no route and assign it to the Empty (no rows) state alone, so a transport failure
tells an admin whose organization is full of active members that none of them matches `scope=all`,
over a grid that says otherwise. The screen now draws `HOLIDAY_MESSAGES.toastServerError` for any
outcome the endpoint's 422 body shape does not describe — the message the Holidays page **this
same change edits** already uses for a failed read (`settings/holidays/page.tsx:179`) — and only a
422 carrying `fields` draws the endpoint's own message. That also keeps a raw framework string off
the screen, which the old `body?.message ?? null` branch did not. The document assigns no message
to a failed read; that it does not is note **N3** below, and a calendar-specific string is a
person's call, not a plan's.

The review's own notes are folded in where they cost nothing: **N2** (the reports fixtures were
kept green by seeding `Membership.countryCode` equal to the `phoneCountryCode` already there, so
no case in either suite can fail if the code regressed to the phone read) is now a rule in T10 —
a fixture that states a membership country must not carry the same country on the phone. **N1**
(the two writes disagree on what an absent `countryCode` key means) is answered by writing the
decision down in T4 and T5 rather than by changing either write: the organization route is a
one-field settings resource whose `GET` and `PUT` carry the same representation, so a `PUT` with
no country submits an empty one (REQ-01-034); the member route is presence-decides because its
body carries three fields and a caller that ignores the new one must change nothing (Backward
Compatibility 3). N3 of the review (no unit assertion for an impossible date) is left to the
implementer's judgement inside TC-01-UNIT-02, which already covers REQ-01-014.

## The compile checklist

| id | Answer |
|---|---|
| H-01 | ok — all 50 `REQ-01-0xx` are assigned; checked by extracting every `#### REQ-` heading against the union of the tasks' `requirements`. |
| H-02 | ok — all 41 live `TC-*` are planned (T9 for this spec's own, T10 for the four shipped suites it moves). No case in this bundle reads `- **Retired.**`. |
| H-03 | ok — all 8 `##` sections answered in `sections`; `handoff-coverage` reports 8/8. |
| H-04 | ok — all 63 paths cited in the handoff exist on disk, checked by walking the JSON. |
| H-05 | ok — `reuse` (21 rows) and `buildFromZero` (10 rows), both with paths. |
| H-06 | ok — the "any read"/"every X" requirement is REQ-01-026, whose four shipping call sites are listed in T6's `allCallSites` with what each does with the new answer. |
| H-07 | ok — `shippingSurfaces`, 16 rows. The three added this round are the narrowing of what both country writes accept, the holiday row's own country (deliberately unchanged, and the rule that governs it named), and the option lists the two pickers offer. |
| H-08 | ok — `concurrency` on every task that writes: the organization country takes no lock by REQ-01-033 and names the two writers that hold `FOR UPDATE` on that row; the member country rides the member update's existing transaction and lock and adds none. |
| H-09 | ok — 14 `messages` rows, each naming its `packages/validation` export and its emitter. Two changed this round. |
| H-10 | ok — the Verification Plan marks three helpers as not existing (`createHolidayViaApi`'s promotion, `setMemberCountryViaApi`, `setOrganizationCountryViaApi`); all three are T9, and the cases that need them are T9's too. |
| H-11 | ok — one migration, two nullable columns, no default and no backfill; T1's note states the order read from `infra/deploy.sh:27` and `:175-192`. |
| H-12 | ok — T3 and T7 gate on `can(normalizeRole(role), 'view-time-off-calendar')` / `hasCapability`; T4 now states both halves are handed the normalized role and what a stored `member` gets; T5 states its gate is the shipped raw-role one and why both stored values reach the same decision. |
| H-13 | n/a — the spec has no External Contracts section and names no third-party system; the Verification Plan's "Access this needs" is *None*. |
| H-14 | n/a — nothing is doubled; `doubleBehaviours` is empty. |
| H-15 | ok — three `dsGaps` rows, matching the spec's own table, including the 2px today inset the settled document added to the sub-`--space-1` row. |
| H-16 | ok — 10 tasks, each with `files`, `requirements` and `dependsOn`. |
| H-17 | ok — `node scripts/handoff-coverage.mjs` passes (sections 8/8; it reports 0/0 requirements and cases because it matches the old `1.` numbering and reads only the behaviour file, not the bundle — the two checks above are the substitute, run by hand). |

## The three notes

**N1 — the two country pickers offer three codes their own save now refuses.** `§Screens` says
the organization picker "is the country picker the holiday form already uses", and that list is
`HOLIDAY_COUNTRY_OPTIONS` → `COUNTRY_OPTIONS` (`apps/web/src/account-data.ts:58`) →
libphonenumber's `getCountries()`. Compared against `COUNTRY_NAMES`: 245 offered, 249 assigned,
and `AC`, `TA` and `XK` are offered but not assigned. Before the spec edit every one of them
saved; after it, choosing Ascension Island answers 422 "Enter a valid country". This is not a
contradiction — both statements can hold at once, the document simply does not say a picker may
not offer what the write refuses — so it is planned, not halted on: T8 filters those two `Select`s
through the assigned-list test, keeping the labels and the order, and leaves the holiday form's
picker and the holiday list's country filter alone, because a `Holiday` row may still carry any
two uppercase letters and a filter that cannot name an existing row is the worse control.

**N2 — the organization country `PUT` and the member `PUT` disagree on an absent key.** The
document is silent on both. Planned as stated above and written into T4 and T5 so the difference
reads as a decision. No case in the bundle sends a body without the key to either route, so
nothing observes it — which is exactly why it would otherwise be settled in a code comment.

**N3 — no message is assigned to a failed calendar read.** The Error Messages table routes seven
messages to the endpoint's 422s and gives the four screen-drawn strings no route; the UI
Description's only failure row is "Refused (422)". A screen that cannot report a failed read at
all is not an option, so the plan borrows the generic message its neighbour already uses. If the
calendar should say something of its own, that is a row in the document, not a string a screen
invents.

## What did not change

The other eight tasks, the migration, the capability in both unions, the country chain and its
four adopting call sites, the grid, the two pickers' placement, and every premise that was
verified last round and re-checked this one. The blast radius is unchanged: after T6 no code path
resolves a holiday country from `Account.phoneCountryCode`, and Amounts Owed moves in both
directions until somebody states a country — the README's deploy-day step, not a code decision.
