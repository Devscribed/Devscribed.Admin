---
id: "BUG-006"
title: The CSP on `/sign/*` blocks the product's own fonts, so the only page a counterparty sees is the only page in the wrong typeface
severity: minor
surface: ui
verdict: SPEC-GAP
owning-spec: documents/04
violates: null
regression-test: TC-04-E2E-07
introduced-in: the CSP added with the public signing page; never noticed because no other page carries one
affects: every signer, every envelope
tags: [csp, design-system, fonts, signing-page, third-party]
---

## Symptom

A signer opens `/sign/{token}`. The page works — the document renders, the widget frames, the
signature can be given — and every glyph on it is the browser's fallback sans-serif. The
console says:

```
Refused to load the stylesheet 'https://fonts.googleapis.com/css2?family=Space+Grotesk…'
because it violates the following Content Security Policy directive: "style-src-elem 'self'
'unsafe-inline'".
```

The reported directive is `style-src-elem`, which is what `style-src` falls back to for a
`<link>`; a test matching on the literal string `style-src` would miss it.

Nothing else in the product does this. `/sign/*` is the only route with a CSP, so it is the
only page in the wrong typeface — and it is the one page shown to somebody outside the
organization, at the moment they are being asked to sign a contract.

## Reproduction

Deterministic, on every signing link, in every environment.

1. Open any `/sign/{token}`.
2. Compare the heading with the same heading on `/login`.

## Evidence

The header, read off the running app:

```
$ curl -sD - -o /dev/null http://localhost:3000/sign/{token} | grep -i content-security
Content-Security-Policy: default-src 'self'; …; style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:; font-src 'self' data:; …
```

`/login` and every other route return no CSP header at all.

The stylesheet the page loads still carries the remote import — webpack does not resolve
remote `@import`s, it hoists them:

```
$ curl -s http://localhost:3000/_next/static/css/app/layout.css | grep -o '@import[^;]*;'
@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:…
```

It arrives there from the design system, which says as much in its own first line:

```css
/* Meridian pairs Space Grotesk (display + numerals) with IBM Plex Sans (text).
   Loaded from Google Fonts; if you self-host, replace this file … */
@import url("https://fonts.googleapis.com/css2?family=…");
```

**Two directives are involved, not one.** The stylesheet is refused by `style-src`; the
stylesheet it would have returned points somewhere else again:

```
$ curl -s 'https://fonts.googleapis.com/css2?family=…' | grep -o 'https://fonts.gstatic.com[^)]*'
https://fonts.gstatic.com/s/ibmplexsans/v23/…
```

So widening `style-src` alone would fetch a stylesheet whose every `src` is then refused by
`font-src`, and the page would render in exactly the same fallback with a different console
message. That is the trap in calling this a one-line fix.

`display=swap` is why nobody noticed for so long: the fallback paints immediately and the
swap that should follow simply never comes. There is no flash, no error state, no delay —
only a page that looks slightly unlike the rest of the product to the one person who has
never seen the rest of the product.

## Root Cause

Not a defect in the policy and not a defect in the design system. Each is right on its own
and neither knows about the other.

The policy at `apps/web/next.config.mjs:102` is deliberately tight, for reasons the area
README states: `/sign/*` renders author-controlled HTML on a session-less page, and a
restrictive CSP is one of four required mitigations. It was written listing what the page
needs, and the page's own stylesheet chain — `layout.tsx` → `@ds/styles.css` →
`tokens/fonts.css` → `fonts.googleapis.com` — is three hops away from anything visible in
that file.

The design system loads its fonts from Google, which is the ordinary arrangement and works
on every page that has no CSP. It is the only import in the product that leaves our origin.

## Spec Verdict

`SPEC-GAP`. No requirement anywhere states the CSP's directive list; the policy exists only
in `next.config.mjs`, and the specs mention it twice — the area README naming "a restrictive
CSP on `/sign/*`" as a required mitigation, and spec 04's blast-radius row explaining why
`frame-src` gained the embed origin. Both are right and neither covers fonts.

The gap is more general than fonts, and that is the row worth adding: **the policy is a
allow-list maintained by hand against a stylesheet chain nobody reading it can see.** The
next asset the design system adds from another origin will fail exactly this way.

