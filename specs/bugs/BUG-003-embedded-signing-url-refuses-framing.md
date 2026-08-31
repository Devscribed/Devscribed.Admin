---
id: "BUG-003"
title: The embedded signing URL refuses to be framed, and the signer waits forever with no error
severity: blocker
surface: ui
verdict: SPEC-GAP
owning-spec: documents/04
violates: null
regression-test: TC-04-INT-26
introduced-in: never worked against the live provider; the stub serves a same-origin URL
affects: all
tags: [signwell, embedded-signing, iframe, x-frame-options, csp]
---

## Symptom

A signer opens `/sign/{token}` for a SignWell envelope. The page renders, the heading and the
test-mode badge appear, and where the widget belongs there is an empty grey rectangle. It stays
that way. No error card, no retry, no timeout.

The browser console says:

```
Refused to display 'https://www.signwell.com/' in a frame because it set
'X-Frame-Options' to 'sameorigin'.
```

## Reproduction

Deterministic, on any SignWell envelope that reached `Sent` at the provider.

1. Send an envelope through SignWell.
2. Open the signer's `/sign/{token}` link.

## Evidence

Our side is correct end to end. `GET /api/sign/{token}` answers:

```json
{ "surface": "embedded",
  "embeddedSigningUrl": "https://www.signwell.com/docs/eef953bce8/" }
```

which is exactly what the provider gave us — `recipients[0].embedded_signing_url` on a
document that is `Sent`, with three materialized fields and two pages.

The URL itself is what refuses. Every shape reachable from the API response was checked:

| URL | response |
|---|---|
| `/docs/eef953bce8/` | `200`, `X-Frame-Options: SAMEORIGIN` |
| `/docs/eef953bce8/?embedded=true` | `200`, `X-Frame-Options: SAMEORIGIN` |
| `/docs/eef953bce8/?embed=1` | `200`, `X-Frame-Options: SAMEORIGIN` |
| `/embed/eef953bce8/` | `404` |
| `embedded_preview_url` | `200`, `X-Frame-Options: SAMEORIGIN` |
| **`/docs/eef953bce8/?signwell_embedded_iframe=1`** | **`200`, no `X-Frame-Options` at all** |

The last row is the answer, and it came from reading the provider's own embed script.
`https://static.signwell.com/assets/embedded.js` is 25 KB and does three things: it appends a
query parameter, creates an iframe, and relays `postMessage`. The parameter is the only part
we do not already do:

```js
l.searchParams.set("signwell_embedded_iframe", "1")
```

Its frame is built with `.src = i.url` — the same URL, with that parameter on it. There is no
private endpoint and no token exchange.

## Root Cause

Not in the code. `embedded_signing_url` is the ordinary signing page — the same address a
signer would receive by email — and the provider protects it from framing, correctly. It
becomes embeddable only when asked to be, by a parameter that appears in no API response and
in no field name.

Nothing in this repository adds it. `signwell-signing-provider.ts:494` passes
`recipient.embedded_signing_url` through unchanged, and `EmbeddedSigning.tsx:133` frames what
it is given.

**The stub is why no test caught it.** `stub-signwell-http-client.ts:114` answers with
`${webOrigin()}/api/test/signwell/widget?document=…` — a same-origin URL that frames happily.
The suites therefore exercise a surface with none of the property under test.

## Spec Verdict

`SPEC-GAP`, and it also settles a contradiction the spec already contains.

Requirement 15 says `signerAccess` returns `recipients[n].embedded_signing_url` and the page
frames it. It does not say the URL needs anything done to it, because nobody had framed a live
one. No requirement covers the parameter, so this is a gap rather than a wrong statement.

The contradiction it settles: requirement 15 at `:296-299` states the SDK is **not** loaded and
`script-src` is not widened, while the Flows section at `:896` still reads "The `SignWellEmbed`
`completed` event fires in the parent page" — an object that does not exist without the SDK.
This report resolves it **in favour of requirement 15**. The SDK adds one query parameter to a
URL we already hold; loading a third-party script into the product's only session-less page to
obtain it would be a poor trade. The Flows sentence is wrong and goes.

