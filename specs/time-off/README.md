# Time Off Specifications

Functional specifications for the **Time off** surface — the sidebar group that already holds
Holidays and Requests, and the screens that read across all three of its sources.

## Why this area exists

Time off is spread across three areas by history rather than by design: the reserve and the
request lifecycle are in [`specs/user-management/`](../user-management/README.md) (07–10), the
holiday calendar is in [`specs/organization/`](../organization/README.md) (03), and the reporting
rollup is in [`specs/reports/`](../reports/README.md). Each of those specs owns one source and
answers questions about it alone. This area is for the screens that read **across** them, where
the interesting rules are the ones no single source can state: which holidays reach which member,
which absences are worth drawing, and what a whole team's month looks like at once.

It opens with the calendar because the calendar is what makes the gaps visible.

## Spec Index

| # | Spec | Mockup | Tags |
|---|------|--------|------|
| 01 | [Vacation Calendar](01-vacation-calendar.md) · [contracts](01-vacation-calendar.contracts.md) · [cases](01-vacation-calendar.cases.md) | [mockup](01-vacation-calendar.mock.html) · [png](01-vacation-calendar.png) · [four people](01-vacation-calendar.people.png) | vacation-calendar, wallchart, timeline, absence, holiday, country-resolution, scope, teams |
| 02 | [Holiday sourcing and what it costs](02-holiday-sourcing.md) · [contracts](02-holiday-sourcing.contracts.md) · [cases](02-holiday-sourcing.cases.md) | — | holidays, import, nager, public-holiday-api, provider-port, sourcing, amounts-owed, cost, country-coverage |
| 03 | [Calendar range and scope defaults](03-calendar-range-and-scope.md) · [contracts](03-calendar-range-and-scope.contracts.md) · [cases](03-calendar-range-and-scope.cases.md) | — | vacation-calendar, date-range, window, scope, teams, people, filter-defaults, wallchart |

Neither 02 nor 03 has a mockup. Both change screens `01` already drew and both state their
layout in the `## Screens` block of their contracts file; a second rendering of a screen that
exists is a second thing to keep current.

### Defects filed against this area's screens

| Bug | Title | Verdict | Owning spec |
|---|---|---|---|
| [011](../bugs/BUG-011-holidays-org-country-hint-is-overlapped.md) | The organization country hint is drawn under the filter below it | `SPEC-GAP` | 01 |
| [012](../bugs/BUG-012-calendar-grid-keeps-the-last-window-that-loaded.md) | The calendar grid keeps the last window that loaded, whatever the header says | `CODE-DEFECT` | 01 |
| [013](../bugs/BUG-013-calendar-header-shifts-with-the-range-label.md) | The calendar's back, Today and forward controls move every time the range label changes width | `SPEC-GAP` | 01 |

BUG-012 and spec 03 touch the same screen and neither depends on the other: 03 removes the
refusal that makes 012 easiest to see, and 012's fix is still needed afterwards, because its
subject is a stale answer rather than a refusal. Whichever goes first, the second rebases.

## Related Areas

[`specs/user-management/`](../user-management/README.md) — spec 09 owns the `VacationRequest`
lifecycle this area draws and never writes, spec 11 owns the `Project` and `ProjectMember` rows
the Teams scope reads, and spec 10 owns the Requests page that reviews what the calendar shows.

[`specs/organization/`](../organization/README.md) — spec 03 owns the `Holiday` entity, its CRUD
and its settings page. **Spec 01 here supersedes that spec's member-country rule** (its §14–15,
`Account.phoneCountryCode` alone) with REQ-01-026: a country stated on the membership, falling
back to one stated on the organization, and the phone dropped as a source entirely. It adds the
organization country to that spec's settings page. Nothing else about `Holiday` changes: this
area adds no holiday field, no holiday route, and no holiday of its own.

[`specs/reports/`](../reports/README.md) — the Time Off and Amounts Owed reports read the same two
sources. They are a *table over a range*; the calendar is a *grid over a range*, and neither is
built out of the other, because the report aggregates by member and the calendar must not
aggregate at all. What they do share is the country rule, and after spec 01 here they share one
implementation of it.

## Product decisions

