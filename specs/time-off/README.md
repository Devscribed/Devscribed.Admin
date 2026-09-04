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
| Row limit | A flat cap of 100 with a refusal | A wallchart paginated by member is two half-charts; the scope controls are already the instrument for narrowing | Pagination, and silent truncation |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Member holiday country is `Membership.countryCode` → `Organization.countryCode`, first valid alpha-2 wins; `Account.phoneCountryCode` is not a source | 01 (REQ-01-026) | `organization/03` (supersedes its §14), `reports/01` (§18) |
| A holiday applies when its `countryCode` is `null` or matches the member's resolved country, case-insensitively | 01 (REQ-01-028), unchanged from `organization/03` §4 | `reports/01` |
| Date-only columns are compared against the raw ISO range, never a tz-shifted instant | `reports/01` §2 | 01 (REQ-01-017) |
| A vacation request's `workingDays` is frozen at submission and never recomputed downstream | `user-management/09` | 01 (REQ-01-024), `reports/01` |
| Every entity is org-scoped and every query filters by `session.organizationId`, never the path `orgId` | `organization/01`, `organization/03` | 01 |
| Capability checks run against `normalizeRole()` | `packages/validation/src/roles.ts` | 01 |

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

## Dependency Graph

```
user-management/09 (VacationRequest) ─┐
user-management/11 (Project, ProjectMember) ─┼─► time-off/01 (Vacation Calendar)
organization/03 (Holiday) ────────────┘              │
                                                     └─► time-off/02 (Time-off policies, later)
```

Spec 01 adds no dependency in the other direction: nothing in user-management, organization or
reports needs the calendar to exist.

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

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| No absence types — every band is a vacation | The calendar is useful with one type, and typing every absence is a design space of its own rather than a field | `specs/time-off/02`, the time-off policy catalogue: a per-organization list of absence types with colours, paid and deducts-from-balance flags, and `VacationRequest.policyId`. It lands by giving REQ-01-025's `kind` more values |
| No booking or approving from the calendar | The request form and the review controls already exist on surfaces that own their rules; putting a second copy on a read screen doubles them before the type model is settled | A later spec, most sensibly after the policy catalogue, since what a click on an empty cell should create is a question about types |
| No blackout dates, minimum notice, or a limit on how much of a team may be away at once | Nothing enforces them today either, and the calendar is what makes the clashes visible enough to be worth a rule | A booking-constraints spec, which wants the calendar in front of it rather than behind it |
| Three country pickers now exist — the holiday form's, the organization's and the member's — each built per screen | All three write through the same validator, so a mismatch is refused rather than stored, and the option list is the same ISO set | A shared country `Select` in the design system that all three take, which is a design-system chore rather than a rule this area owns |
| A holiday inside an approved vacation is still deducted as a working day | The frozen `workingDays` contract is what specs 07–09 and every issued report rest on | A later amendment proposed here: resolve the holiday set at submit time and store which holidays the request counted, leaving every issued report's number untouched |
