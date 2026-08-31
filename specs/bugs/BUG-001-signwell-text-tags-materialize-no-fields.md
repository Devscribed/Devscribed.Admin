---
id: "BUG-001"
title: SignWell materializes no fields from our text tags, so no envelope can be sent
severity: blocker
surface: api
verdict: SPEC-DEFECT
owning-spec: documents/04
violates: null
regression-test: TC-04-INT-21
introduced-in: never worked against the live API; the stub hid it
affects: all
tags: [signwell, text-tags, send, spec-observation]
---

## Symptom

Switching an organization to SignWell and sending an envelope never produces a signable
document. The API log repeats, once per attempt:

```
ERROR [SignWellSigningProvider] SignWell document b961ca9a-… did not materialize the expected
fields: {"id":"b961ca9a-…","status":"Draft","envelopeId":"385dd5a9-…",
"recipients":[{"id":"1","status":"draft"},{"id":"2","status":"draft"}],"fields":[]}
```

The envelope stays `draft` with an empty `providerRef`. Nothing reaches a counterparty, and
the failure is reported to the sender as `provider_unavailable`.

## Reproduction

Deterministic. Every attempt, on a test-mode workspace with a valid key.

1. `SIGNWELL_DRIVER=http`, a real `SIGNWELL_API_KEY` and `SIGNWELL_API_APPLICATION_ID`.
2. Choose SignWell on `/org/{orgId}/settings/signing`.
3. Create an envelope from any template with a signature block and send it.

The same behaviour reproduces against the bare API, without this codebase, which is what
isolates it. Nine probe documents were created directly against
`POST https://www.signwell.com/api/v1/documents/` and deleted afterwards; the workspace was
verified empty (`total_count: 0`) at the end.

## Evidence

Each probe is a one-page PDF whose only text is the tag under test, posted with
`test_mode: true`, one recipient, `embedded_signing: true`, and a valid `api_application_id`.

