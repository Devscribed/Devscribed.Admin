# Pre-implement — documents 04, Signature Providers & SignWell

Run `2026-08-28T16-54-11_documents-04-signature-providers`, branch `spec/signwell-provider`,
diff base `57d55ac`. Verdict: **pass**, three notes, none blocking.

## The first thing I found, and it changed the shape of the plan

The branch already implements this spec.

```
2201c91  Close the six spec defects the first run found      (specs/ + scripts/ only)
1b77b06  Spec 04: a session-scoped SigningProvider port…      (65 files — the implementation)
57d55ac  Spec 04: resolve the contradiction pre-implement found   ← this run's diff base
```

So this is a run resumed after a spec fix, exactly as commit 2201c91 describes: `--from` sets the
diff base behind the implementation so the reviewer sees the whole diff instead of an empty one.
The previous run halted at review with six findings addressed to the **spec** — the correct halt,
since a pipeline that edits specs to make itself pass is the worst failure available — a human
amended the spec, and the code has not been touched since.

That made the honest question not *how would I build this* but *what does the amended spec ask for
that the tree does not already do*. A plan that ordered a rebuild of `provider-registry.ts` or
`signwell-http-client.ts` would send the implementer to write files that are already there, and
the coverage check would have passed anyway — which is precisely the failure mode worth avoiding.

So I checked the six fixes one at a time against the tree.

| Spec fix (commit 2201c91) | State in the tree |
|---|---|
| `envelope-download-button` → `envelope-download-btn`, `sign-signature-canvas` → `signing-signature-canvas` | **Already correct.** `apps/web/app/org/[orgId]/documents/[envelopeId]/page.tsx:259` and `apps/web/src/documents/SignaturePad.tsx:161` carry spec 02's spellings, and `e2e/tests/signature-providers.spec.ts:326` asserts them. The implementer chose spec 02's ids over spec 04's list, which is what forced the spec fix. |
| The `/sign/*` CSP must widen `frame-src` and not `script-src` | **Already correct.** `apps/web/next.config.mjs` reads `SIGNING_EMBED_ORIGIN` at build time (with the comment explaining that `headers()` resolves during `next build` exactly as `rewrites()` does), adds exactly one origin to `frame-src`, and leaves `script-src` alone. `EmbeddedSigning.tsx` is a plain iframe with an origin-checked listener, no vendor SDK. |
| Requirement 40: delete-then-**settle**, no re-read | **Behaviour already correct** — `envelopes.service.ts:1325` calls the DELETE outside the transaction and then voids; there is no re-read. The doc comment above it still says "delete-then-converge", which is stale. |
| Requirement 10's enumerated exception: enum count 15 → 17 | **Already done**, and done narrowly: `packages/validation/src/envelopes.test.ts` asserts 17 plus a `toContain` per new value, and nothing else in spec 02's suite is edited. |
| `providerKey` is written at send, not at creation | **Already correct.** The organization setting is read at send (`envelopes.service.ts:825`) and `providerKey` written in the transaction that flips to `sent` (`:897`); the value written at creation (`:616`) is the draft display default the send overwrites. |
| Backward compatibility 3: the roll-out window is **not** safe in either deploy order | **Nothing answers this.** See below. |

Five of six were satisfied by judgement during the previous run rather than by anyone checking
them against text that did not exist yet. That is worth stating, because it is the argument for
the plan being verification-with-requirement-numbers rather than a victory lap.

## The one genuinely unbuilt deliverable

