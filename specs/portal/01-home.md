---
id: "01"
title: Home
routes: ["/org/{orgId}", "/org/{orgId}/news/{entryId}", "/org/{orgId}/settings/portal"]
api:
  - "GET /api/organizations/{orgId}/portal/home"
  - "GET /api/organizations/{orgId}/portal/news"
  - "GET /api/organizations/{orgId}/portal/news/{entryId}"
  - "GET /api/organizations/{orgId}/portal/settings"
  - "PUT /api/organizations/{orgId}/portal/settings"
entities: [OrganizationPortalSettings]
tags: [portal, home, dashboard, feed, news, landing, projection, org-settings, anniversary, referral, visibility]
depends-on: []
bundle:
  - 01-home.contracts.md
  - 01-home.cases.md
---

# 01 — Home

## Summary

**The request:** a home screen for a signed-in member — their own month on one side (hours by
project, the vacation reserve, the holidays ahead, the requests on them) and the organization's
news on the other, built from what already happens in the product, with an admin deciding which
kinds of news are shown, and every entry openable to a page of its own.

The structural decision that shapes everything here: **the feed is a projection, not a table.**
Nothing writes a news row. `Membership.joinedAt`, `Vacancy.createdAt`, `Project.createdAt` and
`Client.createdAt` already carry the moment each thing happened, and the feed is a query over them
answered per reader. So five areas gain no write path, an organization that has been running for a
year has a feed on the first render rather than an empty one, and visibility is decided at read
time against the role in front of it — a stored `visibleTo` column would be a second, ageing copy
of a rule the reader's own membership already answers.

Beyond the request, this spec adds:

- **A `/portal` route group of its own,** rather than the screen calling the endpoints that
  already answer these questions. Those answer a report table shaped for a report screen and a
  member record shaped for a member screen; parsing either on the home screen would bind this page
  to another spec's column contract. The group is written out in the contracts file.
- **A change to where signing in lands** (`REQ-01-001`), which is the request's "дашборд
  становится домом" and is called out because it moves a destination that 27 test files assert.
- **One additive migration** — `OrganizationPortalSettings`, one row per organization, holding the
  three group switches.
- **One test-support fixture,** `POST /api/test/membership/backdate-joined`. An anniversary needs a
  membership that joined a year or more ago and no route reaches that state; the rehearsal proved
  its absence (`404`).

Blast radius and backward compatibility for this spec are in [README.md](README.md).

## Actors & Preconditions

| Actor | Precondition |
|---|---|
| A signed-in member (`admin`, `manager`, `user`, `viewer`) | An active `Membership` in the organization |
| An admin configuring the feed | `manage-portal-settings`, which only `admin` holds |
| A client contact | A `ClientMembership`. Reaches no route in this spec |

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer | client contact |
|---|---|---|---|---|---|
| `view-portal-home` — read the home screen and the feed | ✅ | ✅ | ✅ | ✅ | ❌ |
| `manage-portal-settings` — read and change the group switches | ✅ | ❌ | ❌ | ❌ | ❌ |

`view-portal-home` is held by every staff role, and **every kind the feed derives is drawn to all
four of them** (`REQ-01-034`). What a role changes is one field inside an entry, not the set of
entries: a `project-started`'s `clientName` is withheld from a reader who may not already see it
(`REQ-01-035`, `REQ-01-055`). The check runs on `normalizeRole(Membership.role)`, so a legacy
`member` row is read as `user`.

## Functional Requirements

### The landing and the shell

#### REQ-01-001 — signing in lands on the portal

WHEN a member signs in and no `next` parameter names another destination inside the organization,
THE SYSTEM SHALL navigate them to `/org/{orgId}`.

**Decided:** a portal nobody lands on is one more screen nobody opens. The reason stops holding
only if a role were introduced that may not read the portal at all; no rule in this spec creates
one, because `view-portal-home` is held by every staff role.

#### REQ-01-002 — a client contact keeps their own landing

