# Implement — attempt 6

Spec: `specs/documents/04-signature-providers.md`
Branch: `spec/signwell-provider`  ·  Base: `57d55acd03b825aeed9c85836e85138f12b01be1`
Commit: `1b77b06` (attempt 5's `33d831c`, **amended** — one run, one commit)

## The finding, answered

| Finding | Verdict |
| --- | --- |
| **F1** `spec/validation-rule-6` — `signwell-signing-provider.ts#testModeFromEnvironment`: `SIGNWELL_TEST_MODE` is parsed only inside `createSession`, so a malformed value does not throw at boot | **Fixed**, not contested |

Only F1 was routed back. The three notes in the review verdict are answered at the bottom of
this report for the record; none of them changed code on this attempt.

---

### F1 — the parse that has to happen while someone is still watching the deploy

**Fixed, exactly as suggested: `testModeFromEnvironment()` is now called once from the
`SignWellSigningProvider` constructor, and the per-send read is untouched.**

`apps/api/src/signature/signwell/signwell-signing-provider.ts:64-81`

```ts
constructor(
  private readonly http: SignWellHttpClient,
  private readonly renderer: PdfRenderer,
) {
  super();
  // VALIDATION RULE 6 — at boot, not at send. …
  testModeFromEnvironment();
}
```

The finding's reading is the spec's, twice over: validation rule 6 (`:1043`) says the value
"must parse as a boolean **at boot** — a malformed value throws at startup rather than
defaulting", and the Infrastructure table (`:683`) repeats it. Nothing called the parser before
a send, so `SIGNWELL_TEST_MODE=yes` produced precisely the sequence the finding walks through:
a healthy container, a settings screen reporting SignWell configured and in test mode, and then
a 503 "Signing service is unavailable" at the first send — the provider blamed for a deployment
mistake, which is the outcome the rule exists to prevent.

**Why the constructor is a boot check and not merely an earlier one.** `SignWellSigningProvider`
is a provider of the global `CoreModule` (`apps/api/src/core.module.ts:60`), and Nest
instantiates every singleton provider while the container comes up. A throw in its constructor
is therefore a container that refuses to start — the same mechanism as the sibling
`SIGNWELL_DRIVER` check in `signature.provider.ts:44-50`, reached from the same phase.

Two deliberate details, both stated in the code:

- **The return value is discarded.** The value on the wire is still read per send
  (`test_mode: testModeFromEnvironment()`), so nothing is captured at boot and the send path is
  byte-for-byte what TC-04-INT-01 already asserted. The constructor call adds a failure, not a
  cache.
- **The lenient badge helper is left alone.** `testModeConfigured()`
  (`signing-settings.service.ts:238-241`) still reads "on" for anything that is not `false`/`0`,
  and its comment — "Validation rule 6 lives in the adapter, where a malformed value throws at
  boot" — is now true rather than aspirational: with the boot check in place a malformed value
  cannot be present in a running process, so the helper's leniency is unreachable in production
  and survives only as a promise that a badge cannot 500 a settings screen.

**Now pinned**, in the case that already owns this variable — TC-04-INT-01, whose first
assertion is `body.test_mode === true` (`apps/api/test/signwell-send.spec.ts:155-194`; no new
test id invented):

- with `SIGNWELL_TEST_MODE=yes`, building the adapter's fragment of the container's graph
  through `Test.createTestingModule({...}).compile()` **rejects** with
  `/SIGNWELL_TEST_MODE must be a boolean/`;
- with `false`, and with the variable deleted, the same graph compiles — so the check is a parse,
  not a blanket refusal to start, and the unset default (`true`, the safe direction) still boots.

The case goes through Nest's DI rather than calling the parser directly on purpose: calling the
exported function would have passed on the pre-fix code too, since the defect was never in the
parser but in nothing being wired to run it at boot. **Verified failing on the pre-fix code**:
with the constructor line commented out, `expect(boot()).rejects` reports "Received promise
resolved instead of rejected".

---

## Tasks touched on this attempt

| Task | Files |
| --- | --- |
| T3 — the SignWell adapter | `apps/api/src/signature/signwell/signwell-signing-provider.ts`, `apps/api/test/signwell-send.spec.ts` |

Tasks T1, T2, T4–T11 are unchanged from attempts 3–5; their file lists stand as recorded in
`implement.attempt-3.md`, `implement.attempt-4.md` and `implement.attempt-5.md`.

**One migration, unchanged and untouched.** `20260828140000_spec_04_signature_providers` is
still the only migration in the diff; this attempt added no column, table or enum value.

## Test cases and where they live

Unchanged from attempt 5 except for the one case added to TC-04-INT-01 above.

| Case | File |
| --- | --- |
| TC-04-UNIT-01, -02, -03 | `packages/validation/src/signwell-text-tags.test.ts` |
| TC-04-UNIT-04, -06 | `packages/validation/src/signwell-webhook.test.ts` |
| TC-04-UNIT-05 | `packages/validation/src/signing-providers.test.ts` |
| TC-04-INT-01 **(+1 new case)**, -02, -03, -03a, -03b, -03c, -03d, -22 | `apps/api/test/signwell-send.spec.ts` |
| TC-04-INT-04, -05, -07, -08 | `apps/api/test/signwell-webhook.spec.ts` |
| TC-04-INT-06, -11, -12 | `apps/api/test/signwell-reconcile.spec.ts` |
| TC-04-INT-09, -10, -10a, -10b, -10c, -13 | `apps/api/test/signwell-completion.spec.ts` |
| TC-04-INT-14, -15 | `apps/api/test/signing-embedded.spec.ts` |
| TC-04-INT-16, -17, -18, -19 | `apps/api/test/signing-settings.spec.ts` |
| TC-04-INT-21 | `apps/api/test/signwell-client.spec.ts` |
| TC-04-INT-20 | No new file, by construction — the case *is* spec 02's suite run unedited (`envelopes.spec.ts`, `signing.spec.ts`) |
| TC-04-E2E-01…-05 | `e2e/tests/signature-providers.spec.ts` |

## Verification run (on the amended commit)

| What | Result |
| --- | --- |
| `npm run test:unit` | 19 files, **941 passed** |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| Integration — the nine suites this diff touches or whose boot it changes: `signwell-send`, `signwell-webhook`, `signwell-reconcile`, `signwell-completion`, `signwell-client`, `signing-settings`, `signing-embedded`, `envelopes`, `signing` | **101 passed, 0 failed** (was 100; the new case is the difference) |
| The new case against the pre-fix code | **fails**, as it must |
| `node scripts/static-gate.mjs --base 57d55acd` | **pass** |
| E2E | **not run**, per the stage rules — QA runs the targeted set next and the deploy gate runs it sharded |

Every suite that boots the whole `AppModule` was re-run deliberately, because the change is to a
constructor the container calls at startup: had the check been wrong about the shape of a valid
value, all nine would have failed to boot rather than failed an assertion.

Nothing skipped, suppressed, cast away or loosened; no assertion removed. The only pre-existing
assertion this whole diff changes is still the enum count in
`packages/validation/src/envelopes.test.ts`, which the review's earlier note N6 sanctions.

## The review's other three findings, for the record

None was routed back to this attempt; all three are notes.

- **F2** `spec/required-testids` and **F3** `spec/requirement-40`, both target **spec** —
  nothing I may do: `specs/` is not mine to edit. Both stand as written in the review verdict
  for whoever corrects the spec.
- **F4** `spec/requirement-34` (target **code**, note) — the provider row renders for a draft.
  **Not taken on this attempt, deliberately.** It was not routed back, it is a note rather than
  a blocker, and the only assertion on `envelope-provider` lives in E2E
  (`e2e/tests/signature-providers.spec.ts:321`), which the stage rules forbid me to run — so
  changing when that row renders is a change I could not verify here. Recorded so the routing
  decision is explicit rather than silent.

## Environment note, unchanged and carried forward

A native Windows `postgres.exe` holds `localhost:5433` ahead of the Docker mapping, so the
tracked default fails `P1000`. The same container also publishes **5434**, so every integration
run above used the documented override rather than editing a tracked file:

```
TEST_DATABASE_URL='postgresql://devscribed:devscribed@localhost:5434/devscribed_test'
```

QA will need the same override on this machine, or port 5433 freed.

Verdict: `pass`.
