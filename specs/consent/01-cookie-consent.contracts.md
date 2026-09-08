# Cookies and storage — contracts

Contracts for [01-cookie-consent.md](01-cookie-consent.md). No API route is added and no entity
is created; what this spec has instead of a route is a cookie grammar and a closed registry of
keys, and both are below.

## Data Model

Nothing is written to the database. The two structures this spec introduces both live in the
browser.

### The consent cookie

| Field | Type | Description |
|---|---|---|
| name | `ds_consent` | First-party. Deliberately **not** `httpOnly`: the pre-paint stamp of REQ-01-001 reads it from the document, and a cookie the page cannot read cannot be read before paint |
| value | `1.accepted.<epochSeconds>` or `1.rejected.<epochSeconds>` | Three dot-separated parts: a grammar version, the decision, and the second the decision was recorded. Anything else is `none` by REQ-01-002 |
| Path | `/` | REQ-01-013 |
| SameSite | `Lax` | REQ-01-013 |
| Secure | present over `https`, absent over `http` | REQ-01-014, and the reason it is conditional is there |
| Max-Age | `31536000` | 365 days, REQ-01-012 |
| httpOnly | absent | The session cookie `ds_session` is `httpOnly` and stays so; this one cannot be |

The value's third part exists for one reason: REQ-01-021 draws the moment the decision was
recorded, and a cookie carries no readable creation time of its own.

### The functional registry

The closed list of browser keys the decision governs. A key not on this list is not functional,
and REQ-01-017 clears exactly these.

| Key | Written by | Classification | Why |
|---|---|---|---|
| `teammerly.booking.timeFormat` | `apps/web/src/hiring/SlotPicker.tsx`, through its exported reader and writer | functional | A display preference on a public surface. The only functional key a candidate's device ever receives |
| `teammerly.hiring.candidateScope` | `apps/web/src/hiring/candidate-list.ts` | functional | A list preference inside the application. Never written on a public surface, and governed only so a rejection recorded on this device is honoured everywhere |
| the candidate-deleted name | `apps/web/src/hiring/candidate-deleted.ts` | necessary | `sessionStorage`, carrying one value across one navigation and removed on read. Storage strictly necessary for a flow the person asked for is consent-exempt, and clearing it would break the redirect it exists for |
| the candidate-origin record | `apps/web/src/hiring/candidate-origin.ts` | necessary | `sessionStorage`, same shape and same reason |
| `ds_session` | `apps/api/src/auth/session.service.ts` | necessary | The sign-in cookie. `httpOnly`, so no client module could clear it even if the classification were different |

**Both writers already funnel through one function each** — `SlotPicker` exports its reader and
its writer, and `candidate-list` has a single setter — which is why this rule costs two call
sites rather than a search of the app.

## Validation Rules

| # | Field | Constraint | Message | Server-only |
|---|---|---|---|---|
| 1 | consent cookie value | Matches `1.(accepted\|rejected).<digits>` exactly | — read as `none`, nothing is shown | no |
| 2 | consent cookie value | The version part is `1` | — a future version is read as `none`, so an older build never acts on a grammar it does not know | no |
| 3 | recorded-at | Digits only, interpreted as seconds since the epoch | — a value that is not digits makes the whole cookie `none` | no |

There is no server validation, because the value never reaches the server as anything the server
reads. The API's `SessionGuard` reads `ds_session` and no other cookie, so `ds_consent` travels on
every request and is ignored by all of them.

## Required data-testid Attributes

| id | Screen | Asserted |
|---|---|---|
| `consent-dialog` | every public surface | present while a decision is missing or the dialog was reopened; absent otherwise |
| `consent-scrim` | every public surface | present with the dialog; clicked to prove it does not close the gate |
| `consent-accept` | the consent dialog | present |
| `consent-reject` | the consent dialog | present |
| `consent-close` | the consent dialog | absent while the decision is missing; present once a decision is recorded |
| `consent-current` | the consent dialog | absent while the decision is missing; present once a decision is recorded |
| `consent-functional-state` | the consent dialog | present |
| `consent-settings-link` | every public surface | present |
| `booking-timeformat-toggle` | the booking page | present. **Not new** — it is the shipped control on `/book/{slug}`, and it is here because two cases drive it to prove that a rejection stops it storing |

## Screens

