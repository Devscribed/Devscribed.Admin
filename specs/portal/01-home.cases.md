# Home — verification and cases

Rules live in [01-home.md](01-home.md); routes, messages and testids in
[01-home.contracts.md](01-home.contracts.md).

## Behaviour Walkthrough

| Decision | What was decided | Decided by | Where it lives |
|---|---|---|---|
| Whether this ships as one document or several | A chain of three: home and the automatic feed first, announcements second, reactions and comments third | human | README.md §Spec Index |
| Where a member arrives after signing in | The portal, replacing the members list | human | REQ-01-001 |
| Which happenings the organization treats as news | People, Hiring and Work. **Absences are not news** — approved vacations and public holidays belong to the personal half and are deliberately absent from the feed | human | REQ-01-027 – REQ-01-032, Out of Scope |
| Whether an organization can choose which of those it shows | Yes, three switches an admin owns | human | REQ-01-048, REQ-01-050 |
| What the personal half contains | Hours this month, the vacation reserve with the holidays ahead, and the requests on the caller. **Tasks and documents-awaiting-signature were considered and left out**, because neither read exists and both would be new surface in the first link | human | REQ-01-011 – REQ-01-021, Out of Scope |
| Whether a feed entry opens onto anything | Every entry has a page of its own, in this spec rather than the next | human | REQ-01-038 |
| Whether the feed is stored or derived | Derived. Nothing writes a news row; five areas gain no write path and an organization with history has a feed on the first render | agent | REQ-01-022 |
| Whether a `user` sees that a project started | Yes. A project starting is company news; what is inside the project is not. **This settles a contradiction the mock and the settings copy carried**: the switch was described as showing Work only to members who can already see projects, while the mock drew a project's page for a member who cannot. The rule now is one sentence — the entry is everyone's, the client's name is not | agent | REQ-01-034, REQ-01-035 |
| Whether a client being added is news at all | No. The kind is not derived, has no page and no sentence. **The earlier question — whether a `user` sees such an entry — was a question about a member of a set whose membership had not been agreed** | human | REQ-01-032, Out of Scope |
| What a client contact is answered on the settings pair | `404`, as on every other route here. `OrgScopeGuard` refuses a client principal before a capability is read, so `403` was never reachable for them; `403` is answered to a member of this organization who lacks the capability, and to nobody else | human | REQ-01-004, REQ-01-050 |
| Which country the holidays block resolves | The country stated on the caller's own membership, and nothing else. A member who states none is answered the global holidays only — the same answer the calendar and Amounts Owed give them, because `PATCH-012` removed the organization fallback from the product | human | REQ-01-018, REQ-01-019 |
| Whether a reader is told a group is switched off | No. Somebody who cannot change the setting learns only that something is missing; the admin who can reads it on the settings screen | agent | REQ-01-037, REQ-01-052 |
| What the reserve block states | Days, never money — the shape a `user` is already answered for their own membership | agent | REQ-01-015 |
| What an empty month draws | The sentence alone. Zero figures beside "No time tracked yet this month" is one message twice | agent | Screens, mock state 2 |
| What a membership with no financials draws | The reserve figures are absent — a reserve nobody configured is not a zero reserve — and **the holidays below them are drawn all the same**. A public holiday says where somebody works, not what they are owed, and gating it on a financials row would hide the holidays ahead from every admin straight out of signup | human | REQ-01-016, REQ-01-017, Screens |
| How far back the feed reaches | 365 days | agent | REQ-01-026, Known Gaps |
| Which status refuses an entry the caller may not see | `404`, identical to a malformed id and a vanished row, because an entry id encodes a source row | agent | REQ-01-040, REQ-01-041 |
| What a settings save does when two admins save at once | Last write wins on a single-row upsert. The two do not race in ordinary use — one row, edited by whoever administers the organization | agent | Edge case 18 |
| What heads an entry's page | The sentence the feed drew for it | agent | REQ-01-039 |

## Verification Plan

Walked before these cases were written. Every cell is what happened.

### Bringing it up

