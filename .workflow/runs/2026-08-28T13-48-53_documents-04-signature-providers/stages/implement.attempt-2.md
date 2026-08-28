# Implement — attempt 2

Spec: `specs/documents/04-signature-providers.md`
Branch: `spec/signwell-provider`  ·  Base: `57d55acd03b825aeed9c85836e85138f12b01be1`

## What this attempt is

Attempt 1 ended on the stage's 45-minute fuse (`{"status":"error"}`), not on a code
verdict — `budget.codeAttempts` is still 0 and there are no findings to answer. It left the
worktree with the production code for T1–T11 written but **uncommitted and untested**: no
integration suite for any of the eleven tasks existed, and nothing had been run.

So this attempt is not a retry of a rejected diff. It is: verify what attempt 1 wrote,
write the test suites it never got to, fix what those tests found, and commit the whole
thing as one commit.

**No findings to answer, nothing contested.**

## Environment note (not a failure)

`apps/api/test/database-url.ts` defaults the test database to `localhost:5433`. On this
machine a native Windows `postgres.exe` service (PID 6928) also listens on 5433 and wins the
bind ahead of the Docker container's mapping, so `prisma migrate deploy` fails
`P1000: Authentication failed` — the connection lands on a server that has no `devscribed`
role. The same container publishes 5434, which `apps/api/.env` already uses for the dev
database and where `devscribed_test` and its per-worker copies exist.

Every run below therefore used the documented override rather than editing a tracked file:

```
TEST_DATABASE_URL='postgresql://devscribed:devscribed@localhost:5434/devscribed_test' npm test -- test/<file>.spec.ts
```

QA and the deploy gate will need the same override on this machine, or 5433 freed.

## Tasks

