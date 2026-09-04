# Pre-implement — time-off/01 Vacation Calendar (refine probe, round 2)

**Verdict: pass.** The spec compiles. Nine tasks, 50/50 requirements assigned, 41/41 live cases
claimed and owned, all 20 sections of the bundle answered. Three notes, none blocking.

This run was asked one question — *can this spec be compiled at all* — and nothing will be
implemented from the plan. So the value is in what the compilation attempt found, not in the task
list. What it found is a spec that survived being checked against the code line by line: of the
nineteen premises it makes about this repository, eighteen are exactly true and one is true but
names one of two places.

## What already exists to build on

Every path below was opened, not inferred.

| What | Where |
|---|---|
| 404-not-403 org scoping | `apps/api/src/auth/org-scope.guard.ts` |
| A capability gate that answers 404 with a bare `NotFoundException`, which `CapabilityGuard` cannot | `apps/api/src/holidays/holidays.service.ts:239`, `:248` |
| The caller's own active membership from the session, never the URL | `holidays.service.ts:220`; `members.service.ts:286` |
| The settings route shape REQ-01-046 names | `apps/api/src/organizations/signing-settings.controller.ts:25` |
| Flat controller registration — this repo does not wrap these in feature modules | `apps/api/src/app.module.ts:211`, `:221` |
| The 249-code ISO alpha-2 list and upcase-then-check semantics | `packages/validation/src/autofill.ts:682`, `:701`, `:717` |
| The shape-only country validator and its message, reused by both writes | `packages/validation/src/holidays.ts:93`; `holiday-messages.ts` |
| REQ-01-028 and REQ-01-029, already shipped and unchanged | `packages/validation/src/reports.ts:509` |
| Role normalization and both capability lookups | `roles.ts:38`, `:286`; `index.ts:842` |
| The member update's transaction and organization-row lock, which the member country rides | `members.service.ts:403-404` |
| The announced filter-bar `<fieldset>` with its clipped legend | `packages/ds/src/components/reports/ReportControls.tsx` |
| The segmented control: radiogroup, one tab stop, arrow keys, `--radius-pill`, `--shadow-toggle-active`, a `testId` per segment | `packages/ds/src/components/core/ToggleButton.tsx` |
| A country picker already rebuilt without the phone list's dialling codes and emoji | `apps/web/app/org/[orgId]/settings/holidays/country-options.ts` |
| The `Time off` sidebar group the Calendar row joins above Holidays | `apps/web/src/layout/Sidebar.tsx:152-165` |

## What must be built from zero

Two nullable `Char(2)` columns and one additive migration. `resolveMemberHolidayCountry`.
`TIME_OFF_CALENDAR_MESSAGES`. The capability, in both unions. The calendar query validators and the
window presets. Three endpoints — the calendar read and both halves of the organization country.
The whole calendar screen and its nav row. Two `Select`s on two shipped screens. Three e2e fixture
helpers. Three DS-gap declarations local to the calendar page.

The honest cost is concentrated in two places: the calendar read (T6, thirty requirements, twenty
integration cases) and the calendar screen (T7). Everything else is small and well-precedented.

## Sweeps

### Contradiction

Ten absolute claims were taken and the call sites they forbid were looked for. All hold.

- **"No route here carries `RequireCapability`."** Universal over a table the round-1 repair
  extended. `HolidaysController:27-28` and `MembersController:24-28` carry only `SessionGuard` and
  `OrgScopeGuard`; a grep for `RequireCapability` under `apps/api/src/holidays/` returns nothing.
- **REQ-01-022's heading says "clipped" and its body returns the *true* dates.** Not a
  contradiction: the payload carries true dates plus two edge flags, the paint clips, and the
  sample body, `startsBeforeWindow`/`endsAfterWindow` and TC-01-INT-10 all agree on that reading.
- **REQ-01-009 ("empty selection is a refusal") against REQ-01-007 (the `none` sentinel).** The
  spec settles it in REQ-01-009's own Decided: `none` is a tick like any other. TC-01-E2E-02 walks
  exactly that path — untick everything, get `teamsRequired`; tick Unassigned alone, get answered.
- **REQ-01-041 against rules 1-4.** First-failure-wins with rule 5 after the range rules is
  satisfiable and no case sends two invalid inputs at once.
- **REQ-01-045 ("unconditional read") against Security's "the write is narrower than the read".**
  Consistent — the read is ungated and the write needs `edit-detail`. `getDetail` already answers
  every role and gates only its two edit flags (`members.service.ts:305-311`), so REQ-01-045 asks
  for no authorization change at all.
- **REQ-01-033's "no lock" against the two shipped `FOR UPDATE`s on the same row.** Not a
  contradiction — one column, no read-modify-write, and a concurrent write simply waits. Planned
  unlocked as the spec decides, and recorded in T4's `concurrency` so a reviewer does not read the
  missing lock as an omission.

**Two notions of "a valid alpha-2 value" coexist in this spec, deliberately.** The write is the
shipped shape check `/^[A-Z]{2}$/` — it refuses `pl` and *accepts* `XX`. The read must upcase and
then test ISO membership, because TC-01-UNIT-01 requires `'pl' → 'PL'` and `'XX'`/`'YY'` → not
usable. The asymmetry is not sloppiness: it is what makes REQ-01-027 and Edge case 10 reachable at
all, since a value that never validates is a branch nothing can enter. Validation Rule 9's explicit
text (*"Empty, or exactly 2 uppercase letters"*) settles which predicate the write uses, so there
is one reading and the spec is plannable. Recorded as note N2 and written into T2, because the
natural implementation reuses `validateHolidayCountryCode` for the read — which is what
`HolidaysService.normalizeResolvedCountry` does today, and it fails TC-01-UNIT-01 on two branches
at once.

