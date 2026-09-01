# Organization Specifications

Functional specifications for the organization-scoped foundation that the Reports feature (`specs/reports/`) depends on. Each spec is self-contained with requirements, UI, API contracts, and test cases. Specs use YAML frontmatter (`tags`, `routes`, `api`, `entities`) for discoverability — grep frontmatter to find relevant specs.

## Why this area exists

The Reports feature ported from Teammerly.API needs primitives that Devscribed.Admin does not yet model: a `Client` entity so hours can be grouped by client, and a `Holiday` calendar so paid public holidays land on the Amounts Owed report. Each is small on its own but touches org-wide data, so they get their own area rather than being buried inside `user-management/`. Once these two specs ship, the Reports spec becomes a pure aggregation layer over `TimeEntry`, `VacationRequest`, `MemberFinancials`, `Project`, `Client`, and `Holiday`.

**Currency is deliberately out of scope for this area.** Every member and every report renders in USD; `MemberFinancials.currency` (per-member, VarChar(3)) is not surfaced anywhere and is not read by reports. No `Organization.currencyCode` is introduced. When multi-currency becomes a real need, a future spec introduces the field, the picker, the FX rules, and the migration in one deliberate step — not now.

## Spec Index

| # | Spec | Design | Tags |
|---|------|--------|------|
| 01 | [Clients](01-clients.md) | — | client, project-client-link, crud, sidebar, org-scoped |
| 03 | [Holidays](03-holidays.md) | — | holiday, calendar, paid-hours, country-code, admin-settings |

*(Spec 02 was reserved for Organization Currency and has been dropped — see §Why this area exists. The number is intentionally left as a gap so a future currency spec can slot in without a renumber.)*

## Product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Client entity | Standalone `Client` model, linked to `Project` via nullable FK | Multiple projects share the same client; the Client survives when projects are archived; matches Teammerly's shape. |
| Client archival | Soft `status` field (`active`/`archived`); no hard delete | Historical time entries and reports must still resolve the client name. Same pattern spec 11 uses for projects. |
| Currency | Hard-coded USD across the product | Every member is de-facto in USD; adding an org-level column, a picker, and FX rules for a single-currency reality would be over-engineering. `MemberFinancials.currency` stays as a legacy column but is not read. |
| Holiday calendar | Org-scoped list with optional ISO-3166 `countryCode` filter | A single org can serve teams in multiple countries. Reports and future vacation calculations can filter by country when needed. |
| Holiday effect on `workingDays` | **No change to `calculateWorkingDays`** in v1 | Vacation math freezes `workingDays` at approval today and specs 07/08/09 rely on this. Excluding holidays from `workingDays` is a separate, deliberate amendment to spec 09 and does not happen here. |
| Holiday effect on reports | Paid holiday hours appear as an "Activities" row in Amounts Owed at each member's current rate on that date | Matches Teammerly's `Holiday` policy behavior. |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Every entity is org-scoped and every query filters by `session.organizationId` (never the path `orgId`) | 01, 03 | reports/01 |
| All amounts are formatted in USD; `MemberFinancials.currency` is not read | this README | reports/01 |
| A soft-archived entity keeps its name resolvable for historical rows; new writes cannot reference it | 01, 03 | reports/01 |
| The `Client` entity name is unique per org (case-insensitive), 1–120 chars | 01 | reports/01 |
| Holidays are additive; deleting a holiday does not retroactively alter a report generated before the deletion | 03 | reports/01 |
| Capability checks run against `normalizeRole()` (see `packages/validation/src/roles.ts`) | 01, 03 | reports/01 |

## Cross-Spec Side Effects

| Trigger | Source | Effect | Target |
|---|---|---|---|
| Delete a `Client` (soft archive) | 01 | `Project.clientId` on all projects pointing at it is set to `NULL` | spec 11 (Projects) reads `clientId?` as optional |
| Create/update/delete a `Holiday` for a past date | 03 | Amounts Owed and Time Off reports generated after the change reflect the new state; already-issued PDFs are frozen | reports/01 |
| Assign a member to a `Project` whose `Client` is archived | 01 | Blocked with a validation error; assignment on active-client projects unaffected | spec 11 |

## Dependency Graph

```
specs/organization/01-clients.md ──┐
specs/organization/03-holidays.md ─┼─►  specs/reports/01-reports.md
specs/user-management/16-billable-time.md ──┘
```

Specs 01 and 03 have no dependencies on each other and can be implemented in parallel. Reports depends on all three (two here plus billable-time in `user-management/`).

## Blast Radius

**Database.** Two new tables (`Client`, `Holiday`) plus one new nullable FK on `Project` (`clientId`). No mutations to existing data columns. Additive migrations only. `Organization` is not touched. See the vacation-safety analysis in the Reports plan for evidence that these changes do not affect vacation math.

**Shared code that breaks on contact.** `packages/validation/src/roles.ts` gets three new capabilities (`ManageClients`, `ViewClients`, `ManageHolidays`). Adding capabilities is backward-compatible — role → capability lookups just gain entries.

**Security surface.** Both specs add new CRUD endpoints under `/api/organizations/{orgId}/...` guarded by `RequireCapability` + `OrgScopeGuard`. Standard org-scope discipline: server queries scope by `session.organizationId`; unauthorized cross-org access returns 404, not 403.

**Operations.** No new AWS resources. No new background jobs. No data migrations beyond the additive schema.

## Backward Compatibility

1. `Project.clientId` is nullable and defaults to `NULL`; existing projects continue to work without a client.
2. `Organization`, `TimeEntry`, `VacationRequest`, and `MemberFinancials` are not modified by any spec in this area. `MemberFinancials.currency` stays as an unread legacy column.
3. The `Capability` enum only gains members; no existing capability is removed or renamed.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| No per-project rate overrides | Reports v1 uses `MemberFinancials` as the sole rate source. Client rates and project-specific rate overrides are a Teammerly parity item deferred by design. | A future spec `specs/organization/04-project-rates.md` adds `Project.billRateOverride` and `Project.payRateOverride`, plus per-`ProjectMember` overrides. |
| Holidays do not exclude from `workingDays` | Vacation math (spec 09) freezes `workingDays` at approval; retroactively excluding holidays would break the frozen contract. | An amendment to spec 09 that (a) resolves the holiday set at submit time, (b) stores which holidays were counted on the request, (c) updates unit tests for Mon-holiday-in-range. |
| No multi-currency | Every member is de-facto in USD. When the first non-USD member lands, `MemberFinancials.currency` is still on the row but reports do not read it. | A future spec introduces `Organization.currencyCode`, the picker, the FX-rate strategy, and the migration in one deliberate step. |
| Client contact fields (email, phone, address) | Reports need only the name to group by; contact management belongs to a CRM concern, not the admin surface. | A follow-up spec if a CRM-lite need emerges. |