| Task | Files touched |
| --- | --- |
| T1 — migration, capabilities, strings | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260828140000_spec_04_signature_providers/migration.sql`, `packages/validation/src/roles.ts`, `packages/validation/src/roles.test.ts`, `packages/validation/src/signing-providers.ts`, `packages/validation/src/index.ts`, `apps/api/.env.example`, `apps/api/test/setup-env.ts`, `e2e/playwright.config.ts` |
| T2 — the `SigningProvider` port and registry | `apps/api/src/signature/signing-provider.ts`, `apps/api/src/signature/provider-registry.ts`, `apps/api/src/signature/signature.provider.ts`, `apps/api/src/core.module.ts`, `packages/validation/src/signing-providers.test.ts` |
| T3 — in-house engine on the new port | `apps/api/src/signature/internal-signing-provider.ts` (new), `apps/api/src/signature/internal-signature-provider.ts` + `signature-provider.ts` (deleted), `apps/api/src/documents/certificate-of-completion.ts`, `apps/api/src/documents/envelope-completion.ts`, `apps/api/src/documents/envelopes.service.ts`, `apps/api/src/signing/signing.service.ts`, `apps/api/src/internal/envelope-sweep.service.ts` |
| T4 — SignWell adapter and HTTP client | `apps/api/src/signature/signwell/{signwell-signing-provider,signwell-http-client,signwell-types,signwell-projection,stub-signwell-http-client}.ts`, `apps/api/src/test-support/signwell-stub.controller.ts`, **`apps/api/test/signwell-client.spec.ts` (new)** |
| T5 — text tags and the send path | `apps/api/src/documents/signwell-text-tags.ts`, `apps/api/src/documents/envelopes.service.ts`, `packages/validation/src/signing-providers.ts`, `packages/validation/src/signwell-text-tags.test.ts`, **`apps/api/test/signwell-send.spec.ts` (new)** |
| T6 — the webhook receiver | `apps/api/src/webhooks/{webhooks.module,signwell-webhook.controller,signwell-webhook.guard,webhook-rate-limit.guard,signwell-notification,redact-payload}.ts`, `apps/api/src/app.module.ts`, `packages/validation/src/signwell-webhook.test.ts`, **`apps/api/test/signwell-webhook.spec.ts` (new)** |
| T7 — converge-to-state | `apps/api/src/documents/provider-reconciler.service.ts`, `apps/api/src/documents/documents.module.ts`, `apps/api/src/documents/envelopes.service.ts`, `apps/api/src/internal/envelope-sweep.service.ts`, `apps/api/src/queue/job-queue.ts`, **`apps/api/test/signwell-reconcile.spec.ts` (new)** |
| T8 — completion and void | `apps/api/src/documents/envelope-completion.ts`, `apps/api/src/documents/provider-reconciler.service.ts`, `apps/api/src/documents/envelopes.service.ts`, `apps/api/src/internal/envelope-sweep.service.ts`, **`apps/api/test/signwell-completion.spec.ts` (new)** |
| T9 — the signing-settings API | `apps/api/src/organizations/{signing-settings.controller,signing-settings.service,signing-settings.dto}.ts`, `apps/api/src/app.module.ts`, **`apps/api/test/signing-settings.spec.ts` (new)** |
| T10 — the signing surface | `apps/api/src/signing/signing.service.ts`, `apps/web/app/sign/[token]/page.tsx`, `apps/web/app/sign/[token]/EmbeddedSigning.tsx`, `apps/web/src/documents/envelopes.ts`, `apps/web/next.config.mjs`, **`apps/api/test/signing-embedded.spec.ts` (new)**, **`e2e/tests/signature-providers.spec.ts` (new)** |
| T11 — settings screen, nav, envelope detail | `apps/web/app/org/[orgId]/settings/signing/{page,ProviderOption,ChangeProviderModal}.tsx`, `apps/web/src/layout/Sidebar.tsx`, `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx`, `apps/web/src/documents/envelopes.ts`, **`e2e/tests/signature-providers.spec.ts`** |

One migration, `20260828140000_spec_04_signature_providers` — six additive columns with
defaults, one new table, two new enum values. No second migration was added on this attempt;
attempt 1 created no schema I had to replace.

## Test cases and where they live

### Unit — `packages/validation` (attempt 1; verified green, 941 passing)

| Case | File |
| --- | --- |
| TC-04-UNIT-01, -02, -03 | `packages/validation/src/signwell-text-tags.test.ts` |
| TC-04-UNIT-04, -06 | `packages/validation/src/signwell-webhook.test.ts` |
| TC-04-UNIT-05 | `packages/validation/src/signing-providers.test.ts` |

### Integration — `apps/api/test` (all written this attempt)

| Case | File |
| --- | --- |
| TC-04-INT-01, -02, -03, -03a, -03b, -03c, -03d, -22 | `apps/api/test/signwell-send.spec.ts` |
| TC-04-INT-04, -05, -07, -08 | `apps/api/test/signwell-webhook.spec.ts` |
| TC-04-INT-06, -11, -12 | `apps/api/test/signwell-reconcile.spec.ts` |
| TC-04-INT-09, -10, -10a, -10b, -10c, -13 | `apps/api/test/signwell-completion.spec.ts` |
| TC-04-INT-14, -15 | `apps/api/test/signing-embedded.spec.ts` |
| TC-04-INT-16, -17, -18, -19 | `apps/api/test/signing-settings.spec.ts` |
| TC-04-INT-21 | `apps/api/test/signwell-client.spec.ts` |
| TC-04-INT-20 | **No new file, by construction.** The case *is* spec 02's suite run unedited. `apps/api/test/envelopes.spec.ts` and `apps/api/test/signing.spec.ts` are untouched in this diff — `git diff --stat` lists neither — and both pass: 59 cases, no assertion changed. That is requirement 10 discharged. |

### E2E — `e2e/tests/signature-providers.spec.ts` (written this attempt, **not run**)

TC-04-E2E-01 through -05, one `test` each. Not executed here per the stage rules; QA runs the
targeted set next and the deploy gate runs it sharded.

## What the tests found, and what I changed because of them

Three production changes, all inside handoff file globs.

1. **`401` with an empty body was not empty** (`apps/api/src/webhooks/signwell-webhook.guard.ts`,
   `signwell-webhook.controller.ts`, `webhooks.module.ts`). TC-04-INT-08 requires "401 with an
   empty body", and the guard's own doc comment promises the same. It threw
   `new HttpException('', 401)`, which Nest's default exception layer renders as
   `{"statusCode":401,"message":""}` — a shape an attacker can compare against the
   `{"received":true}` a verified delivery gets, which is exactly what the refusal is supposed
   not to give away. Added `WebhookHashRejected` and a `@Catch` filter that ends the response
   with a bare 401, wired with `@UseFilters` on the controller. The test now asserts
   `response.text === ''`.

2. **`SIGNWELL_POLL_INTERVAL_MS = '0'` in `apps/api/test/setup-env.ts`** (a T1 file). The
   create poll waits three seconds between reads in production. TC-04-INT-03c drives the poll
   deliberately to its ten-attempt bound, which would cost thirty seconds of pure sleep in a
   suite whose stub answers instantly. Zero changes how long it waits and nothing about how
   many times it reads, which is what -03a and -03c assert (`countOf('getDocument')`).

3. Nothing else. The rest of attempt 1's production code passed its cases unchanged.

Two assertions I wrote wrong first and corrected against the implementation, recorded so the
reviewer does not have to rediscover which way round it is:

- `Envelope.providerRef` and `EnvelopeSigner.providerRef` default to `''`, not `null` (schema
  lines 391, 441 — the schema comment says the empty string is deliberately why there is no
  unique index). "Nothing was pinned" is `''`.
- Redaction (`redact-payload.ts`) replaces *values* with `[redacted]` and keeps the keys, so a
  stored row stays legible for forensics. TC-04-UNIT-06's "no `embedded_signing_url` survives"
  is about the URL, not the key; the integration assertion checks that no `signwell.com` URL
  and no field value survives, and that the key is present with `[redacted]`.

## Two spelling conflicts between spec 04 and shipped code

Both are the forced choice pre-implement already recorded as note P1, and neither is new:

- **`envelope-download-button` vs `envelope-download-btn`.** One control, two spellings. Spec
  02 defines `envelope-download-btn`, `apps/web/.../[envelopeId]/page.tsx` ships it, and
  `e2e/tests/field-autofill.spec.ts:436` asserts it. TC-04-E2E-05 in this suite asserts the
  shipped spelling with a comment saying why; renaming would edit a shipped test, which
  requirement 10 forbids.
- **`sign-signature-canvas` vs `signing-signature-canvas`.** TC-04-E2E-02 asks that our own
  signature canvas be asserted absent and names `sign-signature-canvas`. The id that exists is
  `signing-signature-canvas` (`apps/web/src/documents/SignaturePad.tsx:161`). Asserting the
  absence of an id that has never existed is vacuously true and proves nothing, so the E2E case
  asserts the real one absent. This one is **not** in P1 and the spec's list should be
  corrected the same way.

Both are spec-text defects rather than blockers: only one implementation satisfies the shipped
tests, so nothing downstream has to guess.

## Verification run

| What | Result |
| --- | --- |
| `npm run test:unit` | 19 files, **941 passed** |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| Integration, the eleven files the diff touches | **107 passed, 0 failed** — `signwell-send`, `signwell-webhook`, `signwell-reconcile`, `signwell-completion`, `signwell-client`, `signing-settings`, `signing-embedded`, `envelopes`, `signing`, `org-scope`, `outbox` |
| Integration, suites reachable from the `roles.ts` and test-support edits | **19 passed** — `capability`, `test-fixtures`, `members` |
| E2E | **not run**, per the stage rules |

`test/envelopes.spec.ts` and `test/signing.spec.ts` passing unedited is TC-04-INT-20.

Verdict: `pass`.