WHEN a client contact signs in, THE SYSTEM SHALL navigate them to `/org/{orgId}/requests`.

#### REQ-01-003 — the portal has a navigation row

THE SYSTEM SHALL draw a `Team overview` row at the top of the sidebar for every staff principal,
linking to `/org/{orgId}`.

#### REQ-01-004 — who each route refuses, and with what

THE SYSTEM SHALL refuse a caller on every route in this spec as the table below answers.

`decision-table: keys=(principal, capability) domains=(principal: clientContact|otherOrganization|member, capability: held|notHeld)`

| principal | capability | Outcome |
|---|---|---|
| clientContact | held | `404`. A client contact holds no capability here; the row exists because the table is total. |
| clientContact | notHeld | `404`. `OrgScopeGuard` refuses a client principal before any capability is read, and not-found is what it answers. |
| otherOrganization | held | `404`. The `orgId` does not match the session, so the organization is not confirmed to exist. |
| otherOrganization | notHeld | `404`. Same reason, and it is answered identically so neither refusal confirms the other. |
| member | held | Not refused — the route answers. |
| member | notHeld | `403` `PORTAL_MESSAGES.settingsForbidden` on the settings pair, which is the only pair a capability gates. Refusing a member of this organization leaks nothing about what is inside it. |

### The personal half — the month

#### REQ-01-010 — the month the personal half answers about

THE SYSTEM SHALL compute the personal half over the calendar month containing the caller's own
today, resolved in `Account.timezone`, falling back to UTC when it is unset.

#### REQ-01-011 — tracked time this month

THE SYSTEM SHALL answer the caller's total tracked minutes for that month across every project.

#### REQ-01-012 — the split by project

THE SYSTEM SHALL answer one row per project the caller tracked against in that month, each with
the project name and the caller's minutes on it, ordered by minutes descending then by name.

#### REQ-01-013 — time with no project

WHERE a time entry in the month carries no project, THE SYSTEM SHALL answer its minutes in a row
named by `PORTAL_MESSAGES.noProject`.

#### REQ-01-014 — days with an entry

THE SYSTEM SHALL answer the count of distinct dates in that month on which the caller has at
least one time entry.

### The personal half — the reserve

#### REQ-01-015 — the reserve is answered in days

THE SYSTEM SHALL answer the caller's `availableDays`, `usedDays`, `pendingDays` and
`totalDaysPerYear`.

#### REQ-01-053 — the reserve carries no money

THE SYSTEM SHALL omit every monetary field from the home response, for every role.

**Decided:** a `user` reading their own membership is already answered days and a null balance, so
a home screen that drew money would be a different screen per role for no product reason. The
reason stops holding if a future spec grants a `user` their own monetary balance; none does.

#### REQ-01-016 — a membership with no financials

IF the caller's membership has no `MemberFinancials` row, THEN THE SYSTEM SHALL answer `null` for
the whole reserve block.

`Decided:` a reserve nobody configured is not a zero reserve, so the block is absent rather than
drawn at zero. The holidays are outside it (`REQ-01-017`) — they are a fact about where somebody
works, not about their days, and withholding them would hide the holidays ahead from every admin
straight out of signup, whose membership carries no financials row.

### The personal half — holidays

#### REQ-01-017 — the holidays ahead

THE SYSTEM SHALL answer the next three holidays that reach the caller, on or after the caller's
own today, ordered by date ascending, whatever the reserve block answers.

#### REQ-01-018 — which holidays reach the caller

THE SYSTEM SHALL treat a holiday as reaching the caller when its `countryCode` is null, or equals
the country stated on the caller's own membership, and from nothing else.

#### REQ-01-019 — a member who states no country

IF the caller's membership states no country, THEN THE SYSTEM SHALL answer only the holidays
whose `countryCode` is null.

