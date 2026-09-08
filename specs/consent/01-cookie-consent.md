---
id: "01"
title: Cookies and storage
routes: ["/book/{slug}", "/manage/{slug}/{token}", "/sign/{token}", "/login", "/signup", "/forgot-password", "/reset-password", "/accept-invite", "/account/confirm-email"]
api: []
entities: []
tags: [consent, cookies, localstorage, gdpr, eprivacy, privacy, public-surface, booking, signing, footer, modal, pre-paint-stamp, withdrawal]
depends-on: []
bundle:
  - 01-cookie-consent.contracts.md
  - 01-cookie-consent.cases.md
---

## Summary

The request was a cookie modal. This spec draws one on the nine public surfaces — the booking
page, the manage-booking page, the signing page and the six signed-out account screens — where
the people who meet the product are candidates, signers and visitors rather than members. It asks
about the two things the product keeps in a browser and about nothing else: the sign-in cookie,
stated rather than offered, and one preference key, which can be refused. The decision is a
first-party cookie on the device, it lasts twelve months, and a footer link reopens it.

The structural decision is that **a refusal is honoured by the writer, not by the dialog**. Every
functional key goes through one module reading one recorded decision, so the rule cannot be true
on the screen that asked and false on the screen that writes.

Beyond the request, this spec adds three things.

- **A footer on the nine public surfaces**, carrying one link. Consent that cannot be withdrawn as
  easily as it was given is not consent, and no public surface has anywhere to put a link today.
- **A dismissal-free mode on the design system's `Modal`**, which today always draws a close
  control and always closes on `Escape` and on a scrim click.
- **The deletion of a dead `@import` of `fonts.googleapis.com`** from `packages/ds/src/tokens/fonts.css`,
  and of the two Google origins the signing page's policy carries for it. The dialog promises that
  nothing follows a visitor to another site, and a stylesheet naming a third-party origin makes
  that unauditable. `## External Contracts` records what was measured.

No route, no entity, no migration: the decision never reaches the server.

Blast radius and backward compatibility for this spec are in [README.md](README.md).

## Actors & Preconditions

| Actor | Precondition |
|---|---|
| A visitor with no session | Arrives at one of the nine public surfaces by a link somebody sent them. Holds no account and may never hold one |
| A candidate | On `/book/{slug}` or `/manage/{slug}/{token}`. The only actor whose behaviour the functional key changes today |
| A signer | On `/sign/{token}`, holding a magic link. May be shown a third-party signing frame — see Known Gaps |
| A member with a session | Reaches a public surface by signing out or by opening a booking link. Never asked, and bound by a refusal already recorded on that device |

The decision is per browser profile — two browsers are asked twice, and the dialog says so.

## Roles & Permission Matrix

| Capability | Visitor | Candidate | Signer | Member with a session |
|---|---|---|---|---|
| Be asked, on a public surface | ✅ | ✅ | ✅ | ✅ |
| Be asked, inside the application | ❌ | ❌ | ❌ | ❌ |
| Record a decision | ✅ | ✅ | ✅ | ✅ |
| Reopen the decision from the footer | ✅ | ✅ | ✅ | ✅ |
| Turn the necessary category off | ❌ | ❌ | ❌ | ❌ |

No cell is read from a membership or a role: every one is decided by the surface and the cookie.

## Functional Requirements

### Reading the decision

#### REQ-01-001 — the decision is stamped before first paint

WHEN a document loads, THE SYSTEM SHALL write the recorded decision onto the root element as
`data-consent` before any content is painted.

**Decided:** a React effect runs after paint, so a functional read could happen against an unknown
decision. The mechanism is the one `apps/web/src/layout/ViewportStamp.tsx` uses for `data-bp`; the
reason stops holding only if the root layout stops rendering a synchronous first child.

#### REQ-01-002 — an unreadable decision is no decision

IF the consent cookie is absent, empty, or does not match the recorded grammar, THEN THE SYSTEM
SHALL read the decision as `none`.

#### REQ-01-003 — one source for the decision

THE SYSTEM SHALL read the decision from the consent cookie and from nowhere else.

**Decided:** the stamp is a copy made once per document from the cookie and from nothing else, so
the two cannot disagree within a document's life.

### Asking

#### REQ-01-004 — the gate is drawn where a decision is missing

WHILE the decision is `none` and the surface is public, THE SYSTEM SHALL draw the consent dialog
over the page.

#### REQ-01-005 — the gate is not drawn anywhere else

WHILE the surface is not public, THE SYSTEM SHALL NOT draw the consent dialog.

#### REQ-01-006 — the two answers are equally prominent

THE SYSTEM SHALL draw the accept control and the reject control with the same fill, border,
typography and width.