Two edge-case rows are needed:

| # | Situation | Behaviour |
|---|---|---|
| — | The provider's signing URL refuses framing | The adapter marks the URL embeddable before returning it. The raw `embedded_signing_url` is never framed, and the double must refuse framing the same way the provider does |
| — | The frame never loads | The signer sees an error card with a retry, not a placeholder. Bounded by a timeout, because a refused frame fires no `error` event in every browser |

## Fix Approach

Add the parameter in the SignWell adapter, where provider specifics belong. The port's
`embeddedSigningUrl` is provider-agnostic and the internal provider returns `null`; a caller
should never have to know what a particular provider needs doing to its URL.

- `apps/api/src/signature/signwell/signwell-signing-provider.ts:494` — set
  `signwell_embedded_iframe=1` on the URL before returning it, with `URL`/`searchParams` rather
  than string concatenation, so a URL that already carries query parameters survives.
- `apps/api/src/documents/…` — nothing. The web app keeps framing what it is given.
- `stub-signwell-http-client.ts` — the stub's widget must **also** require the parameter and
  refuse without it, or it goes on hiding this class of defect.

**Also fix the silent failure**, which is a defect in its own right and was raised as a note in
review: `EmbeddedSigning.tsx` has `onLoad` but no `onError` and no timeout, so a frame the
browser refuses leaves "Preparing your document…" on screen forever. A refused frame does not
reliably fire `error`, so the guard has to be a timer.

**Rejected:** loading `embedded.js`. It would widen `script-src` on the one page in the product
that has no session, to be handed a string we can build ourselves.

## Blast Radius

| What | Effect | Mitigation |
|---|---|---|
| `frame-src` in the CSP | Already widened to the embed origin; the parameter does not change the origin | None needed |
| The stub's widget | Tightening it will fail any test that framed the loose URL | Those tests were passing for the wrong reason; update them in the same change |
| A URL that already has a query string | `searchParams.set` is safe; concatenation would not be | Use `URL` |
| The signer-facing error path | New error state on a page with no session and no support channel | The message is spec text, in `packages/validation`, with a retry that re-fetches |

## Backward Compatibility

None required. The URL is never persisted — requirement 15 says so — so nothing stored changes
shape and no envelope in flight is affected.

## Regression Test

`TC-04-INT-26` — the adapter returns an embeddable URL.

**Precondition:** a `Sent` SignWell envelope whose double answers with
`https://example.test/docs/abc/` as `embedded_signing_url`.

**Steps:** `GET /api/sign/{token}`.

**Expected:** `embeddedSigningUrl` is `https://example.test/docs/abc/?signwell_embedded_iframe=1`.
A double whose URL already carries `?foo=1` keeps it and gains the parameter alongside.

**Against the current code it fails**: the URL is returned unchanged.

`TC-04-E2E-06` covers the silent failure: with the frame refused, the signer sees the error card
and the retry within the timeout, not the placeholder.

## Known Gaps

**The parameter is undocumented.** It was read out of the provider's minified embed script, not
from an API reference, so it can change without notice. What protects us is that
`TC-04-INT-26` pins it and the E2E error path makes a regression visible rather than silent —
if the provider renames it, the frame refuses, and the signer now gets an error card instead of
a grey rectangle.

**Whether the widget then functions was verified only as far as the framing.** The response is
framable and the page loads; that the signature ceremony completes and posts back the
`completed` event across origins is exercised against the stub and has not been done against a
live document by a person.

**A second, unrelated CSP defect is visible in the same console** and is not covered here: the
signing page requests `https://fonts.googleapis.com/css2?family=Space+Grotesk…` while
`style-src` is `'self' 'unsafe-inline'`, so the product's only session-less page renders in a
fallback font. It needs its own report.