`Decided:` nobody inherits a country — `PATCH-012` removed that inheritance, and
`resolveMemberHolidayCountry` (`packages/validation/src/reports.ts`) already resolves it this way.
A fallback here would answer a different country than the calendar and Amounts Owed answer for
the same person.

### The personal half — requests

#### REQ-01-020 — the requests on the caller

THE SYSTEM SHALL answer at most three open requests the caller raised or is assigned, ordered by
overdue first, then by `neededBy` ascending with nulls last, then by `lastActivityAt` descending.

#### REQ-01-021 — the count that is not drawn

THE SYSTEM SHALL answer the total number of open requests matching `REQ-01-020`'s filter, so the
screen can say how many are not in the three.

### The feed — what it is

#### REQ-01-022 — the feed is a projection

THE SYSTEM SHALL derive every feed entry from a row that already exists.

#### REQ-01-054 — reading the feed writes nothing

THE SYSTEM SHALL write no row when an entry comes into being and none when one is read.

#### REQ-01-023 — an entry's identity

THE SYSTEM SHALL address every entry as `{kind}:{sourceId}` — and, for an anniversary,
`member-anniversary:{membershipId}:{year}` — computed from the source row and stable across reads.

#### REQ-01-024 — ordering

THE SYSTEM SHALL order the feed by the entry's moment descending, breaking ties by entry id
ascending.

#### REQ-01-025 — paging

WHEN the caller passes a cursor, THE SYSTEM SHALL answer the entries strictly after it in
`REQ-01-024`'s order, at most `limit` of them, and a `nextCursor` when more remain.

#### REQ-01-026 — the window the feed reads

THE SYSTEM SHALL derive entries from source rows whose moment falls in the 365 days ending at the
caller's own today.

**Decided:** an unbounded projection scans every source table's whole history to answer the first
page. The reason stops holding if an organization wants its founding in the feed; nothing in this
spec offers that, and `Known Gaps` records it.

### The feed — the kinds

#### REQ-01-027 — somebody joined

THE SYSTEM SHALL derive a `member-joined` entry from every `Membership` whose `status` is
`active`, at the moment `joinedAt`.

#### REQ-01-028 — a removed membership draws nothing

IF a `Membership` has `status` `removed`, THEN THE SYSTEM SHALL derive no entry from it.

#### REQ-01-029 — an anniversary

THE SYSTEM SHALL derive a `member-anniversary` entry for every whole year `Y` ≥ 1 since an active
membership's `joinedAt` whose anniversary date falls inside `REQ-01-026`'s window.

#### REQ-01-030 — a vacancy opened

THE SYSTEM SHALL derive a `vacancy-opened` entry from every `Vacancy`, at the moment `createdAt`,
whatever its current `status`.

#### REQ-01-031 — a project started

THE SYSTEM SHALL derive a `project-started` entry from every `Project`, at the moment `createdAt`,
whatever its current `status`.

#### REQ-01-032 — a client is not news

THE SYSTEM SHALL derive no entry from a `Client`.

`Decided:` a client being added is not news. What its arrival changes that people act on is a
project starting, and `REQ-01-031` already draws that.

#### REQ-01-033 — hiring says one thing and no more

THE SYSTEM SHALL derive no entry from a `Candidate`, an `Application`, an
`ApplicationScheduleEvent`, an `ApplicationCriterion` or an `ApplicationCv`.

### The feed — who sees what

#### REQ-01-034 — visibility by kind and reader

THE SYSTEM SHALL include an entry in a caller's feed only where the table below marks it drawn.

`decision-table: keys=(kind, reader) domains=(kind: memberJoined|memberAnniversary|vacancyOpened|projectStarted, reader: admin|manager|user|viewer)`