| Step | Command | Observed |
|---|---|---|
| Database | `docker compose ps` | `devscribed-postgres`, `postgres:17-alpine`, healthy |
| The pair, on the run's own ports | `E2E_WEB_PORT=… E2E_API_PORT=… CI=1 npx playwright test tests/<probe> --workers=1 --reporter=list` from `e2e/` | Playwright started both servers, migrated the E2E database through `global-setup.ts`, and the probe passed. Three runs: `1.2m`, `14.4s`, `13.9s` |

### Reaching the states the cases need

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| An organization and an admin | `registerOrganization` (`e2e/tests/helpers.ts`) | yes | `201` |
| A member who joined (the People group's source) | `inviteAndAcceptViaApi` | yes | `joinedAt` is on the member list row **and** the member detail — the feed needs no new read for it |
| A project (the Work group's source) | `createProjectViaApi` | yes | `201`; `createdAt` on the list row |
| A client (the Work group's second source) | `POST .../clients` | yes | not run — the clients suite creates them; the shape was read, not exercised |
| A vacancy (the Hiring group's source) | `createVacancy` | yes | `201`; `description`, `publicSlug`, `durationMinutes` and `interviewer` all on the list row |
| A vacancy that a `user` is refused | `GET .../hiring/vacancies` and `…/{id}` as a `user` | yes | **`403` on both** — the premise the entry page exists for |
| A project a `user` is not assigned to | `GET .../projects` as that `user` | yes | **`200` with `{"projects": []}`**; `GET .../projects/{id}` does not exist as a route at all (`404 Cannot GET`) |
| Hours split by project for one month | `GET .../reports/time-and-activity/my?sumDateRanges=true` | yes | `200`, one group, one row per project, `time` a decimal-hour string (`"3.00"`) |
| A reserve a member reads themselves | `configureFinancials` then `seedReserveCredit`, then `GET .../members/{id}/vacation` as the member | yes | `200`, `balance.availableDays: 6`, `reserveBalance: null`. **Without `configureFinancials` the whole `balance` block is `null`** — which is `REQ-01-016`'s case, reached by omission |
| Holidays a member can read | `GET .../holidays?scope=mine` | yes | `200`, filtered to the member's country. **Without `scope`, a `user` is answered `404`** — `view-holidays` is admin and manager |
| A request on the caller | `POST .../requests` with `assigneeKind: 'member'` and `assigneeMembershipId` | yes | `201`. The two fields are both required; either alone is `400 validation_error` |
| The caller's own open requests | `GET .../requests?scope=mine` | yes | `200`, and `counts.waitingOnMe` is already computed. **`scope=my` is `400 unknown_value`** — the value is `mine` |
| A membership that joined a year ago (an anniversary) | `POST /api/test/membership/backdate-joined` | **no** | `404`. This spec owes the fixture — contracts §Routes |
| A vacancy that has been closed | `PATCH .../hiring/vacancies/{id}` | yes | not run — the hiring suite exercises it; needed only by TC-01-INT-17 |

### Access this needs

| What | Name | Where the value lives | How the next agent gets it | Proven against |
|---|---|---|---|---|
| None | — | — | Every route in this spec is this repository's own, behind the session cookie | The probe ran with no credential beyond a signed-up account |

### Rehearsal

One throwaway Playwright spec at `e2e/tests/zz-probe-portal.spec.ts`, run three times as above,
**deleted after the last run**. It asserted nothing about the product; it walked the route to each
state in the table and printed what came back. What it found, and what changed because of it:

- `GET .../holidays` with no `scope` answers a `user` `404`. The personal half reads `?scope=mine`.
- `GET .../requests?scope=my` is `400`; the value is `mine`.
- `POST .../requests` needs `assigneeKind` beside `assigneeMembershipId`.
- `GET .../members/{id}/vacation` answers `balance: null` until `MemberFinancials` exists, which is
  the state `REQ-01-016` describes.
- A `user` is answered `403` by both hiring vacancy reads, and an empty project list — so the
  entry page is the only screen either fact can reach them through.
- There is no `GET .../projects/{id}` route at all.
- `POST /api/test/membership/backdate-joined` does not exist.

## Test Cases

### TC-01-UNIT-01

- **Level:** Unit
- **Covers:** REQ-01-023
- **Steps:** For each kind, compose an id from a source id (and, for an anniversary, a year) and
  parse it back. Then parse `""`, `"member-joined"`, `"nope:abc"`, `"member-anniversary:abc"` and
  `"member-anniversary:abc:zero"`.
- **Expected Result:** Every round trip returns the kind and source id it was given. Every one of
  the five malformed inputs returns `null`; none throws.

### TC-01-UNIT-02

- **Level:** Unit
- **Covers:** REQ-01-025
- **Steps:** Compose a cursor from an instant and an entry id; parse it. Then parse a cursor whose
  timestamp half is not ISO-8601, one with no separator, and one whose id half is malformed.
- **Expected Result:** The round trip returns the same instant and id. All three malformed inputs
  return `null`.

### TC-01-UNIT-03

- **Level:** Unit
- **Covers:** REQ-01-048
- **Steps:** Validate `{people: true, hiring: false, work: true}`; then a body missing `work`; then
  one whose `hiring` is the string `"false"`; then an empty object.
- **Expected Result:** The first is valid. The other three are invalid and carry
  `PORTAL_MESSAGES.groupsInvalid`.

### TC-01-UNIT-04

- **Level:** Unit
- **Covers:** REQ-01-025
- **Steps:** Validate `1`, `20`, `50`, `0`, `51`, `"20"` and `undefined`.
- **Expected Result:** `1`, `20`, `50` are valid; `undefined` defaults to `20`; `0`, `51` and the
  string carry `PORTAL_MESSAGES.limitInvalid`.

### TC-01-UNIT-05

- **Level:** Unit
- **Covers:** REQ-01-029
- **Steps:** For a joining date of 29 February in a leap year, ask for the anniversary dates in
  the two following years and in the next leap year. For a joining date, ask that year zero is
  never produced.
- **Expected Result:** A non-leap year's anniversary is 1 March; the leap year's is 29 February.
  The lowest year produced is 1.

### TC-01-UNIT-06

- **Level:** Unit
- **Covers:** REQ-01-004, REQ-01-050
- **Steps:** Ask `hasCapability` for both capabilities against `admin`, `manager`, `user`,
  `viewer` and the legacy `member`.
- **Expected Result:** `ViewPortalHome` is true for all five (`member` normalizing to `user`).
  `ManagePortalSettings` is true for `admin` alone.

### TC-01-INT-01

- **Level:** Integration
- **Covers:** REQ-01-002, REQ-01-004
- **Asserts:** `GET /api/organizations/{orgId}/portal/home` → 404;
  `GET /api/organizations/{orgId}/portal/news` → 404;
  `GET /api/organizations/{orgId}/portal/news/{entryId}` → 404;
  `GET /api/organizations/{orgId}/portal/settings` → 404;
  `PUT /api/organizations/{orgId}/portal/settings` → 404
- **Steps:** Sign in as a client contact of an organization and call all five routes.
- **Expected Result:** Every route answers `404` with no body naming the portal, the settings pair
  included — `OrgScopeGuard` refuses a client principal before any capability is read, so nothing
  here answers `403` to a caller who is not a member.

### TC-01-INT-02

- **Level:** Integration
- **Covers:** REQ-01-022, REQ-01-054
- **Asserts:** `GET /api/organizations/{orgId}/portal/home` → 200;
  `GET /api/organizations/{orgId}/portal/news` → 200
- **Steps:** For each of `admin`, `manager`, `user`, `viewer`, and for a membership whose stored
  role is the legacy `member`, call both routes.
- **Expected Result:** `200` for all five. No `news` read writes a row: the count of rows in every
  source table is unchanged after all ten calls.

### TC-01-INT-03

- **Level:** Integration
- **Covers:** REQ-01-010
- **Asserts:** `GET /api/organizations/{orgId}/portal/home` → 200
- **Steps:** Set one member's `Account.timezone` to a zone whose local date is a day ahead of UTC
  at the instant of the call, and leave a second member's unset. Call the route as each.
- **Expected Result:** The two `month.today` values differ by one day, and each `month.startDate`
  is the first of the month containing its own `today`. The member with no zone reports
  `timezone: "UTC"`.

### TC-01-INT-04

- **Level:** Integration
- **Covers:** REQ-01-011, REQ-01-012, REQ-01-013, REQ-01-014, REQ-01-015, REQ-01-053
- **Asserts:** `GET /api/organizations/{orgId}/portal/home` → 200
- **Steps:** As one member, create three time entries inside the run's current month — two against
  one project on two different dates, one against no project — and one entry in the month before.
  Call the route.
- **Expected Result:** `month.totalMinutes` is the sum of the three in-month entries alone.
  `month.daysWithEntry` is 3. `month.byProject` has two rows, the project first by minutes, the
  second named `PORTAL_MESSAGES.noProject` with `projectId: null`. **The serialised body contains
  no key or value from `MemberFinancials`** — asserted by scanning the JSON for `reserveBalance`,
  `monthlySalary` and `clientHourlyRate`, all absent.

### TC-01-INT-05

- **Level:** Integration
- **Covers:** REQ-01-016
- **Asserts:** `GET /api/organizations/{orgId}/portal/home` → 200
- **Steps:** Call the route as a member with no `MemberFinancials` row, then configure financials
  and seed a reserve credit, then call it again.
- **Expected Result:** `timeOff` is `null` in the first body and `holidays` is an object in it all
  the same — the reserve being absent withholds nothing from the holidays. In the second `timeOff`
  is an object with `availableDays` and no monetary key.

### TC-01-INT-06

- **Level:** Integration
- **Covers:** REQ-01-017
- **Asserts:** `GET /api/organizations/{orgId}/portal/home` → 200
- **Steps:** Seed five holidays with no country: one before the run's today and four after it.
  Call the route.
- **Expected Result:** `holidays.upcoming` has three rows, the three earliest on or after today,
  in ascending date order. The past one is absent.

### TC-01-INT-07

- **Level:** Integration
- **Covers:** REQ-01-018, REQ-01-019
- **Asserts:** `GET /api/organizations/{orgId}/portal/home` → 200
- **Steps:** Seed three future holidays — one with no country, one for country A, one for country
  B. Call as a member whose membership states A; then clear the membership's country, set the
  organization's to B, and call again.
- **Expected Result:** First: the null-country holiday and A's. Second: the null-country holiday
  alone, and `holidays.countryCode` is `null` — the organization's B is not inherited, so the
  second call answers what the time-off calendar answers the same member.

### TC-01-INT-08

- **Level:** Integration
- **Covers:** REQ-01-020, REQ-01-021
- **Asserts:** `GET /api/organizations/{orgId}/portal/home` → 200
- **Steps:** Raise five open requests involving the caller — one overdue, two with a `neededBy`
  inside the run's next fortnight, two with none — and one open request between two other members.
  Call the route.
- **Expected Result:** `requests.items` has three rows: the overdue one first, then the two by
  ascending `neededBy`. `requests.openTotal` is 5. The request between two other members appears
  in neither.

### TC-01-INT-09

- **Level:** Integration
- **Covers:** REQ-01-027, REQ-01-028, REQ-01-029
- **Asserts:** `GET /api/organizations/{orgId}/portal/news` → 200
- **Steps:** Invite and accept two members; remove one. Backdate the remaining one's `joinedAt` by
  two years and a day through the fixture. Call the route.
- **Expected Result:** One `member-joined` entry for the remaining member, at its backdated
  moment, and two `member-anniversary` entries for it with `detail.years` 1 and 2. The removed
  member appears in no entry of any kind.

### TC-01-INT-10

- **Level:** Integration
- **Covers:** REQ-01-034
- **Asserts:** `GET /api/organizations/{orgId}/portal/news` → 200
- **Steps:** Seed one member, one vacancy, one project and one client. Call the route as each of
  `admin`, `manager`, `user` and `viewer`.
- **Expected Result:** The four bodies carry an identical set of entries — the seeded member's
  joining, each caller's own joining, the vacancy and the project — and every entry is identical
  field for field between them, except a `project-started`'s `clientName` (`TC-01-INT-15`). The
  client draws no entry for anybody (`REQ-01-032`); the count is not asserted, the equality is.

### TC-01-INT-11

- **Level:** Integration
- **Covers:** REQ-01-024, REQ-01-025
- **Asserts:** `GET /api/organizations/{orgId}/portal/news` → 200;
  `GET /api/organizations/{orgId}/portal/news` → 422 PORTAL_MESSAGES.cursorInvalid;
  `GET /api/organizations/{orgId}/portal/news` → 422 PORTAL_MESSAGES.limitInvalid
- **Steps:** Switch People and Hiring off, so `project-started` is the only kind the feed derives.
  Seed five projects in one call sequence. Read with `limit=2`, then follow `nextCursor` until a
  body carries none. Then read with a cursor of `"not-a-cursor"`, and with `limit=51`.
- **Expected Result:** The pages carry 2, 2 and 1 entries, in descending moment order, with no
  entry repeated and none missed; the last body has no `nextCursor`. The bad cursor and the bad
  limit answer `422` with their own messages.

### TC-01-INT-12

- **Level:** Integration
- **Covers:** REQ-01-026
- **Asserts:** `GET /api/organizations/{orgId}/portal/news` → 200
- **Steps:** Backdate one membership's `joinedAt` to 366 days before the run's today and another's
  to 364 days before it. Call the route.
- **Expected Result:** The 364-day membership's `member-joined` entry is present. The 366-day one's
  is absent, and its first anniversary — which falls two days ago and is inside the window — is
  present.

### TC-01-INT-13

- **Level:** Integration
- **Covers:** REQ-01-036, REQ-01-048, REQ-01-049, REQ-01-050, REQ-01-051
- **Asserts:** `GET /api/organizations/{orgId}/portal/settings` → 200;
  `PUT /api/organizations/{orgId}/portal/settings` → 200;
  `PUT /api/organizations/{orgId}/portal/settings` → 403 TEMPLATE_MESSAGES.generic.forbidden;
  `PUT /api/organizations/{orgId}/portal/settings` → 422 PORTAL_MESSAGES.groupsInvalid;
  `GET /api/organizations/{orgId}/portal/news` → 200
- **Steps:** Seed one member, one vacancy and one project. Read the settings before anything was
  ever saved. As an admin, save `work: false` and read the feed. Then save `hiring: false` too and
  read again. Then attempt the save as a manager, and attempt it as an admin with `work` omitted.
- **Expected Result:** The first read answers all three `true` with no row in the table. After the
  first save a row exists and the feed has the member and vacancy entries and not the project's.
  After the second only the member's remains. The manager is `403`; the partial body is `422`.

### TC-01-INT-14

- **Level:** Integration
- **Covers:** REQ-01-030, REQ-01-033
- **Asserts:** `GET /api/organizations/{orgId}/portal/news` → 200
- **Steps:** Seed a vacancy, book an interview on it through the public endpoint, assess one
  criterion on the resulting application, and close the vacancy. Call the route as an admin.
- **Expected Result:** Exactly one `vacancy-opened` entry, at the vacancy's `createdAt`, and no
  entry of any kind but `member-joined` beside it — every membership the run created draws one of
  those, the admin's own included, and People is not switched off. No entry names the candidate,
  the application, the schedule event or the assessment; asserted by scanning the body for the
  candidate's email and name, both absent.

### TC-01-INT-15

- **Level:** Integration
- **Covers:** REQ-01-031, REQ-01-032, REQ-01-035, REQ-01-055
- **Asserts:** `GET /api/organizations/{orgId}/portal/news` → 200
- **Steps:** Create a client, a project linked to it, and a second project with no client. Archive
  the second. Assign one `user` to the first project and leave a second `user` unassigned. Call as
  an admin, as the assigned `user`, and as the unassigned one.
- **Expected Result:** All three are answered both `project-started` entries, the archived one
  included. The admin and the assigned `user` read the client's name on the first;
  the unassigned `user` reads `clientName: null` on both, so the two are indistinguishable in
  their body.

### TC-01-INT-16

- **Level:** Integration
- **Covers:** REQ-01-040, REQ-01-041
- **Asserts:** `GET /api/organizations/{orgId}/portal/news/{entryId}` → 404;
  `GET /api/organizations/{orgId}/portal/news/{entryId}` → 200
- **Steps:** As a `user`, open a `project-started` id belonging to another organization. Then open
  `"garbage"`, a `client-added:{id}` — a kind this spec derives nothing for — and a
  `project-started` id whose project has since been hard-deleted. Then open a `project-started` id
  from their own feed.
- **Expected Result:** The first four answer `404` with identical bodies. The fifth answers `200`.

### TC-01-INT-17

- **Level:** Integration
- **Covers:** REQ-01-038, REQ-01-042, REQ-01-043, REQ-01-044
- **Asserts:** `GET /api/organizations/{orgId}/portal/news/{entryId}` → 200
- **Steps:** Create a vacancy with a description, a duration and two categories. Open its entry as
  a `user`. Close the vacancy and open it again.
- **Expected Result:** Both bodies carry the title, the description as `body`, both categories, the
  interviewer's name and the interview length. The first carries a `shareUrl` ending in the
  vacancy's `publicSlug`; the second carries `shareUrl: null` and is otherwise identical.

### TC-01-INT-18

- **Level:** Integration
- **Covers:** REQ-01-039, REQ-01-045, REQ-01-046, REQ-01-047, REQ-01-056
- **Asserts:** `GET /api/organizations/{orgId}/portal/news/{entryId}` → 200
- **Steps:** Open a `member-joined` entry as a `user`. Then open a `project-started` entry as a
  `user` assigned to that project, and as one who is not.
- **Expected Result:** The member entry carries the name, the job title, the joining date and a
  `link` to that member's card. The assigned reader's project body carries the roster; the
  unassigned reader's carries no roster, no client and `link: null`. Every body's `subject.name`
  is the same string the feed's own entry carried.

### TC-01-E2E-01

- **Level:** E2E
- **Covers:** REQ-01-001, REQ-01-003
- **Steps:** Sign up an organization, sign out, and sign in through `/login`.
- **Expected Result:** The URL is `/org/{orgId}` and `portal-greeting` is visible. `nav-portal` is
  present and is the first row of the rail. Navigating to `/login?next=/org/{orgId}/members` and
  signing in arrives at the members list instead.
- **Selectors:** `portal-greeting`, `nav-portal`

### TC-01-E2E-02

- **Level:** E2E
- **Covers:** REQ-01-012, REQ-01-017, REQ-01-020
- **Steps:** Seed two projects with time in the run's current month, a configured reserve, a
  member country and two future holidays for it, and two open requests on the member. Sign in and
  land on the portal.
- **Expected Result:** `portal-month-total` reads the summed time; `portal-month-project-row` has
  a count of 2; `portal-timeoff-available` is visible; `portal-holiday-row` has a count of 2;
  `portal-request-row` has a count of 2.
- **Selectors:** `portal-month-total`, `portal-month-days`, `portal-month-project-row`,
  `portal-timeoff-available`, `portal-holiday-row`, `portal-request-row`

### TC-01-E2E-03

- **Level:** E2E
- **Covers:** REQ-01-016, REQ-01-019
- **Steps:** Sign in as a member of an organization created in this run with no time entries, no
  financials, no country and no requests, and whose feed has only their own joining.
- **Expected Result:** `portal-month-empty` is visible and `portal-month-total` is absent —
  the figures are not drawn beside the sentence. `portal-timeoff-figures` is absent in full, and
  `portal-timeoff-panel` stands — the holidays are not gated on a reserve. `portal-holidays-no-country`
  is visible. `portal-requests-empty` is visible. `portal-feed-entry` has a count of 1 and
  `portal-feed-empty` is absent.
- **Selectors:** `portal-month-empty`, `portal-month-total` (absent), `portal-timeoff-figures`
  (absent), `portal-timeoff-panel`, `portal-holidays-no-country`, `portal-requests-empty`,
  `portal-feed-entry`, `portal-feed-empty` (absent)

### TC-01-E2E-04

- **Level:** E2E
- **Covers:** REQ-01-039, REQ-01-042, REQ-01-043
- **Steps:** As an admin, create a vacancy with a description. Sign in as a `user`, land on the
  portal, and open the vacancy's feed entry.
- **Expected Result:** `portal-entry-title` carries the same sentence the entry carried in the
  feed. `portal-entry-body` shows the description. `portal-entry-share` shows a URL ending in the
  vacancy's `publicSlug`. Navigating directly to the vacancy's own screen answers the app's
  not-found, so this page is the only one that reached them.
- **Selectors:** `portal-feed-entry`, `portal-entry-title`, `portal-entry-body`,
  `portal-entry-share`, `portal-entry-fact`, `portal-entry-back`

### TC-01-E2E-05

- **Level:** E2E
- **Covers:** REQ-01-025
- **Steps:** Seed enough projects that the feed's first page is full. Land on the portal, note the
  first entry's text, and press `portal-feed-more`.
- **Expected Result:** The count of `portal-feed-entry` grows, the first entry's text is unchanged
  and still first, and `portal-feed-more` disappears when the last page arrives.
- **Selectors:** `portal-feed-entry`, `portal-feed-more`

### TC-01-E2E-06

- **Level:** E2E
- **Covers:** REQ-01-052
- **Steps:** Land on the portal as an `admin`, then as a `manager`, then as a `user`.
- **Expected Result:** `portal-feed-settings-link` is present for the admin and absent for the
  other two. The `What's new` heading occupies the same left edge in all three, measured from its
  bounding box.
- **Selectors:** `portal-feed-settings-link`

### TC-01-E2E-07

- **Level:** E2E
- **Covers:** REQ-01-037
- **Steps:** Switch all three groups off as an admin — People included, or the joinings the run
  itself created keep the feed non-empty. Sign in as a `user` whose month, reserve, holidays and
  requests are all empty, and land on the portal.
- **Expected Result:** Each of `PORTAL_MESSAGES.monthEmpty`, `requestsEmpty`, `noCountry` and
  `feedEmptyBody` is matched **exactly once** on the page, asserted by count and not by id. No
  text on the page names Hiring or Work.
- **Selectors:** `portal-month-empty`, `portal-requests-empty`, `portal-holidays-no-country`,
  `portal-feed-empty`

### TC-01-E2E-08

- **Level:** E2E
- **Covers:** REQ-01-012, REQ-01-020
- **Steps:** Seed a project whose name is 100 characters, a holiday whose name is 80, and a
  request whose title is 200. Land on the portal and record the bounding boxes of the minutes
  cell of the first `portal-month-project-row`, the first `portal-holiday-row`'s trailing text,
  and the first `portal-request-row`'s title. Then seed short-named equivalents in a second
  organization and record the same three.
- **Expected Result:** In both organizations the request title's left edge is identical across
  every row; the minutes cells share a right edge across every row; the page's
  `scrollWidth` does not exceed its `clientWidth`. Uses the probes in
  `e2e/tests/ui-invariants.ts`.
- **Selectors:** `portal-month-project-row`, `portal-holiday-row`, `portal-request-row`

### TC-01-E2E-09

- **Level:** E2E
- **Covers:** REQ-01-036, REQ-01-052
- **Steps:** Seed a member, a vacancy and a project. Sign in as an admin, land on the portal, and
  follow `portal-feed-settings-link`. Turn the Work switch off and save. Return to the portal.
- **Expected Result:** The settings screen draws all three switches on. After the save and the
  return, `portal-feed-entry`'s count has dropped by exactly one and no entry names the project.
  Reloading the settings screen draws Work off.
- **Selectors:** `portal-feed-settings-link`, `portal-settings-group-people`,
  `portal-settings-group-hiring`, `portal-settings-group-work`, `portal-settings-save`,
  `portal-feed-entry`