**Decided:** an accept styled as the primary action beside a secondary reject is the asymmetry that
invalidates the consent it collects, so this is a rule rather than a preference of the mock.

#### REQ-01-007 — the gate has no exit that records nothing

WHILE the consent dialog is drawn for a missing decision, THE SYSTEM SHALL NOT close it on
`Escape`, on a scrim click, or by a close control.

#### REQ-01-008 — the gate holds focus

WHEN the consent dialog opens, THE SYSTEM SHALL move focus into it and keep focus within it
while it is drawn.

#### REQ-01-009 — the page behind the gate is not hidden

WHILE the consent dialog is drawn, THE SYSTEM SHALL leave the page's content rendered beneath the
scrim.

### Recording

#### REQ-01-010 — accepting records acceptance

WHEN the accept control is activated, THE SYSTEM SHALL write the consent cookie with the decision
`accepted` and the moment it was recorded.

#### REQ-01-011 — rejecting records rejection

WHEN the reject control is activated, THE SYSTEM SHALL write the consent cookie with the decision
`rejected` and the moment it was recorded.

#### REQ-01-012 — the decision lasts twelve months

THE SYSTEM SHALL write the consent cookie with a maximum age of 365 days.

#### REQ-01-013 — the cookie is confined to this site

THE SYSTEM SHALL write the consent cookie with `SameSite=Lax` and a path of `/`.

#### REQ-01-014 — the cookie is secured wherever the page is

WHERE the document was served over `https`, THE SYSTEM SHALL write the consent cookie with the
`Secure` attribute.

**Decided:** unconditional `Secure` is dropped by the browser over `http`, which is how the suite
is served, so no decision could ever be recorded there.

#### REQ-01-015 — the gate closes on an answer

WHEN a decision is recorded, THE SYSTEM SHALL stop drawing the consent dialog without reloading
the document.

### Honouring the decision

#### REQ-01-016 — what each decision permits

THE SYSTEM SHALL resolve every functional-storage operation by the recorded decision.

`decision-table: keys=(decision, operation) domains=(decision: none|accepted|rejected, operation: read|write)`

| decision | operation | Outcome |
|---|---|---|
| none | read | The stored value is returned. Nobody on this surface has been asked, and a value already on the device was written before this spec shipped. |
| none | write | The value is written. A member inside the application is never asked, and blocking here would break a preference for everyone who never saw a dialog. |
| accepted | read | The stored value is returned. |
| accepted | write | The value is written. |
| rejected | read | The default is returned and storage is not consulted. |
| rejected | write | Nothing is written and the operation succeeds silently, exactly as it already does when the browser refuses storage. |

**Decided:** `none` permits. Treating "never asked" as refusal would break preferences on every
screen inside the application, to honour a refusal nobody made.

#### REQ-01-017 — a rejection clears what is already stored

WHEN `rejected` is recorded, THE SYSTEM SHALL remove every key in the functional registry from
local storage.

#### REQ-01-018 — accepting restores nothing

WHEN the decision changes from `rejected` to `accepted`, THE SYSTEM SHALL NOT restore a value a
rejection removed.

#### REQ-01-019 — a functional control still works unstored

WHILE the decision is `rejected`, THE SYSTEM SHALL apply a functional control's change for the
rest of the visit.

**Decided:** removing the control under a rejection would punish the refusal by withdrawing a
feature that does not need storage to work.

### Changing the decision

#### REQ-01-020 — every public surface carries the way back

WHILE the surface is public, THE SYSTEM SHALL draw the cookie settings control beneath the page's
content.

#### REQ-01-021 — the reopened dialog states what is in force

WHILE a decision is recorded, WHEN the dialog is opened from the cookie settings control, THE
SYSTEM SHALL name the decision in force and the moment it was recorded.

#### REQ-01-022 — the reopened dialog can be left

WHILE a decision is recorded, THE SYSTEM SHALL close the dialog on `Escape`, a scrim click or a
close control, leaving the decision unchanged.

#### REQ-01-023 — the controls do not change with the decision

THE SYSTEM SHALL draw the same two controls, with the same labels, whether or not a decision is
recorded.

### What the product contacts

#### REQ-01-024 — the shipped stylesheet names no external origin

THE SYSTEM SHALL serve a stylesheet that names no origin outside the application's own.

#### REQ-01-025 — the signing page's policy names no font origin

THE SYSTEM SHALL send the signing page a `Content-Security-Policy` whose `style-src` and `font-src`
name no origin outside the application's own.

## State Machine

The decision on one device. `ask` is the gate; `settled` is a recorded decision.

`decision-table: keys=(state, event) domains=(state: none|accepted|rejected, event: publicSurfaceLoaded|acceptClicked|rejectClicked|settingsOpened|cookieExpired)`

