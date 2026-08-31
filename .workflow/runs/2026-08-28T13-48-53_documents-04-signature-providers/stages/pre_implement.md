# pre_implement — documents/04 Signature Providers & SignWell

Run `2026-08-28T13-48-53_documents-04-signature-providers`, branch `spec/signwell-provider`,
diff base `57d55ac`. Spec sha256 `c1b8461749fba72902637b89c147e3dd6022c29936d70a385dec1c546c1f85c1`.

## What I read

- `specs/documents/04-signature-providers.md` in full (1513 lines); no paired `.design.md` exists.
- `specs/documents/README.md` — Shared Rules, the role-enum note, Cross-Spec Side Effects, Known Gaps.
- The `depends-on` specs 01 and 02: their entries in the area README and the Shared Rules they own,
  not the specs in full.
- `CLAUDE.md`, and `1_DS for dev/README.md` plus the `.d.ts` of `Radio`, `Badge`, `Modal`, because this
  spec adds a screen.
- The code, before the plan. Everything the "Exists, and is reused unchanged" table names, plus three
  files it does **not** name that decide whether the plan is buildable at all:
  `apps/web/next.config.mjs`, `apps/api/src/queue/job-queue.ts`, and `send()` in
  `apps/api/src/documents/envelopes.service.ts`.

This spec is on its second attempt. The previous run
(`.workflow/runs/2026-08-28T13-28-44_documents-04-signature-providers`) blocked on one contradiction —
`providerKey` pinned at creation versus read at send — and raised four notes. Commit `57d55ac` resolved
all five: requirement 1 now says "**At send and not at creation**" and invariant 7 agrees; requirement 18
now states there is *no* `remind` method on the port; TC-04-INT-04 now expects the **redacted** body;
requirement 32 demotes `reachable`/`webhookRegistered` to live checks displayed beside the option rather
than gates on it; the Configuration table now names SSM Parameter Store. I re-read each of those five in
the current text and consider them closed. Nothing below repeats one.

## Verification I did rather than assumed

The spec claims its webhook hash algorithm was confirmed against real deliveries. That claim is the
load-bearing input to TC-04-UNIT-04 and to the entire webhook path, so I checked it instead of trusting
it: `HMAC-SHA256("{event.type}@{event.time}")` keyed by `WEBHOOK_ID` reproduces `event.hash` on all
three fixtures in `apps/api/test/signwell-webhook-fixtures.ts` — `documentCreated`, `documentSent`,
`documentCanceled`, three matches, no misses. TC-04-UNIT-04 is implementable exactly as written and the
fixtures are usable as they stand.

I also confirmed every path the spec cites exists, and that nothing in `apps/api/test/` or `e2e/`
asserts `Envelope.providerKey` or `providerRef` today, so changing what `create()` writes there cannot
break spec 02's suite.

## What already exists to build on