| Decision | Choice | Rationale | What lost |
|---|---|---|---|
| What a "team" is | A `Project` and its `ProjectMember` rows | The set of people who work together is already modelled, and the filter needs no migration, no CRUD screen and no spec of its own | A `Team` entity for departments. It stays available: the calendar's scope contract would gain a value, not change shape |
| Absence types | None in this release; every band is `kind: "vacation"` | The catalogue is a spec of its own, and the calendar is useful before it exists | Shipping sick leave and unpaid leave with the calendar, which would have doubled the first release |
| Who may see the whole organization's absences | `admin`, `manager`, `user` — not `viewer` | Knowing who is away is what a shared calendar is for, and the response carries no reason and no money. `viewer` is excluded because reports/01 already settles that a viewer sees only their own time off | Admin-and-manager-only, which is today's reports gate but makes the calendar useless to the people who plan around each other; and a share-a-project-with-me rule, which is a second authorization model for one screen |
| A remaining-balance column | Not in this release | It would pull `MemberFinancials`, the reserve ledger and their money-grade capabilities onto a screen that otherwise reads nothing financial | Parity with the wallcharts that show it. The balance stays on the member's Vacation tab |
| Member holiday country | `Membership.countryCode`, falling back to `Organization.countryCode`. Both stated by a person | Which country's public holidays somebody is paid for is a payroll fact, and it is set deliberately rather than guessed. A phone's dial code is a contact detail a foreign SIM makes wrong, and a postal address sits behind a PII capability — neither should decide what a person is paid | Keeping `Account.phoneCountryCode`, which pays a member their national holidays only if they happened to enter a phone number; and reading `MemberProfile.country`, which makes the holidays somebody is paid a side effect of filling in a contract |
| Where the countries are set | The organization's on the existing Holidays settings page; the member's on their About tab, through the update that already carries their role and job title | Each sits where a reader would look for it, and neither earns a screen or a capability of its own — `ManageHolidays` and `edit-detail` already grant exactly the admin and manager who set them | A new `My organization` settings route, which the app shell names but nothing ships; and a dedicated capability per country, a distinction no grant would express |
| Window | Week, 2 weeks, Month; API bounded at 92 days | A month of day-wide columns is the density every wallchart in this category settles on, and the bound leaves a Quarter preset addable without a contract change | A Quarter preset now, which needs a second cell renderer for a grid whose columns are too narrow to label |
| Where public holidays come from | Nager.Date, over HTTPS with no credential, behind a provider port with a local double | It needs no key, so no secret reaches Terraform and no test touches the network; and the port is the shape `CALENDAR_PROVIDER` and `STORAGE_PROVIDER` already have, so a second source is a driver rather than a rewrite | A keyed service (Calendarific, HolidayAPI) with wider coverage — it would have bought India and the UAE at the price of a secret, a quota and a bill; and a bundled npm dataset, which needs no network and goes stale with the version that ships it |
| When sourcing runs | On a page load, once per country per year, recorded and never repeated | This repository runs no scheduler, and the one that would be needed is infrastructure with its own spec. Recording the import is also what makes an admin edit permanent | A cron job, which resurrects every holiday somebody deliberately deleted and does it silently; and fetching live on every read, which puts a third party in the path of a page that must paint |
| What an import may overwrite | Nothing. A date and country that already carries a holiday is skipped | A person who typed or edited a holiday made a decision, and an import is a default | Last-writer-wins on the provider, which would quietly undo every `paidHours` an admin corrected |
| Which holidays are imported | Nationwide `Public` entries only | Measured: 10 of Germany 2026's 20 entries are regional. Importing them pays every German member for ten days half the country does not observe | Importing all of them, or modelling subdivisions — the latter is a real feature and a spec of its own |
| How a holiday is costed | `paidHours` x the billable rate in force on that date, from the snapshot history — the Amounts Owed formula | One formula, two screens. The number on Holidays is the number the report will bill | Deriving it from `monthlySalary`, which is the cost to the company rather than what is invoiced, and which no other surface computes |
| What an empty Teams or People selection means | Everybody — the same rows `All` answers with | Every other filtered surface in this product reads an empty filter as *all*, and the picker already says `All` in its placeholder | The shipped refusal, which replaced the chart with a sentence and left the previous window on screen underneath it |
| Row limit | A flat cap of 100 with a refusal | A wallchart paginated by member is two half-charts; the scope controls are already the instrument for narrowing | Pagination, and silent truncation |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Member holiday country is `Membership.countryCode` → `Organization.countryCode`, first valid alpha-2 wins; `Account.phoneCountryCode` is not a source | 01 (REQ-01-026) | `organization/03` (supersedes its §14), `reports/01` (§18) |
| A holiday applies when its `countryCode` is `null` or matches the member's resolved country, case-insensitively | 01 (REQ-01-028), unchanged from `organization/03` §4 | `reports/01` |
| Date-only columns are compared against the raw ISO range, never a tz-shifted instant | `reports/01` §2 | 01 (REQ-01-017) |
| A vacation request's `workingDays` is frozen at submission and never recomputed downstream | `user-management/09` | 01 (REQ-01-024), `reports/01` |
| Every entity is org-scoped and every query filters by `session.organizationId`, never the path `orgId` | `organization/01`, `organization/03` | 01 |
| Capability checks run against `normalizeRole()` | `packages/validation/src/roles.ts` | 01, 02, 03 |
| The sourced country set is every active member's resolved holiday country, plus the organization's own behind a setting | 02 (REQ-02-001, REQ-02-002) | 02 |
| An import never deletes a holiday and never modifies a manual one | 02 (invariants 1 and 2) | 02 |
| A holiday costs `paidHours` x the billable rate in force on its own date | 02 (REQ-02-015), matching `reports/01` | 02, `reports/01` |
| An empty `projectIds` or `memberIds` narrows nothing | 03 (REQ-03-001, REQ-03-002) | 03 |

