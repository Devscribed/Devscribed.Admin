# Consent Specifications

Functional specifications for **consent** — what the product keeps in a person's browser, who is
asked about it, and how a refusal is honoured. Each spec is self-contained with requirements, UI,
contracts and test cases. Specs use YAML frontmatter (`tags`, `routes`, `api`, `entities`) for
discoverability — grep frontmatter to find relevant specs.

## Why this area exists

The product has nine surfaces that people outside the organization reach: a candidate opening a
booking link, a signer opening a magic link, and the six signed-out account screens. On one of
them the product writes a preference into the visitor's browser, and it has never said so.

That is the whole of it, and the smallness is the point. There is no analytics, no tracking
pixel, no advertising network and — after this area's first spec — no third-party origin named
anywhere in what the browser is served. So this area is not a consent-management platform. It is
one dialog telling the truth about two things, and one rule that makes a refusal mean something
on the screens that do the storing rather than only on the screen that asked.

An area rather than a patch because the rule crosses the design system, the web app's root
layout, two hiring modules and the signing page's security policy, and because the vocabulary it
settles — what counts as necessary, what counts as functional — is what every later storage
decision will be read against.

## Spec Index

| # | Spec | Mockup | Tags |
|---|------|--------|------|
| 01 | [Cookies and storage](01-cookie-consent.md) · [contracts](01-cookie-consent.contracts.md) · [cases](01-cookie-consent.cases.md) | [mockup](01-cookie-consent.mock.html) | consent, cookies, localstorage, gdpr, eprivacy, public-surface, footer, withdrawal |
| 02 | A signer's third-party frame *(not written)* | — | signing, provider, iframe, third-party |
| 03 | Consent carried on an account *(not written)* | — | account, cross-device, member |

02 and 03 are both named in 01's Known Gaps, and neither is scheduled. 02 needs a third
category, which is a vocabulary decision 01 deliberately closed at two; 03 needs a legal basis
for members that the product does not currently claim.

## Product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Who is asked | The nine public surfaces only | The people the law is about here are candidates, signers and visitors. A member is required to use an internal tool and meets it under the employment relationship, not under a banner they click through every time their storage is cleared |
| What is offered | Accept, or Reject non-essential — two controls of equal prominence, blocking until answered | A reject one click away is what makes the accept mean anything. The alternative considered and rejected was a single Acknowledge, defensible today because nothing stored needs consent, and a lie the day anything analytics-shaped ships |
| Which categories exist | Necessary and Functional | Both name something the code writes today. A third for analytics was considered and rejected: a switch that controls nothing is the one thing a consent dialog must never draw |
| Per-category switches | None. The two buttons are the switch | Two categories, one of which cannot be turned off, leaves exactly one thing to toggle |
| Where the decision lives | A first-party cookie on the device, twelve months | Per browser profile is the honest granularity for a record kept on the device. The alternative — never expiring, in `localStorage` — is a decision nobody revisits and one the pre-paint stamp cannot read |
| What a rejection does to values already stored | Clears them at the moment Reject is clicked | A refusal that leaves yesterday's values in place is not a refusal |
| What a rejection does to the controls | Nothing. They still work; they are simply not remembered | Withdrawing a feature that does not need storage would punish the refusal |
| What "never asked" permits | Reads and writes | Every screen inside the application is `none` forever, because nobody there is ever asked. Treating it as refusal would break preferences for every member to honour a refusal nobody made |
| Whether a policy page is written | No | There is little enough to say that a linked page would be a second copy to keep true, and it would be legal prose written without a lawyer |
| The `fonts.googleapis.com` import | Deleted, along with the two origins the signing page's policy carries for it | Asked on the belief the request was live. Measurement showed it inert — `next/font`'s `@font-face` blocks are emitted ahead of it, and a misplaced `@import` is ignored. The answer did not change: a stylesheet that names a third-party origin makes the dialog's promise unauditable whether or not a browser acts on it |

## Shared Rules

| Rule | Defined in | Referenced by |
|---|---|---|
| The functional registry — the closed list of browser keys a decision governs | `01-cookie-consent.contracts.md`, Data Model | Every later spec that stores a preference in a browser. A key not on the list is not governed, which is a defect rather than an exemption |
| Necessary means strictly necessary for something the person asked for | `01-cookie-consent.contracts.md`, Data Model | The classification column of that same registry |
| A decision is read from the consent cookie and from nowhere else | `01-cookie-consent.md`, REQ-01-003 | Anything that needs to know whether it may store |

## Cross-Spec Side Effects

| Trigger | Source | Effect | Target |
|---|---|---|---|
| A rejection recorded on a public surface | consent/01 | The candidate list's scope preference is neither read nor written on that device, and the list opens on its default scope | `user-management` / hiring candidate screens |
| A rejection recorded on any surface | consent/01 | The booking page's time-format preference is cleared and stops being written | `hiring/02-booking-page`, `hiring/07-manage-booking` |
| The two Google origins leaving the signing page's policy | consent/01 | The `Content-Security-Policy` asserted by any case that reads that header changes | `documents/02-envelopes-and-signing`, and BUG-006, whose finding this supersedes |
| A footer row beneath every public surface | consent/01 | Each of the nine layouts gains a row below its content. `AuthLayout`'s existing `footer` slot is untouched and keeps the cross-account link | `user-management/00-app-shell`, `user-management/02-authentication-login` |