| state | event | Outcome |
|---|---|---|
| none | publicSurfaceLoaded | The gate is drawn. State stays `none`. |
| none | acceptClicked | State becomes `accepted`; the cookie is written; the gate closes. |
| none | rejectClicked | State becomes `rejected`; the cookie is written; the registry is cleared; the gate closes. |
| none | settingsOpened | Unreachable — the footer control is drawn on the same surfaces as the gate, and the gate holds focus while the state is `none`. |
| none | cookieExpired | Unreachable — there is no cookie to expire. |
| accepted | publicSurfaceLoaded | Nothing is drawn over the page. State stays `accepted`. |
| accepted | acceptClicked | The cookie is rewritten with a fresh twelve months. State stays `accepted`. |
| accepted | rejectClicked | State becomes `rejected`; the cookie is written; the registry is cleared. |
| accepted | settingsOpened | The dialog is drawn, dismissible, naming `accepted`. State unchanged. |
| accepted | cookieExpired | State becomes `none`; the next public surface draws the gate. |
| rejected | publicSurfaceLoaded | Nothing is drawn over the page. State stays `rejected`. |
| rejected | acceptClicked | State becomes `accepted`; the cookie is written; nothing is restored. |
| rejected | rejectClicked | The cookie is rewritten with a fresh twelve months; the registry is cleared again. State stays `rejected`. |
| rejected | settingsOpened | The dialog is drawn, dismissible, naming `rejected`. State unchanged. |
| rejected | cookieExpired | State becomes `none`; the next public surface draws the gate. |

Invariants:

1. The state is a function of the consent cookie alone, and of nothing the server holds.
2. No transition writes a functional key; only the clearing direction touches the registry.
3. Every transition out of `none` writes the cookie before the gate stops being drawn.

## Out of Scope

- **The application's own screens.** A member is never asked and no screen there changes; a
  rejection on the device is still honoured, by REQ-01-016.
- **A cookie policy page.** There is little enough to say that a second document would be a
  second copy to keep true.
- **Per-category switches.** One category cannot be turned off, so the two controls are the switch.
- **A server-side record of consent.** Nothing reaches the database, so nothing is attributable.
- **The third-party signing frame** on `/sign/{token}`. Named in Known Gaps.
- **The `sessionStorage` hand-offs** inside the hiring screens, classified as necessary in the
  contracts file's registry.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| A signing page whose envelope was executed by an external provider embeds that provider's frame, which the dialog neither describes nor governs | The frame is loaded only for an envelope a signer was deliberately sent to sign, and the product cannot reach into another origin's storage to clear it | A third category naming the provider by name, drawn only on `/sign/{token}` and only for an envelope with an external provider — which needs the vocabulary decision this spec's two categories deliberately closed |
| The decision is per browser profile, so one person is asked on each device and in each private window | It is the honest granularity for a record kept on the device, and the alternative is an account, which a candidate does not have | Nothing in this release. A person who signs in could carry a decision on their account, which is a different spec and a different legal basis |
| A rejection is not enforced against a key written by a future screen that does not use the registry | The registry is one module and the two writers that exist both go through it | A static check that fails on a direct `localStorage` write outside the consent module, in the same family as `ds:check` |
| The dialog's text is English only | Every surface in the product is English only | Whatever spec introduces a second language, which will find this string in the same place it finds the rest |

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| 1 | A first visit to the booking page with no consent cookie draws the dialog over the page, and the booking form beneath it is still rendered | TC-01-E2E-01 |
| 2 | The dialog cannot be left without an answer: `Escape`, a scrim click and the absence of a close control all leave it standing | TC-01-E2E-02 |
| 3 | The accept and reject controls have the same width, to the pixel, at every width the product supports | TC-01-E2E-03 |
| 4 | Accepting writes a first-party cookie that survives a reload, and the dialog is not drawn again | TC-01-E2E-04 |
| 5 | Rejecting removes a functional value already on the device, and using the format toggle afterwards stores nothing | TC-01-E2E-05 |
| 6 | Under a rejection the format toggle still changes the times on screen for the rest of the visit | TC-01-E2E-05 |
| 7 | The footer control reopens the dialog, which names the decision in force and can be dismissed without changing it | TC-01-E2E-06 |
| 8 | No public surface draws the dialog once a decision is recorded, and no application surface draws it at all | TC-01-E2E-07 |
| 9 | The decision is read as `none` when the cookie holds a value the grammar does not admit | TC-01-UNIT-01 |
| 10 | A rejection recorded on a public surface blocks a functional write made anywhere in the product on that device | TC-01-UNIT-03 |
| 11 | The shipped stylesheet names no origin outside the application's own | TC-01-E2E-09 |
| 12 | The signing page's `Content-Security-Policy` names no font origin | TC-01-E2E-09 |