## Cross-Spec Side Effects

| Trigger | Source | Effect | Target |
|---|---|---|---|
| Vacation request approved or submitted | `user-management/09` | A band appears on the calendar on the next read; nothing is pushed or cached | 01 |
| Vacation request rejected or cancelled | `user-management/09` | Its band disappears on the next read | 01 |
| Member removed | `user-management/04` | Their row and every band on it leave every scope | 01 |
| Member assigned to or removed from a project | `user-management/11` | The Teams scope's row set changes on the next read | 01 |
| Holiday created, edited or deleted | `organization/03` | The day's shading changes on the next read | 01 |
| Organization country set or cleared | 01 | Members with no country of their own gain or lose that country's holidays — on the calendar, on the Time Tracking calendar's markers, and in the Amounts Owed payable | 01, `organization/03`, `reports/01` |
| Member's country stated or cleared | 01 | That member gains or loses that country's holidays — on the calendar, on the Time Tracking calendar's markers, and in the Amounts Owed payable | 01, `organization/03`, `reports/01` |
| A member's country is stated for the first time | 01 | That country joins 02's sourced set, and the next load of Settings › Holidays imports its public holidays — which then shade the calendar and add payable rows to Amounts Owed for **every** member who resolves to it | 02, 01, `organization/03`, `reports/01` |
| Holidays imported for a year | 02 | Every one of them is an ordinary `Holiday` row from that moment: it shades the calendar, marks the Time Tracking calendar, and is paid on Amounts Owed. This is the largest single effect in the area, because an import writes tens of rows where a person wrote one | 01, `organization/03`, `reports/01` |
| Include-organization-country turned off | 02 | The organization's country leaves the sourced set unless a member resolves to it. Holidays already imported for it are **not** deleted — the setting governs sourcing, never what is stored | 02 |
| An imported holiday deleted | `organization/03` | It stays deleted; the import record is what stops it being written again. A refresh is the one instruction that brings it back | 02 |
| Financial settings or a rate snapshot changed | `user-management/07` | 02's per-person amounts change on the next read, by the same rate resolution the Amounts Owed report uses | 02, `reports/01` |

## Dependency Graph

```
user-management/09 (VacationRequest) ─┐
user-management/11 (Project, ProjectMember) ─┼─► time-off/01 (Vacation Calendar)
organization/03 (Holiday) ────────────┘              │
                                                     ├─► time-off/02 (Holiday sourcing)
                                                     │        ▲
                                                     │        └── Nager.Date (external)
                                                     │        └── user-management/07 (MemberFinancials, rates)
                                                     │
                                                     └─► time-off/03 (Calendar range and scope)
```

Both 02 and 03 depend on 01 for one thing each and on nothing else in this area: 02 reads 01's
country-resolution chain, 03 reads 01's window helpers. **They do not depend on each other** and
may be run in either order.

Spec 01 adds no dependency in the other direction: nothing in user-management, organization or
reports needs the calendar to exist. **Spec 02 does add one** — every reader of `Holiday` now
reads rows a person did not type, which is the effect the Cross-Spec table above opens with.

