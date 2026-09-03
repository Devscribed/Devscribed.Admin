# Implement — attempt 4

Spec: `specs/documents/04-signature-providers.md`
Branch: `spec/signwell-provider`  ·  Base: `57d55acd03b825aeed9c85836e85138f12b01be1`
Commit: `a12ab4f` (attempt 3's `fb6d0df`, **amended** — one run, one commit)

## The findings, answered

| Finding | Verdict |
| --- | --- |
| **F1** `spec/TC-04-E2E-02` — `e2e/tests/signature-providers.spec.ts#FIELDS`: the E2E template declares a signer-owned field the stub cannot materialize, so every SignWell send in the suite aborts at its precondition | **Fixed**, not contested |
| **F2** `spec/edge-case-4` — `apps/api/src/documents/envelopes.service.ts#send`: a document created by `createSession` is orphaned forever when the transaction after it fails | **Fixed**, not contested |
| F3 `spec/conflicting-test-id` (note, target **spec**) | Nothing to do here — see below |
| F4 `spec/ProviderWebhookEvent.outcome` (note, code) | **Fixed** |
| F5 `pipeline/no-detector-weakening` (note, confirmation) | Nothing to do — it records attempt 3's fix as verified |

---

### F1 — the E2E template

**Fixed by dropping the signer-owned field, which is the branch the stub's own docstring
already assumed.** `contractor_bank` is now `filledBy: 'sender'`, and a shared
`FIELD_VALUES` constant fills both keys at all four `createEnvelope` call sites.

The finding's trace was exact: `translateToTextTags` emitted
`{type: 'text', recipientNumber: 2, …}` into `expectedFields`, and
`StubSignWellHttpClient.createDocument` materializes one required **signature** per
recipient and nothing else, so `verifyMaterialized` deleted the document and threw
`ProviderFieldsNotMaterializedError` → 502 → `sendEnvelope` throws in the precondition of
TC-04-E2E-02, -03 and -05.

I took the first of the two suggested fixes rather than the second. Teaching the stub to
materialize a text field per signer-owned tag would mean reading `{{Text_n}}` back out of a
**rendered PDF** — Chromium output, FlateDecode-compressed — which is the one thing the
stub cannot do and the reason its docstring states the constraint. Nothing in TC-04-E2E-01…
-05 asserts anything about a signer-owned field; the spec's preconditions for those cases
ask only for "a sent SignWell envelope". The signer-owned tag path stays covered where it
costs half a second instead of eight: TC-04-INT-01 sends it, TC-04-INT-03a watches the
parse land, TC-04-INT-03b watches a tag that failed to parse abort the send, and
TC-04-UNIT-01…03 pin the translation itself. That reasoning is now a comment above `FIELDS`
so the constraint is not rediscovered by the next person to add a field there.

**Verified, without running E2E.** The precondition is a pure function of the frozen HTML,
so I ran the exact template through the two real functions the send path uses
(`renderEnvelopeDocument` → `translateToTextTags`, a throwaway script, deleted):

```
expectedFields = [{"type":"signature","recipientNumber":1,"required":true},
                  {"type":"signature","recipientNumber":2,"required":true}]
residual {{…}}  = ["{{Signature_1}}","{{Signature_2}}"]   // only the tags we emitted
```

Two signature expectations, no text expectation, no unresolved placeholder — exactly what
the stub materializes (one required signature per recipient, two recipients). The send that
previously 502'd now matches.

### F2 — the orphaned session

**Fixed with both halves of the suggested fix, plus the hazard the pair creates.**

1. **Compensation (`abandonSession`, `envelopes.service.ts`).** The `catch` around the send
   transaction now deletes the document the send just created, through `provider.cancel`.
   That closes the traced scenario at its root: SES rejects the invitation → rollback →
   the document is deleted → the retry has nothing to adopt and nothing to duplicate. It
   also closes the double-click case the witness named second — the loser of the
   `FOR UPDATE` race deletes the session it opened, so exactly one document per envelope
   survives. `ProviderDocumentGoneError` counts as success (already gone), and the internal
   provider's `cancel` is a documented no-op, so nothing about an internal envelope changes.
2. **Adoption (`ORPHANED_SESSION` + `CreateSessionRequest.adoptExisting`).** When the
   deletion *itself* fails — the only way an orphan can now survive — the send writes
   `providerError = 'orphaned_provider_session'` on the still-`draft` envelope, outside the
   rolled-back transaction. The next send reads that marker and passes `adoptExisting`, and
   `SignWellSigningProvider.createOrAdopt` then runs `findOrphan` **before** creating,
   adopting by `metadata.envelope_id`. That is edge case 4 literally: the orphan exists,
   the envelope stayed `draft`, the next send adopts it by metadata (requirement 26).
   The successful send transaction already writes `providerError: null`, so the marker
   clears itself.

   **Why a flag and not an unconditional pre-create scan.** `findOrphan` is a paged scan of
   the whole SignWell account that throws `orphan_scan_cap_reached` after twenty pages.
   Running it on every send would cost up to twenty calls per send and — on an account with
   more than twenty pages of documents — would reach the cap and **fail every send**, with
   nothing to adopt. The marker is the evidence that makes the scan worth its cost, and it
   is stored in the column whose documented meaning it has ("last provider-side error,
   cleared on the next successful sync"). `providerError` is not rendered anywhere in the
   web app, so nothing user-facing changed.
3. **The hazard the pair creates, closed.** Two concurrent sends of an envelope that
   already carries the marker adopt the *same* leftover; the loser's compensation would
   then delete the document the winner has just pinned, leaving an envelope `sent` on a
   document that no longer exists — worse than the orphan. So `abandonSession` refuses to
   delete a `providerRef` the envelope now holds in a non-draft state. A send that created
   its own document is referenced by nothing and is still removed.

   What remains, stated rather than hidden: `createSession` can still run twice for one
   envelope under a double-click, because invariant 11 forbids holding a transaction across
   the provider call and there is therefore no atomic claim to take before it. Requirement
   5's observable guarantee holds — exactly one session survives, and a failed send leaves
   nothing partially applied.

### F3 — `sign-signature-canvas` (note, addressed to **spec**)

Nothing to fix in code and nothing I may fix in the spec. The implementation asserts the
shipped `signing-signature-canvas`, which is the only spelling that makes TC-04-E2E-02's
"our own canvas is not rendered" assertion mean anything; asserting the spec's spelling
would be vacuously true, and renaming the component would edit a shipped test that
requirement 10 protects. Recorded here for the person who corrects the spec's selector
list, alongside pre-implement's P1 (`envelope-download-button` vs the shipped
`envelope-download-btn`).

### F4 — a delivery recorded with no outcome (note)

**Fixed.** `signwell-webhook.controller.ts` now reads `isConfigured` once, before the row
is written, and stores `outcome: 'error'` when the adapter is unconfigured (edge case 16),
with a warning naming why. `processedAt` deliberately stays null, because that column's
meaning is "null until the reconciler has converged" and the reconciler never ran. The
value comes from the spec's own vocabulary (`converged | ignored_terminal | unknown_ref |
error`) rather than a new one. Correctness was never at stake — requirement 24 converges on
the next read or sweep — but the forensics table no longer accumulates rows whose `outcome`
claims nothing.

---

## Tasks touched on this attempt

| Task | Files |
| --- | --- |
| T2 — the port | `apps/api/src/signature/signing-provider.ts` (`CreateSessionRequest.adoptExisting`) |
| T4 — SignWell adapter | `apps/api/src/signature/signwell/signwell-signing-provider.ts` (`createOrAdopt` adopts before creating when asked) |
| T5 — the send path | `apps/api/src/documents/envelopes.service.ts` (`ORPHANED_SESSION`, `abandonSession`, `openSession` options), `apps/api/test/signwell-send.spec.ts` |
| T6 — the webhook receiver | `apps/api/src/webhooks/signwell-webhook.controller.ts` |
| T10 / T11 — E2E | `e2e/tests/signature-providers.spec.ts` |

Tasks T1, T3, T7, T8, T9 are unchanged from attempt 3; their file lists stand as recorded
in `implement.attempt-3.md`.

**One migration, unchanged.** `20260828140000_spec_04_signature_providers` is the only
migration in the diff and this attempt did not touch it: the marker reuses the
`providerError` column the spec's data model already adds, so no seventh column and no
second migration.

## Test cases and where they live

Unchanged from attempt 3 except for the four cases added under **TC-04-INT-03** in
`apps/api/test/signwell-send.spec.ts` — the spec's own id for the adoption mechanism
(requirement 26), which is what edge case 4 points at. No new test id was invented.

| Case | File |
| --- | --- |
| TC-04-UNIT-01, -02, -03 | `packages/validation/src/signwell-text-tags.test.ts` |
| TC-04-UNIT-04, -06 | `packages/validation/src/signwell-webhook.test.ts` |
| TC-04-UNIT-05 | `packages/validation/src/signing-providers.test.ts` |
| TC-04-INT-01, -02, **-03 (+4 new cases)**, -03a, -03b, -03c, -03d, -22 | `apps/api/test/signwell-send.spec.ts` |
| TC-04-INT-04, -05, -07, -08 | `apps/api/test/signwell-webhook.spec.ts` |
| TC-04-INT-06, -11, -12 | `apps/api/test/signwell-reconcile.spec.ts` |
| TC-04-INT-09, -10, -10a, -10b, -10c, -13 | `apps/api/test/signwell-completion.spec.ts` |
| TC-04-INT-14, -15 | `apps/api/test/signing-embedded.spec.ts` |
| TC-04-INT-16, -17, -18, -19 | `apps/api/test/signing-settings.spec.ts` |
| TC-04-INT-21 | `apps/api/test/signwell-client.spec.ts` |
| TC-04-INT-20 | No new file, by construction — the case *is* spec 02's suite run unedited (`envelopes.spec.ts`, `signing.spec.ts`, untouched and green) |
| TC-04-E2E-01…-05 | `e2e/tests/signature-providers.spec.ts` |

The four new cases under TC-04-INT-03:

- deletes the document the rolled-back send created, and creates one on the retry;
- adopts the orphan a failed cleanup left behind rather than creating a second document;
- does not delete the adopted document when a concurrent send loses the race;
- leaves exactly one document behind when two concurrent sends race.

## Verification run (on the amended commit)

| What | Result |
| --- | --- |
| `npm run test:unit` | 19 files, **941 passed** |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| `tsc --noEmit --strict` over `e2e/tests/signature-providers.spec.ts` | clean |
| Integration — the **nine** suites this diff touches or whose code it changes: `signwell-send`, `signwell-webhook`, `signwell-reconcile`, `signwell-completion`, `signwell-client`, `signing-settings`, `signing-embedded`, **`envelopes`**, **`signing`** | **97 passed, 0 failed** (`envelopes` + `signing` is TC-04-INT-20) |
| `node scripts/static-gate.mjs --base 57d55acd` | **pass** |
| E2E | **not run**, per the stage rules — QA runs the targeted set next and the deploy gate runs it sharded |

Nothing skipped, suppressed, cast away or loosened; no assertion removed.

## Environment note, unchanged and carried forward

A native Windows `postgres.exe` holds `localhost:5433` ahead of the Docker mapping, so the
tracked default fails `P1000`. The same container also publishes **5434**, which
`apps/api/.env` already uses, so every integration run above used the documented override
rather than editing a tracked file:

```
TEST_DATABASE_URL='postgresql://devscribed:devscribed@localhost:5434/devscribed_test'
```

QA will need the same override on this machine, or port 5433 freed.

Verdict: `pass`.
