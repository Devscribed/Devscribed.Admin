# pre_implement — round 4 (replan against the amended spec and two unbuilt rules)

Spec: `specs/time-off/01-vacation-calendar.md` @ `34dc8740…` — **unchanged** since round 3; the
amendment landed in the bundle, not in the requirements file.
Settlement commit: `30b415e` — *"give the organization picker the option that clears it"*
(`01-vacation-calendar.cases.md`, `01-vacation-calendar.contracts.md`).

Three findings sent this back. One is a document change I compile against; the other two are
rules **this plan already carried in round 3** and the diff did not implement. That difference
decides how round 4 is written: F3 gets a new instruction, F1 and F2 get their existing
instruction restated at the exact line the implementer must edit, with the shipped code quoted
back so the divergence is not something anyone has to re-derive.

---

## The three findings

### 1. F1 — the organization country PUT clears on an absent `countryCode` key (`code`, blocker)

**Confirmed on disk, unchanged since the round that planned against it.**
`apps/api/src/organizations/organization-country.service.ts:76` reads
`validateStatedCountryCode((input ?? {}).countryCode)`; `undefined` normalizes to
`{ valid: true, value: null }` (`packages/validation/src/time-off-calendar.ts:250`, doc comment at
:247 — *"Empty, `null` and `undefined` all normalize to `null`"*), and `:84` writes
`countryCode: result.value`. A body of `{}` on an organization holding `PL` answers
`200 {"countryCode":null}`.

The document settled the opposite twice, in `a83e79f`: `spec:359`
(*"a body with no `countryCode` key changes nothing, as the member write beside it does"*) and
`contracts:133-134`. The member write already implements it — `members.service.ts:454`
`const wantsCountry = input !== null && typeof input === 'object' && 'countryCode' in input`, with
the column spread only `...(wantsCountry ? { countryCode } : {})` at `:500`.

Round 3's T4 already said this. What round 4 adds is the shape of the *false* branch, which the
earlier text left to inference and which is where a second wrong implementation would land: no
`prisma.organization.update`, **no `organization_country_set` log line** (nothing was set), and the
answer is the stored value read back through the same `select` the `GET` uses. It also names two
edits that are not behaviour: the comment at `:72-75` argues the reversed reading *as a decision*
and must go, and the interface doc at `:23-26` is true but incomplete. And one prohibition, because
it is the cheapest wrong fix available: **do not** make `validateStatedCountryCode` refuse
`undefined`. Its normalization is what the member write relies on for a *present* key carrying
`null`, and it is asserted in the unit suite. Presence is the route's question; both routes now
answer it the same way.

### 2. F2 — `timeOffCalendarToday` and `resolveTimeOffCalendarTimezone` exist nowhere (`code`, blocker)

**Confirmed.** `git grep -n 'timeOffCalendarToday\|resolveTimeOffCalendarTimezone' -- specs apps
packages e2e` returns `contracts.md:213` and `:214` and nothing else. Commit `c75a6bb` deleted both
from `packages/validation/src/time-off-calendar.ts`, which now ends at `:257` with
`validateStatedCountryCode`; the endpoint restated one of them privately as
`time-off-calendar.service.ts:410 reportedTimezone`, and the screen calls the shipped
`todayInTimeZone` directly (`CalendarScreen.tsx:139`).

The two copies agree today, so nothing observable separates them — which is why this is planned as
a placement rule rather than a behaviour change:

- `resolveTimeOffCalendarTimezone(timezone)` answers **which zone** (`'UTC'` for null, blank or a
  string `Intl.DateTimeFormat` throws on; the stated value otherwise). `range.timezone` reads it.
- `timeOffCalendarToday(timezone, instant)` answers **which day**, in one line, by delegating:
  `todayInTimeZone(resolveTimeOffCalendarTimezone(timezone), instant)`.
  `packages/validation/src/requests.ts:639-652` already ships the `en-CA` formatting and already
  falls back to the UTC date in its `catch`, so a second `Intl.DateTimeFormat('en-CA', …)` anywhere
  in this diff is the drift the named export exists to prevent.

T3 loses `reportedTimezone` and its comment; T7's `today()` calls the named helper; T9 brings the
deleted unit assertions back. The reviewer's second consequence is real and is planned with it:
`packages/validation/src/requests.test.ts:236-241` covers `null` and `''` only, so edge case 18's
third limb — *a string the server does not recognize* (`contracts:420`) — is asserted nowhere in
the repository at present.

