# Pre-implement — spec 04, Signature Providers & SignWell

Run `2026-08-28T13-28-44_documents-04-signature-providers` · branch `spec/signwell-provider` ·
base `0f709b8` · spec sha256 `893b8c06…` (matches `run.json`).

**Verdict: blocked on one spec contradiction (P1), with four notes.** The plan is written and
complete — every requirement and every test case is assigned — but P1 cannot be planned around,
only chosen, and the two choices produce different executed contracts.

## What I read

The spec in full; `specs/documents/README.md` (Shared Rules, the role-enum note, Cross-Spec Side
Effects, Blast Radius, Known Gaps); the `depends-on` specs 01 and 02 for their shared rules and
the supersession note the last commit added to spec 02; `CLAUDE.md`; `1_DS for dev/README.md`.
There is no `04-signature-providers.design.md` — the documents area ships no design files.

Then the code, before the plan: the whole `apps/api/src/signature/` port and its internal
implementation, `envelopes.service.ts` (send, void, create), `envelope-completion.ts`,
`envelope-events.service.ts`, `envelope-renderer.ts`, `signing.service.ts` and its controller,
`envelope-sweep.service.ts`, the three guards, `core.module.ts` / `app.module.ts` /
`documents.module.ts`, the Prisma schema, `packages/validation/src/roles.ts` and `envelopes.ts`,
`apps/web/src/layout/Sidebar.tsx`, the org layout and envelope detail, `e2e/playwright.config.ts`,
and `infra/terraform/modules/app/{api,iam}.tf`.

The base commit added the spec, the README revisions, and
`apps/api/test/signwell-webhook-fixtures.ts` — three real deliveries with their original hashes.
Nothing else of this spec exists yet; `git show --stat 0f709b8` is four files.

## The two lists

**Exists, and is reused.** Every path below was opened, not assumed.

- The provider columns are already on the table with their defaults —
  `apps/api/prisma/schema.prisma:375-376`. The area README's promise held for the *columns*.
- `apps/api/src/documents/envelope-events.service.ts` — the chain's single writer, which takes the
  transaction client as a parameter so an event cannot be written outside a transaction. The
  reconciler joins as a second caller and needs no change to it.
- `apps/api/src/documents/envelope-completion.ts` — the content-addressed
  `signed/{orgId}/{envelopeId}/{hash}.pdf` key and the `updateMany` guard that makes exactly one
  writer win. Only the byte source changes.
- `apps/api/src/pdf/pdf-renderer.ts`, `apps/api/src/storage/file-storage.ts`,
  `apps/api/src/queue/job-queue.ts` — still needed, unchanged.
- `apps/api/src/signature/signing-token.ts` — token minting is untouched; our token still gates
  `/sign/{token}` under SignWell.
- `apps/api/src/internal/internal-task.guard.ts` — the session-less shared-secret guard shape the
  webhook endpoint copies, including "an unset secret denies everything".
- `apps/api/test/signwell-webhook-fixtures.ts` — `WEBHOOK_ID` plus `documentCreated`,
  `documentSent`, `documentCanceled` with unmodified `type`/`time`/`hash`.
- `apps/api/src/auth/{session,org-scope,capability}.guard.ts` and
  `packages/validation/src/roles.ts` — the settings endpoints use the ordinary stack, and
  `normalizeRole()` already exists, so the role-in-transition rule costs nothing new.
- `apps/web/app/sign/[token]/` — the shell and `SigningLayout` are kept; only the body forks.
- `apps/api/src/documents/envelope-renderer.ts` — the `data-signer-role` anchor contract and the
  signer-owned placeholders left standing at freeze are exactly what text-tag translation reads.
- The `MAIL_TRANSPORT=memory` / `STORAGE_DRIVER=local` driver-by-environment pattern
  (`mail.provider.ts`, `storage.provider.ts`, `e2e/playwright.config.ts`) is the model for the
  SignWell stub, and `apps/api/src/test-support/fixture-gate.ts` is the fence if it needs steering.

