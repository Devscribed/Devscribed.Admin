# Pre-implement — documents/04 Signature Providers & SignWell

Run `2026-08-28T17-26-56_documents-04-signature-providers` · branch `spec/signwell-provider` ·
base `57d55ac` · spec sha `1a6ed08c` (matches `run.json`; I recomputed it rather than trusting
preflight).

## The situation this plan is shaped by

I read the code before the plan, and the first thing the code said was that this is not a from-zero
build. The branch already carries a full implementation of this spec:

```
57d55ac  (diff base) Spec 04: resolve the contradiction pre-implement found
1b77b06  Spec 04: a session-scoped SigningProvider port, and SignWell behind it   [the implementation]
2201c91  Close the six spec defects the first run found                            (specs/ + scripts/ only)
4b391ad  Spec 04: settle the deploy order, and make three comments cite the spec that exists
845e8c4  Ask the spec-immutable rule the question it means, not the one the diff answers
38cabfa  Keep the pipeline own record out of the diff it reviews                   (HEAD at init)
```

The previous run halted at the static gate on `pipeline/spec-immutable`, because the rule read the
whole diff from the base — which contains 2201c91 spec edit — instead of what the implement stage
itself changed. That rule has since been corrected, and this run restarts the pipeline over the same
tree with an unchanged spec.

There were two ways to plan this and only one of them is honest. A from-zero plan would tell the
implementer to create `apps/api/src/signature/signing-provider.ts` when it is already there in a form
I have read. So every task names the path that carries its requirements today and states what this run
must still do to it, and `runContext` in the handoff says so in its first sentence, because a reader
expecting a build plan would otherwise misread the whole file.

## Reconnaissance — what I verified by opening the file

Not a summary of the previous run report; I re-checked each one.

| Spec area | Where it lives now | What I checked |
|---|---|---|
| Data model | `apps/api/prisma/schema.prisma`, `.../migrations/20260828140000_spec_04_signature_providers/migration.sql` | One migration, additive throughout: new columns with defaults on `Organization`, `Envelope`, `EnvelopeSigner`; the `ProviderWebhookEvent` table with the five-column unique key and the `processedAt` index; two new `EnvelopeEventType` values. No rename, no drop, no new `NOT NULL`. The `EnvelopeSigner` unique the spec deliberately omits is omitted, with the reason in the schema comment. |
| The port | `apps/api/src/signature/signing-provider.ts` | Abstract class with the four methods, `LocallySigned` and `RemotelyTracked` as narrowing interfaces, no `remind`, no `issueInvitation`. |
| Registry | `apps/api/src/signature/provider-registry.ts`, `apps/api/src/core.module.ts` | `missingConfiguration()` names the three SignWell values; an adapter is registered when configured, not when selected (backward compatibility 7). |
| Internal provider | `apps/api/src/signature/internal-signing-provider.ts` | Replaces `internal-signature-provider.ts`. A diff over the test trees shows the spec 02 suite untouched except the single hunk requirement 10 enumerates: fifteen becomes seventeen in `packages/validation/src/envelopes.test.ts`. |
| SignWell adapter | `apps/api/src/signature/signwell/` (five files) | Per-route-family rate-limit state read from the response, 10s timeout, five attempts, breaker at five failures for 60s, the `waiting` and `sent` status mapping, a projection that drops field values, a stub driver gated by `SIGNWELL_DRIVER` and `fixture-gate.ts`. |
| Text tags and send | `apps/api/src/documents/signwell-text-tags.ts`, `envelopes.service.ts` | Translation, the residual-brace abort, the materialization poll, `ORPHAN_SCAN_PAGE_CAP = 20` with client-side `metadata.envelope_id` matching. |
| Webhook | `apps/api/src/webhooks/` (six files) | A bare `401` on a bad hash, a `200` with the reference lookup deferred to the queue, dedupe on the composite key, redaction before the first write. |
| Reconciler | `apps/api/src/documents/provider-reconciler.service.ts`, `internal/envelope-sweep.service.ts` | `DEFAULT_PROVIDER_SYNC_STALE_SECONDS = 120`, the four outcomes, the terminal short-circuit that skips `fetchState` for a self-inflicted `document_canceled`, the sweep reconcile pass. |
| Completion and void | `apps/api/src/documents/envelope-completion.ts` | Download, then put, then the transactional update; the certificate is branched on the `completedDocument` capability and not on the key. |
| Settings | `apps/api/src/organizations/signing-settings.*`, `apps/web/app/org/[orgId]/settings/signing/` | `SessionGuard` then `OrgScopeGuard` (404, not 403) then `CapabilityGuard`; `configured` is presence only, `reachable` and `webhookRegistered` are displayed and never gate; message text comes from `packages/validation`. |
| Signing surface | `apps/api/src/signing/signing.service.ts`, `apps/web/app/sign/[token]/EmbeddedSigning.tsx`, `apps/web/next.config.mjs` | Wrong turn decided from our own rows before any call; the URL never persisted; a plain iframe with an origin check and no vendor SDK; `frame-src` widened by one build-time origin with `script-src` untouched. |
| Nav and detail | `apps/web/src/layout/Sidebar.tsx`, `.../documents/[envelopeId]/page.tsx` | `nav-settings` rendered only for `ViewSigningSettings` and the route calls `notFound()` otherwise; provider row and test badge present. |
| Tests | seven integration files, four unit files, one E2E file | All forty `TC-04` ids of the spec appear in the suites, and the E2E config runs the stub driver so nothing reaches the network. |

