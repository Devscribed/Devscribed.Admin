# Cookies and storage — verification and cases

Cases for [01-cookie-consent.md](01-cookie-consent.md). Contracts, ids and screens are in
[01-cookie-consent.contracts.md](01-cookie-consent.contracts.md).

## DS gaps

The mock declares no custom property and writes no colour the design system does not name, so
every gap below is a **behaviour** or a **measurement** the system has no name for, not a value
improvised on this screen.

| Gap | Impact | What closes it |
|---|---|---|
| `Modal` has no dismissal-free mode. It always draws a close control, always closes on `Escape` and always closes on a scrim click | A consent gate built on it can be left without an answer, which is the one thing REQ-01-007 forbids. Building a second dialog shell instead would be the copy `decisions.md` §40 exists to prevent | A `dismissible` prop on `Modal`, defaulting to today's behaviour, that withdraws the three exits together and drops the close control — and leaves the focus trap, the labelling and the returned focus untouched, because §8 states those go together |
| `Modal` sizes itself at `maxWidth: 70%` with a 360px floor, so its width is the viewport's | 70% of a wide viewport is a line of prose nobody can read. The dialog takes a literal 520px | A width the caller can state, or a named token for a reading measure. Until then the literal is recorded here and in `## Geometry & motion` |
| The system names no width for a status cell beside a label | `consent-functional-state` reserves a literal 92px so the four strings it can hold do not move the label beside them | A token for a reserved status slot, which the calendar's own fixed-width label would also use |
| The system has no link-styled control | `consent-settings-link` is a `<button>` — it opens a dialog and is not a navigation — painted with `--text-link` and an underline, which no component in `packages/ds/src/components` does today | A `TextLink` in the core family, taking the `--text-link` token and the underline offset, so the next screen that needs one does not paint it again |

## Behaviour Walkthrough

| Decision | What was decided | Decided by | Where it lives |
|---|---|---|---|
| Which surfaces are asked at all | The nine public ones. A member inside the application is never asked | human | REQ-01-004, REQ-01-005, Actors & Preconditions |
| What the dialog offers | Accept and Reject non-essential, of equal prominence, blocking the page until one is chosen | human | REQ-01-006, REQ-01-007 |
| Which storage categories exist | Necessary and Functional, and no third | human | Data Model, the functional registry |
| Whether a category is invented for analytics that do not exist | No. A switch that controls nothing is a control that lies | human | Out of Scope |
| What happens to the `fonts.googleapis.com` request | The line is deleted and the typeface is served by the application. Asked and answered on the belief the request was live; reconnaissance then showed it inert, and the answer did not change — a stylesheet naming a third party makes the dialog's promise unauditable either way | human | REQ-01-024, REQ-01-025, External Contracts |
| Where the decision is recorded and for how long | A first-party cookie on the device, twelve months, per browser profile | human | REQ-01-012, REQ-01-013, Data Model |
| What happens to preferences already stored when somebody rejects | Cleared the moment Reject is clicked; new writes stop | human | REQ-01-017, Edge case 6 |
| How a person changes their mind | A footer row carrying one link, on every public surface, reopening the dialog | human | REQ-01-020, REQ-01-021 |
| Whether the modal links to a cookie policy page | No page. The dialog says what is stored, in the dialog | human | Out of Scope |
| What `none` — never asked — permits | Reads and writes both. Treating "never asked" as a refusal would break preferences for every member, to honour a refusal nobody made | agent | REQ-01-016 |
| Whether a rejection reaches the application's screens | Yes. A rejection recorded on this device blocks a functional write anywhere in the product | agent | REQ-01-016, Edge case 8 |
| Whether accepting after rejecting brings values back | No. A cleared value is gone; the person sets it again if they want it | agent | REQ-01-018 |
| Whether a functional control is withdrawn under a rejection | No. The format toggle still changes the times for the visit and simply is not remembered | agent | REQ-01-019, Edge case 6 |
| Whether the reopened dialog can be dismissed | Yes, and dismissal changes nothing. An answer is already on file | agent | REQ-01-022 |
| How the current decision is shown | In prose and in the category row, never by changing a control's label | agent | REQ-01-023, Geometry & motion |
| Whether the page behind the gate is hidden | No. The control being asked about is on that page | agent | REQ-01-009 |
| Whether the decision is stamped before paint | Yes, by the mechanism `ViewportStamp` already uses | agent | REQ-01-001 |
| Where the grammar lives so it can be unit-tested | `packages/validation`, which is the only place unit tests run. The browser-touching half stays in the web app and is covered by E2E | agent | Verification Plan |
| The third-party signing frame | Out of scope, named rather than governed | agent | Known Gaps |

