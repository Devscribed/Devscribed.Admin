# Implement — attempt 3

Spec: `specs/documents/04-signature-providers.md`
Branch: `spec/signwell-provider`  ·  Base: `57d55acd03b825aeed9c85836e85138f12b01be1`
Commit: `fb6d0df` (attempt 2's `95f669a`, **amended** — one run, one commit)

## The finding, answered

| Finding | Verdict |
| --- | --- |
| `pipeline/no-detector-weakening` — `packages/validation/src/signwell-webhook.test.ts`, "an `as any` cast was added": `const pages = redacted.data.object.fields as any[][];` | **Fixed**, not contested. |

**How.** The cast was the test navigating an untyped payload instead of checking it.
`redactProviderPayload` returns `unknown` on purpose — it walks a body whose shape is
SignWell's, not ours — and the case then asserted that shape away with `as any[][]`, which is
exactly the failure mode its own comment warns about ("a redactor written as
`fields.map(f => …)` type-checks against a hand-written interface and silently redacts
nothing"). A cast cannot catch that; only a check can.

So the suite now narrows rather than casts:

- a `RedactedDelivery` interface naming the parts these cases read — `event.{hash,time,type}`,
  the **page-grouped** `fields: RedactedField[][]`, `recipients[]`, `metadata`;
- `readRedacted(body)`, which redacts and then *verifies* every one of those parts at runtime
  (`asObject` / `asArray` throw naming the path that failed) before narrowing. It returns the
  redactor's own object rather than a rebuilt copy, so `JSON.stringify(redacted)` still covers
  the whole payload — the "no signing URL survives anywhere" and "is total" cases lose nothing;
- the two `as Record<string, any>` casts, at the describe head and in the foreign-metadata
  case, are gone with it. `readRedacted` is the only way into the payload now.

**The check got stronger, not weaker.** `expect(pages).toHaveLength(1)` is a new assertion —
the captured delivery carries one page — so a redactor that flattened the grouping now fails
on the page count as well as on `Array.isArray(pages[0])`, and a shape change anywhere else in
`RedactedDelivery` throws inside `readRedacted` with the failing path named. Net assertions in
the file: **+1**. Nothing skipped, commented, suppressed or loosened; no assertion removed.

`node scripts/static-gate.mjs --base 57d55acd` now reports **pass**.

No production code changed on this attempt — the delta against attempt 2 is one test file.

## Tasks

| Task | Files touched |
| --- | --- |
| T1 — migration, capabilities, strings | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260828140000_spec_04_signature_providers/migration.sql`, `packages/validation/src/roles.ts`, `packages/validation/src/roles.test.ts`, `packages/validation/src/signing-providers.ts`, `packages/validation/src/index.ts`, `apps/api/.env.example`, `apps/api/test/setup-env.ts`, `e2e/playwright.config.ts` |
| T2 — the `SigningProvider` port and registry | `apps/api/src/signature/signing-provider.ts`, `apps/api/src/signature/provider-registry.ts`, `apps/api/src/signature/signature.provider.ts`, `apps/api/src/core.module.ts`, `packages/validation/src/signing-providers.test.ts` |
| T3 — in-house engine on the new port | `apps/api/src/signature/internal-signing-provider.ts` (new), `apps/api/src/signature/internal-signature-provider.ts` + `signature-provider.ts` (deleted), `apps/api/src/documents/certificate-of-completion.ts`, `apps/api/src/documents/envelope-completion.ts`, `apps/api/src/documents/envelopes.service.ts`, `apps/api/src/signing/signing.service.ts`, `apps/api/src/internal/envelope-sweep.service.ts` |
| T4 — SignWell adapter and HTTP client | `apps/api/src/signature/signwell/{signwell-signing-provider,signwell-http-client,signwell-types,signwell-projection,stub-signwell-http-client}.ts`, `apps/api/src/test-support/signwell-stub.controller.ts`, `apps/api/test/signwell-client.spec.ts` |
| T5 — text tags and the send path | `apps/api/src/documents/signwell-text-tags.ts`, `apps/api/src/documents/envelopes.service.ts`, `packages/validation/src/signing-providers.ts`, `packages/validation/src/signwell-text-tags.test.ts`, `apps/api/test/signwell-send.spec.ts` |
| T6 — the webhook receiver | `apps/api/src/webhooks/{webhooks.module,signwell-webhook.controller,signwell-webhook.guard,webhook-rate-limit.guard,signwell-notification,redact-payload}.ts`, `apps/api/src/app.module.ts`, **`packages/validation/src/signwell-webhook.test.ts` (the file this attempt changed)**, `apps/api/test/signwell-webhook.spec.ts` |
| T7 — converge-to-state | `apps/api/src/documents/provider-reconciler.service.ts`, `apps/api/src/documents/documents.module.ts`, `apps/api/src/documents/envelopes.service.ts`, `apps/api/src/internal/envelope-sweep.service.ts`, `apps/api/src/queue/job-queue.ts`, `apps/api/test/signwell-reconcile.spec.ts` |
| T8 — completion and void | `apps/api/src/documents/envelope-completion.ts`, `apps/api/src/documents/provider-reconciler.service.ts`, `apps/api/src/documents/envelopes.service.ts`, `apps/api/src/internal/envelope-sweep.service.ts`, `apps/api/test/signwell-completion.spec.ts` |
| T9 — the signing-settings API | `apps/api/src/organizations/{signing-settings.controller,signing-settings.service,signing-settings.dto}.ts`, `apps/api/src/app.module.ts`, `apps/api/test/signing-settings.spec.ts` |
| T10 — the signing surface | `apps/api/src/signing/signing.service.ts`, `apps/web/app/sign/[token]/page.tsx`, `apps/web/app/sign/[token]/EmbeddedSigning.tsx`, `apps/web/src/documents/envelopes.ts`, `apps/web/next.config.mjs`, `apps/api/test/signing-embedded.spec.ts`, `e2e/tests/signature-providers.spec.ts` |
| T11 — settings screen, nav, envelope detail | `apps/web/app/org/[orgId]/settings/signing/{page,ProviderOption,ChangeProviderModal}.tsx`, `apps/web/src/layout/Sidebar.tsx`, `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx`, `apps/web/src/documents/envelopes.ts`, `e2e/tests/signature-providers.spec.ts` |

One migration, `20260828140000_spec_04_signature_providers` — six additive columns with
defaults, one new table, two new enum values. **No second migration**: this attempt added
nothing to the schema and replaced nothing in it.

## Test cases and where they live

### Unit — `packages/validation`

| Case | File |
| --- | --- |
| TC-04-UNIT-01, -02, -03 | `packages/validation/src/signwell-text-tags.test.ts` |
| TC-04-UNIT-04, -06 | `packages/validation/src/signwell-webhook.test.ts` |
| TC-04-UNIT-05 | `packages/validation/src/signing-providers.test.ts` |

### Integration — `apps/api/test`

| Case | File |
| --- | --- |
| TC-04-INT-01, -02, -03, -03a, -03b, -03c, -03d, -22 | `apps/api/test/signwell-send.spec.ts` |
| TC-04-INT-04, -05, -07, -08 | `apps/api/test/signwell-webhook.spec.ts` |
| TC-04-INT-06, -11, -12 | `apps/api/test/signwell-reconcile.spec.ts` |
| TC-04-INT-09, -10, -10a, -10b, -10c, -13 | `apps/api/test/signwell-completion.spec.ts` |
| TC-04-INT-14, -15 | `apps/api/test/signing-embedded.spec.ts` |
| TC-04-INT-16, -17, -18, -19 | `apps/api/test/signing-settings.spec.ts` |
| TC-04-INT-21 | `apps/api/test/signwell-client.spec.ts` |
| TC-04-INT-20 | **No new file, by construction** — the case *is* spec 02's suite run unedited. `apps/api/test/envelopes.spec.ts` and `apps/api/test/signing.spec.ts` are untouched in the diff and both pass. |

### E2E — `e2e/tests/signature-providers.spec.ts`

TC-04-E2E-01 through -05, one `test` each. **Not run** here, per the stage rules; QA runs the
targeted set next and the deploy gate runs it sharded.

## Carried forward from attempt 2 (unchanged, still true)

- **Environment note, not a failure.** A native Windows `postgres.exe` holds `localhost:5433`
  ahead of the Docker mapping, so `prisma migrate deploy` fails `P1000` against the tracked
  default. The same container also publishes **5434**, which `apps/api/.env` already uses.
  Every integration run below used the documented override rather than editing a tracked file:
  `TEST_DATABASE_URL='postgresql://devscribed:devscribed@localhost:5434/devscribed_test'`.
  QA will need the same override on this machine, or 5433 freed.
- **Two `data-testid` spelling conflicts between spec 04 and shipped code** —
  `envelope-download-button` vs the shipped `envelope-download-btn` (pre-implement note P1),
  and `sign-signature-canvas` vs the shipped `signing-signature-canvas`. Both E2E cases assert
  the shipped spelling, because the alternatives are editing a shipped test (requirement 10
  forbids it) or asserting the absence of an id that never existed, which is vacuously true.
  Spec-text defects, not blockers: only one implementation satisfies the shipped suites.
- The three production changes attempt 2 made under its tests — the bare 401 body via
  `WebhookHashRejected` plus a `@Catch` filter, `SIGNWELL_POLL_INTERVAL_MS='0'` in the test
  env, and nothing else — stand unmodified.

## Verification run (this attempt, on the amended commit)

| What | Result |
| --- | --- |
| `npm run test:unit` | 19 files, **941 passed** (`signwell-webhook.test.ts`: 16) |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| `tsc --noEmit --strict` over `signwell-webhook.test.ts` (the package tsconfig excludes tests) | clean — the narrowing type-checks with no cast to `any` |
| Integration, the **seven** spec files this diff touches | **34 passed, 0 failed** — `signwell-send`, `signwell-webhook`, `signwell-reconcile`, `signwell-completion`, `signwell-client`, `signing-settings`, `signing-embedded` |
| Integration, untouched suites the changed production code serves | **75 passed** — `envelopes`, `signing` (that is TC-04-INT-20), `capability`, `members` |
| `node scripts/static-gate.mjs --base 57d55acd` | **pass** |
| E2E | **not run**, per the stage rules |

Verdict: `pass`.