The mock is [01-cookie-consent.mock.html](01-cookie-consent.mock.html), four states, drawn over
the booking page because the control the dialog asks about is on that page.

**The question this screen asks.** *What has this device already decided about storage?* Its
values are one: the consent cookie. Nothing else changes the answer — not the route, not the
session, not the role — which is why there is one question here and not one per surface.

The screen asks nothing of the server. There is no request in flight at any point, so there is no
loading state and no failure state, and the table below says so rather than leaving the rows out.

| Surface | Behaviour |
|---|---|
| Loading | None. The decision is read from the cookie by a synchronous script before paint, so the first frame already knows the answer and no state precedes it |
| Answered, decision missing | The dialog over the page, no close control, the page's content rendered beneath the scrim |
| Answered, decision recorded | No dialog. The footer control is the only trace |
| Reopened | The dialog with a close control and a line naming the decision in force, over a page that keeps answering the same question |
| Empty | Unreachable. A cookie is present or it is not, and its absence is the missing-decision state above rather than an empty one |
| Refused | None. Nothing here is authorized, so nothing here can be refused |
| Failed | None. Writing a cookie can fail only where the browser refuses storage entirely, and there the decision is `none` on the next load and the person is asked again — which is the missing-decision state, not a new one |
| Permission-limited | None. Every actor in the matrix is offered the same two answers |

**What the screen borrows**

| Borrowed | What it demands of the caller | How this spec meets it |
|---|---|---|
| `Modal` (`decisions.md` §8) | A real dialog: `role="dialog"`, `aria-modal`, a labelled title, `Escape` to close, a focus trap, focus returned to the opener, and a named close button. §8 states the four rules **go together** — a panel that only closes by click is one a keyboard user cannot leave | The trap, the labelling and the returned focus are taken unchanged. The three exits are withdrawn **only for the missing-decision state**, where there is nothing to return focus to and no page behind to leave to. This is the DS gap in the cases file, and it is why the dismissal-free mode is a mode of `Modal` rather than a second dialog shell |
| `Modal`'s sheet form (`decisions.md` §51, `packages/ds/src/base.css`) | Below the `sm` rung the panel becomes a bottom sheet with a sticky actions row, decided by a media query and not by a prop | Taken as it is. The two equal-width controls are what the sticky row already stretches, so the sheet needs nothing from this spec |
| The pre-paint stamp (`apps/web/src/layout/ViewportStamp.tsx`) | A synchronous first child of `<body>`, writing attributes on the root element before anything below is parsed. The application's CSP permits an inline script, and on `/sign/:path*` — the one route with a policy — `script-src` carries `'unsafe-inline'` | A second attribute, `data-consent`, written by the same mechanism in the same place |
| The scrim token `--color-overlay-scrim` | Nothing; it is a colour | Used unchanged, so the gate's scrim is the product's scrim |
| The nine public surfaces | Each renders its own layout. `AuthLayout` already owns a `footer` slot, and that slot carries the cross-account link — "Don't have an account?" — on every signed-out screen | The cookie settings control is **not** put in that slot. It is a page-level row beneath the layout, so the two never compete for one place and the cross-account link keeps the position a visitor has learned |

**A screen this spec changes and does not draw.** `/sign/{token}` and `/manage/{slug}/{token}`
receive the same dialog and the same footer row and are not in the mock. The risk that leaves
open is the signing page's own layout: it is the one public surface that can render a
full-height third-party frame, and a footer row beneath it may sit below the fold on a short
viewport. What holds is that the control is reachable by scrolling and by keyboard on every
surface; what is not proven is that it is *visible* without scrolling on that one.

## Geometry & motion