## New infrastructure introduced by this area

Spec 02 introduces the area's first **outbound HTTP dependency**: a public holiday service,
behind a port with two drivers, selected by `HOLIDAY_PROVIDER`.

| Piece | Shape | Why it is not improvised |
|---|---|---|
| The port | An abstract class Nest uses as its DI token, one method: holidays for a country and a year | The shape `JobQueue`, the calendar provider and the storage provider already have |
| `nager` driver | HTTPS to `date.nager.at`, no credential, bounded by `HOLIDAY_PROVIDER_TIMEOUT_MS` | The only driver that touches the network, and it is never selected in a test |
| `fake` driver | Answers a seeded fixture, and can answer empty, fail, and never answer | Selected whenever `NODE_ENV` is not `production` and `HOLIDAY_PROVIDER` is unset, so a fresh clone needs no configuration |
| `HOLIDAY_PROVIDER`, `HOLIDAY_PROVIDER_BASE_URL`, `HOLIDAY_PROVIDER_TIMEOUT_MS` | Three variables in `apps/api/.env.example`, Terraform in a deployed environment | **None of them is a secret.** The provider needs no key, so there is nothing to place in SSM and nothing to rotate |

## Blast Radius

**Database.** Two nullable columns — `countryCode` on `Organization` **and on `Membership`**. No
new table, no altered column, no new `NOT NULL`, no rename, no drop, no backfill. A reviewer
checking the migration is additive should expect to find both; the second is the one easily
missed, because the feature reads as organization-scoped. The migration is additive in the strict
sense `infra/deploy.sh` relies on, so the new-schema-then-new-code order it enforces is safe and
the reverse — old code against the new schema — is safe too.

**Shared code that breaks on contact.** `packages/validation/src/roles.ts` gains one capability,
`ViewTimeOffCalendar`, and `packages/validation/src/index.ts` gains its lowercase-dashed twin
`view-time-off-calendar` in `MemberCapability` — the spelling the calendar's own gate reads,
through `can()` on the normalized role, so a membership still storing `member` is read as `user`. Neither country write adds one — they reuse `ManageHolidays` and
`edit-detail`, which already grant exactly the admin and manager who set them. `Capability` is a
union typed against `ROLE_CAPABILITIES` and `MemberCapability` one typed against
`CAPABILITY_MATRIX`, so adding a member to either forces every role's entry to be revisited at
compile time, which is the intended behaviour and the reason both types are shaped that way.
Adding a capability is otherwise backward-compatible: no existing capability is removed, renamed
or regranted.

**Two shipped member routes change shape.** `GET .../members/{memberId}` gains `countryCode` in
its explicit projection and `PUT .../members/{memberId}` gains it in its body. Both keep every
status, message and guard they have; the read is the only thing that can tell the new picker what
is stored, which is why it is named here rather than assumed.

**The country rule moves money, in both directions, and this is the one to read twice.** Every
call site that resolves a member's country reads `Account.phoneCountryCode` today, and this area
drops that source rather than ranking against it (the sites are listed in
[the contracts file](01-vacation-calendar.contracts.md)). The consequence is on **Amounts Owed**,
where a country-scoped holiday adds a paid "Holiday · {name}" row for each member it applies to.

**It can pay less than today.** A member whose only country is their phone's resolves to `null`
the moment this ships, and stops receiving that country's holiday rows, until somebody states a
country for them or for the organization. That is the direction to plan for: setting the
organization country is not an optional nicety here, it is the step that restores and then widens
what was being paid, and it should be done in the same change window as the deploy.

**It can pay more.** A member who has no phone country — and today therefore receives no national
holidays at all — gains them as soon as a country covers them. Measured on the spec's own probe,
in a fixture of five members with one `PL` holiday and one global holiday in the month: the `PL`
day produced **one** holiday row (`320.00`) because exactly one member had a phone country, while
the global day produced **five** (`1280.00`). An organization country of `PL` moves the first day
to the second shape.

Neither direction is a silent drift: both follow from a field a person set, both are evaluated on
read so nothing is stored wrong in the meantime, and the migration alone changes nothing, because
both columns land `null`.

**Reports and the Time Tracking calendar change without their specs changing.** The Time Tracking
weekly and monthly views read `GET /holidays?scope=mine` (organization/03 §10) and will show
markers on days a member did not see before, once the organization country is set. No route, no
response shape and no test id changes for either.

