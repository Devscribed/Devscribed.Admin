# implement — attempt 1

Run `2026-08-28T17-26-56_documents-04-signature-providers` · spec `specs/documents/04-signature-providers.md`
(sha256 `1a6ed08c…b8347`, unchanged) · branch `spec/signwell-provider` · diff base `57d55ac`.

## What this attempt was

The handoff's `runContext` is the frame for everything below: **the branch already carried a full
implementation of this spec** (`1b77b06`, ~65 files, plus `4b391ad`'s runbook and comment
corrections). No stage that reached review had ever checked it against the amended requirement
numbers — the previous run stopped at the static gate on a rule that has since been fixed. So this
attempt is verification with the requirement numbers in hand, per task, at the paths the handoff
names, plus the tests actually run, plus the one defect verification turned up.

I opened every file I claim to have checked. Where a claim is checkable by execution rather than by
reading, I executed it and the command is named.

## Environment note (did not block)

Host port **5433 is bound by a foreign Postgres** that rejects the `devscribed` user, so the
suite's default `BASE_TEST_DATABASE_URL` fails `P1000` in `global-setup`. The project's own
container `devscribed-postgres` also publishes **5434**, and `test/database-url.ts` documents
`TEST_DATABASE_URL` as the override CI reaches for, so every integration run below used
`TEST_DATABASE_URL=postgresql://devscribed:devscribed@localhost:5434/devscribed_test`. Nothing in
the repository was changed for this; it is a fact about this machine and is recorded so the next
stage does not rediscover it as a failure.

## Per task

### T1 — the one additive migration, the columns, and the deploy order (req 1, 22, 24, 29, 34, 35)

- `apps/api/prisma/schema.prisma` — checked field by field against the spec's Data Model.
  `Organization.signatureProviderKey/SetAt/SetBy` (FK to `Account`, `onDelete: SetNull`);
  `Envelope.providerTestMode/providerStatus/providerSyncedAt/providerError`;
  `EnvelopeSigner.providerRef @default("")` with **no** `@@unique([envelopeId, providerRef])` and
  the reason stated in the model; `ProviderWebhookEvent` with the five-column unique key,
  `@@index([processedAt])` and the extra `@@index([envelopeId])`; `EnvelopeEventType` gains
  `provider_synced` and `provider_error`.
- `apps/api/prisma/migrations/20260828140000_spec_04_signature_providers/migration.sql` — **still
  the only migration this run has**; none added. Every statement is additive (new columns with
  defaults, one table, two enum values; no rename, no drop, no new NOT NULL on an existing table).
- Verified mechanically rather than by eye that the SQL and the schema agree:
  `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel
  prisma/schema.prisma --shadow-database-url ...` answered **"No difference detected."**, and
  `prisma migrate deploy` against the applied test database answered **"No pending migrations to
  apply."**
- Backward compatibility 3's runbook half: `docs/deployment.md:94-115` states that a release adding
  columns to a table the running code reads **must migrate first**, names spec 04 as the first
  release in that class, and keeps the additive rule as what buys the safe rollback rather than
  weakening it; `:298-314` splits the troubleshooting entry into the outage case (`42703`, screens
  at 500) and the benign one. Both still say that.
- Req 34 as `providerTestMode`: written at send (`envelopes.service.ts:899`), read at display from
  the envelope's own column (`signing.service.ts` `testMode`, detail `provider.testMode`) — never
  from configuration, so edge case 17 holds. Req 29: `documentHash` (the frozen HTML) and
  `signedPdfHash` (their bytes) are written from two different sources and neither is used to
  verify the other.

### T2 — the port, the capability record, the registry (req 2–7, 18)

- `apps/api/src/signature/signing-provider.ts` — abstract `SigningProvider` with exactly
  `key`, `capabilities`, `createSession`, `signerAccess`, `completedDocument`, `cancel`, plus
  `LocallySigned` and `RemotelyTracked`. **No `remind`, no `issueInvitation`** (req 18).
- Req 2 checked by grep, not by assertion: searching `apps/api/src` for `signwell` outside
  `signature/signwell/`, `webhooks/` and `test-support/` leaves only imports, DI registration,
  logs, and `provider-registry.ts:89`, which is *configuration* (which env vars a key needs) and
  not behaviour. Every consumer branch I read is on `capabilities` — `sendsOurOwnInvitation`
  (send), `signingSurfaceOf` (signing page), `capabilities.completedDocument` (completion),
  `issuesCertificateOfCompletion` (detail), `notifications === 'webhook'` (registry, settings).
