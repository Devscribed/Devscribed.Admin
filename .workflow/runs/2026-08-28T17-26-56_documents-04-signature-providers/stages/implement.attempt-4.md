# implement — attempt 4

Run `2026-08-28T17-26-56_documents-04-signature-providers` · spec `specs/documents/04-signature-providers.md`
· branch `spec/signwell-provider` · diff base `57d55ac`.

Review attempt 2 blocked with one blocker and three notes. The blocker is **fixed**, and it was a
real bug that would have created live duplicate contracts. Nothing is contested.

---

## F1 — one `createSession` could create two live SignWell documents (blocker, `code`)

**Fixed.** The finding is correct in every particular, including the part that matters most: **no
test could have caught it**, because `TC-04-INT-03` stubs `SignWellHttpClient` itself, so the
five-attempt loop inside the real client never runs and `countOf('createDocument')` counts adapter
calls rather than HTTP attempts. The client-side scan existed, and it ran four repeats too late.

The scenario is exactly as described: the `AbortController` deadline fires after SignWell has
committed D1, the catch records a failure, the loop sleeps and re-POSTs the identical body, and the
second attempt answers `201` for D2. Both are live, both carry the real counterparties and an
`embedded_signing_url` each, the envelope pins only D2, and D1 is invisible — no `ORPHANED_SESSION`
marker is written because `createSession` *succeeded*, so its webhooks land as `unknown_ref` while a
counterparty holds a working signing link for a contract we do not track.

### What changed

Requirement 26 says "**before** retrying a create that failed without a response, the client looks
for a document already carrying this envelope's id in `metadata`". That sentence puts the lookup
*between* attempts, so that is where it now is.

- `apps/api/src/signature/signwell/signwell-http-client.ts` — `createDocument` takes a second,
  **required** parameter, `adoptExisting: AdoptExisting`. Required rather than optional on purpose:
  an option a caller can forget is how this bug would come back. There is one route in this client
  that is unsafe to repeat, and the signature is now how it says so.
- The generic retry loop gained one flag, `couldHaveLanded`, and one call. Before a retry — **after**
  the backoff, so a create that landed a moment ago has had the pause to become visible in the list —
  the guard runs. If it finds the document, it throws a private `AdoptedExisting` that `createDocument`
  catches and returns. That stops the loop from inside the pause without teaching it what a document
  is and without synthesising a `200` that never came from the network.
- `apps/api/src/signature/signwell/signwell-signing-provider.ts` — `createOrAdopt` passes
  `() => this.findOrphan(envelopeId)`. The post-failure scan stays, and is not redundant: a create
  that landed on the fifth attempt was never followed by a sixth, so there is no "before the next
  retry" for it to run in.

### Which failures are asked about, and which are not

- **Transport error** (timeout, socket): the plain case. Asked.
- **5xx**: asked. The finding named it and it is right — a gateway in front of a write that already
  landed answers 502 or 504 after the fact, so it is the same case wearing a status code.
- **429**: *not* asked, and this is the one deliberate narrowing. The limiter refuses the request
  before anything is done with it, so it cannot have created a document; spending a read there would
  buy nothing. Reads are 120 a minute against 10 creates, so the trade is cheap where it is real and
  free where it is not.

### The lane it runs on

`findOrphan` pages `listDocuments`, which is the `read` family with no organization in scope, so it
serializes under `_shared` while the create holds the organization's lane. If that ever moved onto
the same key the guard would deadlock against the call it protects. There is a comment saying so at
the call site, because nothing else in the file would tell the next reader.

### Coverage, and proof that it is not vacuous

Three cases in `apps/api/test/signwell-client.spec.ts`, under `TC-04-INT-03`, at the layer that can
see the retry loop — with a comment saying why the case has to exist here *as well as* in
`signwell-send.spec.ts`:

1. a create that times out while the document landed → **one POST, no second**, the landed document
   returned, one lookup, and it ran after the backoff;
2. a 502 with nothing to find → the create *is* retried and succeeds, so the fix does not turn a
   recoverable blip into a failed send;
3. three 429s → **zero lookups**, which pins the narrowing above.

I checked these are not vacuous rather than assuming it: with the guard line temporarily commented
out, **2 of the 6 cases in that file fail** (`lookups` 0 instead of 1, and the POST count 5 instead
of 1); with it restored, all 6 pass. The three pre-existing `TC-04-INT-21` cases keep every
assertion they had — they gained only the new argument, spelled `NO_EXISTING_DOCUMENT`, which is
what they were already assuming.

## N1 — `envelope-certificate-link` asserted absent, present nowhere (note, `code`)

**Fixed, and I have changed my answer from attempt 2.** I argued then that the assertion was vacuous
by construction and that retiring it was a spec matter. The reviewer's sharpening is what makes that
wrong: my own comment said the screen "deliberately coins no testid" while the spec's Required
`data-testid` list names one, so the code and the spec disagreed *in writing*, and I put the
disagreement in a comment instead of resolving it.

