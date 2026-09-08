# Portal Specifications

Functional specifications for the **portal** — the screen a signed-in member lands on, and what
the organization says to itself there. Each spec is self-contained with requirements, UI, API
contracts and test cases. Specs use YAML frontmatter (`tags`, `routes`, `api`, `entities`) for
discoverability — grep frontmatter to find relevant specs.

## Why this area exists

Signing in lands a member on the members list, which answers a question almost nobody was asking.
Everything a person actually opens the product for is one navigation away and spread over seven
screens: their hours are under Timesheets, their reserve is on their own member card, the holidays
that reach them are in Settings, and the requests waiting on them are in a third place with a badge
on the rail.

Meanwhile the organization has no voice. Somebody joins and nobody is told. A vacancy opens and the
engineer who knows the right person to recommend never hears about it — they cannot even open the
vacancy, because `canManageHiring` is admin and manager. Every one of those happenings is already a
row with a timestamp; none of them is ever read as news.

This area is both halves of that: **what is mine**, and **what the organization did**, on one
screen a person lands on.

## Spec Index

| # | Spec | Mockup | Tags |
|---|------|--------|------|
| 01 | [Home](01-home.md) · [contracts](01-home.contracts.md) · [cases](01-home.cases.md) | [mockup](01-home.mock.html) | portal, home, dashboard, feed, news, landing, projection, org-settings, anniversary, referral, visibility |
| 02 | Announcements *(not written)* | — | announcement, post, pinned, editor, publish-right |
| 03 | Reactions & comments *(not written)* | — | reaction, comment, thread, moderation |

**A chain, and it ships one link at a time.** 01 is the screen and the automatic feed: nothing
writes a news row, and the only migration is a settings table. 02 adds announcements a person
writes — the first prose the portal stores, an editor, a pin, and the setting that says which roles
may publish. 03 adds reactions and comments to every entry, automatic and written alike, which is
why 01 gives each entry a stable address and a page of its own rather than leaving it a line in a
list.

02 comes before 03 deliberately. Reactions on a feed nobody can post to is a product that reacts to
its own bookkeeping.

## Product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Feed storage | A read-time projection over `Membership`, `Vacancy` and `Project` | Every source already carries the moment it happened. A materialised table would need a write path in five areas, would start empty for organizations that have been running for a year, and would carry a `visibleTo` column that ages against the role it was computed from. |
| Absences as news | Not news | Settled with the requester. An approved vacation and a public holiday are the personal half's business — who is away is a schedule, not an announcement. |
| Which groups exist | People, Hiring, Work | The three the requester chose. The grain is a group and not a source table, so a switch means something to whoever flips it. |
| Hiring in the feed | A vacancy opening, and nothing else | A candidate's name, an interview and an assessment are confidential to hiring. The vacancy is the one hiring fact the whole company benefits from seeing. |
| Client entries | Not news at all | Settled with the requester. The kind was dropped rather than role-filtered: what a client's arrival changes that people act on is a project starting, and the feed already draws that. |
| Project entries | Shown to everybody; the client's name only where the reader may already see it | A project starting is company news; what is inside the project is not. |
| Entry pages | Every entry has one, in 01 | The source records are gated — a `user` is answered `403` by both vacancy reads and an empty list by the projects read — so a feed of links to them would be a feed of dead ends for the role that reads it most. |
| Money on the home screen | None, for any role | A `user` reading their own membership is already answered days and a null balance. Drawing money would make one screen two. |
| Where signing in lands | The portal | A portal nobody lands on is one more screen nobody opens. |
| Who may publish an announcement | An organization setting listing the roles that may, with `admin` always among them and unable to remove itself. **Decided before 02 was written, and recorded here rather than in a spec** — 02 is not written yet, and a rule stated against code that does not exist is what ADR-0010 warns about | The requester asked for a right that can be granted to another role — HR, a team lead — and `ROLE_CAPABILITIES` is a compile-time constant with no per-organization override. One setting on the portal's own screen gives exactly that without inventing a permissions system for the whole product. |

## Blast Radius

