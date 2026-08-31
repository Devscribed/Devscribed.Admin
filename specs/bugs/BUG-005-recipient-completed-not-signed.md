---
id: "BUG-005"
title: A SignWell recipient who has signed reads `completed`, not `signed`, so no second signer is ever let in
severity: blocker
surface: api
verdict: SPEC-DEFECT
owning-spec: documents/04
violates: null
regression-test: TC-04-INT-28
introduced-in: requirement 39, written from an observation taken before anyone had signed
affects: every sequential envelope with more than one signer
tags: [signwell, reconcile, signer-status, turn-order, silent-failure]
---

## Symptom

Two signers, sequential. The first signs successfully in the widget. The second is invited by
mail — our own mail, with our own `/sign` link, exactly as requirement 12 wants — opens it, and
is told:

> It is not your turn to sign yet. We will email you when the document is ready.

The envelope is now unfinishable. Nothing reports an error, the log reads as a clean handover,
and the sender's screen shows the envelope still `sent` with signer 1 unsigned.

```
LOG [InMemoryMailService] Signing invitation for asdas@gmail.com — "Договор подряда (BY)"
DEBUG [InlineJobQueue] Running provider-reconcile inline for envelope 36ffb92c-…
DEBUG [InlineJobQueue] Running provider-reconcile inline for envelope 36ffb92c-…
LOG [InMemoryMailService] Signing invitation for ototot@gmail.com — "Договор подряда (BY)"
```

The second invitation going out is what makes this hard to see from the log alone: by every
trace we emit, the turn was handed over.

## Reproduction

Deterministic, on every SignWell envelope with two or more signers.

1. Send an envelope with two signers.
2. Sign as the first.
3. Open the second signer's link.

## Evidence

Our rows, after the handover the log describes:

```
 order |      email       |  status  | signedAt
     1 | asdas@gmail.com  | viewed   |
     2 | ototot@gmail.com | notified |
```

Signer 1 is `viewed`. `currentSignerOf` returns the first signer who is neither `signed` nor
`declined`, so the current signer is still signer 1 — and signer 2's token is refused by
`signing.service.ts:741`, correctly, for a turn our rows say has not arrived.

The provider disagrees. `GET /api/v1/documents/{id}` on the same document, at the same moment:

```json
{ "status": "Pending",
  "recipients": [
    { "id": "1", "email": "asdas@gmail.com",  "status": "completed", "signing_order": 1 },
    { "id": "2", "email": "ototot@gmail.com", "status": "sent",      "signing_order": 2 } ] }
```

**`completed` is the word for a recipient who has signed.** `signed` appears nowhere in a
recipient object. Neither does `signed_at`: the completed recipient above carries no timestamp
of any kind.

## Root Cause

One line of vocabulary, in `signwell-signing-provider.ts`:

```ts
case "signed":
  return "signed";
```

`normalizeSignerStatus` listens for a word the provider never says, and its `default` sends
everything else to `pending`. A recipient who has signed therefore converges to *"nothing has
happened to them yet"*, silently.

Two questions are then asked about the same fact and get different answers, which is what
produced the two contradictory halves of the symptom:

| question | asked by | reads | answer for signer 1 |
|---|---|---|---|
| *Is this recipient finished?* | `openNextTurn`, via `FINISHED_REMOTELY` | the provider's status, mapped | no |
| *Is the next recipient's turn open?* | `openNextTurn`, via `ADVANCED_PAST_PENDING` | the **next** recipient's status, mapped | yes — recipient 2 reads `sent` |
| *Whose turn is it?* | `resolve`, via `currentSignerOf` | **our** signer rows | still signer 1 |

The second question is answered from recipient 2 alone, so the invitation goes out on its own
evidence, without anything having closed recipient 1's turn. The handover is half-applied by
construction: a mail and a token for signer 2, and a signer 1 our database still believes is
waiting to sign.

The document-level status hides it further. A partially signed document reads `Pending` — a
value that appears in no requirement — and `envelopeStatusFrom` falls through to `sent`, which
happened to be the right answer for the wrong reason.

## Spec Verdict

`SPEC-DEFECT`. Requirement 39 states the mapping as fact:

> **Turn is read from `recipients[].status`, not inferred.** *Observed values:* `created`
> before send, then `sent` for the recipient whose turn is open and `waiting` for the rest.
> Convergence maps `waiting` → our `pending`, `sent` → `notified`, and takes `viewed`, `signed`
> and `declined` at face value.

The observation is real and the sentence after it is not. `created`, `sent` and `waiting` were
all seen — on a document nobody had signed yet. `signed` was never observed, because observing
it required a signature, and the requirement quietly extended a verified list with an
unverified member. This is BUG-001's shape exactly: the first half of an observation
reproduces, the second half was assumed.

The corrected vocabulary, marked for where each value came from:

| provider value | ours | observed |
|---|---|---|
| `created` | `pending` | before send |
| `waiting` | `pending` | a recipient whose turn has not opened |
| `sent` | `notified` | the recipient whose turn is open |
| `completed` | `signed` | a recipient who has signed |
| `viewed` | `viewed` | **not observed** — kept because it costs nothing |
| `declined` | `declined` | **not observed** |
| anything else | `pending`, and logged | — |

And the edge cases:

| # | Situation | Behaviour |
|---|---|---|
| — | The provider reports a recipient status we do not recognize | The recipient stays `pending` — the envelope stalls rather than advancing on a guess — and the adapter logs an error naming the value. A status we cannot read is a defect to be seen, never a state to be inferred |
| — | Every recipient reads signed and the document is not `Completed` | Convergence does not complete the envelope, and the adapter logs the document's status. Completion is the document's own claim; a count of finished recipients is not a substitute for it |

## Fix Approach

`apps/api/src/signature/signwell/signwell-signing-provider.ts` — map `completed` → `signed`,
drop the `signed` case, name `created` and the empty string explicitly, and pass an
`onUnknown` callback so an unrecognized value is logged with the document it arrived on.

**Dropping `signed` is the point, not tidying.** Left in, it is a word only our own doubles
speak, and it lets a test pass by agreeing with us — which is precisely how every suite stayed
green while no second signer could ever be admitted.

So the doubles are corrected in the same change:

- `stub-signwell-http-client.ts` — `completeDocument` sets recipients to `completed`, and no
  longer invents a `signed_at` the API does not return.
- `test/signwell-fixtures.ts` — `signWellDocument` stops deriving `signed_at` from the status.
- The suites that drove the doubles with `'signed'` now drive them with `'completed'`.

**Rejected:** accepting both words. It costs one line and buys nothing real, and it keeps alive
the thing that hid the defect — a double able to say something the provider cannot.

**Rejected:** inferring completion from "every recipient is finished". `completedDocument`
downloads the provider's final PDF, and a document whose recipients are all done is not
necessarily one whose PDF exists. The warning above makes the case visible instead; if it ever
fires, the document status it names is the evidence needed to decide properly.

## Blast Radius

| What | Effect | Mitigation |
|---|---|---|
| Envelopes stuck right now | Signer 1 stays `viewed` until the next convergence, which then closes the turn correctly | None needed — convergence is state-based, so a stale row heals on the next read. No data fix |
| The already-minted second token | Still valid; `openNextTurn` finds a live token and mints no second one | Covered by the existing "opens the next signer's turn" case |
| Single-signer envelopes | Were **not** affected. Completion is read from the document's `Completed`, not from recipients | — |
| Any suite driving a recipient status | Fails until it speaks the provider's vocabulary | Updated in this change; that they had to change is the finding |

## Backward Compatibility

None required. Recipient statuses are read from the provider on every convergence and never
stored. Nothing on our side holds a provider status string except `Envelope.providerStatus`,
which is the document's and is explicitly non-authoritative.

## Regression Test

`TC-04-INT-28` — the second signer can sign once the first has completed.

**Precondition:** a sent two-signer SignWell envelope whose double reports
`{ '1': 'completed', '2': 'sent' }`, and a stale `providerSyncedAt`.

**Steps:** read the envelope, so convergence runs; then `GET /api/sign/{token}` with the token
from the invitation the second signer received.

**Expected:** signer 1's row is `signed`; the second signer's link answers `200` with
`surface: 'embedded'`.

**Against the previous code it fails**, at signer 1's row: `Expected "signed", received
"notified"`.

The vocabulary itself is pinned beside it, in `test/signwell-signer-status.spec.ts`: every
observed value maps to what was observed, an unknown value stalls *and* reports, and `signed`
is not accepted.

The case ends on the signing surface deliberately. Every part of the handover already had a
test — the row, the token, the mail, the `email_accepted` event — and all four passed while the
signer met a refusal. **A handover asserted anywhere short of the person it hands over to is
not asserted.**

## Known Gaps

**`viewed` and `declined` are still unobserved.** They are what requirement 39 always claimed,
and they are now marked as claims rather than observations. A declined SignWell recipient has
never been seen by this codebase, so the decline path carries the same risk this report is
about, in a place where the consequence is an envelope that never registers a refusal.

**The completed-document status is unverified.** A fully signed SignWell document is assumed to
read `Completed`; what was observed here is `Pending` for a partially signed one, which is in
no requirement either. If the finished value is anything else, envelopes will stall at the last
signature instead of the second — the same defect one step later. The warning added in this
change is what would say so, and the next full signature through the widget settles it.

**Signature times are ours, not the provider's.** No recipient timestamp is returned, so the
`signed` event is dated from the convergence that noticed it. For a webhook that is seconds;
for the hourly sweep it can be an hour. Whether an audit trail may say "signed at" about a time
we merely observed is a question for spec 02, not for this report.