- Req 4: no method on the port touches Prisma, `MailService` or `EnvelopeEventsService` — neither
  adapter imports any of them.
- Req 5 and invariant 11: `createSession` is called at `envelopes.service.ts:835` (`openSession`),
  **before** the `this.prisma.$transaction` at :847. The one documented exception is
  `applySignature` inside the signing transaction, and it never touches the network.
- Backward compatibility 7 and edge cases 15–16: `SigningProviderRegistry.missingConfiguration`
  reads `process.env` **at call time**, and `find()` returns `null` when the configuration is
  absent — so removing `SIGNWELL_API_KEY` unregisters the adapter and `converge()` records
  `provider_unconfigured`, while an adapter stays registered regardless of what any organization
  has selected.
- `packages/validation/src/signing-providers.ts` carries the shape and the questions asked of it;
  each adapter declares its own record. TC-04-UNIT-05 passes.

### T3 — the in-house engine on the new port (req 8, 9, 10)

- `internal-signing-provider.ts` declares `{ours, ours, ours, none, ours}` and implements
  `LocallySigned`; the certificate assembly moved verbatim to
  `documents/certificate-of-completion.ts`.
- Req 10 verified the way the handoff asks — **by diffing the tests, not the sources**:
  `git diff 57d55ac...HEAD -- apps/api/test e2e/tests packages/validation/src` is new spec-04
  files plus **exactly one hunk** in an older suite: `TC-02-UNIT-02`'s enum count 15 to 17, which
  is the single enumerated exception, and it *adds* two assertions (`provider_synced` and
  `provider_error` are present) rather than removing any. Nothing else in the suites of specs 01,
  02 and 03 is touched.
- TC-04-INT-20 has no code of its own by design; it is "spec 02's suite passes unedited", and I
  ran it (below).

### T4 — the SignWell adapter and its HTTP client (req 7, 11, 17, 19, 36, 39)

- Capabilities `{ours, embedded, provider, webhook, provider}` — requirement 11 exactly.
- Req 19: limits are **read** from `x-ratelimit-limit` and `x-ratelimit-remaining` per route family
  (`read`, `create-document`, `create-hook`) and nowhere hard-coded; a 10s hard timeout via
  `AbortController`; five attempts with exponential backoff **plus jitter**; serialization per
  organization; a breaker that opens after five consecutive failures and fails fast for 60s.
- Req 17: `completed_pdf?url_only=false&audit_page=true`, and a `404` returns `null` and is
  retried — completion is established from `GET /documents/{id}` first, since `completedDocument`
  refuses unless the document reads `completed`.
- Req 36: only `describeDocument` (the projection) is ever logged; `failure()` deliberately
  excludes the provider's body; `embedded_signing_url` and `fields[].value` are absent from the
  projection by construction.
- Req 39: `normalizeSignerStatus` maps `waiting` to `pending`, `sent` to `notified`, and takes
  `viewed`, `signed` and `declined` at face value; `fetchState` keeps `document.status` verbatim
  as `providerStatus`.
- Stub driver: selected by `SIGNWELL_DRIVER` in `signature.provider.ts`, which **throws** on
  `stub` when `NODE_ENV=production`; `test-support/signwell-stub.controller.ts` sits behind the
  existing `fixture-gate.ts` and 404s under any other driver; `e2e/playwright.config.ts` sets
  `SIGNWELL_DRIVER=stub` and the three configuration values, because registration is decided by
  their presence.

### T5 — text tags and the send path (req 1, 5, 12, 13, 14, 26, 38)

- Req 1 as a lifecycle fact: the organization setting is read **once at the start of the send**
  (`organizationProviderKey`, edge case 13), and `providerKey` is written in the transaction that
  sets `status = sent` and nowhere else. I grepped for every writer of `providerKey`: besides the
  draft display default at creation, that send transaction is the only one.
- Req 14: `signwell-text-tags.ts` visits **every** `{{...}}` in the frozen HTML; anything that is
  not a signer-owned field of a role that actually has a signer is a residual, and residuals throw
  `UnresolvedPlaceholdersError` **before** `createSession` is called — so the abort happens before
  a document exists on their side. Signature tags are emitted after that check, from the literal
  `signature-mark` anchor the renderer writes, and two blocks with the same `data-signer-role`
  legally emit two tags (edge case 3). Tags are wrapped in the page background colour, per the
  Known Gap.
