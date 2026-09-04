# pre_implement — round 3 (replan against the settled spec)

Spec: `specs/time-off/01-vacation-calendar.md` @ `34dc8740…` (was `90275255…` at round 2)
Settlement commit: `a83e79f` — *"the pickers draw the list the write accepts"*.

The plan on disk was compiled from the round-2 document. Three things moved in `a83e79f`, and two
of the three findings that sent this back are consequences of them. What follows answers each
finding by name, then records what changed in `handoff.json`.

---

## The three findings

### 1. L1 — the picker offered three codes the write refuses (`spec`, blocker)

**Fixed upstream, and the plan now compiles against the fix.** The document no longer has two
halves that disagree: §Screens pins **both** stated-country pickers to `COUNTRY_OPTIONS` from
`@devscribed/validation` — `COUNTRY_NAMES`, the same 249 assigned codes `validateCountryCode`
tests (contracts:214, :344, :360) — so the list a picker offers and the list rule 9 accepts are
one list. `AC`, `TA` and `XK` leave the feature with the phone-derived list they came in on, and
the holiday row that may still carry one of them is now a Known Gap naming what closes it and
where that rule belongs (spec:444).

Verified against the code, not the prose:

- `packages/validation/src/autofill.ts:970` exports `COUNTRY_OPTIONS` as
  `readonly { code, name }[]`, sorted by name, built from `COUNTRY_NAMES`; the package root
  re-exports it at `packages/validation/src/index.ts:3750`; `autofill.test.ts:803` pins the
  length at 249.
- The name is taken **twice**: `apps/web/src/account-data.ts:58` exports a `COUNTRY_OPTIONS` of
  its own from libphonenumber's `getCountries()`, and that is the one
  `settings/holidays/country-options.ts:1` imports today. A wrong import here compiles, renders,
  and only fails when somebody picks Kosovo — so T8 maps the package's list **once**, in a new
  `apps/web/src/stated-country-options.ts`, and both screens import that.
- The design system's `Select` takes `{ value, label }` while the package exports
  `{ code, name }`; the mapping is the whole of the new module.
- A stored `null` needs no option of its own: `optionFor` returns `undefined` for a value no
  option matches (`apps/web/src/select.ts:51`) and `Select` paints its placeholder.

T8 was rewritten end to end (its round-2 instruction — *filter the phone list* — is explicitly
superseded, not merely appended to), its `files` gained the new module, and `reuse`,
`buildFromZero`, `premises`, `shippingSurfaces` and `risks` were moved with it.

One consequence is recorded as a **note**, not planned around: with the org picker's options
pinned to the assigned list and no `packages/validation` export holding a label for a "no
country" option, **the organization country cannot be cleared from the screen**. It is still
cleared through the endpoint, which is where REQ-01-034 lives and where all three of its cases
(TC-01-INT-12, TC-01-INT-21, TC-01-INT-24) exercise it. Inventing a label here would put a
user-facing string outside `packages/validation` and outside the spec's closed Error Messages
table; that is a person's call, in the document.

### 2. S1-2 — the banner drew the framework's own words (`code`, blocker)

**Planned, in T7 (b), as a rule with no third branch.** The fallback chain on
`CalendarScreen.tsx:234` is one term too long: `fields ? first : (body?.message ?? generic)`
never reaches the generic term, because Nest populates `message` on every error — a revoked
capability draws `Not Found`, a 500 draws `Internal server error`, and neither is an export of
`packages/validation` or a row of the contracts' Error Messages table.

The plan now states the whole chain literally — `fields ? Object.values(fields)[0] :
HOLIDAY_MESSAGES.toastServerError` — and names the two rows the document added for it:
`HOLIDAY_MESSAGES.toastServerError` in §Error Messages (contracts:181) and its own §UI
Description state, *"Failed for any other reason"* (contracts:372). The same shape is planned for
the organization country save in T8, whose `handleSaveCountry` carries the identical
`body?.message` term (`settings/holidays/page.tsx:179`) and is a surface this run edits.

### 3. S1-1 — `max-width: 160px` in the loading skeleton (`code`, blocker)

**Planned, in T7 (c).** The spec's DS gaps table closes the set of literals this screen may carry
at three — the 3px band margin, the 3px hatch stripe, the 2px today inset — each with `@literal`
and a reason. `globals.css:1122` is a fourth, it names no token, carries no comment and is
recorded in no row; the two declarations beside it in the same rule are `var(--space-4)` and
`var(--radius-s)`.

The plan says the skeleton is measured from tokens and from the track it sits in, that the
name-column placeholder carries **no** `max-width` of its own, and that a shorter placeholder is
expressed as a fraction of its track rather than as a new number of pixels. It also says the
alternative — amending the DS gaps table — is a spec edit this run does not make.

T7 (d) folds in the review's own note on the same block: the skeleton renders only under
`loading && !data`, where the data-derived template declares one day column while fourteen cells
are placed into it, so it gets a template of its own.

---

## What else moved with the document

- **T4 reverses round 2.** REQ-01-034's Decided (spec:359) and the PUT contract (contracts:134)
  now both say a body with no `countryCode` key changes nothing. The validator cannot express
  that — `validateStatedCountryCode(undefined)` answers `{ valid: true, value: null }` — so the
  route tests the key itself (`'countryCode' in body`), the idiom the member write already uses.
  Round 2 planned the opposite and said so in the code; the document has now decided, and the two
  writes agree.
- **T2** records the three helpers §Shared code gained (`validateStatedCountryCode`,
  `timeOffCalendarToday`, `resolveTimeOffCalendarTimezone`) and requires the today helper to
  format **through** the shipped `todayInTimeZone` (`requests.ts:639`) rather than restate its
  fallback — one definition of REQ-01-018.
- **T9** picks up three case-level notes: `calendar-scope-all` is asserted (it is the one id of
  the 26 no case touches), a window's expected first day is computed in the **account's** zone and
  never from the runner's UTC clock, and every `describe` carries the TC id it serves.
- **T10** picks up the leftover fixture seeds at `reports-amounts-owed.spec.ts:651` and `:658`.

Deliberately **not** planned: the `minWidth: 220` on the organization-country control. The
identical literal already ships on the country filter directly below it in the same file, so the
new control matches its neighbour rather than inventing a measurement; that a control width has
no token and no DS-gaps row is a note for the document's owner, recorded on this verdict.

## Coverage

`node scripts/handoff-coverage.mjs` — pass, sections 8/8. Checked by hand as well: 50/50
requirements assigned, 41/41 live cases claimed, every `##` heading answered in `sections`. Every
path cited anywhere in `handoff.json` exists except `apps/web/src/stated-country-options.ts`,
which is the one file this replan adds and which `buildFromZero` names.