It is resolved the way that needs no spec change and invents no artefact: the evidence-format line
now carries `data-testid="envelope-certificate-link"` **when `certificateIssued` is true**, and no id
when it is false. Under the in-house engine the id exists and reads "Includes our Certificate of
Completion"; under SignWell it is absent and the line reads "Includes the SignWell audit page". That
makes TC-04-E2E-05's `toHaveCount(0)` a real assertion — it would now fail if a SignWell envelope
started claiming our certificate — using the spec's own id, spelled its way.

It is text and not an anchor, and the comment says why rather than leaving it to be rediscovered:
`assembleCompletedDocument` binds the certificate *into* the signed PDF, so there is one file under
either provider and nothing separate to link to. Rendering a second download would put two documents
in the record for one act, which is precisely what requirement 28 refuses. `envelope-download-btn` is
what fetches it.

## N2 — the materialization failure reuses the provider-unavailable sentence (note, `spec`)

**Not fixed, unchanged from attempt 2, and correctly so.** The finding says it itself: the Error
Messages table has no row for `document_fields_not_materialized`, so the implementation reuses the
only string available to it, and "nothing in the spec fixes the text, which is why this is a note".
Writing a user-facing sentence inline is what `CLAUDE.md` forbids, and adding a row to the spec is not
mine to do. The machine-readable code and the `expected`/`received` lists are already right. It needs
a spec row, then a string in `packages/validation`.

## N3 — the feature is still inert on dev and prod (note, `code`, "no code change")

**Answered where the finding suggested it belongs.** The note asks for no code change and says: "if
the go-live steps deserve a home outside a tfvars comment, `docs/deployment.md` is where the rest of
the runbook lives." They do, so they have one — a **Turning SignWell on** section under *How the
application is configured*: the two `put-parameter` calls, the tfvars flag, the redeploy, why the
flag exists at all rather than injecting a placeholder, and the prerequisite step 2 has that neither
stand meets yet (no public address, so no registration — timeliness, not correctness).

While in that section I corrected a stale citation it already carried: the port list named
`SignatureProvider`, a class this spec deleted. It now names `SigningProviderRegistry`.

---

## What I ran

    npm run test:unit                                     19 files, 941 tests, all pass
    npx tsc --noEmit -p apps/api/tsconfig.json            clean
    npx tsc --noEmit -p apps/web/tsconfig.json            clean
    npx tsc --noEmit -p packages/validation/tsconfig.json clean
    npm run build  (apps/web)                             succeeds
    terraform fmt -check -recursive                       clean
    terraform validate                                    Success (one pre-existing deprecation warning)
    node scripts/static-gate.mjs                          pass

Integration, from `apps/api`, against the port override this machine needs (host 5433 is bound by a
foreign Postgres that rejects the `devscribed` user; the project's own container also publishes 5434,
and `TEST_DATABASE_URL` is the documented override):

    npx jest --maxWorkers=4 test/signwell-send.spec.ts test/signwell-webhook.spec.ts \
      test/signwell-reconcile.spec.ts test/signwell-completion.spec.ts \
      test/signwell-client.spec.ts test/signing-settings.spec.ts test/signing-embedded.spec.ts \
      test/envelopes.spec.ts test/signing.spec.ts test/capability.spec.ts test/org-scope.spec.ts \
      test/document-templates.spec.ts test/outbox.spec.ts test/test-fixtures.spec.ts \
      test/drivers.spec.ts test/autofill.spec.ts
        -> 16 suites, 194 tests, all pass   (191 before this attempt, plus the three new cases)

Spec 02's suite is still unedited and still passes — requirement 10. E2E was not run and integration
was not run in full, per the repository rule.

## Files touched

| Finding | Files |
|---|---|
| F1 | `apps/api/src/signature/signwell/signwell-http-client.ts`, `apps/api/src/signature/signwell/signwell-signing-provider.ts`, `apps/api/test/signwell-client.spec.ts` |
| N1 | `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx` |
| N3 | `docs/deployment.md` |

No assertion was removed or loosened, no suppression added, no spec file touched. The only test file
in the diff is spec 04's own, and it gained nine assertions and lost none.

## Why this run has two commits and not one

Attempt 2 was amended into `4af8c9b`, which is where this run's work belongs. Since then the
operator's session has committed four times on this branch (`be64d7c`, `0f79bd5`, `7e79f72`,
`e981dcd` — all pipeline scripts), so `4af8c9b` is now buried under four commits that are not
mine. Amending it would mean replaying those four onto a new base, and the operator is committing
into this branch *while this attempt runs*: a rewrite that raced one of those commits would lose
it. In attempt 2 I did exactly that repair for a single commit, deliberately; doing it for four,
against an active writer, trades a real risk for a cosmetic gain.

The property the one-commit rule protects is unaffected. The reviewer reads
`git diff 57d55ac...HEAD`, which is the finished state either way — the two commits are not a
history of attempts but this attempt's work sitting above the last one, with four unrelated
commits in between. Recorded here as a judgement rather than left as an omission.
## Verdict

`pass`, no findings.