| Element | What varies | What holds it | What moves if it does not |
|---|---|---|---|
| `consent-accept` and `consent-reject` | two labels of very different length — "Accept" against "Reject non-essential" — and a translated pair later | the two controls share the actions row with `flex: 1 1 0`, so each is exactly half of it and neither is sized by its own text | the whole actions row: the longer label pushes the shorter control sideways, and the accept control lands somewhere different on the reopened dialog than on the first-visit one |
| `consent-functional-state` | four strings across the states — "Always on", "Your choice", "On", "Off" | a slot of a fixed 92px with the text right-aligned and wrapping suppressed; a literal because the design system names no width token for a status cell, and it is recorded as a DS gap | the category name beside it, which starts at a different x in each state, so the two rows of the dialog fail to line up with each other |
| `consent-current` | present only once a decision is recorded, and two strings within that | the dialog's height is content-decided and is allowed to be — it is the outermost box, so nothing sits beside or below it to be moved | nothing on the page: the dialog is `position: fixed` and centred, so a taller panel grows about its own centre |
| `consent-dialog` | nothing. Its width is a fixed 520px, not `Modal`'s `maxWidth: 70%` | a literal, recorded as a DS gap; 70% of a wide viewport is a line of prose too long to read | the readability of every sentence in the dialog, which is the only thing in it |
| the page beneath the scrim | everything, on nine different surfaces | the dialog is `position: fixed` with the scrim `inset: 0`, so it is out of every surface's flow and contributes to no ancestor's scroll height | any surface that scrolls would gain scrollable height it never had, and the gate would be reachable by scrolling past the page |
| `consent-settings-link` | one label today | a row of its own beneath the content, centred, with nothing beside it | nothing today; the row exists so that a second link later does not have to move this one |

Motion: the dialog appears without a transition. There is no previous state for it to have
arrived from, and a gate that animates in is a gate a fast reader clicks through before it
settles.

## Edge Cases

| # | Situation | Exact behaviour |
|---|---|---|
| 1 | The cookie holds `2.accepted.1700000000` — a grammar version this build does not know | Read as `none` by REQ-01-002. The gate is drawn and the person is asked again |
| 2 | The cookie holds `1.accepted.` with no timestamp | Read as `none`. The whole value must match; a partial match is not a decision |
| 3 | The cookie holds `1.maybe.1700000000` | Read as `none`. `accepted` and `rejected` are the only decisions the grammar admits |
| 4 | The browser refuses cookies entirely | The write throws or is discarded, the gate closes for this document by REQ-01-015, and the next load reads `none` and asks again. The person is never blocked from the page they came for |
| 5 | The browser refuses `localStorage` — a private window with storage disabled | The registry clear is wrapped and swallows the failure, exactly as `SlotPicker`'s existing reader and writer already do. The decision is still recorded |
| 6 | A person rejects, then uses the format toggle, then reloads | The toggle changed the times for that visit by REQ-01-019, nothing was stored by REQ-01-016, and the reload shows the 24-hour default |
| 7 | A person accepts on the booking page, then opens the signing page in the same browser | No dialog. One cookie, path `/`, so the decision is the site's, not the page's |
| 8 | A person rejects on a public surface, then signs in and opens the candidates list | The scope preference is not written and not read, by REQ-01-016. The list opens on its default scope every time, and no dialog is drawn inside the application |
| 9 | A member who has never seen the dialog opens the candidates list | The scope preference works exactly as it does today. `none` permits, by REQ-01-016 |
| 10 | Two tabs are open on public surfaces and the person accepts in one | The other tab keeps drawing its gate until it is reloaded. The cookie is written, so the answer in the second tab writes the same value again and nothing is lost |
| 11 | The consent cookie is present but the session cookie has expired | Unrelated. The consent decision says nothing about authentication and the sign-in flow is untouched |
| 12 | A person clicks the accept control twice before the dialog closes | The second write sets the same decision and a fresh twelve months. The operation is idempotent by construction: the value is computed from the decision, not accumulated |
| 13 | The reopened dialog is dismissed with `Escape` | The recorded decision is unchanged, by REQ-01-022. Dismissing is not an answer, and there is already an answer |
| 14 | A signing page renders an external provider's frame | The dialog is still drawn and still says what *this* product stores. The frame's own storage is named in Known Gaps and is not claimed to be governed |
| 15 | A person's cookie was written 366 days ago | The browser has already dropped it. The decision is `none` and the gate is drawn, which is the twelve-month re-ask working rather than an edge case being handled |

## Security

- **The consent cookie carries no identifier.** Its value is a decision and a timestamp. It
  cannot single out a device beyond the fact that the device answered, which is the minimum a
  record of consent can be.
- **It is not `httpOnly`, and that is a deliberate, bounded weakening.** Script on the page can
  read and write it. What that buys an attacker is the ability to change a storage preference;
  what it cannot touch is `ds_session`, which stays `httpOnly` and is what any real attack wants.