## Dependency Graph

```
                       consent/01
                            |
        +-------------------+--------------------+
        |                   |                    |
  packages/ds          apps/web root        apps/web/next.config
  Modal.dismissible    layout stamp +       CSP: two origins
        |              footer row           removed
        |                   |                    |
        +-------> the nine public surfaces <-----+
                            |
                  the functional registry
                            |
            +---------------+---------------+
            |                               |
   SlotPicker (public)            candidate-list (application)
```

Nothing depends on this area, and this area depends on no other spec. It reads three shipped
mechanisms — `Modal`, `ViewportStamp`, `AuthLayout` — and changes one of them.

## Blast Radius

| What breaks | Why | Mitigation |
|---|---|---|
| **Every existing E2E case that opens a public surface** | Nine surfaces gain a blocking dialog over the page. `booking.spec.ts`, `manage-booking.spec.ts`, `envelopes-signing.spec.ts`, `authentication.spec.ts`, `signup.spec.ts` and `invitation.spec.ts` all begin by opening one, and their first click would land on a scrim | A helper in `e2e/tests/helpers.ts` that seeds an accepted `ds_consent` cookie on the context, called from the existing setup those suites already share. Seeding a cookie is not a fixture the product needs; it is the same `context.addCookies` any returning visitor arrives with |
| **`Modal`, everywhere it is used** | A new prop on a component with many call sites. `decisions.md` §8 states its four dialog rules go together, and a careless implementation could withdraw the focus trap along with the exits | The prop defaults to today's behaviour, so every existing call site is unchanged by construction; and it withdraws only the three exits, never the trap, the labelling or the returned focus |
| **The signing page's rendering, if the font deletion is wrong** | `/sign/:path*` is the one route with a policy, and BUG-006 is the record of that page rendering in a fallback sans-serif when the policy refused the font | The typeface has been served by `next/font` from the application's own origin since PATCH-027, and the emitted stylesheet carries `@font-face` rules with local sources. The two origins being removed are permissions for a request that measurement shows is not made |
| **Any screen that reads `localStorage` directly rather than through the registry** | A rejection would not reach it, and the product would store against a recorded refusal | Two writers exist and both already funnel through a single function. The gap — that a future screen could bypass the registry — is named in 01's Known Gaps with the static check that would close it |
| **The root layout, on every page in the product** | The stamp is added to the layout that renders the application as well as the public surfaces | The stamp only reads a cookie and writes an attribute. It draws nothing, and REQ-01-005 keeps the dialog off every non-public surface |
| **Nothing in the database, and nothing in the API** | No migration, no route, no column, no message | — |

## Backward Compatibility

1. **No migration, so no deploy order matters and a rollback needs no database rollback.**
   Nothing about this area reaches the schema. `infra/deploy.sh` skips the migration step for a
   web-only deploy, and this is one.
2. **An older build meeting a `ds_consent` cookie ignores it.** No shipped code reads that name,
   so a rollback leaves the cookie in place and inert, and a roll-forward reads it again.
   Enforced by the cookie being new rather than a reuse of an existing name.
3. **A newer build meeting a device with no cookie asks.** That is the missing-decision state,
   which is the state every device is in on the day this ships. Enforced by REQ-01-002, which
   reads absent as `none`.
4. **A grammar this build does not know is read as no decision, never as consent.** So a future
   version of the value can be introduced without a version of the product acting on a decision
   it misread. Enforced by validation rule 2 and TC-01-UNIT-01.
5. **Values already in `localStorage` on the day this ships keep working.** Nobody has been asked
   yet, every device is `none`, and `none` permits. Enforced by REQ-01-016's decision table,
   whose `none` row exists for exactly this population.
6. **`ds_session` is untouched — same name, same attributes, same `httpOnly`.** No session is
   invalidated by this area and nobody is signed out. Enforced by the consent module never
   writing a cookie other than `ds_consent`.
7. **`Modal`'s existing call sites are unchanged.** The new prop defaults to the current
   behaviour, so a component that does not pass it behaves exactly as it does today. Enforced by
   the default rather than by care.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| A signing page can embed an external provider's frame, whose storage the dialog neither describes nor governs | The frame loads only for an envelope the signer was deliberately sent to sign, and no product code can clear another origin's storage | Spec 02 of this area, which needs a third category |
| The decision does not follow a person across devices or browser profiles | It is a record kept on the device, and a candidate has no account to attach it to | Spec 03 of this area |
| A future screen could write `localStorage` without going through the registry, and a rejection would not reach it | Two writers exist today and both go through it | A static check in the `ds:check` family that fails on a direct `localStorage` write outside the consent module |
| The dialog is English only | Every surface in the product is English only | Whatever spec introduces a second language |
| Whether the external signing frame sets storage of its own was never measured | Nothing in this area rests on it; the row is marked Assumed in 01's External Contracts and carries no requirement | Probing a real provider envelope, which spec 02 would do anyway |