| kind | reader | Outcome |
|---|---|---|
| memberJoined | admin | Drawn. |
| memberJoined | manager | Drawn. |
| memberJoined | user | Drawn. |
| memberJoined | viewer | Drawn. |
| memberAnniversary | admin | Drawn. |
| memberAnniversary | manager | Drawn. |
| memberAnniversary | user | Drawn. |
| memberAnniversary | viewer | Drawn. |
| vacancyOpened | admin | Drawn. |
| vacancyOpened | manager | Drawn. |
| vacancyOpened | user | Drawn. |
| vacancyOpened | viewer | Drawn. |
| projectStarted | admin | Drawn. |
| projectStarted | manager | Drawn. |
| projectStarted | user | Drawn. |
| projectStarted | viewer | Drawn. |

#### REQ-01-035 — a project's client is named where the reader may see it

WHERE the reader holds `view-clients` or is a `ProjectMember` of the project, THE SYSTEM SHALL
name the project's client on a `project-started` entry.

#### REQ-01-055 — and withheld where they may not

IF the reader holds neither, THEN THE SYSTEM SHALL answer `clientName` as `null` on that entry.

#### REQ-01-036 — a disabled group draws nothing

WHILE a group is switched off for the organization, THE SYSTEM SHALL derive no entry of the kinds
that group covers.

#### REQ-01-037 — a disabled group is not announced

THE SYSTEM SHALL NOT state on the home screen that any group is switched off.

**Decided:** a reader who cannot change the setting is told only that something is missing. The
reason stops holding for the admin who can change it, and `REQ-01-052` is where they read it.

### The entry page

#### REQ-01-038 — an entry has a page

WHEN a caller opens `/org/{orgId}/news/{entryId}` for an entry their feed would contain, THE
SYSTEM SHALL answer that entry with the facts its kind carries.

#### REQ-01-039 — the page is headed by the feed's own sentence

THE SYSTEM SHALL head the entry page with the same sentence the feed drew for it.

#### REQ-01-040 — an entry the caller may not see

IF `GET .../portal/news/{entryId}` is asked for a row the caller's own feed would not contain,
THEN THE SYSTEM SHALL answer `404`.

#### REQ-01-041 — an id that names nothing

IF `GET .../portal/news/{entryId}` is asked for an id that is malformed, names an unknown kind, or
names a source row that no longer exists, THEN THE SYSTEM SHALL answer `404`.

#### REQ-01-042 — a vacancy's page carries what a reader can act on

WHERE the entry is `vacancy-opened`, THE SYSTEM SHALL answer the vacancy's title, description,
interview length, categories and interviewer name.

#### REQ-01-043 — the public link, while the vacancy is open

WHILE the vacancy's `status` is `open`, THE SYSTEM SHALL answer its public booking URL on the
entry page.

#### REQ-01-044 — a closed vacancy offers no link

IF the vacancy's `status` is `closed`, THEN THE SYSTEM SHALL omit the booking URL.

#### REQ-01-045 — a person's page

WHERE the entry is `member-joined` or `member-anniversary`, THE SYSTEM SHALL answer the member's
display name, job title, `joinedAt`, and the active projects the reader may already see them on.

#### REQ-01-046 — a project's page

WHERE the entry is `project-started`, THE SYSTEM SHALL answer the project name, its `createdAt`,
and the client under `REQ-01-035`'s condition.

#### REQ-01-047 — the roster on a project's page

WHERE the reader holds `manage-projects` or is a `ProjectMember` of the project, THE SYSTEM SHALL
answer the project's members on its entry page.

#### REQ-01-056 — and no roster where they may not

IF the reader holds neither, THEN THE SYSTEM SHALL omit the members from that entry page.

### The settings

#### REQ-01-048 — the switches an organization holds

THE SYSTEM SHALL hold one enabled flag per group — People, Hiring, Work — for each organization.

#### REQ-01-049 — an organization that has never been configured

IF no `OrganizationPortalSettings` row exists for the organization, THEN THE SYSTEM SHALL read
every group as enabled.

#### REQ-01-050 — who may change them

WHEN a member of this organization without `manage-portal-settings` requests
`PUT .../portal/settings`, THE SYSTEM SHALL answer `403` `PORTAL_MESSAGES.settingsForbidden`.
A caller who is not a member of this organization is refused by `REQ-01-004` before this rule is
reached.

