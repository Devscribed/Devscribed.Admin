---
id: "BUG-002"
title: A signer address our validation accepts is rejected by the provider, and the sender is told the provider is down
severity: major
surface: api
verdict: SPEC-GAP
owning-spec: documents/04
violates: null
regression-test: TC-04-INT-22
introduced-in: predates this spec; the shared pattern is spec 01's
affects: all
tags: [validation, signwell, email, error-mapping]
---

## Symptom

A sender adds a signer whose email address contains non-Latin characters. Every screen accepts
it. The envelope is created and the signers are stored. The send then fails, and the sender is
told the signature provider is unavailable.

```
WARN [HttpSignWellClient] SignWell createDocument answered 422
WARN [SignWellSigningProvider] Creating a SignWell document for envelope 385dd5a9-… failed;
looking for an orphan. {"detail":"status_422","name":"ProviderUnavailableError"}
```

The provider is not unavailable. It rejected the request because of a value the product
accepted two screens earlier.

## Reproduction

Deterministic.

1. On SignWell, create an envelope and add a signer with `фывфывфыв@gmail.com`.
2. Send.

## Evidence

The shared pattern at `packages/validation/src/index.ts:87`:

```js
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,}$/;
```

Checked directly against it:

| address | our validation |
|---|---|
| `фывфывфыв@gmail.com` | **passes** |
| `ivan.demchenko.dev@gmail.com` | passes |
| `a b@x.com` | rejected |
| `пример@пример.рф` | rejected |

The provider answered `422` for the first. Its error body, which this codebase discards, has
the shape `{"errors":{"files":{"file_1":{"file_data":[…]}}}}` — a field-addressed list, which
is enough to name the offending input.

## Root Cause

The pattern is half strict. The domain must end in Latin letters — `[A-Za-z]{2,}` — which is
why `пример@пример.рф` is refused. The local part is `[^\s@]+`, anything that is not a space
or an at-sign, which admits every script. A non-Latin local part is only deliverable over
SMTPUTF8, and most providers refuse it.

Two consequences follow, and the second is the worse one.

The address survives to the send. And `signwell-http-client.ts:479` turns every non-retryable
status into `ProviderUnavailableError('provider_unavailable', 'status_422')`, discarding the
body. A `422` is not an outage: it is a permanent refusal of something we sent. The sender is
shown an infrastructure fault for a field error, at the last step instead of the first, and
the provider layer then runs an orphan scan although a `422` means nothing was created.

## Spec Verdict

`SPEC-GAP`. No requirement in `documents/04` says what a signer address must satisfy, and spec
01's Shared Rules define the pattern without reference to what a downstream provider will
accept. Neither is wrong about anything it states; neither covers the case.

Two edge-case rows are needed on `documents/04`:

| # | Situation | Behaviour |
|---|---|---|
| — | A signer address the configured provider will not accept | Refused at entry, with a field error on the address, before the envelope is created |
| — | The provider answers `4xx` for a request we built | Not `provider_unavailable`. A distinct permanent-refusal outcome that names the field when the body identifies one, and skips the orphan scan |

The first also belongs in spec 01 if the tightening applies to every address the product
stores, which is the more likely reading and the more useful one.

## Fix Approach

Tighten the local part to what mail providers actually accept, in `packages/validation` where
the rule already lives, and split the provider's permanent refusals from its outages.

- `packages/validation/src/index.ts:87` — restrict the local part to the ASCII set RFC 5322
  allows unquoted. One rule, re-run server-side, so both screens and the API refuse it.
- `apps/api/src/signature/signwell/signwell-http-client.ts:479` — map `4xx` other than `429`
  to a permanent-refusal error, and extract the field path from the error body rather than
  discarding it wholesale. Requirement 36 permits the projection; a field path is not document
  content.
- The caller of `createOrAdopt` — do not scan for an orphan after a `4xx` that means the
  provider never began.

**Rejected:** validating against SignWell before sending. It is a network call in the entry
path, it fails differently when the provider is down, and it makes address validation depend
on which provider an organization happens to have chosen.

## Blast Radius

| What | Effect | Mitigation |
|---|---|---|
| Every address field in the product | The shared pattern is spec 01's and is used everywhere | Tighten only the local part; the change refuses strictly less than today's domain rule already does |
| Stored addresses that no longer validate | Existing rows are never re-validated on read | Check the count before shipping; a data fix is a separate decision |
| `provider_unavailable` handling | Callers branch on it, including the sweep's retry | A new outcome is additive; the sweep must not retry a permanent refusal |
| The error message shown for a refused send | Currently the provider-unavailable sentence | Needs a row in the spec's Error Messages table before it can be written |

## Backward Compatibility

Addresses already stored are not re-validated, so no envelope becomes unopenable. If the
tightened rule would refuse rows that exist, the count decides whether a migration is worth
having; nothing breaks without one.

## Regression Test

`TC-04-INT-22` — a signer address with a non-Latin local part is refused at entry.

**Precondition:** an organization on SignWell.

**Steps:** POST a signer with `фывфывфыв@gmail.com`.

**Expected:** `400` with the shared invalid-address message, addressed to the email field. No
envelope is created and no provider call is made.

**Against the current code it fails**: the address is accepted, the envelope is created, and
the failure appears later as `provider_unavailable`.

A second case, `TC-04-INT-23`, covers the mapping: a provider `422` produces a permanent
refusal, not `provider_unavailable`, and no orphan scan runs.

## Known Gaps

**The exact local-part grammar is not decided here.** RFC 5322 unquoted is the obvious
candidate, but quoted local parts and plus-addressing need a deliberate answer, and that
answer belongs in spec 01 rather than in this report.

**Whether other provider `4xx` responses carry a usable field path is untested.** Only the
`422` shape was observed. The mapping should degrade to a generic permanent refusal when no
field can be named.