The previous run one genuinely unbuilt deliverable — the deploy order that backward compatibility 3
delegates to the runbook — is now in `docs/deployment.md:94-115`, with the split troubleshooting entry
at `:306-314`. **I found no requirement of this spec with nothing on the branch answering it.**

## The plan

Ten tasks, ordered by dependency rather than by file: the migration and the runbook; the port and its
registry; the in-house rewrite; the SignWell adapter; text tags and the send path; the webhook
receiver; reconciliation; completion and void; the settings surface end to end; the signing surface
and the envelope detail. Requirements 1 to 42 are all assigned, all forty `TC-04` cases are mapped to
a task, and `TC-02-UNIT-02` is mapped to T3 because requirement 10 makes that one assertion this
spec business. Every path cited in `files` and in `reuse` exists — I checked all of them
programmatically after writing the handoff rather than trusting myself while writing it.

Repository rules are encoded where they bite rather than restated as a preamble: the additive rule and
the one-migration-per-run constraint in the T1 `migration` block; org scoping with 404 and not 403,
and `normalizeRole()`, in T9, the only task touching authorization; validation text living in
`packages/validation` in T5 and T9; the submit-never-disabled rule in T9 together with the one
exception this spec earns, where the confirmation checkbox gates the confirm button and the validation
never does; design-system imports and tokens in T9 and T10.

The two dangerous details got their own tasks and their own risk entries rather than a line inside a
larger one. Requirement 14 collision fails invisibly — a tag SignWell does not strip, painted in the
page background colour — so T5 states that both the residual-brace assertion and the materialization
poll are aborts and never warnings. The list route in requirement 26 ignores a filter silently rather
than rejecting it, so T5 states that matching is client-side and that no match means a failed send
rather than an adopted document.

## Findings

Three notes, no blockers. The spec compiles: every requirement I tried to turn into a task had one
reading, and where the text is emphatic it is emphatic in the same direction as the code.

- **N1 (carried, spec).** The first-signer flow still says the `SignWellEmbed` SDK event fires in the
  parent page, while requirement 15 says that SDK is deliberately not loaded and the CSP makes the
  other reading unimplementable. Requirement 15 governs and the code follows it, so this is drift,
  not ambiguity.
- **N2 (carried, spec).** No DS gaps table in spec 04, nor in any documents spec, while `CLAUDE.md`
  requires one and two shipped comments say a gap is recorded in it. The two gaps are carried in
  `handoff.dsGaps` so nothing is lost in this run; the convention is what is missing.
- **N3 (new, spec).** `specs/documents/README.md:31` and `:118` still say an envelope provider is
  written **at creation**, which requirement 1, invariant 7, edge case 14, TC-04-INT-17 and the
  README own Shared Rules row at `:57` all contradict — the setting is read at **send**. The
  normative rows agree with the spec, so the plan is unaffected; the rationale column is stale and
  would teach the next reader the decision that was deliberately rejected.

None of the three changes a task. All three carry a witness someone other than me can check, which is
why they are recorded rather than fixed silently — and why they are notes rather than blockers, since
halting the run here would spend a human on prose drift while the governing text is unambiguous.

## What I did not do

I ran no test suite. Nothing has been implemented in this stage, so a suite run would only tell me what
the branch already does, at minutes a go; the seven integration files and the E2E file are the
implement and QA stages business. I read the tree with `git`, `grep` and `sed`, and I wrote no
product code.