## Verification Plan

Walked before the cases below were written, on a worktree with no `node_modules` and no
`apps/api/.env` — which is why the first two rows are here.

**Bringing it up**

| Step | Command | Observed |
|---|---|---|
| Install | `npm install` from the repository root | Exit 0. `prisma generate` ran from `apps/api` through its `postinstall` |
| The API's environment | `cp apps/api/.env.example apps/api/.env` | **Not enough.** The API refused at boot with `P1000: Authentication failed against database server` — the example's database credentials are placeholders. Replaced with the working checkout's own untracked `.env`, which is the file every fresh clone has to supply |
| The shared package | `npx tsc -p packages/validation/tsconfig.json` | Required before the API will start in a fresh tree. Without it the API dies with `Cannot find module '@devscribed/validation/dist/index.js'` and Playwright reports only `Timed out waiting 120000ms from config.webServer`, which names neither cause |
| The pair | `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/<file> --workers=1` from `e2e` | Both servers started, against the E2E database rather than the development one; 32 migrations already applied. First run compiled `/book/[slug]` in 13.4s, later runs in about 1s |
| A production build, for the stylesheet claim | `npm run build --workspace @devscribed/web` | Exit 0. Emitted two stylesheets under `apps/web/.next/static/css` |

**Reaching the states the cases need**

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| A public surface with no session and no seeding | `page.goto('/login')` | yes | Proven — rendered, `document.cookie` empty |
| A public booking page with real availability, no session | `registerOrganization` then `createVacancy` from `e2e/tests/helpers.ts`, then `/book/{publicSlug}`, awaiting `booking-page` and then `calendar-control` | yes | Proven. **Awaiting `booking-page` alone is not enough** — the format toggle is not mounted until availability has loaded, and a probe that skipped `calendar-control` found the control absent |
| A functional key already on the device | Click `booking-timeformat-toggle` on that page | yes | Proven — `localStorage` went from empty to `teammerly.booking.timeFormat = "24h"` |
| A device that already holds a consent decision | `context.addCookies` with `ds_consent`, before the first navigation | yes | Proven — the page read back `ds_consent=1.accepted.1700000000` |
| A browser that refuses `localStorage` | `page.addInitScript` redefining `window.localStorage` with throwing accessors | yes | Proven — the accessor threw and the login screen still rendered its form |
| An application screen with a session | `signIn` from `e2e/tests/helpers.ts` | yes | Proven — landed on `/org/{orgId}/members`; the root element carried `data-bp` and no `data-consent` |
| The stylesheets a page actually loaded | `document.styleSheets` from the page, reading `CSSImportRule` entries | yes | Proven — one same-origin sheet plus inline ones, and the CSSOM reported **no** `@import` rule at all |
| The signing page's response headers | `page.goto('/sign/<token>')` and read the response's headers | yes | Proven — answered `200` and carried a `Content-Security-Policy` naming `https://fonts.googleapis.com` in `style-src` and `https://fonts.gstatic.com` in `font-src` |
| A pure grammar function under a unit runner | `packages/validation`, where `npm run test:unit` runs | yes | Proven by inspection: the workspace holds the only unit suite in the repository, and the web app imports `@devscribed/validation` already |

**How a customer reaches each state.** Every one of them is reached by a person doing the
ordinary thing: a candidate opens a booking link, uses the format toggle, and answers the
dialog. Nothing here is reachable only by seeded data, and this spec adds no fixture.

**Access this needs**

| What | Name | Where the value lives | How the next agent gets it | Proven against |
|---|---|---|---|---|
| The API's database credentials | `DATABASE_URL`, `DIRECT_URL` | untracked `apps/api/.env` | Copy the working checkout's file; `apps/api/.env.example` carries placeholders that do not authenticate | The E2E pair, which started and migrated |

No third-party key, token, bot or MCP server is needed. Nothing this spec verifies leaves the
machine, which is the same fact the dialog tells a visitor.

**Rehearsal**

Two throwaway Playwright specs were written into `e2e/tests`, run on the pair above, and
deleted. The first — the booking page, its storage and its outbound requests — passed two cases
in 22.8s. The second — a pre-set cookie, a throwing `localStorage`, the CSSOM's stylesheet list,
the signing page's headers and a signed-in application screen — passed five cases in 20.7s. Both
files are gone; `git status` on `e2e/` reports no change.

The rehearsal corrected two things before a case was written: the format toggle's id is
`booking-timeformat-toggle` and not the `booking-time-format-toggle` a reasonable guess produces,
and the toggle is absent until availability has loaded.

## Test Cases

### TC-01-UNIT-01