### 3. F3 — nothing in the product could clear the organization country (`spec`, blocker)

**Settled in the document, and the plan compiles against the settlement.** `contracts:344-348` now
gives `org-country-select` a first option labelled from
`TIME_OFF_CALENDAR_MESSAGES.orgCountryNoneOption`, submitting `null`; `contracts:178` adds the
message row (`No country — global holidays only`, an em dash, `New: yes`); `TC-01-E2E-07` clears it
from the screen and watches the marker go; `TC-01-INT-20` picks up the absent-key no-op.

Verified against the code rather than the prose:

- `apps/web/src/stated-country-options.ts:22` maps `COUNTRY_OPTIONS` once, 249 assigned codes, no
  empty value — so before this amendment a stored `PL` could not be unset from any screen.
- `MEMBER_COUNTRY_OPTIONS` (`MemberDetailScreen.tsx:45-47`) is the shape to mirror: one head over
  the shared list. The two heads are **different sentences for different states**, so the head is
  built beside each control and not inside the shared module.
- `ALL_COUNTRIES` (`settings/holidays/country-options.ts:6`) is the holiday *filter's* "everywhere"
  and is deliberately not reused for this control's state — T8 says so, because reaching for it is
  the obvious shortcut and it would put a filter's meaning on a stored column.
- `handleSaveCountry` already submits `{ countryCode: null }` for an empty value
  (`page.tsx:166`), so REQ-01-034's clearing branch needs no new transport.
- `page.tsx:369-371` carries a comment stating the gap as justification; it was true of the round-3
  document and is false of this one, so it is named for deletion.

No DS gap: `Select` has no clear affordance (`packages/ds/src/components/forms/Select.tsx:23-63`
carries no `isClearable`), which is exactly why the spec settled on an option rather than a control.

---

## The trap in the amended case, and why it is a note

`TC-01-INT-20`'s steps now read: set `PL`, submit an empty value, **then** submit a body with no
`countryCode` key. Taken in that order the third write cannot fail: the column is already `null`
after the second, so `200 {"countryCode":null}` comes back whether the route no-ops or clears — the
same vacuity the reviewer noted of the case as it stands today.

This is not a contradiction and not a rule the plan may not compile: the Expected Result says the
third write *"changes nothing"*, and "nothing" is only observable against a country that was there
to lose — which the case's own sentence describes (*"a mistyped key must not drop a country the
fallback depends on"*). T9 therefore keeps every step the case names and re-sets `PL` before the
keyless body, then reads the value back. Recorded as a note, not a blocker: nothing is decided here
that the document did not decide, and the repair is one extra write inside a case the document
already numbers.

---

## What changed in `handoff.json`

| Task | Round-4 instruction |
|---|---|
| T2 | Both helpers written in `packages/validation/src/time-off-calendar.ts` and re-exported from the root; `timeOffCalendarToday` **must delegate** to `todayInTimeZone`. `TIME_OFF_CALENDAR_MESSAGES` gains a twelfth row, `orgCountryNoneOption`, em dash included — round 2's "exactly the eleven rows" superseded. |
| T3 | `range.today` / `range.timezone` from the two helpers; private `reportedTimezone` deleted; round 1's "via `Intl` … the `currentYearIn` idiom" superseded. |
| T4 | Key-presence test first, in the member write's exact idiom; the false branch writes nothing and logs nothing; two comments corrected; the validator explicitly left alone. |
| T7 | `today()` calls `timeOffCalendarToday`. |
| T8 | `ORG_COUNTRY_OPTIONS` at module scope in the holidays page, head + shared list, empty string not `ALL_COUNTRIES`; round 3's "nothing above it" superseded; the stale comment deleted. |
| T9 | `TC-01-INT-20` re-sets `PL` before the keyless write; `TC-01-E2E-07` clears from the screen naming the option through the message export; the `TC-01-UNIT-02` block regains the today helper with all three fallback limbs; the message-text block gains the new row. |

Also: one `messages` row (the new export and the control that draws it), four `premises` (the
delegation target, the member write's idiom, the two absent helpers, `Select`'s missing clear), two
`risks` (two empty-valued heads with different meanings; the invisible no-op).
`node scripts/handoff-coverage.mjs` → pass, sections 8/8.

## Coverage

All seventeen checklist ids answered in the verdict. `H-13` and `H-14` are `n/a`: this spec has no
External Contracts section and no double — its dependencies are all first-party routes in this
repository.