| Thing | Path | Why it matters here |
|---|---|---|
| 404-not-403 org scoping | `apps/api/src/auth/org-scope.guard.ts` | The settings endpoints take the ordinary stack; TC-04-INT-16's "404, not 403" is this guard, unmodified. |
| Capability gating on the normalized role | `apps/api/src/auth/capability.guard.ts`, `apps/api/src/auth/require-capability.decorator.ts`, `packages/validation/src/roles.ts` | `hasCapability()` already funnels through `normalizeRole()`. The two new capabilities are two union members plus four list edits — no new authorization mechanism. |
| The hash chain's single writer | `apps/api/src/documents/envelope-events.service.ts` | `record()` takes `Prisma.TransactionClient` as a parameter, so the reconciler physically cannot write an event outside a transaction. Invariant 4 holds for the new writer by construction. |
| Content-addressed, write-once completion | `apps/api/src/documents/envelope-completion.ts` | `signed/{orgId}/{envelopeId}/{sha256}.pdf`, `storage.exists()` before `put`, and the `updateMany({ where: { signedPdfKey: null } })` guard that makes exactly one racer win. That is TC-04-INT-13 already solved; only the byte source changes. |
| `JobQueue` with `afterCommit`, `whenIdle`, and a `JobName` **union** | `apps/api/src/queue/job-queue.ts`, `apps/api/src/queue/inline-job-queue.ts` | Requirement 25 wants the reference lookup off the request thread; `whenIdle()` exists precisely so an integration test can await it deterministically. `JobName` is a union, so adding `provider-reconcile` forces every switch to be revisited. |
| Token minting and hashing | `apps/api/src/signature/signing-token.ts` | 32 bytes, base64url, only the SHA-256 stored. Unchanged — but now called by the envelope, signing and sweep services directly, because `issueInvitation` leaves the port. |
| The session-less shared-secret guard shape | `apps/api/src/internal/internal-task.guard.ts` | Timing-safe compare, and an unset secret denies everything. The webhook guard copies this shape. |
| A per-source rate limiter | `apps/api/src/signing/signing-rate-limit.guard.ts` | The webhook's 600/min limit is the same pattern; its in-process counting stays the recorded area gap it already is. |
| The freeze | `apps/api/src/documents/envelope-renderer.ts` | `renderEnvelopeDocument` deliberately re-emits `{{signer_owned_key}}` literally and marks each signature block with `data-signer-role`. Those two facts are exactly what requirement 14's translation consumes. |
| The send path and its lock | `apps/api/src/documents/envelopes.service.ts:742` | `SELECT … FOR UPDATE`, the freeze, `documentHash`, the token, the `created`/`sent`/`email_accepted` events, mail inside the failure boundary. Requirement 5 moves the provider call out in front of it and changes nothing else. |
| The public signing surface | `apps/api/src/signing/signing.service.ts` `view()`/`resolve()`, `signing.module.ts` | `resolve()` already decides `not_your_turn` from our own rows before anything else, so requirement 16 is a short-circuit that is already there. |
| The sweep container task | `apps/api/src/internal/envelope-sweep.service.ts`, `apps/api/src/internal/internal.controller.ts` | Requirement 24b is a third pass in `run()`; requirement 18's reminders stay byte-for-byte as they are. |
| Driver selection per port | `apps/api/src/signature/signature.provider.ts`, `apps/api/src/mail/mail.provider.ts`, `apps/api/src/core.module.ts` | The registry replaces `selectSignatureProvider()` in the file that already owns that decision. |
| The whole mail surface | `apps/api/src/mail/mail.service.ts` | `sendSigningInvitation`, `sendSigningReminder`, `sendEnvelopeCompleted`, `sendEnvelopeDeclined`, `sendEnvelopeVoided` all exist. **No `MailService` change is needed** — unlike spec 02, this spec does not disturb the mail port at all. |
| Role-gated page plus `notFound()` | `apps/web/app/org/[orgId]/projects/page.tsx`, `apps/web/app/org/[orgId]/documents/page.tsx` | The exact pattern TC-04-E2E-04's "a `user` gets the not-found page" needs. |
| Capability-gated nav, omitted rather than hidden | `apps/web/src/layout/Sidebar.tsx` | A group with no visible rows is dropped entirely, label included, so `user`/`viewer` never see an empty SETTINGS heading. |
| Toast keyed by testid | `apps/web/src/toast.tsx` | `showToast('toast-signing-provider-saved', …)`. |
| The signing page shell | `apps/web/app/sign/[token]/page.tsx`, `apps/web/app/sign/[token]/SigningLayout.tsx` | Kept; only its body forks on `surface`. |
| Captured deliveries | `apps/api/test/signwell-webhook-fixtures.ts` | Verified above. Note `data.object.fields` is an **array of arrays** — page-grouped. |
| Integration bootstrapping with `overrideProvider` | `apps/api/test/envelopes.spec.ts`, `apps/api/test/envelope-fixtures.ts` | "The SignWell client stubbed at the HTTP boundary" is `overrideProvider(SignWellHttpClient)` — the same move `StubPdfRenderer` already makes. |
| The fixture fence | `apps/api/src/test-support/fixture-gate.ts` | The one gate every `/api/test/*` route shares. The E2E provider stub's control surface sits behind it rather than growing a second fence. |

## What must be built from zero

1. **The `SigningProvider` port** — abstract class, `ProviderCapabilities`, and the two narrowing
   interfaces `LocallySigned` / `RemotelyTracked`. Plus a **registry** keyed by provider key, which
   `selectSignatureProvider()` is not: it resolves one class at boot from an env var.
2. **`InternalSigningProvider`** — the shipped engine re-expressed on the new port. This is the risky
   half: it touches a working signature path, and requirement 10 makes "spec 02's suite passes
   unedited" the acceptance test rather than an intention.
3. **The Certificate of Completion as a module.** The new port has no `finalize`, and today
   `EnvelopeCompletionService` gets document-plus-certificate from it.
4. **`SignWellSigningProvider` and its HTTP client** — 10s timeout, per-route-family limits read from
   `x-ratelimit-*`, five-attempt backoff with jitter, a circuit breaker, error mapping, and the
   response projection requirement 36 demands.
5. **Text-tag translation** — `{{…}}` to SignWell tag syntax, with the residual assertion that aborts
   the send. Nothing resembling it exists.
6. **The webhook receiver** — the product's second unauthenticated route: hash verification, redaction,
   the replay store, a leak-free `200`, a rate limit.
7. **Converge-to-state reconciliation** — a second writer of the event chain, reached three ways
   (doorbell, lazily on read, sweep).
8. **`ProviderWebhookEvent` and six new columns** — the run's one migration.
9. **The organization-settings surface.** There is **no `/org/{orgId}/settings/*` route in the product
   today** — the routes are `documents`, `members`, `outbox`, `projects`, `requests`, `time-tracking`.
   This spec introduces the first one, and with it a `nav-settings` entry that does not exist.
10. **The embedded signing host** — the iframe, the origin-checked `postMessage` listener, and a CSP
    change (below).
11. **A stubbed SignWell driver for E2E** with a runtime control surface, because TC-04-E2E-03 needs the
    stub to answer `503` and then be made healthy inside one test.

## Decisions the spec leaves open, made here so they are not re-derived