**Must be built from zero.** The port itself (session-scoped, with a capability record and two
narrowing interfaces); a registry replacing the single-class DI in `signature.provider.ts`;
`InternalSigningProvider` re-expressed against it — a rewrite of a shipped engine; the SignWell
adapter and its HTTP client with header-read rate limits, backoff, breaker and projections;
text-tag emission and the residual-`{{…}}` assertion; the two-phase send with its verification
poll; orphan recovery by client-side metadata matching; the webhook receiver with redaction and a
replay store; the converge-to-state reconciler plus lazy and scheduled convergence;
provider-sourced completion; void-by-delete; **the entire organization-settings surface, which the
product does not have at all today** — the org routes are documents, members, outbox, requests,
projects, time-tracking; the embedded signing host; and a stub driver plus an E2E seeding path.

The cost is not in the adapter. It is in the rewrite of the internal provider, in restructuring
`send()` so no provider call sits inside its transaction, and in a settings surface that has no
precedent to copy.

## How the plan is cut

Eleven tasks, ordered so the dangerous change lands alone: schema and shared constants (T1), the
port and registry (T2), **the internal rewrite by itself (T3)**, the client (T4), text tags and the
send (T5), the webhook receiver (T6), the reconciler (T7), completion and void (T8), the settings
API (T9), the signing surface (T10), the web screens and E2E (T11). T3 is deliberately its own
task and its own commit: requirement 10 makes "spec 02's suite passes unedited" a checkable
statement, and it is only checkable if nothing else moved in the same breath.

Repository rules encoded into the tasks rather than left to memory:

- **One additive migration** (T1) — new columns with defaults, one new table, two enum values; no
  renames, no drops, no new `NOT NULL`. Deploy rolls services out *before* `migrate deploy`, so
  this is load-bearing. The migration adds the enum values and writes no rows with them, because
  Postgres will not let a value added by `ALTER TYPE … ADD VALUE` be used in the same transaction.
- **Org scoping** (T9) — `OrgScopeGuard`, 404 not 403, queries by `session.organizationId` and
  never by the path parameter.
- **`normalizeRole()`** is named in T9's description, the task that touches authorization, and the
  two new capabilities are added to the closed union in T1.
- **Messages in `packages/validation`** (T1), never inline, re-run server-side; validation rules 4,
  5 and 6 exist only on the server.
- **`@ds` and tokens only**, with what is missing recorded in `dsGaps` rather than improvised.
- **Submit is never disabled for validation** — the only disabled controls on the settings screen
  are the in-flight save and the modal's confirm behind its checkbox, which the spec itself calls
  out as the deliberate-confirmation case.

## Why P1 blocks

Requirement 1, invariant 7 and the Data Model all say `providerKey` is pinned when the envelope is
created — and the code already does exactly that at `envelopes.service.ts:559`. Edge case 13 says
"the send already read the organization setting", and TC-04-INT-17 seeds a draft *before* the
switch and then expects the sent envelope to be `signwell`. Those cannot both be implemented.
Guessing costs more than asking: under creation-time pinning QA fails on a test case that cannot
be argued with, and under send-time pinning review fails on an invariant that cannot be argued
with, so the run burns attempts on its way to the same human. And the thing being decided is not
cosmetic — it is which service executes a contract an organization has already drafted, and
therefore whose audit page is its evidence.

The four notes do not stop the run: the reminder caller (P2), "verbatim" versus redacted storage
(P3), whether a live webhook registration gates selection (P4), and Secrets Manager versus this
repository's SSM parameters (P5). Each has a witness, each has a defensible reading, and the
handoff records the reading it took in `openQuestions` so the choice is visible rather than
smuggled.

## Checks run on the handoff

- Requirements 1–42: every number assigned to at least one task (verified mechanically).
- Test cases: 40 live (6 unit, 29 integration, 5 E2E), each assigned; the spec retires none.
- Task dependencies all resolve to task ids that exist.
- Every path cited in `reuse` exists on disk.

No test suite was run. Nothing of this spec is implemented, so a suite run would only report what
`main` already does, at minutes a go.