- Req 13: the outgoing body carries every field the table names, `file_base64` (never `file_url`),
  `metadata.envelope_id` and `organization_id`, and `api_application_id` only when configured.
- Req 38: `pollUntilParsed` (ten attempts) then `verifyMaterialized`, which claims each expected
  field once by type, recipient and required flag; a mismatch or a timeout **deletes** the document
  and throws `document_fields_not_materialized` naming what was missing.
- Req 26: `findOrphan` pages `GET /documents` with **no filter parameters at all**, compares
  `metadata.envelope_id` in our own code, adopts only on an exact match, caps at twenty pages and
  throws `provider_unavailable` at the cap. TC-04-INT-03d asserts both directions — the matching
  row adopted, the non-matching rows not, and nothing adopted when no row matches.
- Req 12: the invitation goes through `MailService.sendSigningInvitation` with
  `invitation.signingUrl` (our own `/sign/{token}`), under `sendsOurOwnInvitation(capabilities)`.

### T6 — the webhook receiver (req 20, 22, 25, 35)

- Req 20: no header is consulted; `verifySignWellHash` HMACs `"{type}@{time}"` keyed by the webhook
  id, compares lengths first and then `timingSafeEqual`. A missing secret denies everything.
- Req 25: the route answers the same `RECEIVED` constant for every verified request; the reference
  lookup and the convergence run on the job queue **after** the response is decided; an unknown
  reference logs a warning and closes the row `unknown_ref` with a null `envelopeId`; a bad hash is
  a bare `401` with an empty body via a marker exception plus a filter, so Nest's default JSON
  envelope cannot leak a comparable shape; the route is rate limited to 600/min per source with a
  bare `429`.
- Req 22: dedupe is the composite unique key; `P2002` is the duplicate path and is logged at debug
  rather than raised.
- Req 35: `redactProviderPayload` walks recursively — the real `fields` are an **array of arrays**,
  which a `map` would have silently skipped — redacting every `embedded_signing_url`, every `value`
  inside a `fields` subtree, and every `metadata` key outside our two; it then re-serializes and
  refuses to store if any credential key survived. Redaction happens **before** the first write, and
  a payload that fails to redact is not stored at all.

### T7 — converge-to-state, reached three ways (req 21, 23, 24, 37, 39, 41, 42)

- Req 21 and 23: `converge()` calls `fetchState` and writes only what the difference implies,
  through `EnvelopeEventsService` inside one `$transaction`.
- Invariant 9 and req 41: the terminal check is **before** the `fetchState` call, so our own
  `document_canceled` is settled rather than converged — no provider call, no `providerError`,
  outcome `ignored_terminal`.
- Req 42 and edge cases 27–28: `!state.exists` on a non-voided envelope sets
  `provider_document_not_found` and changes nothing; a voided envelope never reaches that line.
- Edge cases 9–10: an unmatched or duplicated remote recipient sets `mismatch`, which suppresses
  every envelope-level transition and records `signer_mismatch`; **no `EnvelopeSigner` is ever
  created or deleted from provider data.**
- Req 24: `convergeIfStale` is called from `EnvelopesService.get` and from the signing page read
  (only once the turn is open); `DEFAULT_PROVIDER_SYNC_STALE_SECONDS = 120` is exported here; a
  null `providerSyncedAt` is treated as **stale** (`POSITIVE_INFINITY`), which is the safe
  direction the handoff asks to keep, and the send writes `providerSyncedAt` so a fresh envelope
  costs nothing (TC-04-INT-12). `sweepStale` walks non-terminal remote envelopes older than an
  hour.
- Req 37: the `provider_synced` event's metadata is exactly `{provider, providerStatus}`.

### T8 — completion before the status commits, void as delete-then-settle (req 17, 27–30, 40, 42)

- Req 27 and invariant 10: `completeFromProvider` downloads, then `store()` (magic-number check,
  hash, content-addressed `put`), and only **then** the transaction that sets `status = completed`.
  A failure sets `pdfStatus = pending` with `providerError` under a `status != completed` guard, and
  the sweep's `retryProviderDownloads` retries it.
