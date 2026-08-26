# Devscribed.Admin

Implementation of the specs in [`specs/`](specs/). User-management specs 01
([Organization Creation](specs/user-management/01-organization-creation.md)) and 02
([Authentication & Login](specs/user-management/02-authentication-login.md)) are complete.
The [hiring specs](specs/hiring/README.md) run from a vacancy through a booking to the card the
team takes notes on during the interview. Boards, the candidate database and the two libraries are
still to come. See [Hiring](#hiring) for the capability boundaries and the rules that are easy to
mistake for omissions.

## Stack

| Layer | Choice |
|---|---|
| API | NestJS 11, Prisma, PostgreSQL (Docker locally, Neon in production) |
| Web | Next.js 15 (App Router), React 19 |
| UI | Teammerly Meridian (`1_DS for dev/`), imported through `@ds` — no hardcoded colors or sizes |
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
                      …/hiring/applications/{id}/cv, and the public /api/book/{slug}
apps/web/             Next.js: /signup, /login, /org/{orgId}/members,
                      /org/{orgId}/hiring/vacancies,
                      /org/{orgId}/hiring/candidates/{id}, and the public /book/{slug}
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
npm run test:unit   # validation rules — TC-01-UNIT-*, TC-H01/H02/H04-UNIT-*
npm run test:int    # API endpoints — TC-01-INT-*, TC-H00/H01/H02/H04-INT-*, needs Postgres running
npm run test:e2e    # browser flows — TC-01-E2E-*, TC-H01/H02/H04-E2E-*
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
`/org/{orgId}/hiring/candidates/{candidateId}?application={applicationId}`, and from this release
that link works: it opens the card with that application's section expanded, signing the visitor in
first when they arrive without a session and returning them to it afterwards. Until the candidate
database lands, the invite is the only route to a card that the product hands anyone — which is why
the E2E suite reads the link out of `GET /api/test/calendar/latest` rather than assembling it, the
same way it reads a reset link out of the mail sink. Both endpoints answer only behind their
stand-in implementation and never in production.

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
narrowed view of hiring, is `InterviewerScopeGuard` in its own phase.

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

`/book/{slug}` is the product's only public route. The slug carries 72 bits of entropy, which is
why it needs no organization segment, and it is frozen at creation so a link already sent keeps
working. There is **no rate limiting on the booking POST** — see
[02 §11](specs/hiring/02-booking-page.md), which records the exposure that leaves open rather
than implying the endpoint is protected.

## Design-system notes

- Components come from `1_DS for dev/index.js` via the `@ds` alias
  (`experimental.externalDir`), re-exported through `apps/web/src/ds.ts` — a single
  `'use client'` boundary, since the DS uses hooks and ships no directives.
- `Input` has no way to tag its error message node, so the app passes the message as a
  node carrying `field-error-{fieldName}`. A first-class `errorId` prop belongs in the
  DS; see the "DS gaps" table in the design spec.
- Hiring closed several gaps the design specs had already recorded, in the design system
  rather than in the screens: `BookingLayout`, `Textarea`, `FileInput`, `Toast`,
  `Skeleton`, `Calendar`, `Menu`, `Tooltip`, `BoardColumn`, `BoardCard` and `Combobox`
  are new components; `Textarea` gained a
  `trailing` slot in its label row — where `Input`'s sits inside the field, which a
  multi-line field has no unambiguous place for — so the candidate card's saved-at
  indicator can appear and change without moving the field below it, and a real
  `<label for>`, since the micro-label was previously only sitting above the field
  rather than naming it; `Button` gained `as="a"` for an action that is a navigation,
  because a CV download through an onClick would lose middle-click, copy-address and the
  browser's own download handling; `SelectOption` gained
  `disabled`, `hint` and `testId` so an ineligible interviewer can be shown-but-disabled
  with its reason;
  `Select`'s popover now scrolls, because a time-zone picker is hundreds of rows and
  would otherwise run off the viewport; `Table` gained `rowHref`/`rowTestId`; `Toggle`
  and `Modal` now forward unknown props, matching `Card` and `AuthLayout`. `Button`'s
  disabled state drops to a sunken field with faint ink instead of fading the violet fill
  — a 55%-opacity primary still reads as the primary action, which is the one thing a
  disabled CTA must not do.
- `Combobox` is `Select` with the four things a library-backed field needs and `Select` has
  none of: typing, filtering, multi-select, and a `Create "…"` row for what is missing.
  Its filter folds case deliberately — an option that already exists must never hide
  behind a create row over a difference in capitalisation, because creating it is exactly
  what the API will refuse. Like `Calendar` it is presentational: it never writes
  anything. `onCreate` hands the typed name back and the caller decides what that means,
  which is what lets the vacancy dialog hold a pending category and create it in the same
  submit as the vacancy — so cancelling the dialog leaves no orphan behind. Spec 03's
  filters and spec 04's criteria autocomplete are its next two callers.
- `Calendar` is presentational by construction: it is handed the weeks to draw, which
  dates may be chosen, and the bounds it may navigate between. Availability, the booking
  window and the time zone are business rules and stay on the page. It owns the grid
  semantics and the keyboard — arrows by day and by week, `Home`/`End`, `PageUp`/
  `PageDown`, and focus that only ever lands on a selectable date.
- The public booking page and the candidate card are the two screens with real
  breakpoints, and inline styles cannot express a media query, so their layout classes
  live in `apps/web/app/globals.css`. Every value there is still a token.
- `Menu` and `Tooltip` are a pair. A blocked action — Delete on a vacancy that has
  candidates, and the last-admin guard when spec 04 lands — is **disabled rather than
  hidden**, because a missing action is indistinguishable from a bug. That only works if
  the reason is reachable, so a disabled item keeps `tabIndex` and `aria-disabled`
  instead of the `disabled` attribute, which would take it out of the tab order and the
  reason with it. The `Tooltip` bubble stays in the accessibility tree at all times and
  only changes visibility, so `aria-describedby` always resolves.
- `BoardColumn` and `BoardCard` are Meridian's only drag-and-drop primitive, and the
  pick-up/gap/drop visual language is now the system's rather than one screen's, so a
  second board would not invent its own. They are presentational and drag-mechanical only:
  a column turns a pointer position into a **slot index** and hands it back, and what the
  slots mean, which columns exist, and what a drop writes all stay in the app.
- **One placeholder, and it travels.** A card dragged with a pointer is not rendered at
  all; the gap it would fill is a single card-sized placeholder that moves to wherever the
  drop would land. Its height is measured from the card at pick-up, so the gap is exactly
  the size of the thing going into it. The slot index counts **cards only** — the
  placeholder is never a slot — which is what keeps the arithmetic stable while the gap
  moves around under the pointer, and it means every index everywhere is an index into the
  column as it will be *without* the card in flight: the same list the server resolves
  neighbours against, with no rendered-versus-model conversion anywhere.
  [05's design spec](specs/hiring/05-board.design.md) originally paired a placeholder at
  the *source* with a 2px insertion line at the target; two grey marks for one card read
  as two cards in flight, and the line was too slight to say what size the gap would be.
  The spec's Interactions section records the revision and why.
- **A keyboard-held card stays where it is** and only the placeholder travels. Moving it
  would re-parent the element between columns, and a focused node moved to a new parent is
  blurred — which would take the arrow keys, `Escape` and the drop itself with it, one
  keystroke into the drag.
- **Two things about HTML5 drag that are not optional here.** The browser rasterizes the
  drag image at the end of the `dragstart` handler, and React flushes a discrete event's
  state update before that handler returns — so the card is unmounted one frame *later*,
  via `requestAnimationFrame`, or the pointer drags a blank. And because the source element
  is gone for the length of the drag, `dragend` is delivered to a detached node that bubbles
  nowhere: a native `once` listener is attached to the node itself at pick-up, which is what
  ends a drag released over no column at all. Without it the gap stays on screen for good
  and the next drag begins on a board still holding the last one. Both have regression tests
  that fail without them.
- `BoardCard` is the one `role="button"` in Meridian that does **not** activate on `Space`:
  `Space` picks the card up and `Enter` opens it. A board whose cards activated on `Space`
  could not be dragged with a keyboard at all, and the drag is the screen's whole purpose.
  The hint that says so is rendered once by the board, not repeated on every card, and
  `prefers-reduced-motion` drops the lift while keeping the placeholder, which is what
  carries the information.
- `Tabs` became a real `tablist`. Its tabs were anchors to `#`, which a screen reader
  announces as links that go nowhere, and it is a control that chooses which panel is shown
  rather than a set of destinations — so they are buttons now, with `aria-selected`,
  `aria-controls`, roving focus and arrow-key movement, plus a `testId` per item. The count
  on the board's mobile tabs rides in the item's `label` node: a strip that grew a `count`
  prop would then need a badge, and an icon.
- Still outstanding for later hiring phases: `Combobox`, and promoting the template's `P`
  glyph dictionary to real icon exports. `Combobox` is the reason the time-zone selector
  is a long unsearchable list: the whole IANA set is offered, because a shortlist would
  strand anyone whose zone it left out.