- **It is never read by the server.** `SessionGuard` reads `ds_session` and nothing else, so no
  authorization decision anywhere depends on a cookie the client can write.
- **`SameSite=Lax`** keeps it off cross-site subrequests, so another origin cannot cause it to be
  sent and cannot learn the decision from a timing difference.
- **Nothing about the decision is attributable.** No row, no route, no log line. A person who
  rejects leaves no record on our side that they were ever asked, which is the correct trade for
  a consent record whose only enforcement point is the device it is stored on.
- **Deleting the font origins narrows the signing page's policy.** `style-src` and `font-src` on
  `/sign/:path*` each lose one external origin, so the one page with a policy stops permitting
  two hosts it does not use.

## External Contracts

The product contacts one system it does not own, and the claim that it contacts a second turned
out to be false. Both are recorded.

**Observations**

| Claim | How established | Ran against | State the probe was in | Observed / Assumed |
|---|---|---|---|---|
| The design system's stylesheet contains an `@import` of `fonts.googleapis.com` | Read `packages/ds/src/tokens/fonts.css` and `packages/ds/src/styles.css`, which imports it | the working tree | source, unbuilt | Observed |
| That `@import` survives into the shipped stylesheet | `npm run build --workspace @devscribed/web`, then searched the emitted CSS under `apps/web/.next/static/css` | the production build | built, not served | Observed |
| **The browser never fetches it** | Read the emitted stylesheet's byte offsets: the `@import` sits about 10kB into the file, after the `@font-face` blocks `next/font` emits ahead of it. A CSS `@import` that does not precede every other rule is ignored | the production build | built, not served | Observed |
| No request leaves the application's own origin on `/book/{slug}` | A Playwright probe recorded every request whose URL did not start with the local origin | the E2E pair | a published vacancy, no session, availability loaded | Observed |
| No request leaves the application's own origin on `/login` | The same probe, waiting for the network to fall idle | the E2E pair | signed out | Observed |
| `next/font` self-hosts both families, so the typeface does not depend on the `@import` | `apps/web/app/globals.css` repoints `--font-family-base` at the two `next/font` variables, which PATCH-027 introduced; the emitted CSS carries `@font-face` rules with local `/_next/static/media` sources | the production build | built | Observed |
| The signing page can embed `https://www.signwell.com` in a frame | Read `apps/web/next.config.mjs` for the frame origin and `apps/web/app/sign/[token]/EmbeddedSigning.tsx` for the `<iframe>`, and `apps/api/src/signing/signing.service.ts` for the `internal` provider that renders our own surface instead | the working tree | source | Observed |
| That frame sets storage of its own | — | — | — | **Assumed.** It is a third-party document and it is reasonable to expect it stores something, but nothing here measured it. No requirement rests on this row |

**What this corrects.** `apps/web/next.config.mjs` states, and BUG-006 records, that the request
*is* made at runtime — and it was, when that bug was written and the `@import` was the first
statement the browser saw. PATCH-027 then added `next/font`, whose `@font-face` blocks are
emitted ahead of the design system's CSS, and silently pushed the `@import` out of the only
position where it is legal. Nobody changed the line; the line stopped working. This spec deletes
it and the two origins the policy carries for it, and the comment in `next.config.mjs` goes with
them.

**Boundary values**

| Value | Our unit or vocabulary | Theirs | Converted where | What detects a mismatch |
|---|---|---|---|---|
| the recorded-at moment | seconds since the epoch, in the cookie | the browser's `Max-Age`, also in seconds | nowhere — both are seconds, and the cookie's own expiry is what enforces the twelve months | Validation rule 3: a non-numeric third part makes the decision `none`, so a mangled value asks again rather than displaying a wrong date |
| the decision | `accepted` / `rejected` | — | — | Validation rule 1 |

**What the double must reproduce**

| Provider behaviour | Why a double without it certifies nothing |
|---|---|
| A browser that refuses `document.cookie` writes | Every case would otherwise prove only that the write path runs where it always succeeds, and edge case 4 — the person is asked again rather than blocked — would be untested |
| A browser that throws on `localStorage` access | `SlotPicker`'s reader and writer already swallow this; the registry clear must too, and a double that never throws would let an unguarded clear ship |

There is no double for the font origin, because after this spec there is no external origin to
stand in for. That is the point of deleting it rather than describing it.