- **Level:** Unit
- **Covers:** REQ-01-002, REQ-01-003
- **Steps:** Call the grammar's parser with, in turn: `1.accepted.1700000000`;
  `1.rejected.1700000000`; the empty string; `2.accepted.1700000000`; `1.accepted.`;
  `1.maybe.1700000000`; `1.accepted.abc`; `1.accepted.1700000000.extra`.
- **Expected Result:** The first two parse to `accepted` and `rejected`, each carrying the
  recorded second as a number. Every other input returns `none`.

### TC-01-UNIT-02

- **Level:** Unit
- **Covers:** REQ-01-010, REQ-01-011
- **Steps:** Call the formatter for `accepted` and for `rejected`, passing a fixed number of
  seconds. Parse each result back.
- **Expected Result:** Each output matches the grammar with version `1`, and parsing it returns
  the decision and the seconds that went in. No clock is read: the moment is an argument.

### TC-01-UNIT-03

- **Level:** Unit
- **Covers:** REQ-01-016
- **Steps:** Call the permission function for each of the six pairs in REQ-01-016's decision
  table — `none`, `accepted` and `rejected`, each with `read` and with `write`.
- **Expected Result:** Every pair except `rejected`/`read` and `rejected`/`write` permits. Those
  two refuse, and refusing is the function returning `false` rather than throwing.

### TC-01-UNIT-04

- **Level:** Unit
- **Covers:** REQ-01-017
- **Steps:** Read the functional registry.
- **Expected Result:** It holds exactly the two keys the contracts file classifies as functional.
  Neither `sessionStorage` hand-off appears in it, and `ds_session` does not appear in it.

### TC-01-E2E-01

- **Level:** E2E
- **Covers:** REQ-01-004, REQ-01-009
- **Steps:** With a fresh context and no cookies, open `/login`.
- **Expected Result:** `consent-dialog` is present exactly once. `consent-close` is absent.
  The login form beneath the scrim is still in the document and still has a non-zero bounding
  box — the page is covered, not unmounted.
- **Selectors:** `consent-dialog`, `consent-scrim`, `consent-close` (absent),
  `consent-settings-link`.
- **Fails today:** none of these ids exists, so the first assertion times out.

### TC-01-E2E-02

- **Level:** E2E
- **Covers:** REQ-01-007, REQ-01-008
- **Steps:** With a fresh context, open `/login`. Read which element holds focus. Press
  `Escape`. Click `consent-scrim` at a point outside the dialog's box. Press `Tab` eight times,
  reading the focused element after each.
- **Expected Result:** Focus is inside `consent-dialog` on arrival and after every `Tab`.
  `consent-dialog` is still present after `Escape` and after the scrim click, and no
  `consent-close` exists to click.
- **Selectors:** `consent-dialog`, `consent-scrim`, `consent-accept`, `consent-reject`,
  `consent-close` (absent).

### TC-01-E2E-03

- **Level:** E2E
- **Covers:** REQ-01-006, REQ-01-023
- **Steps:** With a fresh context, open `/login` and record the bounding boxes of
  `consent-accept` and `consent-reject`, and of `consent-functional-state`. Accept. Reopen the
  dialog from `consent-settings-link` and record the same three boxes. Repeat the whole
  sequence at a viewport narrower than the `sm` rung.
- **Expected Result:** At each width, the two controls have the same width to the pixel and the
  same height, and their labels are the same two strings in both states. `consent-functional-state`
  has the same width in both states, though its text differs between them.
- **Selectors:** `consent-accept`, `consent-reject`, `consent-functional-state`,
  `consent-settings-link`, `consent-dialog`.

### TC-01-E2E-04

- **Level:** E2E
- **Covers:** REQ-01-010, REQ-01-012, REQ-01-013, REQ-01-014, REQ-01-015
- **Steps:** With a fresh context, open `/login` and click `consent-accept`. Read the context's
  cookies. Reload the page.
- **Expected Result:** `consent-dialog` is absent immediately after the click, with no
  navigation. A cookie named `ds_consent` is present with path `/`, `sameSite` `Lax`, and an
  expiry between 360 and 370 days after the run's own now — asserted as a span from the moment
  the test read the clock, never as a date. Over the suite's `http` origin it carries no
  `Secure` flag. After the reload `consent-dialog` is still absent.
- **Selectors:** `consent-accept`, `consent-dialog` (absent after the click).

### TC-01-E2E-05