- Req 28: the certificate's inputs are handed to a provider **only** when
  `capabilities.completedDocument === 'ours'`, so no Certificate of Completion is assembled for a
  SignWell envelope; the detail screen's `certificateIssued` reads the same capability.
- TC-04-INT-13: the `updateMany({ where: { signedPdfKey: null } })` guard is inside the
  transaction, so the loser writes nothing and leaves the stored object alone.
- Req 30: the only `DELETE` call sites are the void path, the rolled-back-send compensation, and
  the unusable-document delete inside `createSession`; `canVoid` excludes `completed`, so a
  completed document is never deleted.
- Req 40: `cancelRemoteSession` runs **before** the void transaction and there is no re-read; a
  `404` becomes `provider_document_already_gone` on the envelope and the void still commits.
  Grepping `apps/`, `docs/` and `specs/` for "delete-then-converge" returns **no hits** — the
  superseded text is gone.

### T9 — signing settings end to end (req 31–33)

- Guard stack `SessionGuard` then `OrgScopeGuard` then `CapabilityGuard`; every query scopes by
  `session.organizationId`; a foreign organization is 404 from the guard, a wrong role is 403 with
  the shared message. `ViewSigningSettings` is admin and manager, `ManageSigningSettings` is
  **admin only**, both through `ROLE_CAPABILITIES` and `normalizeRole()`.
- Req 32: `missingConfiguration()` is the whole gate — `SIGNWELL_API_KEY`,
  `SIGNWELL_API_APPLICATION_ID`, `SIGNWELL_WEBHOOK_SECRET`. `reachable` and `webhookRegistered` are
  computed in `liveChecks`, returned beside the option, and are **never** consulted by `update()`.
  An unconfigured provider is listed, disabled, with the missing items named.
- Req 33: the modal names `inFlightCount`, which counts `sent` and `partially_signed` only — a
  draft is deliberately excluded, because edge case 14 sends it on the **new** provider. The
  confirm button is gated by the checkbox, which is the permitted deliberate confirmation, while
  the page's Save button is disabled only by `loading={saving}` and never for validation.
- Every user-facing string on both surfaces comes from `SIGNING_PROVIDER_MESSAGES`; I re-read the
  three components looking for inlined copy and found none.
- Navigation: the Settings group is pushed only under `hasCapability(role, 'ViewSigningSettings')`
  and the page calls `notFound()` for anyone else — the same shape `projects/page.tsx` and
  `time-tracking/page.tsx` already use.

### T10 — the signing surface, the iframe, the detail row (req 6, 12, 15, 16, 34)

- Req 16 is ordered correctly, and this is the security-critical part: `resolve()` decides the state
  from **our** rows, and `embeddedSurface()` returns early unless `state === 'ready_to_sign'`, so a
  wrong-turn visitor makes zero provider calls (TC-04-INT-15).
- Req 6: `signerAccess` runs on every open and the URL is returned inline; no column holds it.
- Req 15: `EmbeddedSigning.tsx` renders a plain `<iframe>` and adds a `message` listener that
  returns early unless `event.origin === origin`; the SDK is not loaded. `next.config.mjs` widens
  `frame-src` by exactly one origin from a **build-time** constant. I proved that lands rather than
  assuming it: `npm run build` in `apps/web`, then `.next/routes-manifest.json` contains
  `frame-src 'self' https://www.signwell.com` with `script-src` untouched.
- The `503` with the signing-service-unavailable message is distinct from an invalid token, the
  retry card says the link still works, and the token is not consumed.
- Req 34: the detail screen renders `envelope-provider` and `envelope-test-badge` from the
  envelope's own columns; the two spec-02 ids (`envelope-download-btn` and
  `signing-signature-canvas`) are untouched.

## The one change this attempt made

Comment-only, in three files that T9 and T10 already own. Three shipped comments said the DS gap
they describe "is recorded in this spec's DS gaps table" — and no such table exists, in spec 04 or
in any spec in the documents area. Pre-implement raised it as **N2** in this run and in the previous
one, and the handoff's own `dsGaps[2]` names exactly two settlements: the specs grow the section
(not mine to write), **or** "the two code comments stop naming a table that does not exist". I took
the half that is inside my globs, so the comments now point at where the gap is actually recorded —
this run's `handoff.dsGaps` — and say why. There are three such comments, not two; all three are
corrected.