| What breaks | Why | Mitigation |
|---|---|---|
| **The post-sign-in destination moves.** `signIn` in `e2e/tests/helpers.ts` waits for `**/members`, and 27 further spec files wait for it themselves — 33 lines in all | `REQ-01-001` sends a staff principal to `/org/{orgId}` instead | Change `signIn` once and the 33 waits to the portal path. The change is mechanical and enumerable; `grep -rn "waitForURL('\*\*/members'" e2e/tests` is the whole list. A test that genuinely means to be on the members list navigates there. |
| **`authentication.spec.ts` asserts the landing as behaviour**, not as a wait | It is that spec's subject, not its scaffolding | That assertion is amended, not deleted: the login spec keeps a case saying where sign-in lands, and the destination in it changes. |
| **The sidebar gains a row above every existing one** | `REQ-01-003` puts `Team overview` first | `app-shell.spec.ts` asserts the rail's contents. The row is additive; no existing row moves out of the rail, but any case asserting the first row's identity is amended. |
| **`ROLE_CAPABILITIES` gains two members** | `ViewPortalHome` and `ManagePortalSettings` | The map is `Record<NormalizedRole, readonly Capability[]>` typed against the union, so adding a member forces every role's list to be revisited at compile time — the check is the type system, not a review. |
| **`PORTAL_MESSAGES.noProject` names a string the reports service writes inline** | The same words now exist as an export and as a literal | This spec changes no report. The duplication is recorded here so the next person to touch either finds the other. |
| **A new table in the schema** | `OrganizationPortalSettings` | Additive; see below. |
| **A new test-support route** | `POST /api/test/membership/backdate-joined` | Behind `assertFixturesOpen` and the production check, exactly as `POST /api/test/financials/backdate` is. It reaches no product code path. |
| **Nothing in the documents, hiring, requests, reports or time-off areas changes** | The feed reads their tables and writes nothing to them | No migration touches them; no service of theirs is edited. A change to what they store changes what the feed says, which is the point. |

## Backward Compatibility

| Guarantee | Mechanism |
|---|---|
| Every existing route answers exactly what it answered | This area adds routes under `/portal` and edits none. |
| Every existing screen renders exactly as it did | The only edits outside `/portal` are the sidebar's new row and the login form's destination string. |
| A deployment can roll the code back without rolling the database back | The migration is **additive**: one new table, no column added to an existing one, no rename, no drop, no new `NOT NULL`. Old code ignores a table it does not know about. |
| An organization that existed before this shipped needs no backfill | `REQ-01-049` reads a missing `OrganizationPortalSettings` row as all three groups enabled, so the migration writes no rows and signup is not amended. |
| An organization that existed before this shipped has a feed immediately | The projection reads history that is already there — a year of joinings, vacancies and projects — rather than starting from the deploy. |
| A membership whose stored role is the legacy `member` reads the portal | Every check runs through `normalizeRole`, which maps `member` to `user`; `ViewPortalHome` is held by all four normalized roles. |
| A client contact's experience is unchanged | `REQ-01-002` keeps their landing, and `REQ-01-004` refuses them every route here with the same `404` every other organization route already answers them. |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Every portal query scopes by `session.organizationId`, never the path `orgId` | 01 | — |
| Every route answers `404` — never `403` — to a client principal and to a wrong `orgId`, the settings pair included. `403` is answered to one caller only: a member of this organization who lacks the capability | 01 | — |
| An entry is addressed `{kind}:{sourceId}`, computed and never stored | 01 | 02, 03 |
| The feed writes nothing, ever | 01 | — |
| No portal response carries a monetary value | 01 | — |

## Related Areas

[`specs/user-management/`](../user-management/README.md) — owns `Membership` and its `joinedAt`,
the `Project` and `ProjectMember` rows the Work group reads, the `TimeEntry` rows the month is
summed from, and the reserve the days come from. **This area supersedes nothing there**; it reads
those tables and writes to none of them. Spec 02's login screen keeps its own rules and changes
only the destination it navigates to, which is `REQ-01-001` here.

[`specs/hiring/`](../hiring/README.md) — owns `Vacancy`, its `publicSlug` and its `description`.
The Hiring group draws a vacancy's opening and nothing else, and `REQ-01-033` states that as a
prohibition rather than as an omission.

[`specs/requests/`](../requests/README.md) — owns the `Request` lifecycle the personal half lists.
The portal reads `scope=mine` and never writes.

[`specs/organization/`](../organization/README.md) — owns `Client` and `Holiday`.

[`specs/time-off/`](../time-off/README.md) — owns `Holiday` and the reserve the personal half
reads. The country a holiday reaches somebody by is **not** that area's older chain: `PATCH-012`
removed the organization fallback from the product, and a member's own membership is the whole
resolution. `REQ-01-018` and `REQ-01-019` state it in full rather than pointing at it.