- **Level:** E2E
- **Covers:** REQ-01-011, REQ-01-017, REQ-01-019
- **Steps:** Register an organization and create a vacancy. Open `/book/{publicSlug}`, wait for
  `booking-page` and then `calendar-control`. Answer the dialog with `consent-accept`. Click
  `booking-timeformat-toggle` and read `localStorage`. Reopen the dialog from
  `consent-settings-link` and click `consent-reject`. Read `localStorage` again. Click
  `booking-timeformat-toggle` once more, read the slot labels, then read `localStorage` a third
  time. Reload and read the slot labels again.
- **Expected Result:** After the first toggle, `teammerly.booking.timeFormat` is present. The
  moment `consent-reject` is clicked it is gone. The second toggle changes the slot labels
  between a 24-hour and a 12-hour reading, and writes nothing — the key is still absent. After
  the reload the labels are back to the 24-hour default.
- **Selectors:** `consent-settings-link`, `consent-reject`, `booking-timeformat-toggle`.

### TC-01-E2E-06

- **Level:** E2E
- **Covers:** REQ-01-020, REQ-01-021, REQ-01-022
- **Steps:** With a fresh context, open `/login` and accept. Click `consent-settings-link`.
  Read `consent-current` and `consent-functional-state`. Press `Escape`. Reopen, and this time
  click `consent-close`. Read the context's cookies after each dismissal.
- **Expected Result:** `consent-settings-link` is present on the page with no dialog over it.
  The reopened `consent-dialog` carries `consent-close` and one `consent-current` naming the
  decision in force, and `consent-functional-state` reads as on. Both `Escape` and
  `consent-close` close the dialog, and after each the `ds_consent` cookie holds the same value
  it held before.
- **Selectors:** `consent-settings-link`, `consent-dialog`, `consent-close`, `consent-current`,
  `consent-functional-state`.

### TC-01-E2E-07

- **Level:** E2E
- **Covers:** REQ-01-005
- **Steps:** Register an organization and sign in, landing on the members screen. Look for
  `consent-dialog` and `consent-settings-link`. Then, in the same context, open `/login` again.
- **Expected Result:** Neither id exists anywhere on the application screen. On `/login` the
  dialog is drawn, because that context recorded no decision — which is what proves the absence
  above was the surface and not the cookie.
- **Selectors:** `consent-dialog` (absent, then present), `consent-settings-link` (absent, then
  present).

### TC-01-E2E-08

- **Level:** E2E
- **Covers:** REQ-01-001
- **Steps:** Add a `ds_consent` cookie holding an accepted decision to a fresh context before
  any navigation. Open `/login` and read `data-consent` from the root element. In a second
  fresh context with no cookie, open `/login` and read it again.
- **Expected Result:** The first reads `accepted`, the second reads `none`. In the first, no
  `consent-dialog` is ever drawn — not for a frame — which the case asserts by reading the
  attribute before any network idle and finding the dialog absent throughout.
- **Selectors:** `consent-dialog` (absent in the first context).

### TC-01-E2E-09

- **Level:** E2E
- **Covers:** REQ-01-024, REQ-01-025
- **Steps:** Open `/login` and enumerate `document.styleSheets`, collecting every `href` and
  every `CSSImportRule` the CSSOM reports. Then request `/sign/{token}` for any token and read
  the response's `Content-Security-Policy`.
- **Expected Result:** Every stylesheet `href` is on the page's own origin and no
  `CSSImportRule` names another origin. The policy's `style-src` and `font-src` name only
  `'self'`, `'unsafe-inline'` and `data:`, and no `fonts.googleapis.com` or `fonts.gstatic.com`.
- **Selectors:** none — the assertions are on the document and on a response header.
- **Fails today:** the policy names both Google origins, measured on the pair.

### TC-01-E2E-10

- **Level:** E2E
- **Covers:** REQ-01-018
- **Steps:** Register an organization and create a vacancy. Open `/book/{publicSlug}`, wait for
  `calendar-control`, accept, and set the format toggle so a value is stored. Reopen the dialog
  and reject. Reopen it again and accept. Read `localStorage`.
- **Expected Result:** The functional key is absent after the rejection and still absent after
  the acceptance. Accepting grants permission to store again; it restores nothing.
- **Selectors:** `consent-settings-link`, `consent-accept`, `consent-reject`,
  `booking-timeformat-toggle`.

### TC-01-E2E-11

- **Level:** E2E
- **Covers:** REQ-01-011, REQ-01-017
- **Steps:** Before any navigation, redefine `window.localStorage` on the context so every
  accessor throws. Open `/login` and click `consent-reject`.
- **Expected Result:** The dialog closes, the `ds_consent` cookie is written, and no page error
  is raised — the registry clear swallows the failure the way `SlotPicker`'s own reader and
  writer already do.
- **Selectors:** `consent-reject`, `consent-dialog` (absent after the click).
