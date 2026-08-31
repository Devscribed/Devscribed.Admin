# Devscribed.Admin

Implementation of the specs in [`specs/`](specs/). User-management specs 01
([Organization Creation](specs/user-management/01-organization-creation.md)) and 02
([Authentication & Login](specs/user-management/02-authentication-login.md)) are complete.
The [hiring specs](specs/hiring/README.md) run from a vacancy through a booking to the card the
team takes notes on during the interview, the board, the candidate database, the two libraries,
and the page a candidate manages their own booking from. See [Hiring](#hiring) for the capability
boundaries and the rules that are easy to mistake for omissions.

## Stack

| Layer | Choice |
|---|---|
| API | NestJS 11, Prisma, PostgreSQL (Docker locally, Neon in production) |
| Web | Next.js 15 (App Router), React 19 |
| UI | Teammerly Original DS (`1_DS for dev/`), imported through `@ds` — no hardcoded colors or sizes |
| Unit tests | Vitest |
| Integration tests | Jest + Supertest against a disposable Postgres database |
| E2E | Playwright |

## Layout

```
packages/validation/  every rule and error message — one source shared by web and API
apps/api/             NestJS: POST /api/signup, /api/login, /api/logout,
                      GET /api/me, GET /api/organizations/{orgId}/members,
                      …/hiring/vacancies, …/hiring/interviewers,
                      …/hiring/candidates/{id}, …/hiring/applications/{id},
                      …/hiring/applications/{id}/cv, and the two public surfaces
                      /api/book/{slug} and /api/manage/{slug}/{token}
apps/web/             Next.js: /signup, /login, /org/{orgId}/members,
                      /org/{orgId}/hiring/vacancies,
                      /org/{orgId}/hiring/candidates/{id}, and the public /book/{slug}
                      and /manage/{slug}/{token}
e2e/                  Playwright specs, one per TC-*-E2E-* case
```

`packages/validation` exists so the client and the server can never disagree about a
message. The API re-runs it on every request — the client's copy is a convenience, not a gate.

## Setup from scratch

### Prerequisites

| | Version | Why |
|---|---|---|
| Node.js | 22.x | the version CI and Vercel run; the repo uses npm workspaces |
| Docker | any recent | supplies Postgres 17 — nothing is installed on the host |

Nothing else is needed globally: the Prisma CLI, Nest CLI and Playwright all come from
`node_modules`.

### 1. Install dependencies

```bash
npm install
```

Run it from the repository root, not from inside `apps/api` — one install covers every
workspace. It ends by running `prisma generate` (the API's `postinstall`), which writes
the typed client into `node_modules/.prisma`. If your editor reports unknown Prisma
types later, this is the step to repeat.

### 2. Create the API's environment file

```bash
cp apps/api/.env.example apps/api/.env
```

The defaults already match the Docker database below, so nothing needs editing. `.env`
is deliberately untracked, which means every machine — and every fresh clone — needs
this step. `SESSION_SECRET` there is a development placeholder; every deployed
environment must override it.

`STORAGE_PROVIDER=fs` keeps uploaded CVs in `apps/api/.storage`, which is git-ignored.
That combination is refused outright when `NODE_ENV=production`, and so is a production
process with no Microsoft Graph credentials — see [Hiring](#hiring). Leaving the `GRAPH_*`
variables empty locally is expected: the fake calendar takes over.

### 3. Start Postgres

```bash
docker compose up -d
```

This brings up `postgres:17-alpine` as the container `devscribed-postgres` and creates
two databases on it:

| Database | Used by |
|---|---|
| `devscribed_dev` | the dev server — data survives restarts |
| `devscribed_test` | the integration suite — wiped at the start of every run |

They are separate so that a test run does not delete whatever you were looking at in
development.

The container listens on **5433**, not the usual 5432, so it cannot collide with a
Postgres you already have running. It restarts with Docker, so this is a one-time step.
Check on it with:

```bash
docker compose ps
```

Wait for the status to read `healthy` before continuing — an immediate `migrate` against
a still-initialising server fails with a connection error.

The same command also brings up **pgAdmin** on <http://localhost:5050> if you want to
browse the data. It opens straight into the UI with no login, and the local server is
already registered as *Devscribed (local)* — the first connect asks for the password,
which is `devscribed`. Nothing else depends on it, so it is safe to ignore or to stop on
its own with `docker compose stop pgadmin`.

### 4. Build the shared validation package

```bash
npm run build --workspace @devscribed/validation
```

`packages/validation` is consumed as compiled output by both the API and the web app.
The API's `prebuild` does this automatically, but the dev server does not, so a fresh
clone needs it once.

### 5. Apply the database schema

```bash
npm run db:migrate --workspace @devscribed/api
```

Runs `prisma migrate deploy` against `devscribed_dev` — the same command CI runs against
Neon, so local and production schemas come from one source. `npm run dev` repeats it
automatically on every start, so you will rarely type it again.

### 6. Install the Playwright browsers

```bash
npx playwright install chromium
```

Only needed if you intend to run `npm run test:e2e`; skip it otherwise.

## Running

```bash
npm run dev --workspace @devscribed/api   # http://localhost:4000
npm run dev --workspace @devscribed/web   # http://localhost:3000
```

Two terminals — the API must be up before the web app can serve anything past the login
screen. Open http://localhost:3000/signup and create an organization to get a usable
account.

The API loads `apps/api/.env` itself (`import 'dotenv/config'`, first line of `main.ts`).
The Nest CLI does not, and only the Prisma CLI in `predev` used to — which left the dev
server without a `DATABASE_URL`, falling back to `pg`'s default port, and working only
when the shell already carried the variables. That is also why `npm run test:e2e` could
not start its own API from a cold shell. A deployment has no `.env` file and dotenv never
overwrites a variable that is already set, so nothing about production changes.

The web app proxies `/api/*` to the API (`next.config.mjs` rewrites), so the session
cookie is same-origin and `httpOnly`. That is also why the browser only ever addresses
port 3000; calling port 4000 directly is only useful for `curl`.

Password-reset mail has no real transport outside production. The link is printed to the
API's console and served from `GET /api/test/mail/latest`, which is how the E2E suite
reads it.

## Tests

```bash
npm run test:unit   # validation rules — TC-01-UNIT-*, TC-H01…H07-UNIT-*
npm run test:int    # API endpoints — TC-01-INT-*, TC-H00…H07-INT-*, needs Postgres running
npm run test:e2e    # browser flows — TC-01-E2E-*, TC-H01…H07-E2E-*
```

`test:int` resets `devscribed_test` before it starts, so a failed run never poisons the
next one. `test:e2e` starts the two dev servers itself and reuses them if they are
already up.

### When something is off

| Symptom | Cause |
|---|---|
| `Can't reach database server at localhost:5433` | container is down — `docker compose up -d` |
| `The table 'public.Account' does not exist` | schema never applied — step 5 |
| `@devscribed/validation` fails to resolve | package not built — step 4 |
| `Environment variable not found: DATABASE_URL` | `apps/api/.env` missing — step 2 |
| `ECONNREFUSED` from the API but `prisma migrate status` connects | `apps/api/.env` missing — the CLI has its own loader, so only the server notices |
| Port 5433 already allocated | another container holds it — `docker compose down`, or change the host port in `docker-compose.yml` and in `.env` |
| Port 5050 already allocated | something else holds the pgAdmin port — change the host port in `docker-compose.yml`, or drop the service |

To start over from an empty database:

```bash
docker compose down -v
docker compose up -d
npm run db:migrate --workspace @devscribed/api
```

`-v` drops the volume, which is what makes `docker/postgres-init.sql` run again and
recreate both databases. It also clears pgAdmin's own volume, so
`docker/pgadmin-servers.json` is re-imported on the next start.

## The app shell

Every signed-in route lives under `/org/{orgId}/` and renders inside one shell —
sidebar, top bar, page header — built in `apps/web/src/layout/`. It is documented in
[00-app-shell.design.md](specs/user-management/00-app-shell.design.md), which also
records why the shell sits in the app rather than in the design system.

The organization id in the URL is never a selector. `OrgScopeGuard`
(`apps/api/src/auth/org-scope.guard.ts`) compares it against the session cookie and
answers 404 on any disagreement; queries still scope by the session.

## Deployment

Two Vercel projects from this one repository, plus a Neon database.

| | Root directory | Framework preset | Notes |
|---|---|---|---|
| web | `apps/web` | Next.js | needs `API_ORIGIN` pointing at the api project's URL |
| api | `apps/api` | NestJS | zero-config; no `vercel.json` |

The api project needs no deployment scaffolding of its own. Vercel detects `src/main.ts`
by name, builds the whole application into a single function and runs it on Fluid
compute, so `app.listen()` behaves the same there as it does locally.

The browser only ever talks to the web domain: the front end calls relative `/api/*` and
`next.config.mjs` rewrites those to `API_ORIGIN`. That keeps the session cookie
same-origin, which is why `sameSite: 'lax'` works and no CORS configuration is involved.

API environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon **pooled** endpoint (`-pooler` host), `?sslmode=require&connection_limit=1&pgbouncer=true` |
| `DIRECT_URL` | Neon direct endpoint — migrations only |
| `SESSION_SECRET` | required; without it the app silently falls back to the development key |
| `WEB_ORIGIN` | the web project's URL, used to build password-reset links |

Migrations do not run at deploy time. `.github/workflows/migrate.yml` applies them with
`prisma migrate deploy` on every merge to `main`, using the `DIRECT_DATABASE_URL` secret.

## Hiring

Three things hiring depends on and does not own are expressed as capabilities, each with one
implementation behind it ([`specs/hiring/00-integrations.md`](specs/hiring/00-integrations.md)).
No vendor name appears outside its own module, and no screen names one at all.

| Capability | Ships today | Where |
|---|---|---|
| `CalendarProvider` | `TenantAppOnlyProvider` (Microsoft Graph) · `FakeCalendarProvider` | `apps/api/src/hiring/calendar/` |
| `Storage` | `LocalFsStorage` | `apps/api/src/hiring/storage/` |
| `MailService` | nothing — Outlook delivers the invite | — |

**Which calendar runs.** Graph whenever `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` and
`GRAPH_CLIENT_SECRET` are set, and the fake otherwise — which is every development machine and
both automated suites, neither of which can hold a real tenant mailbox. `CALENDAR_PROVIDER`
overrides the choice. The API names the one it chose on the first line of its startup log. Like
storage, the wrong combination is refused at boot: production with the fake calendar would take
bookings and invite nobody, which is the same silent loss as discarding a CV.

To point a local API at a real tenant, fill in these three in `apps/api/.env` and restart it:

| Variable | Where it comes from |
|---|---|
| `GRAPH_TENANT_ID` | Entra ID → the app registration's **Directory (tenant) ID** |
| `GRAPH_CLIENT_ID` | the same page's **Application (client) ID** |
| `GRAPH_CLIENT_SECRET` | Certificates & secrets → a new **client secret**, copied at creation |

The registration needs three **application** permissions, admin-consented — `Calendars.ReadWrite`,
`MailboxSettings.Read`, `User.Read.All` — because app-only auth has no signed-in user to delegate
from. Delegated permissions of the same name will not work.

One consequence worth expecting: interviewers must be real mailboxes in that tenant. A member
whose address has no `mail` attribute resolves to nothing, so the picker shows them disabled with
"No Microsoft 365 mailbox" and the API refuses to assign them. Seed accounts created for local
development will all fail that check.

**`TenantAppOnlyProvider`** authenticates with client credentials against one Azure app
registration and names the mailbox on every call (`/users/{upn}/…`), because app-only auth has
no signed-in user. It needs `Calendars.ReadWrite`, `MailboxSettings.Read` and `User.Read.All`,
admin-consented. It talks to Graph over `fetch` rather than through the SDK: the surface hiring
needs is six calls, and the SDK's types are exactly what must not escape that module.

**The fake is not scaffolding.** It resolves every address to a mailbox, reports flat
09:00–17:00 UTC weekdays, and treats the interviews it has created as busy — so a slot booked
locally stops being offered, exactly as a real one would. Set `FAKE_CALENDAR_NO_MAILBOX` to a
comma-separated list to see an ineligible interviewer in the picker.

**Availability comes from the mailbox, never from configuration.** Working hours are
`mailboxSettings.workingHours`; busy blocks are free/busy, filtered to `busy`, `tentative` and
`oof` so a `free` event neither removes a slot nor creates one outside working hours. Graph
reports Windows zone ids, which `windows-zones.ts` translates on the way out — the engine only
ever sees IANA. Slots are anchored to the vacancy's duration from the start of working hours, so
a 45-minute interview drifts (`09:00, 09:45, 10:30`) and that is correct: anchoring keeps
bookings tiling and never strands a gap too small to reuse. Overlap is half-open, there is no
lead time and no buffer, and the window runs today through the same day-of-month one month
ahead, clamped when that day does not exist.

The engine itself is in `packages/validation` (`hiring-time.ts`, `hiring-slots.ts`) rather than
in the API. The booking page re-derives the same window to bound its month navigation, and a
page that offered a start time the server would reject is precisely the failure that sharing
prevents.

**An availability failure is never an empty month.** `GET /api/book/{slug}/availability` answers
`503 availability_unavailable` when the calendar cannot be reached, and the page renders its own
error state with a retry. A date present with an empty array is fully booked; a date absent from
the response is outside the window. Those are three different facts and none of them is allowed
to look like another.

**Storage fails fast.** An application configured with `NODE_ENV=production` and
`STORAGE_PROVIDER=fs` refuses to start, naming the variable, and opens no listener. A Vercel
function's filesystem is read-only except `/tmp`, and `/tmp` does not survive the invocation —
so the alternative is accepting bookings and silently discarding every CV. This is deliberately
stricter than `SESSION_SECRET`, which falls back to a development key without complaint: a
missing signing key breaks loudly on the next request, where a discarded CV breaks silently and
cannot be recovered.

CVs are streamed through `GET /api/organizations/{orgId}/hiring/applications/{id}/cv`, never
linked to. Storage keys are `{applicationId}{extension}` — application-generated, never derived
from the uploaded filename, and never present in any response.

**One future interview per email per vacancy.** A repeat booking is refused with `409
already_booked`, naming the date, time and zone of the interview the candidate already has. The
check is scoped on both axes — same vacancy only, because applying to two roles is normal, and
future only, because someone who interviewed three months ago is a re-interview. It runs at submit
and nowhere else: a live check on email blur would hand out the answer for the price of typing an
address. Telling the candidate plainly departs from the enumeration-safe posture the rest of the
product keeps, and [02 §09.38](specs/hiring/02-booking-page.md) makes that trade deliberately.

**Editing a vacancy affects future bookings only.** A new interviewer or a new length
changes what the booking page offers from the next request onward and nothing else:
interviews already scheduled keep their time, their length and their original calendar
event, which stays in the mailbox it was created in. A Graph event cannot be moved
between mailboxes, and cancelling, recreating and re-inviting a candidate is not a side
effect a dropdown may have — so `PATCH …/vacancies/{id}` writes to `Vacancy` alone, and
the absence of any application fix-up is the requirement rather than an omission. The
screen confirms with the count it is leaving untouched before the request goes out.

**Closing stops new bookings and nothing else.** Existing applications, their events and
their counts all stand, and the booking link stays on the vacancy page — a manager still
has to be able to copy it. A closed link is deliberately not a 404: it answers with the
wordmark, the title and "This position is no longer accepting applications", with no
calendar and no form, because someone who received the link legitimately deserves an
explanation rather than something that looks broken. Availability for a closed vacancy
answers the window with no slots in it, which is a different fact from a calendar that
could not be reached — that one is still a `503`.

**The candidate card is what the invite links to.** The calendar event's body carries
`/org/{orgId}/hiring/candidates/{candidateId}?application={applicationId}`, and that link works: it
opens the card with that application's section expanded, signing the visitor in first when they
arrive without a session and returning them to it afterwards. An `admin` or `manager` also reaches
a card through the candidate database, and a `user` interviewer through My interviews — the invite
is no longer their only route, which is exactly why that screen exists. The E2E suite still reads
the link out of `GET /api/test/calendar/latest` rather than assembling it, the same way it reads a
reset link out of the mail sink. Both endpoints answer only behind their stand-in implementation
and never in production.

**Interview notes and the conclusion autosave, and a failure stops the loop.** Both are plain text,
both are shared fields with last-write-wins, and both write about two seconds after typing stops.
Saves never overlap: keystrokes arriving during one are coalesced into a single write that follows
it. A failed save keeps the text and its cursor, shows an error with a retry, and **stops
autosaving** until the member retries or edits again — a failing endpoint retried every two seconds
for the length of an interview is worse than one that stopped and said so. The loop itself lives in
`packages/validation/hiring-autosave.ts`, away from any component, because when a save fires and
when it does not is a rule rather than a rendering detail.

Everything on that screen answers to one constraint: someone is on a live call. Nothing steals
focus, nothing moves under the cursor — the saved-at indicator sits in a label row that reserves its
height whether or not it has text — and no save is silent. The record is fetched once and never
refetched in the background, and a status change is patched in place, because a response arriving
mid-sentence would replace text someone was still writing. The one focus move on the page is the
Conclusion field taking focus after a status change to `Didn't pass` or `Offer`, which is a direct
answer to what the member just did. Prompted, never required.

**Autosaves are not announced; explicit saves and failures are.** A polite live region that spoke
every two seconds would talk over the interview it exists to help record, so the visible indicator
carries the routine case on its own and the live region is a separate node that stays empty for it.

**The CV is named and sized, never located.** `Application.cvSizeBytes` is recorded at upload so the
card can show the size without reading the file back out of storage. **View** asks for
`?disposition=inline`, which serves a content type derived from the extension rather than the stored
one — the stored type came from the candidate's own multipart upload, and a `.txt` announced as
`text/html` and rendered inline would be script running on this origin. Only `.pdf` and `.txt` are
ever inline; everything else downloads, with `nosniff` on both paths.

**The board is one field, not a column and a status.** `Application.status` *is* the column, and
`Application.position` orders it — a gap integer scoped to `(vacancyId, status)` with `id` as a
stable tiebreak, so two cards that collide on a position never swap between renders. Every
transition between the five columns is allowed, backwards included: hiring is not a state machine,
and any guard written there would be fought within a month.

**A drop names its neighbours, never a position.** `PATCH …/applications/{id}/placement` carries the
target status and the ids of the cards immediately above and below the drop point; the server reads
their *current* positions and takes the midpoint. A position sent by the client is not rejected — it
is simply never read, because the number a browser can see is the one it last fetched, and a stale
board would otherwise write a position that has since been reused. A named neighbour that has left
the column answers `409 stale_neighbours`, the board says "This board changed. Refreshing…" and
refetches, rather than putting the card somewhere nobody aimed at. A move writes exactly one row.

When the gap between two neighbours closes below 2 there is no integer left between them, so that
one column is renumbered back to clean multiples of 1000 **in the same transaction as the move**.
It is the only time another card's position changes, and it never crosses into another column.

**Moves are optimistic and reverted on failure.** A drag that visibly waits for a round trip stops
feeling like a drag. The card being dragged is not drawn at all — a single card-sized placeholder
travels to wherever the drop would land, so what you see mid-drag is the shape of the result. On success the board refetches; on failure the card animates back and
`toast-move-failed` appears. Dropping into `Didn't pass` or `Offer` completes the move and *then*
opens the card with Conclusion focused — after the request is confirmed, so a failed move never
navigates. Prompted, never required: cards in those two columns with no conclusion carry an amber
marker so the gaps can be found later.

**`Application.isCancelled` is specified and dormant.** Nothing sets it in this release — a no-show
is handled by dragging the card to `Didn't pass`. The board renders it as a mark on the card, in the
column the card is already in, so the deferred reschedule flow does not arrive and invent a sixth
column that would strand an assessment already recorded.

**The board answers an assigned interviewer 404, not 403.** `BoardScopeGuard` is the board's own
guard rather than `HiringManageGuard` for that one reason: a `user` who interviews for this vacancy
is the single caller who could read a permission error as "the board is there, you are not senior
enough". A `viewer`, and a `user` with no assignment, get the honest 403 the rest of the hiring
surface gives — they already know the vacancy exists. The general rule, an interviewer's whole
narrowed view of hiring, is `InterviewerScopeGuard` below.

**A vacancy with applications cannot be deleted, only closed.** Deleting it would take
its interview notes, conclusions and criteria assessments with it, and spec 04 treats
that record as permanent. `DELETE` answers `409 has_applications`; the menu item is
disabled with the reason rather than hidden.

**An assigned interviewer cannot be removed from the organization.** `DELETE
…/members/{id}` — user-management spec 04's endpoint, which lands here because this is
the guard that needs it — refuses with `409 interviewer_on_open_vacancies` and the count
of open vacancies still assigned. Reassigning or closing them lifts it; a closed vacancy
never counted, since its link already explains itself. The rest of that screen (search,
the removed filter, restore) arrives with its own spec. Removal is a soft delete, and it
rotates the account's `securityStamp`, which revokes every outstanding session at once.

**Case-insensitive uniqueness is the whole category library.** `react` cannot be created while
`React` exists, and the rule is enforced by a `lower(name)` unique index per organization rather
than by a normalized second column — a stored copy of a value is a value that can drift from the
one it copies. The service looks the collision up first anyway, because it has to answer `409
duplicate_name` with the **existing row's id**: a member typing `react` into the vacancy dialog
meant `React`, and the combobox selects it for them instead of showing an error they cannot act on.
The lookup is a convenience and the index is the guarantee — two concurrent creates of the same
name both pass the lookup, and the one that loses the write gets the same 409 carrying the row that
beat it.

Names are stored exactly as typed and folded only to compare, so `Asp.Net` never renders as
`asp.net`. Renaming propagates everywhere by writing one column and touching no assignment row,
because a vacancy references the category rather than its name. Deleting is allowed even in use —
unlike a criterion, a category is a label, so removing it loses a classification rather than a
judgement — and it unassigns from every vacancy and deletes nothing else; the confirmation names
the count because there is no undo.

**Merge is not built, and the settings screen says so.** Once uniqueness is enforced, rename cannot
fix a duplicate that already exists: renaming `ReactJS` to `React` collides. The note on the
Categories card states the consequence and the way out — reassign the vacancies and delete one —
rather than leaving a member to discover it against an error message.

**Categories are internal.** They are absent from `GET /api/book/{slug}` entirely, not merely
hidden by the page: `Middle` or `Senior` on a public posting carries implications that are not ours
to publish on the team's behalf. A regression test asserts the string does not appear anywhere in
that response.

**A criterion's type is fixed at creation, and that is a schema decision.** Each of the four types
— scale, boolean, number, text — has its own column on `ApplicationCriterion`, so every filter in
the candidate database is a plain indexed comparison rather than a cast out of JSON. Which means
changing a type would strand or silently reinterpret every assessment already recorded, so `PATCH`
answers `422 type_immutable` and the edit dialog omits the control entirely rather than disabling
it. Archive the criterion and create a replacement.

The rule is enforced in the database, not only in the service. `ApplicationCriterion` carries a copy
of its criterion's `type`, kept honest by a composite foreign key onto `Criterion(id, type)`, and a
check constraint says that exactly one value column is populated and that it is the one `type`
names. The copy cannot drift, because the value it copies is immutable and the foreign key would
refuse the write if it moved. A scale's `valueId` is checked the same way — a second composite key
onto `CriterionValue(criterionId, id)`, so a value from another criterion's scale is not storable —
and that key is `ON DELETE NO ACTION`, which is what makes "a value in use cannot be removed" a fact
about the database rather than a promise about the service.

**A scale compares by position, never by label.** Renaming `B1` to `B1 (intermediate)` is therefore
free and needs no confirmation, while dragging it above `A2` changes what every saved filter
matches — the only edit in either library with retroactive effect, and so the only one that
confirms. The whole ordered list is sent on every write and renumbered contiguously from zero, which
is why two values can never share a position and none is ever skipped. Adding a value is not a
reorder even though it shifts the positions below it: every existing value keeps its place in the
sequence, so every existing comparison keeps its answer.

**Criteria are archived, never deleted, once assessed.** Deleting one would destroy exactly the
judgements the candidate database exists to filter on, and nothing brings them back — so `DELETE`
answers `409 has_assessments` naming the count, and the settings row disables it with archive named
as the alternative. An archived criterion leaves the Add-criteria autocomplete, which is the only
thing archiving does: its assessments stay readable **and editable** where they already are, and it
stays available to the filter marked "Archived". Whether a `PUT` is a new assessment or an edit of
an existing one is decided by whether the row is already there.

**A criterion becomes a chip before it has a value.** There is no such thing as an assessment
without one — the check constraint forbids it — so choosing a criterion from the autocomplete adds a
pending chip client-side and the first value is what writes the row. Removing a chip that never got
one is a local undo with nothing to delete. Values save on change and nothing else: a `Select`
writes the moment it is chosen, and the number and text fields commit on blur and on Enter, because
saving per keystroke would write `7`, `70`, `700` on the way to `700`.

**Already-assessed criteria stay in the autocomplete.** Filtering them out would be worse than
redundant: typing a name that exists would then match nothing and the control would offer to
*create* it, which the library refuses as a duplicate. So they stay, and choosing one moves focus to
the value already there and says "Already assessed — edit the existing value".

**The library tension was settled by the matrix, not by convenience.** Both libraries are
`admin`/`manager` only, `GET` included, which is what
[06's TC-H06-INT-08](specs/hiring/06-libraries.md) asserts — and an assigned `user` interviewer
needs the criteria library to assess anybody on their own vacancy's card. The assessment endpoints
narrowed naturally under `InterviewerScopeGuard`, because they name an application; the library's
read does not, because it names nothing. Opening it for the sake of one autocomplete would have
made every criterion, every scale and every usage count readable by any interviewer, to solve a
control. So the library stayed shut and **the card renders criteria read-only for an interviewer**:
the chips are text, with no value control, no remove and no Add, and everything they show came with
the card's own response. The page detects it by the 403 rather than by inspecting a role — a screen
that predicted a permission would eventually predict it wrongly.

**The naming half of both libraries is one class.** `LibraryNames` holds what categories and
criteria share — the 1–50 rule, the case-insensitive lookup, the 409 that carries the existing row's
id, and the recovery when the unique index rather than the lookup catches the duplicate — and takes
the lookup as a closure so nothing in it names a Prisma delegate. A scale's own labels are unique
within their criterion case-insensitively, but that one is enforced in the service rather than by an
index: values are only ever written as one complete ordered list inside one transaction, so the
service sees the whole final state, and a unique index would break a legitimate edit — swapping two
labels collides halfway through, since a plain unique index is checked per statement and an
expression index cannot be declared deferrable.

**The candidate database is one row per person, and that decides everything else.** A candidate
who applied three times is one row with a count beside it, so every filter is evaluated across all
three of their applications: filters AND across kinds and OR within a multi-select, and each clause
is satisfied by *any* application. `React AND Senior` therefore matches somebody whose React
application and whose Senior-tagged application are two different applications — the row is the
person, and the screen exists to find people to contact rather than to audit applications.

**The rollup is what makes the headline query work.** A candidate's value for a criterion is the
assessment from their **most recent interview**, whichever vacancy it was recorded against, ties
broken on the assessment's own `updatedAt`. Which is what lets English assessed during a .NET
interview count when filtering React applicants — English is English. "Most recent" is the
application's `start`, not the assessment's timestamp: notes edited a month later do not make an
older interview newer. Only applications actually carrying an assessment are considered, so a later
interview where nobody asked about English does not blank out an earlier answer.

**Absence is not a value.** A candidate never assessed on English is absent from `English at least
B1` *and* from `English at most B1`, and from `is not B1` too — the negative operators are claims
about somebody who was assessed. That rule lives in one `if` at the top of the comparison, before
the operator is read, because it is the one place every operator would otherwise have to remember
it.

**Half the filter runs in SQL and half in JavaScript, on purpose.** Search, positions and
categories are indexed comparisons and belong in the query. The rollup is not expressible there:
"the assessment from their most recent interview" is a correlated per-candidate maximum, and
writing it as raw SQL would put a second copy of the comparison rules beside the one in
`@devscribed/validation` that the criterion dialog and the filter row already share — the two would
disagree about `at least` within a release. So the assessments for the criteria a query *names* are
read, rolled up per candidate and matched with the shared predicate, and the surviving ids restrict
the query. One extra round trip, bounded by one row per application per named criterion, and the
comparison exists once.

**An unknown id is refused, never dropped.** A `vacancyId` from another organization, an operator a
criterion's type does not answer, a scale value belonging to a different scale: all `422
invalid_filter`, because from the caller's side they are one mistake — a filter this organization
cannot evaluate — and a query that silently ignored a clause would return more people than the
chips on screen claim to allow. `pageSize` is the deliberate exception: over 100 is clamped rather
than refused, since nothing about it can make the answer wrong.

**A boolean asks two questions, not four.** `is yes` and `is no` are the operator itself, and the
row has no value control at all. Offering `is`/`is not` beside `yes`/`no` would be four spellings
of two questions, and one of them would have to be explained.

**The count is the feedback, which is why the list is paginated.** Infinite scroll cannot show how
many rows match, and "how many?" is the question a filtered list is asked — so the count sits above
the table, holds both numbers once anything narrows it, and is the only `aria-live` region on the
screen. A refilter never replaces the table with a spinner: the rows stay, dimmed and `aria-busy`,
and only the number becomes one. A table that collapsed and re-expanded on every keystroke would
reflow the page under the reader for no information at all. `Table` gained the `busy` flag for it,
so the next filterable list dims the same way instead of inventing its own.

**A half-built criteria row is not a filter.** A row whose value is still empty is skipped rather
than sent — treating it as a filter would empty the list under somebody mid-way through building
it — and changing the criterion resets the operator and the value rather than carrying a
meaningless leftover across types. Archived criteria stay in the picker, marked, because history
has to stay reachable; the marker rides in the option's text rather than in a `Badge`, since the
combobox filters on what its options say and a node there would make an archived criterion
unfindable by typing its name.

**The database answers 404 to everyone it refuses, including an interviewer.** `403` is never
returned here. It is the one hiring surface where the honest 403 would be wrong for all three
refused callers rather than one: a `viewer` and an unassigned `user` have no route to it, and an
assigned interviewer — who *does* reach candidates, their own — would read a permission error as
"the database is there, ask to be promoted". `CandidateDatabaseGuard` is therefore its own guard
rather than `HiringManageGuard`, which still answers the card's different question.

**`InterviewerScopeGuard` is the one non-uniform permission in the product.** Every other rule in
hiring is a role test; this one is a row test. A `user` who has been assigned an interview reaches
the candidate card, its notes, its conclusion, its status, its CV and its criteria — for *their*
vacancy's applications and nothing else. The guard covers the whole candidate-shaped surface (the
card, `PATCH …/applications/{id}`, both criteria endpoints, and the CV stream), resolving whichever
of `:candidateId` or `:applicationId` the route names, so an interviewer patching another vacancy's
application by id is refused on the row rather than on their role.

**It answers 404 and never 403**, and so does everything else that surface touches — including for
a `viewer`, and for a `user` with no assignment. Not because the caller could not be told, but
because the alternative leaks: a 403 on `…/candidates/{id}` confirms the id names a real candidate
in this organization, which is precisely what somebody walking ids is trying to learn. Every
refusal there looks identical, an id from another organization included. The vacancy and library
endpoints keep their honest 403 — the caller already knows their organization has vacancies, and
there is nothing to conceal.

**The scoped card omits, it does not hide.** An interviewer's response holds only their own
applications; the other vacancy's id, title, notes and criteria are absent from the body rather
than filtered out by the page. A section the browser never receives is one no devtools panel can
open. The guard decides the scope once and hands it to the service, so the membership lookup that
decided it is not repeated per query.

**My interviews is gated on assignment, not role.** It is application-grain — one row per
interview, unlike the candidate database's one row per person — because it answers "what interviews
do I have?" rather than "who do I know?", and it has no search, no filters and no pagination
because it is a short list by construction. Its endpoint is the one hiring route with no role guard
at all: `admin`, `manager` and `user` all see the same screen showing their own assigned
interviews, and a `viewer` cannot hold an assignment, so the row count answers for every role at
once.

A member with **no assignment** gets 404, not an empty list — the screen's existence is not
advertised to people it will never serve. A member who holds a vacancy **nobody has booked yet**
gets the screen with an empty `UPCOMING` group. Those are two different facts and the split between
them is the assignment, not the bookings. Upcoming is soonest-first and past is most-recent-first,
divided by the interview's **end**: one that started ten minutes ago is the card the interviewer is
most likely to be opening, and moving it to `PAST` the instant it began would drop it below every
finished interview at exactly the wrong moment.

**The sidebar row rides on `/api/me`.** `isInterviewer` travels with the session because the shell
already blocks on that response before rendering anything, which is what stops a gated row flashing
into view and back out — the same mechanism the role-gated rows use, with a different predicate. Any
assigned vacancy counts, closed ones included: a closed vacancy keeps its past interviews, and
dropping the row would take away the only route an interviewer has to those cards. The HIRING
section is therefore assembled row by row rather than gated whole, and an interviewer sees the
label with exactly one row under it.

**`POST /api/test/members` is a seam, not a feature.** Hiring's permission matrix is four roles
wide and its last row is gated on assignment, so the rules cannot be exercised from one admin
account — and with no invitation endpoint yet (user-management spec 03) a browser has no way to
produce a second member at all. This creates exactly the account and membership an invitation
eventually will, fenced like `/api/test/mail` and `/api/test/calendar` and one turn tighter: never
in production, and only behind an `admin`'s own session, so what it can create is bounded by an
organization somebody already administers.

### Manage booking

A candidate can move their interview, replace their CV or call it off, from a second public page
reached by a per-booking link ([07](specs/hiring/07-manage-booking.md)). The team has its own copy
of the first and the last, from the candidate card and from My interviews, over the same rules.

**A completed booking lands here, and that is why this page exists at two doors.** `/book/{slug}`
has no confirmation view of its own: it navigates to `/manage/{slug}/{token}` and the live record is
the confirmation. The old confirmation was component state, so a refresh threw it away and put an
empty booking form in front of somebody who had already booked — the one reading that screen must
never offer. It was also a duplicate: the manage page already states the title, the length, the
time and the zone, and unlike the confirmation it can act on them. It deliberately does **not**
restate the candidate's name, address or CV filename — see below. The one fact it cannot state for
itself — that Microsoft's invite is coming, which matters because the
product sends no mail of its own — arrives as a notice above the card, carried by a bare `?booked=1`
flag that the page strips from the address bar on its first paint. What the candidate is left
holding is byte-identical to the link in their invite, and a reload shows the record without the
notice: a receipt for an action, not a state of the record, which is the same rule the cancellation
receipt already followed. The notice draws only over a live booking, so no flag can make it appear
on the blurred screen and confirm that a dead token was once real.

**A completed move leaves a notice of the same kind.** Rescheduling is the one action on this page
that would otherwise leave no trace of itself: cancelling replaces the screen, booking arrives on a
URL the candidate was not on a moment ago, and a move rewrites a single line of a card they were
already looking at. A successful move therefore draws "Your interview has been moved. An updated
calendar invite is on its way." in the slot the just-booked notice uses, and clears it on the next
reload or the next press of Reschedule. It states no time — the card two lines below carries that,
and repeating it would read as two things having happened — while the polite region gets a longer
form that does name the new time, having no card beneath it to lean on.

**The manage page names nobody.** Not the interviewer, and — since this release — not the candidate
either: no name, no email address, no CV filename, withheld from the response rather than merely
unrendered. The reasoning is the one already used to blur a dead link. That link travels in a
calendar event both parties hold and can forward onward, and the spec goes to some lengths to stop
an expired one confirming that a particular person booked an interview and later cancelled it — so a
live one that answered with a full name, an address and `jane-doe-cv.pdf` was giving away strictly
more, to whoever the invite reached and whoever they sent it on to. `booking` carries `hasCv`, a
boolean, so a replacement can still be offered without naming the document. The cost is recorded
rather than waved away: the page was the candidate's only chance to notice a mistyped email address
at the moment cancel-and-rebook could still fix it, and a typo now goes unremarked.

**Two spec deferrals are now superseded, and this is where they are recorded.**
[02 §09.40](specs/hiring/02-booking-page.md) said a candidate who books by mistake "must contact
the organization", and [05 §07.24](specs/hiring/05-board.md) said nothing set
`Application.isCancelled`. Both were true only while this flow was deferred. `TC-H02-E2E-01` now
asserts the manage link on the confirmation rather than its absence, and the board's cancelled
badge has real data behind it.

**The token is plaintext, and that is the considered choice.** It follows `Vacancy.publicSlug`
rather than `PasswordResetToken.tokenHash`: hashing protects a credential that grants account
access, where this addresses one application row that anybody holding the database already has. It
would buy nothing and would cost the candidate the ability to reopen a month-old invite. It carries
128 bits — twice the slug's 72, because it guards one named person's booking rather than a page
meant to be shared, and because no rate limit stands behind it either. It has **no expiry of its
own**: access ends when the interview starts, and a token that died on a timer would strand a
candidate whose interview is next month.

**The interviewer receives the candidate's manage link, and that is a departure taken on purpose.**
[00 §04.19](specs/hiring/00-integrations.md) says both parties get identical content, and one event
has one body — so the only channel that reaches the candidate at all reaches the interviewer too.
It grants them no capability they lack, since they cancel and reschedule from the card; the real
cost is attribution, because an action taken through that link is logged as the candidate's. When a
mail transport lands, the email becomes the carrier, the body line is dropped, and §04.19 is
restored without a migration.

**Every non-live state is one screen, and one response.** A revisited cancellation, an interview
that has started, a token that never existed and a token that is not a token all answer `200` with
`booking: null`, with the organization name and vacancy title present in all four. The blur is
enforced at the API, not in the client, and the four are indistinguishable in the body as well as
on screen — because the link travels in a calendar event both parties hold and can forward onward,
and a stale link must not confirm that a particular person booked a particular interview and later
cancelled it. Only an unknown **slug** is a bare 404, which is exactly why the URL carries the slug
as well as the token: without it, the state this route renders most often would have no
organization, no title, and nowhere for its "New booking" button to lead.

**Cancelling means the interview did not take place**, and says nothing about the candidate's
standing. The card keeps its column, its position and every assessment on it, and the candidate may
book the same vacancy again — which produces a **second application** rather than restoring the
first. A reschedule is continuous intent and updates the row; a rebooking is fresh intent and
creates one, and the two reach the product through visibly different doors. There is **no undo**:
the calendar has already told both parties, and a notification cannot be recalled, which is why
both sides confirm first.

**No lead-time cutoff, on either action, for either party** — one rule, `start > now`. Booking
itself has no minimum lead time, so a cutoff on cancelling would let somebody take a slot ten
minutes out and then be told it is too late to release it. And a late cancellation is strictly
better than a no-show: forbidding it does not produce attendance, it produces an interviewer
sitting alone. Once `start` has passed the page blurs and the actions are **absent, not disabled** —
a disabled control invites a reader to work out why. A no-show remains what it always was, a drag
to `Didn't pass`.

**A closed vacancy changes nothing here.** Closing means "stop accepting new applicants", not
"renege on the interviews already granted", so the page renders as live and both actions stand.
After a cancellation, "New booking" lands on the closed-vacancy page — the correct dead end, and an
honest one.

**`Application.interviewerAccountId` fixes a defect and cannot fix its own history.** The card used
to resolve the interviewer live through `vacancy.interviewer`, so reassigning a vacancy
retroactively rewrote the interviewer shown on every past application, including interviews
somebody else conducted. The column is stamped at booking and read from there. Its migration
back-fills from each vacancy's **current** interviewer, which is the only answer available and is
wrong for any application booked before a reassignment that already happened — that history was
never recorded and cannot be recovered. The column is correct from its migration forward, and this
is stated here rather than discovered later by somebody who trusts it further back than it goes.

**`ApplicationScheduleEvent` is append-only and never replayed.** `isCancelled` remains the flag the
board queries; the log is the record beside it. A `booked` entry is written at booking, so the
history is the whole story rather than only its deviations, and the migration manufactures one for
every application that predates it. The history is **team-only** — it appears on the candidate card
and on no candidate-facing surface, because the candidate already knows what they did and a tally
of their own reschedules reads as a reprimand from a page whose whole purpose is to make changing an
interview unremarkable. It renders collapsed to one summary line, for the same reason the card's
sections collapse at all.

**The board badge names who cancelled.** "The candidate withdrew" and "we called it off" are
different facts to a hiring manager scanning a column, and the log now distinguishes them. The badge
shows a first name only, because a card is a glance; the tooltip carries the full name, the date and
— for a member — the reason, and it is the badge's accessible name rather than the truncated form.

**A reschedule updates the row, and moves the event in place.** `start`, `end` and `timeZone`
change; `status`, `position`, `submittedName`, the CV, the notes and the criteria do not, and the
board card does not move. That is the whole point of updating rather than replacing: `position` is
the hiring manager's own ordering, and a candidate nudging their interview by thirty minutes must
not silently delete their card and re-insert it at the top of `Scheduled`. Reschedules are
**unlimited** — no counter, no quota, no cooling-off period — and a move to the time the interview
already has is accepted as a no-op, touching neither the calendar nor the log.

**Availability for a move is about the application, not the vacancy.** Three facts come from the
row rather than from the position it was booked against: the duration is `end - start`, so a vacancy
re-timed since keeps its promise to the interview already granted; the mailbox is the one
`interviewerAccountId` names, so a reassignment does not silently move a candidate to a stranger;
and the application's **own event is excluded from the busy calculation**, without which a candidate
trying to move thirty minutes later collides with themselves and every slot near their own interview
reads as taken. That exclusion matches on the interval, because an interval is all a free/busy read
returns — no event id crosses the `CalendarProvider` boundary in that direction.

**A failed move always leaves the interview that was already there.** Nothing is cancelled in order
to attempt one, so a slot claimed between selection and submission answers `409` with the booking
wholly intact, and a calendar that refuses answers `503` with the row untouched. The one state that
needs care is a calendar that succeeded followed by a database write that did not: both parties have
already been told about a move the row does not record, and there is no move back, because a
notification cannot be recalled. A retry then finds its own displaced event sitting on the target.
It is told apart from real contention by asking where this interview's event actually is — if the
calendar no longer holds it where the row says, the blocker is our own — and the retry completes the
write **without a second calendar call**, which would only send both parties a second notice for a
move they were already told about. A calendar somebody edited by hand reads the same way; nothing in
07 reconciles one.

**No mail, still.** The calendar is the whole notification mechanism: `updateEvent` produces
Microsoft's own meeting-updated notice and `cancelEvent` its cancellation notice, exactly as
`createEvent` produces the invite. A reschedule is therefore **never** a cancellation followed by a
fresh booking — that would tell the candidate their interview is cancelled as the first half of
moving it, re-upload the CV on every move, and leave a tombstone in the interviewer's calendar each
time. Nobody who is not the interviewer is notified of a change; they learn of it by opening the
board or the card, and that is recorded rather than solved — there is no notification system in the
product, and building one for this feature would be larger than this feature.

**A CV is replaced by the candidate, and by nobody else.** Internal members cannot replace or delete
one from any surface, and no endpoint offers it: "the candidate corrected their own CV" and
"somebody in the organization swapped it" are very different facts about a hiring record, and only
the first is available. Replacement is **not gated behind rescheduling** — somebody who spotted a
typo in their CV must not have to move their interview to fix it, and somebody who only wants a
different Tuesday must not be interrogated about their CV — so the affordance sits in the live state
and is carried into the reschedule flow rather than living inside it. The page still names no file:
it says a CV is attached, never which one, because the filename is usually built from the
candidate's own name and this link is forwardable.

**Nothing is deleted, so every version is kept.** `ApplicationCv` holds them all and the
`Application.cv*` columns hold the current one, which is what leaves the authenticated CV endpoint
and the candidate card untouched by any of this. The record is permanent, and what the candidate
submitted at booking is evidence the interviewer may already have read. Storage keys moved from
`{applicationId}{extension}` to `{cvId}{extension}` for that reason alone: the old shape is a single
slot and cannot hold two versions. Files written under it **keep the keys they have** — the
migration back-fills one row per application that has a CV and moves, copies and renames nothing.
The consequence is unbounded storage per booking, since the replacement endpoint is unauthenticated
and unthrottled like everything else behind this token; that is recorded in
[07 §15](specs/hiring/07-manage-booking.md) rather than mitigated.

**The calendar event's attachment is swapped, not accumulated.** Storage is the permanent record and
the attachment is a convenience copy of what is current, so a replacement adds the new file and
removes the old one — in that order, because a half-failed swap that leaves the interviewer with two
CVs is recoverable by looking at the dates, where one that leaves them with none is a candidate's
document missing from a meeting they are about to attend. Storage, then the calendar, then the row:
everything before the transaction is retryable and leaves nothing behind, and a failure after the
calendar has taken the new attachment fails the request and logs the divergence rather than
compensating, exactly as a move does.

**The card's timeline merges two records at render.** CV versions are deliberately not events — a
filename, a size and a content type have no place in an `ApplicationScheduleEvent` row — so the two
are stored apart, sent apart, and combined only where they are drawn. The oldest version is the
document the booking carried and is never read as a replacement; the `booked` entry already accounts
for it. A CV that changed silently between booking and interview, after the interviewer read the
first one, is a bad surprise, which is the whole reason the team sees these at all.

`/book/{slug}` and `/manage/{slug}/{token}` are the product's two public routes. The slug carries 72
bits of entropy, which is why neither needs an organization segment, and it is frozen at creation so
a link already sent keeps working. There is **no rate limiting on either POST** — see
[02 §11](specs/hiring/02-booking-page.md) and [07 §15](specs/hiring/07-manage-booking.md), which
record the exposure that leaves open rather than implying the endpoints are protected.

## Design-system notes

> **The reskin is in flight.** The app is moving off yellow (Teammerly Meridian, the prototype
> skin) and onto blue (Teammerly Original DS, the system measured from the live Teamplay/Teammerly
> product). The notes below describe blue and the rules the migration carries across.
> [`specs/design-system/README.md`](specs/design-system/README.md) is the decision record — the
> token map, the component inventory, and the eight numbered decisions everything else cites — and
> [`specs/design-system/ledger.md`](specs/design-system/ledger.md) records what the vendored copy
> adds beyond upstream. Until the first migration phase vendors blue, `1_DS for dev/` still holds
> yellow and `npm run ds:drift` reports the gap.

- Components come from `1_DS for dev/index.js` via the `@ds` alias
  (`experimental.externalDir`), re-exported through `apps/web/src/ds.ts` — a single
  `'use client'` boundary, since the DS uses hooks and ships no directives.
- **Blue is a measurement, not a design**, and that distinction settles most arguments. Where blue
  made a choice it wins, layout included. Where blue merely never wrote something down — rest-prop
  forwarding, `ref`, aria hooks, keyboard handling — it is silent rather than authoritative: blue's
  `Modal` has no focus trap because production never wrote one. Those get added to the vendored
  copy, numbered in the ledger, and pushed back upstream in one batch. `npm run ds:drift` is what
  keeps that from happening quietly — it diffs `index.js`'s exports against `_ds_manifest.json` and
  exits non-zero when they disagree.
- **Blue's components are closed.** `Button` destructures exactly seven props with no `...rest`, so
  `data-testid`, `ref`, `aria-*`, `className` and `style` all vanish without an error — 81
  attributes feeding 632 e2e selectors. It also hardcodes `width: '100%'`. Opening them changes no
  pixels and is the first task after vendoring.
- **`Modal` has to become a real dialog**: `role="dialog"`, `aria-modal`, `Escape` closes it, focus
  trapped while it is open and returned to the invoking control on close, and `initialFocusRef` to
  say what opens focused. That goes into the component rather than into its callers because
  [07's design spec](specs/hiring/07-manage-booking.design.md) refused a second dialog component
  precisely to stop focus behaviour forking — and a cancellation dialog has to open on its
  dismissive control, never on the button that cannot be undone. `Button` declares `ref` for the
  same reason; React 19 passes it through as an ordinary prop, so a caller can name that control
  without a `forwardRef` wrapper.
- **`TextInput` has no way to tag its error message node**, so the app passes the message as a node
  carrying `field-error-{fieldName}`. A first-class `errorId` prop belongs in the DS, along with
  `id`, `name`, `required` and `aria-describedby`.
- **`TextArea`'s trailing slot belongs in the label row, not in the field.** `TextInput`'s sits
  inside the field, which a multi-line field has no unambiguous place for. The candidate card's
  saved-at indicator lives in that slot so it can appear and change without moving the field below
  it — the alternative shifts the layout on every autosave. `TextArea` also needs a real
  `<label for>`; a micro-label sitting above a field never names it.
- **`Button` needs `as="a"`** for an action that is really a navigation. The CV download is one: a
  download through an `onClick` loses middle-click, copy-address and the browser's own download
  handling.
- **`Select isSearchable` replaces `Combobox`** — the capability exists in blue, production just
  never enables it. The rules the libraries screen established travel with it. Its filter folds
  case deliberately: an option that already exists must never hide behind a create row over a
  difference in capitalisation, because creating it is exactly what the API will refuse. The create
  row appears only when the typed text matches **nothing at all**, not merely when it is not an
  exact match — somebody typing `Eng` while `English` exists is looking for English, and offering
  to create `Eng` beside it is precisely how a library fills with near-duplicates
  ([06 §04.21](specs/hiring/06-libraries.md)). Like `Calendar` it is presentational: it never
  writes anything. `onCreate` hands the typed name back and the caller decides what that means,
  which is what lets the vacancy dialog hold a pending category and create it in the same submit as
  the vacancy — so cancelling the dialog leaves no orphan behind.
- **`SelectOption` needs `disabled`, `hint` and `testId`**, so an ineligible interviewer is shown
  disabled with its reason rather than dropped from the list. `Select`'s popover also has to
  scroll: the booking page offers the whole IANA time-zone set, because a shortlist would strand
  anyone whose zone it left out.
- **A `Card` clips every popover opened inside it.** Cards clip to their radius, which is what
  rounds an edge-to-edge `Table`'s square corners — and it also cuts a `Select` list off at the
  card's edge, so the options below the fold are invisible and unclickable. `clip` (default `true`)
  is the opt-out, and it has to exist from the moment `Card` is built, because four surfaces pass
  `clip={false}`: the candidate database's filter bar, the candidate card's application section,
  and the two library cards on hiring settings, whose row menus clip the same way below 768px. The
  regression test hit-tests the option's own coordinates rather than clicking it — a clipped
  popover keeps its layout box and still scrolls into view inside the card hiding it, so a click
  passes either way and only what is *painted* there tells the two apart.
- **`Table` needs `busy` and `hideHeader`.** `busy` dims the body and sets `aria-busy` while a
  refetch is in flight, and belongs in the DS rather than in the screen so every filterable table
  gets the same treatment: the alternative is each page dimming its own rows slightly differently,
  and the one thing this state must do is stay unremarkable. `hideHeader` drops the uppercase rule
  and keeps the column widths — My interviews is two groups of a few rows each, and a header rule
  over three rows reads as a report rather than as a glance at today.
- **Six of yellow's components go away rather than get repainted**, because blue already has the
  pattern: `SectionLabel` → headings, `Skeleton` → `Preloader`, `Toast` → `InfoBanner`, `Tooltip` →
  native `title`, `Pagination` → infinite scroll, `Toggle` → `ToggleButton`. Three of those
  overturn a decision this repo made deliberately, and each needs a call rather than a swap:
  - `Pagination` exists **because** infinite scroll cannot answer "how many match?", and its bounds
    are disabled rather than hidden so a vanishing Previous never slides Next under the cursor.
    Adopting infinite scroll means the candidate database has to re-home the match count.
  - `Tooltip` and `Menu` are a pair. A blocked action — Delete on a vacancy that has candidates, or
    the last-admin guard — is **disabled rather than hidden**, because a missing action is
    indistinguishable from a bug. That only works because the disabled item keeps `tabIndex` and
    `aria-disabled` instead of the `disabled` attribute, which would take it out of the tab order
    and the reason with it, and because the bubble stays in the accessibility tree at all times so
    `aria-describedby` always resolves. Native `title` is not keyboard-reachable in any major
    browser, so this is a free swap for a pointer and a regression for everyone else.
  - `Toast` → `InfoBanner` turns transient into persistent, which needs both a slot and a
    dismissal story on five screens.
- **`BoardColumn` and `BoardCard` are the only drag-and-drop primitive in either system**, and
  production has no kanban at all — so they are designed rather than measured, and the
  pick-up/gap/drop visual language is the system's rather than one screen's. They stay
  presentational and drag-mechanical only: a column turns a pointer position into a **slot index**
  and hands it back, and what the slots mean, which columns exist, and what a drop writes all stay
  in the app.
- **One placeholder, and it travels.** A card dragged with a pointer is not rendered at all; the
  gap it would fill is a single card-sized placeholder that moves to wherever the drop would land.
  Its height is measured from the card at pick-up, so the gap is exactly the size of the thing
  going into it. The slot index counts **cards only** — the placeholder is never a slot — which is
  what keeps the arithmetic stable while the gap moves around under the pointer, and it means every
  index everywhere is an index into the column as it will be *without* the card in flight: the same
  list the server resolves neighbours against, with no rendered-versus-model conversion anywhere.
  [05's design spec](specs/hiring/05-board.design.md) originally paired a placeholder at the
  *source* with a 2px insertion line at the target; two grey marks for one card read as two cards
  in flight, and the line was too slight to say what size the gap would be. The spec's Interactions
  section records the revision and why.
- **A keyboard-held card stays where it is** and only the placeholder travels. Moving it would
  re-parent the element between columns, and a focused node moved to a new parent is blurred —
  which would take the arrow keys, `Escape` and the drop itself with it, one keystroke into the
  drag.
- **Two things about HTML5 drag that are not optional here.** The browser rasterizes the drag image
  at the end of the `dragstart` handler, and React flushes a discrete event's state update before
  that handler returns — so the card is unmounted one frame *later*, via `requestAnimationFrame`,
  or the pointer drags a blank. And because the source element is gone for the length of the drag,
  `dragend` is delivered to a detached node that bubbles nowhere: a native `once` listener is
  attached to the node itself at pick-up, which is what ends a drag released over no column at all.
  Without it the gap stays on screen for good and the next drag begins on a board still holding the
  last one. Both have regression tests that fail without them.
- **`BoardCard` is the one `role="button"` that does not activate on `Space`**: `Space` picks the
  card up and `Enter` opens it. A board whose cards activated on `Space` could not be dragged with
  a keyboard at all, and the drag is the screen's whole purpose. The hint that says so is rendered
  once by the board, not repeated on every card, and `prefers-reduced-motion` drops the lift while
  keeping the placeholder, which is what carries the information.
- **The cancelled badge is truncated to a first name** because a board card is a glance, so the
  whole fact rides in the badge's accessible name rather than in what is drawn. That has to be an
  `aria-label`: a native `title` on an element that already has text content is a *description*,
  and the text content still wins the name computation.
- **`PageTabs` is a real `tablist`.** Yellow's `Tabs` were anchors to `#`, which a screen reader
  announces as links that go nowhere, and it is a control that chooses which panel is shown rather
  than a set of destinations — so they are buttons, with `aria-selected`, `aria-controls`, roving
  focus, arrow-key movement and a `testId` per item. The count on the board's mobile tabs rides in
  the item's `label` node: a strip that grew a `count` prop would then need a badge, and an icon.
- **The scale editor is composed in the app, not added to the DS.** Its chips carry a drag handle
  and a remove control, and [04's design spec](specs/hiring/04-candidate-card.design.md) already
  records the rule that decides this: a `Badge` is a `<span>` with text, and a chip carrying
  controls is a screen concern rather than a token concern. The criterion chips on the candidate
  card are composed the same way, for the same reason. Reordering is operable by pointer and by
  keyboard against one list — `Space` picks a value up, arrows move it, `Space` drops it, each step
  announced — because this dialog opens mid-interview and a member with both hands on the keyboard
  should not have to find a mouse to put `B1` above `A2`.
- **`Calendar` is presentational by construction**: it is handed the weeks to draw, which dates may
  be chosen, and the bounds it may navigate between. Availability, the booking window and the time
  zone are business rules and stay on the page. It owns the grid semantics and the keyboard —
  arrows by day and by week, `Home`/`End`, `PageUp`/`PageDown`, and focus that only ever lands on a
  selectable date. Blue's `DateField` is a 140px text field holding a formatted date and is not a
  substitute; the grid is modelled on `react-datepicker`'s defaults, which is what production
  actually renders.
- The public booking page and the candidate card are the two screens with real breakpoints, and
  inline styles cannot express a media query, so their layout classes live in
  `apps/web/app/globals.css`. Every value there is still a token.
- **Still outstanding.** Promoting the template's `P` glyph dictionary to real icon exports —
  raised for the fourth time now, since My interviews borrows the `timesheets` clock. Blue's icon
  rules say how (geometric, filled, `currentColor`, 12–24px, no icon font), but hiring keeps its
  own glyphs: production's nav items and glyphs are content, not design language. The booking
  page's time-zone selector is still a plain `Select` and therefore a long unsearchable list;
  moving it onto `Select isSearchable` is the obvious next use of the control the libraries
  introduced.