### Premise

Nineteen checked against the file that implements them. Eighteen exactly true — including every
one of the twelve e2e helper line numbers, `infra/deploy.sh:27`, the four `phoneCountryCode` call
sites, the restore that clears the job title, and the mock's zero colour literals. One incomplete:
`createHolidayViaApi` is private to **two** spec files, not one (note N1).

`node scripts/spec-lint.mjs` on the bundle: clean — 50 requirements, 41 cases, 6 routes, 14
messages, 26 testids. That reconciles exactly with this plan's coverage.

### External claims

None to check, and this is worth saying rather than leaving blank. The spec has no External
Contracts section and the cases file states outright: *"Access this needs: None."* No third party,
no key, no MCP server, no new secret, no new AWS resource. So there is no `Assumed` row carrying a
requirement and no double to plan — `doubleBehaviours` is empty on purpose, with the reason
recorded beside it.

### Call sites

- REQ-01-026's "every call site that resolves a member's country" — exactly four, and the spec
  names exactly those four: `holidays.service.ts:103`, `reports.service.ts:552`, `:1047`, `:1884`.
  A repository-wide grep returns nothing else but the phone field that owns the column.
- **REQ-01-048 has two restore paths, and the spec walks one.** `members.service.ts:273` is the
  restore route TC-01-INT-28 uses. `invitations.service.ts:529-531` is the other: re-inviting a
  removed member of the same organization writes `{ status, role, joinedAt, jobTitle: null }`.
  Both satisfy REQ-01-048 by *not* writing `countryCode` — but that is a thing to leave undone in
  two files, and only one of them has a case. Recorded in T5's `allCallSites`. This is the sweep
  earning its place: a rule applied to the path a change adds and to none of its siblings is
  exactly what it prevents.

### Writers

`Organization` is written by the new PUT (unlocked, by decision), by `SigningSettingsService:119`,
and locked `FOR UPDATE` by `members.service.ts:160` and `:404`. `Membership` is written by
`updateDetail:457` (inside that org lock), `remove:218`, `restore:273` and
`invitations.service.ts:529`. All four recorded on the tasks that touch them.

### Messages

Eleven new rows in a new module; three reused rows verified **verbatim** in the shipped code —
`'Country code must be 2 uppercase letters.'`, `'You do not have permission to edit members'`,
`'You do not have permission to view this member'`. No row's text exists nowhere, and no row's
route already answers with another spec's message.

### Verification

Three helpers the plan marks as owed become T9: promote `createHolidayViaApi`, add
`setMemberCountryViaApi`, add `setOrganizationCountryViaApi`. The three fixture facts the probe
paid three failures for are carried into T9's notes, because a later agent that does not know them
will pay for them again: re-login before each invitation, the four-role enum refuses `member`, and
`firstDayOfWeek` must be capitalized.

### Sections

All eight `##` headings of the main spec and all twelve of the bundle answered by name.
`handoff-coverage.mjs` reports `sections 8/8`.

## A note on the coverage gate

`node scripts/handoff-coverage.mjs` returns **pass**, but it reports `requirements 0/0  cases 0/0`.
That is not this plan's coverage — it is the script being blind to this spec's shape. It counts
requirements by matching `^(\d+)\. ` inside the `Functional Requirements` section, and this bundle
numbers them as `#### REQ-01-NNN` headings; it counts cases in the spec file, and this bundle keeps
all 41 in a sibling. Only the section check ran for real.

So the other two were verified directly against the bundle rather than reported as passed:
**50/50 requirements** assigned, **41/41 live cases** claimed *and* owned by a named task. A green
gate that checked nothing is worse than a red one, and reporting it as coverage would have been the
most expensive thing in this document.

## Risks carried into the plan

Seven, in full, in `handoff.json`. The three that matter:

1. **The member About save button is disabled unless the form is dirty**
   (`MemberDetailScreen.tsx:316`), and `dirty` reads role and jobTitle only. Add the Select without
   adding it to `dirty` and you ship a control that changes and never saves.
2. **T3 moves money on Amounts Owed, downward first.** A member whose only country was their
   phone's stops receiving that country's holiday rows until somebody states one. The mitigation is
   not code — it is stating the organization country in the same change window as the deploy, and
   it belongs in the release note. The migration alone changes nothing: both columns land `null`
   and the chain is evaluated on read.
3. **TC-01-INT-17 needs 101 active members.** Built through invitation round-trips — each needing
   an admin re-login — it is minutes, not the half-second an integration case costs. Seed the rows.

## Findings

Three notes, none blocking. None meets a `spec/*` blocking rule, and none is a repair that would
grow the spec.

| id | rule | What |
|---|---|---|
| P1 | `spec/stale-statement` (**demoted to note** — incomplete, not false) | `createHolidayViaApi` is private to two files, not one, and the copies differ |
| P2 | note | The read's and the write's "valid alpha-2" are different predicates — decidable, and worth a code comment |
| P3 | note | TC-01-INT-23 does not state its range, and rule order puts the range before the scope |
