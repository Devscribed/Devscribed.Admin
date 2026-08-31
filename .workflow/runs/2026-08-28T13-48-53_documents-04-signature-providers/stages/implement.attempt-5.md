# Implement — attempt 5

Spec: `specs/documents/04-signature-providers.md`
Branch: `spec/signwell-provider`  ·  Base: `57d55acd03b825aeed9c85836e85138f12b01be1`
Commit: `33d831c` (attempt 4's `a12ab4f`, **amended** — one run, one commit)

## The findings, answered

| Finding | Verdict |
| --- | --- |
| **F1** `spec/requirement-33` — `signing-settings.service.ts#inFlightCount`: the confirmation count includes drafts, which do not stay on the old provider | **Fixed**, not contested |
| **F2** `checklist/partial-failure` — `provider-reconciler.service.ts#openNextTurn`: `email_accepted` is written inside the convergence transaction, before the transport is asked | **Fixed**, not contested — and the test written for it exposed a second defect in the same function, fixed with it |
| N1 `spec/webhook-429-empty-body` (note) | **Fixed** |
| N2 `checklist/idempotent-paths` (note, locking) | **Not taken** — reasoning below, left for the human the note is addressed to |
| N3, N4 (notes confirming attempt 4's fixes) | Nothing to do |
| N5, N6 (notes, target **spec**) | Nothing I may do — `specs/` is not mine to edit |

---

### F1 — the count the modal names

**Fixed by counting only what actually stays behind.** `inFlightCount` was

```ts
status: { in: [EnvelopeStatus.draft, EnvelopeStatus.sent, EnvelopeStatus.partially_signed] }
```

and is now `{ in: [EnvelopeStatus.sent, EnvelopeStatus.partially_signed] }`
(`apps/api/src/organizations/signing-settings.service.ts:142-160`).

The finding's reading is the spec's: requirement 33 counts "in-flight envelopes **that will
stay on the old provider**" (:454), and edge case 14 says a draft is precisely the envelope
that does *not* stay — "it goes out on the **new** provider: the provider is read at send, not
at creation" (:554). The shipped `SIGNING_PROVIDER_MESSAGES.settings.inFlight` states the
guarantee in words ("They stay with the built-in provider until they complete, decline, or
expire"), so with drafts in the count the one sentence the deliberate confirmation exists to
say was false. Nothing about the message text changed — it lives in `packages/validation` and
is verbatim from the spec's Error Messages table; only the number it is handed changed.

Both comments the finding named were wrong for the same reason and are corrected: the one at
the call site ("non-terminal … those are the ones that stay") and the absent one on the query,
which now states the rule and its two spec references.

**Now pinned.** TC-04-INT-17's preconditions are already "one sent envelope and one draft", so
the assertion belongs there and nowhere else
(`apps/api/test/signing-settings.spec.ts:181-186` and `:198-200`): before the switch the
settings read says `inFlightCount: 1` with a draft sitting beside the sent envelope, and after
the draft has gone out on SignWell it says `2`. The second half matters as much as the first —
it says the draft is excluded because it is *draft*, not because it is invisible.

### F2 — a claim written before the attempt

**Fixed by sending first and recording second**, the first of the two suggested fixes.

- `openNextTurn` no longer records anything (`provider-reconciler.service.ts:434-492`). It
  still mints the token and sets `notified` inside the convergence transaction, because both
  are true at commit whatever the mailbox does. The comment in its place says why the event is
  not there.
- `notifyNextTurn` (`:545-597`) sends through `safeMail`, and writes `email_accepted` only
  when the transport took the message, in its own transaction. `safeMail` now returns whether
  the send succeeded instead of `void`; it still never throws, because the transition it
  follows is a signature the provider has already captured and rolling that back to fix a
  deliverability problem would lose evidence.
- Invariant 4 is untouched: the event still goes through `EnvelopeEventsService.record`, which
  takes a transaction client, so it is written inside a transaction — its own, opened after
  the acceptance it records.

The result is the ordering the two other writers of this event already use: the send path
awaits the transport and records after it (`envelopes.service.ts:938-967`), and the internal
next-turn path records nothing at all (`signing.service.ts:476-489`). A rejection now leaves
signer 2 with a live token, `notified`, and **no** email status on the envelope screen, rather
than `Accepted` for a message SES refused.

What is left, stated rather than hidden: if SES accepts and the small event transaction then
fails, the trail lacks an `email_accepted` it could have had. That is a missing claim, not a
false one, and it is the direction the checklist asks for.

**A second defect, found by the test written for this finding.** With the event moved, the new
case asserted that signer 2 ends up `notified` — and it did not. `openNextTurn` chose its
candidate from the signer rows loaded *before* the transaction opened, so the signer who had
just signed still read `notified` in memory, was the first candidate every time, always had a
live token, and tripped the `alreadyInvited` early return. The reconciler therefore never
opened the next signer's turn at all: on a two-signer SignWell envelope, signer 2 was never
invited — not by webhook, not by lazy read, not by sweep. The candidate filter now excludes
anyone the **provider** says is finished as well as anyone our rows say is finished
(`provider-reconciler.service.ts:447-456`, with `FINISHED_REMOTELY` beside the two existing
status sets at `:614`). That is inside the symbol the finding named and it is what makes the
fix observable — without it there is no invitation to accept or reject.

**Pinned by two cases** under TC-04-INT-11, the convergence-on-read case in
`apps/api/test/signwell-reconcile.spec.ts` (no new test id invented):

- `:180-216` — convergence opens signer 2's turn, mails **our** `/sign/` link (asserted not to
  be a provider link), and records exactly one `email_accepted` for that signer;
- `:218-263` — with `mail.failNextSend()` armed, the signed event, the token and `notified`
  all still stand, no invitation exists, **zero** `email_accepted` rows for signer 2, and the
  envelope detail returns `lastEmailStatus: null` for them rather than `email_accepted`.

The second case fails on the pre-fix code in the way the finding describes.

### N1 — the `429` that was not empty (note)

**Fixed**, because it was fifteen lines and an established pattern one status code away.
`WebhookRateLimited` and `WebhookRateLimitedFilter` now sit beside the guard
(`apps/api/src/webhooks/webhook-rate-limit.guard.ts:63-91`), exactly mirroring
`WebhookHashRejected` / `WebhookHashRejectedFilter`, and the controller lists both filters
(`signwell-webhook.controller.ts:50`). The wire body is now empty rather than
`{"statusCode":429,"message":""}`, which is what the API contract asks for (:1007) and what
the `401` beside it already did.

Covered next to the `401` it copies, in TC-04-INT-08
(`apps/api/test/signwell-webhook.spec.ts:230-262`): the window is filled through
`WebhookRateLimiter.allow` for a source the case names in `X-Forwarded-For`, so it costs
microseconds instead of 600 requests, and it asserts the empty body and that nothing was
recorded.

### N2 — no row lock on convergence (note)

**Not taken, deliberately.** The note itself says why it is a note: the shipped download path
writes its event with no envelope lock, so this diff is not introducing the class of race, and
the note asks for a human's attention rather than a fix. Taking `SELECT … FOR UPDATE` inside
`applyState` would change the locking behaviour of all three triggers at once — webhook job,
synchronous read and sweep — on the last attempt of a run, with no case in this suite that can
reproduce the interleaving it is meant to close. That is a change worth making deliberately,
with a concurrency test, not as a footnote to two blockers. Recorded here so the routing
decision is explicit rather than silent.

### N5, N6 — notes addressed to the spec

Nothing to do in code, and the spec is not mine to edit. N5's contradiction (backward
compatibility item 6 versus requirement 1 and invariant 7) has one resolution and the code has
taken it; N6's is the sanctioned enum-count edit in
`packages/validation/src/envelopes.test.ts`. Both stand as written in the review verdict for
whoever corrects the spec.

---

## Tasks touched on this attempt

| Task | Files |
| --- | --- |
| T7 — the reconciler | `apps/api/src/documents/provider-reconciler.service.ts`, `apps/api/test/signwell-reconcile.spec.ts` |
| T6 — the webhook receiver | `apps/api/src/webhooks/webhook-rate-limit.guard.ts`, `apps/api/src/webhooks/signwell-webhook.controller.ts`, `apps/api/src/webhooks/webhooks.module.ts`, `apps/api/test/signwell-webhook.spec.ts` |
| T9 — the settings surface | `apps/api/src/organizations/signing-settings.service.ts`, `apps/api/test/signing-settings.spec.ts` |

Tasks T1–T5, T8, T10, T11 are unchanged from attempts 3 and 4; their file lists stand as
recorded in `implement.attempt-3.md` and `implement.attempt-4.md`.

**One migration, unchanged and untouched.** `20260828140000_spec_04_signature_providers` is
still the only migration in the diff; this attempt added no column and no table.

## Test cases and where they live

Unchanged from attempt 4 except for the three cases added below. No new test id was invented:
each case sits under the spec id whose preconditions it already shares.

| Case | File |
| --- | --- |
| TC-04-UNIT-01, -02, -03 | `packages/validation/src/signwell-text-tags.test.ts` |
| TC-04-UNIT-04, -06 | `packages/validation/src/signwell-webhook.test.ts` |
| TC-04-UNIT-05 | `packages/validation/src/signing-providers.test.ts` |
| TC-04-INT-01, -02, -03, -03a, -03b, -03c, -03d, -22 | `apps/api/test/signwell-send.spec.ts` |
| TC-04-INT-04, -05, -07, **-08 (+1 new case)** | `apps/api/test/signwell-webhook.spec.ts` |
| TC-04-INT-06, **-11 (+2 new cases)**, -12 | `apps/api/test/signwell-reconcile.spec.ts` |
| TC-04-INT-09, -10, -10a, -10b, -10c, -13 | `apps/api/test/signwell-completion.spec.ts` |
| TC-04-INT-14, -15 | `apps/api/test/signing-embedded.spec.ts` |
| TC-04-INT-16, **-17 (+2 assertions)**, -18, -19 | `apps/api/test/signing-settings.spec.ts` |
| TC-04-INT-21 | `apps/api/test/signwell-client.spec.ts` |
| TC-04-INT-20 | No new file, by construction — the case *is* spec 02's suite run unedited (`envelopes.spec.ts`, `signing.spec.ts`) |
| TC-04-E2E-01…-05 | `e2e/tests/signature-providers.spec.ts` |

## Verification run (on the amended commit)

| What | Result |
| --- | --- |
| `npm run test:unit` | 19 files, **941 passed** |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| Integration — the nine suites this diff touches or whose code it changes: `signwell-send`, `signwell-webhook`, `signwell-reconcile`, `signwell-completion`, `signwell-client`, `signing-settings`, `signing-embedded`, `envelopes`, `signing` | **100 passed, 0 failed** (`envelopes` + `signing` is TC-04-INT-20) |
| `node scripts/static-gate.mjs --base 57d55acd` | **pass** |
| E2E | **not run**, per the stage rules — QA runs the targeted set next and the deploy gate runs it sharded |

Nothing skipped, suppressed, cast away or loosened; no assertion removed. The only pre-existing
assertion this whole diff changes is still the enum count in
`packages/validation/src/envelopes.test.ts`, which N6 sanctions.

## Environment note, unchanged and carried forward

A native Windows `postgres.exe` holds `localhost:5433` ahead of the Docker mapping, so the
tracked default fails `P1000`. The same container also publishes **5434**, so every integration
run above used the documented override rather than editing a tracked file:

```
TEST_DATABASE_URL='postgresql://devscribed:devscribed@localhost:5434/devscribed_test'
```

QA will need the same override on this machine, or port 5433 freed.

Verdict: `pass`.