| # | Situation | Behaviour |
|---|---|---|
| — | The design system loads an asset from an origin the `/sign/*` policy does not name | The browser refuses it and the page renders degraded, with no error state and nothing failing. Every origin the policy admits is named in one place with the reason it is there, and `TC-04-E2E-07` fails when a resource on that page is refused — whatever the resource is |

And spec 04's blast-radius row on the CSP gains the second widening, so the table stays the
one place that says what the policy admits and why.

## Fix Approach

Widen the policy by exactly the two origins Google Fonts needs, in the same
`next.config.mjs` list, beside the `frame-src` widening that is already there and annotated
the same way.

- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` — the stylesheet.
- `font-src 'self' data: https://fonts.gstatic.com` — the font files it names.

Written as named constants next to `embedOrigin`, so the file states which third parties the
signing page may reach in one place rather than three.

**Rejected: self-hosting the two faces.** It is the better answer on the merits — it removes
a third-party request from a page shown to counterparties, it works on a network that blocks
Google, and both faces are SIL OFL so there is no licensing obstacle. It was not taken here
because it is a change to the design system, which is shared by every page and versioned
separately, and this defect is worth one line in the policy rather than a font pipeline. The
option stays open and the DS file already documents how.

**Rejected: dropping the CSP from `/sign/*`.** It is one of four required mitigations for
author-controlled HTML on a session-less page.

**Rejected: `style-src *` or `font-src *`.** Naming the two origins costs the same to write
and is the difference between a policy and a formality.

## Blast Radius

| What | Effect | Mitigation |
|---|---|---|
| The `/sign/*` policy | Two origins wider. Both serve static assets and neither can be made to host attacker content | Named, not wildcarded; recorded in spec 04's CSP row |
| Every other route | Unchanged — they carry no CSP and already load these fonts | None needed |
| A signer on a network that blocks Google | Still gets the fallback font, now without a console message | None. This is the cost of the option chosen; self-hosting is what removes it |
| The E2E suite | A case that asserted the font had arrived would depend on Google being reachable from CI | `TC-04-E2E-07` asserts the *absence of a refusal*, which a network failure does not produce |

## Backward Compatibility

None required. A response header, computed at build time, with no stored state and nothing
in flight to migrate.

## Regression Test

`TC-04-E2E-07` — the signing page is refused nothing.

**Precondition:** a sent envelope and a signer's link.

**Steps:** collect `securitypolicyviolation` events from the moment the document exists, then
open `/sign/{token}` and let it settle.

**Expected:** no violation is reported. The assertion names the blocked URI and the violated
directive when it fails, so the next gap in the policy is one line of output rather than an
investigation.

**Against the current code it fails.** Measured, by driving a real browser at the page with
the policy narrowed back and then widened again:

| policy | violations | fonts loaded |
|---|---|---|
| `style-src 'self' 'unsafe-inline'` | `style-src-elem -> https://fonts.googleapis.com/css2?family=…` | none |
| with both origins named | none | `IBM Plex Sans`, `Space Grotesk` |

The assertion compares the collected list against an empty one rather than matching a
directive name, so `style-src-elem` needs no special case and neither does the next one.

It is deliberately about *any* refusal rather than about fonts. The defect is not that one
stylesheet was missed; it is that a hand-maintained allow-list on a page nobody reads the
stylesheet chain of will be missed again.

## Known Gaps

**Nothing automated proves the fonts actually arrive.** The test asserts that the browser did
not refuse them, which is the part we control. Whether Google served them is Google's, and
an assertion on the rendered typeface would make the suite fail when CI has no route to
`fonts.gstatic.com` — trading a defect nobody can fix for a flake everybody must.

**Every signer's browser now contacts Google.** On the one page in the product visited by
people who are not our users, at the moment they open a contract. That is not a defect in
this fix — it is the arrangement the design system already has on every other page — but on
this page it is a request made by a counterparty who never chose us, and it is the strongest
argument for self-hosting later.

**Closed:** the Playwright case has since been run. It could not be at first — the suite
could only hold the ports a dev environment holds — which is what ADR 0005 fixes; on
relocated ports it passes, along with the rest of `signature-providers.spec.ts` and
`regressions.spec.ts`.

**The policy's other directives were not re-derived.** This report widened the two the font
chain needs and left the rest as they are. Whether anything else on that page is being
silently refused is answered by `TC-04-E2E-07` from now on, and was not answered before it.