`Decided:` the refusal is raised in the service, not by `CapabilityGuard`. The guard's message is
fixed at the generic forbidden string the documents area owns
(`packages/validation/src/documents.ts`), which reads "You do not have permission to manage
templates" — a sentence about templates on a portal screen. `ManageRequestTopics` is raised in its
own service for the same reason. `Rejected:`
rewording the shared export, which is a better product and a change to five other areas' refusals
and two shipped assertions; it is owed a document of its own, and this spec changes none of them.

#### REQ-01-051 — a write creates the row

WHEN an admin saves the switches and no settings row exists, THE SYSTEM SHALL create one in the
same transaction as the write.

#### REQ-01-052 — the control is drawn only for whoever holds it

THE SYSTEM SHALL draw the feed's settings control only for a caller holding
`manage-portal-settings`.

## Out of Scope

- **Announcements a person writes.** The whole point of `portal/02`; nothing here stores prose.
- **Reactions and comments.** `portal/03`. No control for either is drawn, because a control whose
  effect the screen will not show is a control that lies.
- **Which roles may publish.** It is `portal/02`'s setting and lands on `portal/02`'s screen.
- **Notifying anybody.** The feed is read, never delivered. No mail, no badge, no unread state.
- **Absences in the feed.** Approved vacations and public holidays are the personal half's
  business here and are deliberately not news — settled with the requester.
- **A client being added.** Not a feed entry, not a page, and no sentence — settled with the
  requester. `REQ-01-032` is where the kind was dropped.
- **A per-member mute.** The switches are the organization's, not a reader's.
- **`/` for a signed-in visitor.** The root still redirects to `/signup`; only the post-sign-in
  destination moves.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| The feed reads a 365-day window, so an organization's founding leaves it after a year | Every entry kind recurs; nothing in the first year is a record somebody must keep | A window control on the feed, or a `since` parameter |
| An anniversary is computed, so a membership restored by a later invitation counts from the new `joinedAt` | Restoration already resets the row the members list reads; two joining dates would be a second truth | A `firstJoinedAt` column, which is a members-area decision and not this one |
| A `user` sees `project-started` but can open no project screen from it | The entry page is the screen — that is why it exists | Nothing; it is the design |
| An entry cannot be linked to from outside the product | Every route here sits behind the session, as the whole app does | Nothing planned |
| The projection is not paged efficiently past the first few hundred entries | Five source tables, each indexed on `organizationId`, over one year | A materialised feed table, which this spec argues against |

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| 1 | Signing in through the login form arrives at the portal, not at the members list | TC-01-E2E-01 |
| 2 | A client contact signing in still arrives at their requests page | TC-01-INT-01 |
| 3 | The personal half states the caller's own month, split by project, and never a monetary amount | TC-01-INT-04 |
| 4 | A member whose membership states no country is answered only the holidays no country claims | TC-01-INT-07 |
| 5 | A `user` and an `admin` reading the same organization are answered the same entries; the only field that differs between their bodies is a `project-started`'s `clientName` | TC-01-INT-10, TC-01-INT-15 |
| 6 | Switching a group off removes exactly that group's entries and nothing else | TC-01-INT-13 |
| 7 | No feed entry ever names a candidate, an application or an assessment | TC-01-INT-14 |
| 8 | A `user` opens a vacancy's entry page and reads its description and its booking link, having been refused the vacancy itself | TC-01-E2E-04 |
| 9 | An entry page for a row the caller's feed would not contain answers 404, not 403 | TC-01-INT-16 |
| 10 | The home screen draws no settings control for a `manager` | TC-01-E2E-06 |
| 11 | Every message the home screen draws is drawn once | TC-01-E2E-07 |
| 12 | Nothing on the home screen changes width when a project name, a holiday name or a request title is long | TC-01-E2E-08 |