**Security surface.** Three new endpoints — the calendar read, and the read and write of the
organization country — all under `/api/organizations/{orgId}/`, all behind `SessionGuard` +
`OrgScopeGuard` + a capability checked in the service. The calendar returns names, job titles,
absence dates and a resolved two-letter country — no money, no reason for an absence, and no
profile field; the country pair returns one two-letter code.

**Operations.** No new AWS resources, no new background job, no new secret, no third-party
dependency. Nothing in this area is scheduled: every rule is evaluated on read, so a failed job
cannot make the calendar wrong because there is no job.

**Frontend.** One new route and one new sidebar row. Two shipped screens each gain one control and
one test id: the Holidays settings page gains `org-country-select` with its save, and the member
detail About tab gains `member-country-select`. No existing markup, control or test id is removed,
renamed or moved.

### Spec 02 — holiday sourcing

**Database.** Two new tables, `HolidayImport` and `OrganizationHolidaySourcing`, and three
columns on `Holiday` — `source` with a default of `manual`, and the nullable `externalKey` and
`importedAt`. Additive in the strict sense `infra/deploy.sh` relies on: new schema first, then the
code that uses it, and the reverse is safe because old code selects none of the three columns and
neither new table is referenced by an existing query. No backfill — every existing row *is*
manual, which is exactly what the default says.

**The largest blast radius in this area is not code, it is rows.** Sourcing writes tens of
`Holiday` rows where a person wrote one, and every reader of `Holiday` reads them without
knowing they were imported: the calendar shades those days, the Time Tracking calendar marks
them, and **Amounts Owed pays them**. An organization with three countries and eight people can
gain forty paid holiday rows from one page load. This is the change to stage deliberately — it
is the intended behaviour, it is what the screen is for, and it is money.

**Shared code that breaks on contact.** `packages/validation` gains `HOLIDAY_SOURCING_MESSAGES`,
a new export that nothing removes and nothing renames. No capability is added: the four routes
reuse `view-holidays`, `manage-holidays` and `view-amounts-owed`, all of which grant exactly the
roles they grant today.

**Security surface.** One outbound HTTPS call to a service this repository does not own, carrying
a year and a country code and no identifier of any kind. Its response is untrusted input and is
re-validated field by field against the same functions a typed holiday passes. No credential is
introduced, so none can leak.

**Operations.** The provider is a new external dependency that can be down. It is bounded in time
(REQ-02-011), it fails to a `200` with a named unsourced country (REQ-02-009), and the number of
calls per page load falls to zero once a year is sourced (invariant 5). A provider outage
therefore degrades one panel of one screen and stops nothing.

### Spec 03 — calendar range and scope

**Database.** Nothing. No table, no column, no migration.

**A shipped route loses two refusals.** `GET .../time-off/calendar` stops answering `422
teamsRequired` and `422 peopleRequired`. A caller that relied on either to know its selection was
empty now receives `200` and rows — which is the point, and which is why this is a spec. The
enforcing mechanism for finding every such caller is deletion rather than deprecation: both
message exports are removed from `packages/validation`, so every import of them stops compiling.

**Security surface.** Unchanged. The widened default resolves to the active memberships of the
caller's own organization — the same set the `all` scope has always answered with for the same
three roles — so no row becomes reachable that clicking `All` did not already reach.

**Operations.** An empty Teams selection in an organization over 100 people now answers `422
tooManyMembers` where it previously answered `422 teamsRequired`. Both are refusals with a
banner; the new one is the true one.

## Backward Compatibility

1. **Both country columns are nullable with no default**, so every row that predates the migration
   reads `null` and behaves identically until somebody states a country. The enforcing mechanism
   is the absence of a backfill: nothing writes either column but an admin or a manager.
2. **The country chain is not a superset of today's rule, and this area says so rather than
   claiming otherwise.** Dropping `Account.phoneCountryCode` narrows the answer for any member
   whose only country was their phone's: they resolve to `null` until a country is stated. The
   compensating mechanism is the organization country, which covers every such member at once;
   the exposure is bounded to holiday rows on Amounts Owed and holiday markers, and touches no
   vacation balance, no ledger row and no issued PDF. TC-01-INT-12 pins the new resolution
   including a member whose phone country reaches nothing.