| probe | `text_tags` | tag in the PDF | fields at create | after 20s |
|---|---|---|---|---|
| ours | `true` | `{{Signature_1}}` | 0 | 0, `Draft` |
| HelloSign style | `true` | `[sig\|req\|signer1]` | 0 | 0, `Draft` |
| short brace | `true` | `{{s1}}` | 0 | 0, `Draft` |
| underscore | `true` | `{{sig_1}}` | 0 | 0, `Draft` |
| DocuSign style | `true` | `\s1\` | 0 | 0, `Draft` |
| no tag at all | `true` | `Sign here` | 0 | 0, `Draft` |
| **explicit `fields`** | `false` | — | **1** | **1, `Sent`** |

Two facts settle it.

**SignWell does read the file.** `files[0].pages_number` goes from `0` at create to `1`
shortly after, on every probe. Parsing happens; it produces no fields.

**The explicit-field path works completely.** With `text_tags: false` and one `fields` entry,
the document reports one field at create, reaches `Sent` within twenty seconds, and its
recipient carries an `embedded_signing_url`. That is the state requirement 38 waits for and
never sees.

Every tag syntax behaves exactly like the probe with no tag in it, which is what rules out a
wrong vocabulary: nothing is being parsed, so nothing can be misspelled.

## Root Cause

Not a coding error. The send path is a faithful implementation of a spec observation that does
not hold.

`apps/api/src/signature/signwell/signwell-signing-provider.ts:125` sends `text_tags: true` and
no `fields`. `apps/api/src/documents/signwell-text-tags.ts:161` emits
`{{Signature_<n>}}` hidden in white text for each signature block, and `:142` emits
`{{Text_<n>}}` for each signer-owned field, recording each in `expectedFields`. The provider
then polls (`:267`, ten attempts) and verifies the parsed fields against that list (`:314`),
failing at `:339`.

Every step is correct given the premise. The premise is that SignWell turns those tags into
fields. It does not, so `expectedFields` is non-empty, the parsed list is permanently empty,
and the check can only ever fail. The document is then discarded and no `providerRef` is
stored — which is why the workspace holds nothing and the envelope keeps an empty ref. That
compensation is working as designed.

## Spec Verdict

`SPEC-DEFECT`. Requirement 13 of `specs/documents/04-signature-providers.md:266` records:

> *Observed:* the call answers `201` with `status: "Created"`, `files[0].pages_number: 0` and
> `fields: []` — the PDF has not been read yet. Creation is **two-phase and asynchronous**:
> SignWell parses the file, materializes the text tags into fields, and moves the document to
> `Sent` on its own, with no second call from us. Requirement 38 is the consequence.

The first half reproduces exactly: creation is two-phase, and `fields` is empty at `201`. The
second half does not. SignWell parses the file and then leaves the document in `Draft` with no
fields, for every tag syntax tried. It moves to `Sent` only when fields exist, and on this
account fields exist only when the request supplies them.

Requirement 14 — the placeholder-collision design, and the whole text-tag translation module —
rests on that sentence. Requirement 38's polling is correctly shaped and waits for a state
that cannot arrive.

**What requirement 13 should say instead:** creation is two-phase and asynchronous; SignWell
parses the file and materializes only the fields the request supplied; a document with no
fields settles in `Draft` and is never sent. Requirements 14 and 38 follow from the corrected
sentence and both need rewriting, not amending.

## Fix Approach

Send an explicit `fields` array and stop asking SignWell to find anything in the PDF.

The translation module already knows what fields are needed and for whom — `expectedFields`
carries type, recipient number and required flag. What it does not carry is geometry, because
a text tag carried its own position. The renderer must therefore emit the position of each
signature block and signer-owned field, and the adapter must map those to
`fields[page][{api_id, type, recipient_id, page, x, y, width, height, required}]`.

- `apps/api/src/documents/envelope-renderer.ts` — emit the geometry of each anchor.
- `apps/api/src/documents/signwell-text-tags.ts` — becomes a field-list builder rather than a
  tag emitter; the placeholder-collision abort in (c) is still needed and still correct.
- `apps/api/src/signature/signwell/signwell-signing-provider.ts:125` — `text_tags: false`,
  `fields: […]`.

**Rejected:** keeping text tags and asking SignWell to enable the feature. It may well be a
plan or account setting rather than a removed capability — see Known Gaps — but the explicit
path is deterministic, is verified working on this account today, and removes the white-text
rendering trick along with the collision hazard that requirement 14 exists to manage.

## Blast Radius

| What | Effect | Mitigation |
|---|---|---|
| `envelope-renderer.ts` | Shared with the internal provider, which needs no geometry | Emit geometry as data attributes; the internal path ignores them |
| Requirement 14's abort | Still required — a stray `{{…}}` would still print | Keep (c) exactly as written; only the emission changes |
| Existing envelopes with `stub-document-*` refs | Created under the stub, never real | None needed; they cannot be reconciled either way |
| The E2E stub | Materializes fields from tags, so it agrees with the spec and not with SignWell | Update the stub in the same change, or it will keep hiding this |
| Requirement 38's poll | Still needed — `Sent` is still asynchronous | Keep the poll; only the verification premise changes |

## Backward Compatibility

None required. No envelope has ever carried a real SignWell `providerRef`: every stored ref is
either empty or `stub-document-*`. There is no in-flight document at the provider and no
stored data whose shape changes.

## Regression Test

`TC-04-INT-21` — a send against a SignWell double that behaves like the live API.

**Precondition:** an organization on SignWell, a template with two signature blocks bound to
two signers, and a double whose `POST /documents` returns `fields: []` and materializes only
the fields the request supplied.

**Steps:** send the envelope.

**Expected:** the request carries a `fields` array with one signature entry per signer, each
`recipient_id` matching that signer's `signing_order`; the document reaches `Sent`; the
envelope stores its `providerRef`.

**Against the current code it fails**, and it reports what production reports: the request
carries `text_tags: true` and no `fields`, the double materializes nothing, and the provider
throws after ten polls with `did not materialize the expected fields`.

The E2E stub must be corrected in the same change. As written it materializes fields from
tags, which is why seven integration suites and a full E2E run pass against a behaviour the
provider does not have.

## Acceptance Criteria

- A SignWell envelope sent from the UI reaches `Sent` at the provider and stores its ref.
- The signer's `/sign/{token}` page loads the widget through a real `embedded_signing_url`.
- `TC-04-INT-21` passes; the reproduction above no longer reproduces.
- No request from this codebase sets `text_tags: true`.
- Requirements 13, 14 and 38 are rewritten before the code changes, per CLAUDE.md.

## Known Gaps

**Whether text-tag parsing is off for this account or absent from the API is not established.**
One workspace was tested, on one plan, with one key. A plan-gated feature and a withdrawn one
look identical from here. It does not change the verdict — the spec records an observation
that does not hold on the account the product will use — but it does change the conversation
with SignWell, and somebody should have it before the rewrite lands.

**Field geometry is unmeasured.** The fix needs pixel positions on a rendered page, and this
report does not say how accurately the renderer can supply them for a block whose height
depends on content. That is the first thing the spec change has to answer.

**The Cyrillic-email 422 found on the way is a separate defect**, recorded as BUG-002. It was
what produced the first failures in this session and is unrelated to text tags.