Backward compatibility 3 now says the migration is additive — so a **rollback** needs no schema
change — but that it is *not* safe in either deploy order, because the generated Prisma client
enumerates columns in its `SELECT`. Between `make deploy-<env>`'s rollout and `prisma migrate
deploy`, every read of `Envelope`, `EnvelopeSigner` and `Organization` names columns that do not
exist yet and fails with `42703`; the documents list and detail return 500 for that window. The
spec delegates the resolution explicitly: *"The choice belongs in docs/deployment.md."*

`docs/deployment.md` today says the opposite, twice:

- line 84 — "Migrations run after the rollout… the deploy and the migration are independent and
  **either order must work**."
- line 278 — "A green rollout followed by a red migration means the new code is already serving;
  **the environment is not broken**, the schema is behind."

That is task **T1**, and it is the only thing in this plan with nothing on the branch answering
it. It is documentation, which makes it the easiest task here to skip and the one whose omission
ships a broken deploy window — so it carries its own risk entry.

Two smaller items: three comments cite spec text that no longer exists
(`envelopes.service.ts:1309` and `signwell-completion.spec.ts:38` say "delete-then-converge";
`e2e/tests/signature-providers.spec.ts:324` says spec 04 names the control
`envelope-download-button`). The behaviour under all three is right; only the citations are
stale, and a comment citing a superseded requirement is how the next reader relearns a decision
wrongly. T8 and T11.

## The two lists

### Exists, to build on

Beyond the spec's own reconnaissance table — `envelope-events.service.ts`,
`envelope-completion.ts`, `pdf-renderer.ts`, `file-storage.ts`, `job-queue.ts`,
`signing-token.ts`, `internal-task.guard.ts`, the three guards, the `/sign` shell — this run
additionally inherits the whole of commit 1b77b06:

`signature/signing-provider.ts` (port + capabilities + the two narrowing interfaces),
`signature/provider-registry.ts`, `signature/internal-signing-provider.ts`,
`documents/certificate-of-completion.ts`, `signature/signwell/` (adapter, HTTP client, types,
projection, stub driver), `documents/signwell-text-tags.ts`,
`documents/provider-reconciler.service.ts`, `webhooks/` (module, controller, hash guard,
rate-limit guard, notification parser, redactor), `organizations/signing-settings.*`,
`test-support/signwell-stub.controller.ts`, the settings screen and its two components, the
sidebar entry, `sign/[token]/EmbeddedSigning.tsx`, the migration
`20260828140000_spec_04_signature_providers`, and every one of the forty test cases —
`TC-04-UNIT-01…06`, `TC-04-INT-01…22` and `TC-04-E2E-01…05` all resolve to a test file today
(`TC-04-INT-20` is the "run spec 02's suite unedited" case, which is not a new file by
construction).

Also inherited and load-bearing: `apps/api/test/signwell-webhook-fixtures.ts`, the three real
captured deliveries. Their hashes are ones SignWell produced, which is what makes `TC-04-UNIT-04`
prove our HMAC agrees with theirs rather than with itself.

### Must be built from zero

1. The deploy-order decision in `docs/deployment.md` (T1) — the only one.
2. Three stale citations, no behaviour change (T8, T11).
3. The audit that spec 02's and spec 03's suites carry no edit beyond requirement 10's one
   enumerated exception (T3) — a checkable claim over
   `git diff 57d55ac...HEAD -- apps/api/test packages/validation/src e2e/tests`, and the cheapest
   guard against the one regression class that breaks executed contracts rather than a screen.

Everything else is verify-against-the-amended-text work, and each of the eleven tasks names the
requirement numbers to verify it against, so the loop has something to aim feedback at other than
"the spec".

## Repository rules encoded into the plan

- **One migration, additive.** T1's `migration` note names the existing file as the run's only
  one, forbids a second, and re-states what must stay true of it (defaults, new table, two `ADD
  VALUE`s, no rename, no drop, no new `NOT NULL`), plus the deliberate absence of
  `@@unique([envelopeId, providerRef])` on `EnvelopeSigner` — an empty string would collide
  across every internal signer.
- **Org scoping, 404 not 403.** T9, and the query scopes by `session.organizationId`, never by
  the path parameter.
- **Roles in transition.** T9 names `normalizeRole()` explicitly: the column holds `admin`/
  `member`, the spec targets four roles, and a check written against the raw column is wrong even
  when it passes today.
- **Validation messages in `packages/validation`, re-run server-side.** T9 lists the three
  settings messages; T5 carries `document_tags_unresolved`; none may be inlined.
- **`@ds` only, no hardcoded colours or sizes**, with two composed pieces recorded in `dsGaps`
  (Skeleton, and a selectable option row) rather than improvised per screen.
- **Submit is never disabled for validation** — T11 spells out the one permitted exception, the
  modal's confirm button gated by the "I understand" checkbox.
- **Targeted test runs only.** T3 names the exact files and both spellings of the invocation; I
  ran no suite myself, because nothing has been implemented *in this run* and a suite run would
  only have told me what the branch already does, at minutes a go.

## Findings

Three notes, no blockers, so the run continues.

**N1 (spec, note)** — the "First signer signs" flow at line 896 still names SignWell's
`SignWellEmbed` SDK, while requirement 15 at line 295 says that SDK is deliberately not loaded.
Not a blocker: the two readings are not equally live, because the CSP the same commit documented
adds the embed origin to `frame-src` only, so the SDK reading cannot execute in a browser. It is
drift from an earlier draft, and the previous run's note P2 asked for exactly this sentence to be
settled — requirement 15 was added and the flow was not updated with it.

**N2 (spec, note)** — `CLAUDE.md:59` requires DS gaps to be recorded in the spec's DS gaps table;
spec 04 has none, and neither does any spec in this area, while two shipped comments say a gap is
"recorded in this spec's DS gaps table". The gaps are carried in `handoff.dsGaps` so nothing is
lost in this run; the convention is what is missing, and it is an area-wide question rather than
this spec's alone.

**N3 (self, note)** — recorded so the reviewer, who will diff all 65 files from `57d55ac`, knows
this handoff deliberately describes existing code instead of proposing to write it again, and so
a reader of the digest can tell that apart from a plan that quietly dropped the hard part.

I raised nothing as a blocker. The spec compiles: every one of requirements 1–42 lands on a task,
all forty test cases are assigned, and the places where the text is loose (the flow's SDK
sentence, the sample `embeddedSigningUrl` shape) have a determinate reading that the normative
requirement already fixes.

## Mechanical check, run before writing this

- 11 tasks, requirements 1–42 all assigned, no gaps.
- 40 test cases in the spec, 40 in the plan, none in one and not the other, each mapped to exactly
  one task and every task's own `testCases` agreeing with that map.
- Every `dependsOn` resolves; no cycles.
- Every path cited anywhere in the handoff — 81 of them across tasks, `reuse`, `buildFromZero`,
  `dsGaps` and the findings — exists on disk. No implementer will be sent chasing a phantom.