3. **Three shipped surfaces gain something; none loses or changes anything.** `GET .../members/
   {memberId}` gains the `countryCode` field in its projection, `PUT .../members/{memberId}` gains
   `countryCode` in its body, and the member detail About tab gains `member-country-select`. Every
   other route this area names is new — the calendar (proven: it answers `404` today) and both
   halves of the organization country. The mechanism is additive-only: no status, message, guard,
   field or test id that ships today is removed, renamed or given a new meaning, so a caller that
   ignores the new field is a caller nothing changed for. Enforced for the routes the suites cover
   by the reports and holidays E2E suites, which this area does not touch and which must stay
   green; the member detail screen is covered by neither, so TC-01-INT-27 and TC-01-E2E-08 are
   what enforce it there.
4. **Both capability unions only gain members.** No role loses a capability it holds today, and
   `viewer` gains nothing: its `view-time-off-calendar` entry is `false`. Enforced by the
   compile-time exhaustiveness of `ROLE_CAPABILITIES` and `CAPABILITY_MATRIX`.
5. **Vacation math is untouched.** This area writes no `VacationRequest` and no
   `VacationReserveTransaction`, and recomputes no `workingDays`. Enforced by TC-01-INT-10, which
   asserts the frozen count survives a window that shows only part of the request.
6. **A code rollback needs no database rollback.** The only schema change is a nullable column that
   older code does not select.

### Added by spec 02

7. **`Holiday.source` defaults to `manual`**, so every row that predates the migration reads as
   what it is, and every reader that does not know the column is unaffected. `externalKey` and
   `importedAt` are nullable with no default. The enforcing mechanism is the column default plus
   the absence of a backfill.
8. **An organization with no `OrganizationHolidaySourcing` row reads `includeOrgCountry: true`.**
   No organization changes behaviour before somebody touches the checkbox, and no backfill is
   written. Enforced by the service resolving a missing row to the default rather than by data.
9. **Sourcing is opt-out by inaction, not by configuration** — but it is not silent. An
   organization that states no country and whose members state none has an empty sourced set, so
   nothing is fetched and nothing is written. The organizations that *will* gain holiday rows are
   exactly those that already stated a country, which is the field spec 01 introduced for this
   purpose.
10. **A code rollback needs no database rollback here either.** Older code selects none of the
    three new `Holiday` columns and queries neither new table; the imported rows it does see are
    ordinary holidays and were always going to be readable as such.

### Added by spec 03

11. **Two message exports are removed, and that is a compile-time break by design.**
    `teamsRequired` and `peopleRequired` are deleted rather than deprecated, so every consumer is
    found by the type checker rather than at runtime. The only shipped consumers are the calendar
    service and the calendar screen, both changed in the same diff.
12. **No stored data, no URL and no response body changes shape.** A client that keeps sending a
    non-empty `projectIds` or `memberIds` gets exactly what it gets today. Enforced by
    TC-03-INT-23, which asserts the narrowing survived the widening.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| No absence types — every band is a vacation | The calendar is useful with one type, and typing every absence is a design space of its own rather than a field | The time-off policy catalogue: a per-organization list of absence types with colours, paid and deducts-from-balance flags, and `VacationRequest.policyId`. It lands by giving REQ-01-025's `kind` more values. **It has no number yet** — spec 01 called it `time-off/02` before that number was taken by holiday sourcing, and it takes the next free one when it is written |
| No booking or approving from the calendar | The request form and the review controls already exist on surfaces that own their rules; putting a second copy on a read screen doubles them before the type model is settled | A later spec, most sensibly after the policy catalogue, since what a click on an empty cell should create is a question about types |
| No blackout dates, minimum notice, or a limit on how much of a team may be away at once | Nothing enforces them today either, and the calendar is what makes the clashes visible enough to be worth a rule | A booking-constraints spec, which wants the calendar in front of it rather than behind it |
| Three country pickers now exist — the holiday form's, the organization's and the member's — each built per screen | All three write through the same validator, so a mismatch is refused rather than stored, and the option list is the same ISO set | A shared country `Select` in the design system that all three take, which is a design-system chore rather than a rule this area owns |
| A holiday inside an approved vacation is still deducted as a working day | The frozen `workingDays` contract is what specs 07–09 and every issued report rest on | A later amendment proposed here: resolve the holiday set at submit time and store which holidays the request counted, leaving every issued report's number untouched |
