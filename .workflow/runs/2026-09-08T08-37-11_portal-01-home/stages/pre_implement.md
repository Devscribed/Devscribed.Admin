# pre_implement — attempt 4 — specs/portal/01-home.md

**Verdict: pass.** The bundle compiles. `handoff.json` carries ten tasks with disjoint file sets,
51/51 requirements, 33/33 live cases, 20/20 `##` sections, nine shipping surfaces and one additive
migration.

## What changed since attempt 3

Attempt 3 blocked on one finding, `P1` — `spec/stale-statement` against
`01-home.contracts.md` §Error Messages. The row named `TEMPLATE_MESSAGES.generic.forbidden` as the
settings pair's 403, marked `New: no`, and stated the text *"You do not have permission to do
that."*; the export carries *"You do not have permission to manage templates"*
(`packages/validation/src/documents.ts:125`) and that is what `CapabilityGuard` puts on the wire
(`apps/api/src/auth/capability.guard.ts:63-66`). No implementation satisfied the Error Messages
row, the §Routes row and the README's "nothing in the documents … areas changes" together.

Commit `413177b` took the second of the two repairs the finding offered, and took it completely:

| Where | Now |
|---|---|
| §Routes, both settings rows | `SessionGuard`, `OrgScopeGuard`; `hasCapability(role, 'ManagePortalSettings')` **in the service** — no `CapabilityGuard` |
| §Error Messages | `PORTAL_MESSAGES.settingsForbidden`, "You do not have permission to change the portal settings.", `New: yes` |
| REQ-01-004's decision table, `member`/`notHeld` | the same new export |
| REQ-01-050 | the same export, plus a `Decided:` / `Rejected:` paragraph naming `ManageRequestTopics` as the precedent and refusing to reword the shared string here |
| TC-01-INT-13 | asserts `403 PORTAL_MESSAGES.settingsForbidden` |

I re-read all five surfaces. They agree with each other and with the code: `roles.ts:100-101`
already records that `ManageRequestTopics` is raised in its own service *because*
`CapabilityGuard`'s message is fixed, and `request-topics.service.ts:431-469` is the shape — read
the live `Membership` by `accountId`, refuse a row that is missing, not `active` or in another
organization, `normalizeRole` the column, then ask the capability and throw
`ForbiddenException({ error: 'forbidden', message })`. `grep` finds no `CapabilityGuard`,
`RequireCapability` or `TEMPLATE_MESSAGES` left anywhere in the bundle except the one sentence in
REQ-01-050 that explains why the guard is not used.

The plan was re-cut against the repair rather than re-typed:

- **T1** now writes all ten `PORTAL_MESSAGES` strings (every §Error Messages row is `New: yes`),
  and records that neither new capability is named by any `@RequireCapability` decorator.
- **T3** states the prohibition positively: the controller's stack is `SessionGuard, OrgScopeGuard`
  and nothing else, on the settings pair exactly as on the three reads.
- **T5** carries the service-raised refusal with the precedent's file and lines, and the role read
  from the live membership through `normalizeRole` rather than from the cookie.
- **T8** gains the screen's own gate, which the spec does not state and does not owe: the shipped
  convention for an organization settings screen is `notFound()` when the capability is absent
  (`apps/web/app/org/[orgId]/settings/signing/page.tsx:40`). Recorded as note **N13** rather than
  raised as a finding — a spec that restated every screen convention would be a copy of the code.
- **reuse**, **messages**, **premises**, **sections** and **shippingSurfaces** were repointed off
  `capability.guard.ts` and onto the service precedent. Note **N11** was rewritten: ten rows now,
  six drawn, four on the wire.
- One thing the repair made newly true and worth writing down: because no route in the group
  carries a capability guard, **the guard stack is identical on all five handlers**, which is what
  makes REQ-01-004's "every route in this spec" a single sentence rather than two cases.

## The compile, id by id

Every id was re-run against the current bundle, not carried from attempt 3.

- **H-01** 51 `#### REQ-01-nnn` headings, all 51 named in some task's `requirements`, tallied id by
  id; nothing assigned that the spec does not contain.
- **H-02** 33 cases, none retired (no body opens `- **Retired.**`), every one in `testCases` and
  every one owned in `caseOwners`.
- **H-03** Twenty `##` sections across the three files — seven, ten, three — all twenty in
  `sections`. `handoff-coverage` reports 7/7 on the spec's own.
- **H-04** 89 repository paths cited; every one stat-ed. The twenty that do not exist are exactly
  the twenty this change creates, all in `buildFromZero`.
- **H-05** Fifteen `reuse` rows with file:line, twenty-three `buildFromZero` entries. The largest
  reuse is still negative: REQ-01-004's first four rows need no code, only the absence of
  `@AllowClientPrincipal()`.
- **H-06** Four set-quantified requirements, each with its complete list. REQ-01-004 → the five
  handlers. REQ-01-027/030/031 → the four derivation call sites. REQ-01-053 → one DTO with no
  monetary key, scanned by TC-01-INT-04. REQ-01-001 → T9's enumeration, re-counted at this HEAD:
  **33 literal `waitForURL('**/members')` lines across 28 files**, plus the six parameterised
  callers of `client-participants.spec.ts:32` that a literal grep does not find, minus
  `signup.spec.ts:16` and `invitation.spec.ts:115`, which are not sign-ins.
- **H-07** Nine shipping surfaces, each with the rule that governs it. Seven are governed by
  requirements here. Two are deliberate widenings the spec argues in three places each — a `user`
  and a `viewer` reading a vacancy's five facts and its booking link, and a project's name and
  start date for a project they are not on — bounded by REQ-01-035/055 and REQ-01-047/056. One row
  is present precisely because it is *not* a widening (`view-list` is true for all four roles).
  The capability row's rule was tightened by the repair: neither new member of the union is read by
  any guard.