- `apps/web/app/org/[orgId]/settings/signing/page.tsx` — the `LoadingRows` doc comment.
- `apps/web/app/org/[orgId]/settings/signing/ProviderOption.tsx` — the option-row doc comment.
- `apps/web/app/sign/[token]/EmbeddedSigning.tsx` — the `placeholder` doc comment.

No behaviour, no test, no selector and no message changed. The DS gaps themselves are unchanged and
**no design-system component was invented to close them**, per the handoff's instruction.

## Test cases

Every `TC-04-*` id in the spec appears in the suites.

- Unit: `TC-04-UNIT-01..03` in `packages/validation/src/signwell-text-tags.test.ts`;
  `TC-04-UNIT-04` and `TC-04-UNIT-06` in `packages/validation/src/signwell-webhook.test.ts`,
  against the three real deliveries in `apps/api/test/signwell-webhook-fixtures.ts`;
  `TC-04-UNIT-05` in `packages/validation/src/signing-providers.test.ts`; the amended
  `TC-02-UNIT-02` in `packages/validation/src/envelopes.test.ts`.
- Integration: `TC-04-INT-01`, `-02`, `-03`, `-03a`, `-03b`, `-03c`, `-03d`, `-17`, `-22` in
  `apps/api/test/signwell-send.spec.ts`; `-04`, `-05`, `-07`, `-08` in
  `apps/api/test/signwell-webhook.spec.ts`; `-06`, `-10c`, `-11`, `-12` in
  `apps/api/test/signwell-reconcile.spec.ts`; `-09`, `-10`, `-10a`, `-10b`, `-13` in
  `apps/api/test/signwell-completion.spec.ts`; `-14`, `-15` in
  `apps/api/test/signing-embedded.spec.ts`; `-16`, `-18`, `-19` in
  `apps/api/test/signing-settings.spec.ts`; `-21` in `apps/api/test/signwell-client.spec.ts`.
  `TC-04-INT-20` is the meta-case, and it is the spec-02 run below.
- E2E: `TC-04-E2E-01..05` in `e2e/tests/signature-providers.spec.ts`.

## What I ran

    npm run test:unit                                     19 files, 941 tests, all pass
    npx tsc --noEmit -p apps/api/tsconfig.json            clean
    npx tsc --noEmit -p apps/web/tsconfig.json            clean
    npx tsc --noEmit -p packages/validation/tsconfig.json clean (the API's prebuild target)
    npm run build  (apps/web)                             succeeds; frame-src verified in the manifest

Integration, from `apps/api`, with the port override described above — the files this diff touches,
and the spec-01/02 files it sits under:

    npx jest --maxWorkers=4 test/signwell-send.spec.ts test/signwell-webhook.spec.ts \
      test/signwell-reconcile.spec.ts test/signwell-completion.spec.ts \
      test/signwell-client.spec.ts test/signing-settings.spec.ts test/signing-embedded.spec.ts
        -> 7 suites, 42 tests, all pass

    npx jest --maxWorkers=4 test/envelopes.spec.ts test/signing.spec.ts test/capability.spec.ts \
      test/org-scope.spec.ts test/document-templates.spec.ts test/outbox.spec.ts \
      test/test-fixtures.spec.ts test/drivers.spec.ts
        -> 8 suites, 136 tests, all pass    <- TC-04-INT-20 / requirement 10, unedited

Also run: `npx prisma migrate diff ...` (no difference) and `prisma migrate deploy` (no pending
migrations). **E2E was not run and the integration suite was not run in full**, per the repository
rule — both run sharded on the deploy gate, and QA runs the targeted set next.

## Not fixed, and why

- **N1** (the first-signer flow still describes the `SignWellEmbed` SDK event, which requirement 15
  forbids) and **N3** (`specs/documents/README.md` says the provider is pinned at creation, which
  requirement 1 contradicts) are both `target: spec` notes. The code follows the governing
  requirement in each case — a plain iframe with an origin-checked listener, and `providerKey`
  written at send — and specs are not mine to edit. They stay for a human.
- The settings `GET` makes two live provider calls (`ping`, then `hooks`) on every load. With an
  unreachable provider the first load can spend the full retry budget before the breaker opens. The
  spec asks for the live check and sets no budget for it, so I did not invent one; recorded here
  because it is the kind of thing worth a decision rather than a discovery.

## Verdict

`pass`, no findings.