Each of these has one reading that is clearly intended and one that is merely possible. I picked, and
say why, so review does not read the pick as an invention.

- **`completedDocument` is implemented by both providers.** The new port has no `finalize`, yet
  requirement 9 preserves the Certificate of Completion exactly. The alternative — leaving
  `InternalSigningProvider.completedDocument()` as a throw because its capability says `ours` — is the
  "port method with no caller" shape requirement 18 explicitly criticises. So: the certificate assembly
  moves to `apps/api/src/documents/certificate-of-completion.ts` (moved, not rewritten),
  `InternalSigningProvider.completedDocument()` builds document-plus-certificate and renders it through
  the injected `PdfRenderer`, and `SignWellSigningProvider.completedDocument()` downloads.
  `capabilities.completedDocument` then decides only **ordering** — invariant 10's bytes-before-status
  for `provider`, spec 02's unchanged ordering for `ours` — and whether a certificate exists at all
  (requirement 28). Both readings produce the same observable output; this one keeps every port method
  with a caller.
- **A plain `<iframe>`, not SignWell's `SignWellEmbed` SDK.** The flow text names `SignWellEmbed`, but
  the UI table calls `sign-embedded-frame` "the iframe", TC-04-E2E-02 asserts *its* `src` is the URL the
  provider returned, and edge case 20 has **us** checking `event.origin` on a `postMessage`. All three
  describe our own frame with our own listener. Loading a vendor script onto `/sign/*` would also mean
  widening `script-src` on the one page that renders author-controlled HTML without a session, which
  the spec nowhere authorises. So: our iframe, our listener, no third-party script. The cost is that
  the instant in-page confirmation depends on SignWell emitting a `postMessage` we have not observed;
  edge case 19 already makes that cosmetic, since the envelope converges regardless.
- **`providerSyncedAt` is written at send**, alongside `providerKey` and `providerTestMode`, and a
  **null** `providerSyncedAt` on a remote envelope counts as stale. Without the first half,
  TC-04-INT-15's "zero calls to SignWell" is at the mercy of whether requirement 24a fires on a
  freshly-sent envelope.
- **The dedupe row is written before the response; only the reference lookup and convergence are
  deferred.** Requirement 25's "the reference lookup happens after the response is queued" is about the
  `providerRef` → envelope resolution, which is the only part that could leak which documents we hold.
  TC-04-INT-05 ("exactly one `ProviderWebhookEvent` row") and TC-04-INT-08 ("no row") both assert on the
  row synchronously, so the unique insert has to sit on the request path.
- **`create()` writes `providerRef = created.id` only for `internal`.** Requirement 1 says nothing
  provider-side exists for a draft. Nothing reads it before send and no test asserts it.
- **`applySignature` stays inside the signing transaction.** Invariant 11's stated reason is a
  five-attempt backoff holding a row lock for a minute; `applySignature` lives on `LocallySigned`, which
  only a provider with `signingSurface: 'ours'` implements, so it never touches the network. Moving it
  would also reorder error precedence against spec 02's suite, which requirement 10 forbids disturbing.
  The invariant is enforced on the four base-class methods, which are the ones that can reach out.
- **Reminders never consult the provider**, and the sweep mints its replacement token through
  `signing-token.ts` directly, now that `issueInvitation` has left the port (requirement 18).
- **Signer *n+1*'s token and invitation are ours under every provider.** `signingOrder: 'provider'`
  means SignWell advances its own turn; it does not mean the counterparty gets a vendor link. The
  reconciler mints our token and sends our SES invitation on converging to `partially_signed`
  (requirement 12, and step 8 of the "First signer signs" flow).

## The thing the spec does not mention and the plan would die without

`apps/web/next.config.mjs` sets a Content-Security-Policy on `/sign/:path*` whose `frame-src` is
`'self'`. As the code stands, the browser refuses a SignWell iframe on that page outright: TC-04-E2E-02
cannot pass and no signer could ever sign through the widget. The spec's Infrastructure and Blast Radius
sections do not mention it. Widening it is unambiguous — the plan does it in T10 — but it is a
security-relevant change to a mitigation the area README lists as required, so it also goes to the human
as a note. Two consequences the plan carries: `headers()` resolves at **build time**, exactly like
`rewrites()`, so the embed origin has to come from a build-time variable; and the E2E stub's embed URL
must be an origin that variable admits.

## Test levels

I moved no case between levels. The spec's own split already follows the repository rule: 28 integration
cases carry every server rule, and the five E2E cases each buy something no API test can reach — a
browser origin, a checkbox that gates a button, an absent canvas, an absent nav item, a frame's `src`.
Six unit cases sit on pure functions. Coverage: 42 requirements and 40 live `TC-*` ids — no case in this
spec is marked `- **Retired.**` — each assigned to at least one task.

## Verdict

Two notes, no blockers. Neither prevents the plan from being executed: the first names a `data-testid`
that two specs spell differently and states which spelling the plan uses; the second names the CSP the
spec forgot and states what the plan does about it. Both are handed to the human at the end.
`status: pass`.