- **H-08** Every route but the settings `PUT` is a read and REQ-01-054 forbids writing on a read;
  T3 and T4 carry `concurrency` with empty `rows` and the reason. The one writer is a single
  upsert on the unique `organizationId`; Edge case 18 settles the race as last-write-wins over a
  whole-record replacement, and all three booleans are required so no partial body interleaves.
- **H-09** All ten Error Messages rows name a new `PORTAL_MESSAGES` export in T1, with an emitter
  and — for the six the screens draw — the element that draws them.
- **H-10** One Verification Plan row is marked as not existing today
  (`POST /api/test/membership/backdate-joined`, observed `404`) and it is T5; TC-01-INT-09 and
  TC-01-INT-12 need it, and T6 depends on T5.
- **H-11** One migration, additive: one new table, one back-relation, no column on an existing
  table, no rename, no drop, no new `NOT NULL`. T2's note quotes the order from
  `infra/deploy.sh:27` — *"Migrations run BEFORE the rollout, and the order is the whole point"* —
  read from the file, and states why the additive shape makes the rollback direction safe.
- **H-12** T1 adds both capabilities to all four `ROLE_CAPABILITIES` rows and records that
  `hasCapability` normalizes, so a stored legacy `member` reads as `user` and an unrecognised value
  as `viewer`. T5 now names `normalizeRole(membership.role)` explicitly, because the check moved
  out of the guard that used to do it. Stored set `admin`/`member`, target set
  `admin | manager | user | viewer`; TC-01-INT-02 and TC-01-UNIT-06 exercise both.
- **H-13** `n/a` — the bundle has no External Contracts section. Every route is this repository's
  own, behind the session cookie; the rehearsal ran with no credential beyond a signed-up account.
- **H-14** `n/a` — no double, because no external contract is depended on.
- **H-15** Three DS gaps: the two the spec's own table carries (`--layout-reading-column`; a
  `Figure` component or `--figure-size`/`--figure-weight`), plus the one this plan found — §Screens
  requires each feed entry to be a `Card variant="panel"` that is an `<a>` and hovers, and `Card`
  renders a `div`, takes no `as` prop and withholds hover by design
  (`packages/ds/src/components/core/Card.tsx:33-38, 52-77`). The interim shape is written down so
  the improvisation is on the record.
- **H-16** Ten tasks, each with `files`, `requirements` and `dependsOn`; explicit paths rather than
  directory globs, and **no file appears in two tasks**. One seam was added: T3's controller
  imports classes T4 and T5 write, so T3's detail now names all four service classes and their five
  method signatures verbatim, and a risk row records that the wave may be split if the lead
  prefers.
- **H-17** `node scripts/handoff-coverage.mjs --run 2026-09-08T08-37-11_portal-01-home` → `pass`,
  sections 7/7. Its requirement and case counters read 0/0 here because it extracts requirements as
  `^\d+. ` lines and cases as `^### TC-` from the spec file alone, while this bundle numbers
  requirements as `#### REQ-01-nnn` headings and keeps its cases in the cases file. H-01 and H-02
  were therefore tallied against the heading lists rather than delegated to the script.
- **H-18** Ten `## Geometry & motion` rows, eight lines of T7 and two of T8, each with what varies,
  what holds it and what moves if it does not. No holder is a `min-width` or a `min-height`: they
  are a fixed-gap flex band with no `justify-content`, `minmax(0,1fr)` columns with ellipsis beside
  `auto` ones, a `space-between` heading row, a block in the column's flow, a 720px reading cap,
  and a `flex: 1; min-width: 0` code box — where `min-width: 0` removes a min-content floor rather
  than imposing one.
- **H-19** Nothing on these screens is drawn outside its own flow, and the spec says so rather than
  being silent: the day separator is a block in the column's flow with its own top padding, and
  every panel, entry and settings row is in flow. The only positioned box any of these controls
  opens is a `Select`'s list, which the design system portals and which no ancestor's overflow
  counts. Recorded on T7.
- **H-20** Each of the six strings the screens draw names its single element. TC-01-E2E-07 counts
  four of them exactly once with `expectMessageOnce` (`e2e/tests/ui-invariants.ts:99`) rather than
  asserting visibility. The other four rows are answers on the wire that no element draws —
  `settingsForbidden` among them, since REQ-01-052 withholds the control and the screen `notFound`s
  a caller without the capability. Note **N11** records that `feedEmptyTitle` and `noProject` are
  drawn and counted by nothing.

## Findings

None blocking. Thirteen notes travel in the handoff; the ones a person may want to read are

- **N5** — §Screens replaces the holidays list with `PORTAL_MESSAGES.noCountry` whenever no country
  is stated, while REQ-01-019 answers such a member the *global* holidays. On an organization with
  a global holiday the screen says "no holiday calendar reaches you" above rows the body carried.
  Determinate to build; the copy is what is wrong, and no case distinguishes the readings.
- **N7** — signing *up* still lands on the members list, and so does accepting an invitation. A
  person who has just created an organization does not see the portal until their second session.
- **N8** — "open request" here is the schema's literal `open`, while the requests area's own
  waiting-on-me counter spans `['open','answered']`, so two screens will show a member two numbers.
- **N13** — the settings screen's refusal state is settled by the shipped convention, not by the
  spec.

Each is a note and not a blocker for the same reason: the spec is plannable as written, and the
repair for each is another rule rather than a missing one.
