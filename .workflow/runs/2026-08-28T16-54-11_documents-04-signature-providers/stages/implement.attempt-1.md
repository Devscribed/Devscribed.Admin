# Implement — attempt 1

Spec: `specs/documents/04-signature-providers.md`
Branch: `spec/signwell-provider` · Diff base: `57d55ac`

This run resumes after a spec fix. Commit `1b77b06` implemented the spec; commit `2201c91`
amended the spec in six places and touched no application code. Five of the six fixes were
already satisfied by the shipped code, so this attempt is **three concrete deliverables plus
verification of the rest against the amended requirement numbers**, exactly as the handoff
frames it. No finding from a prior stage was addressed to `code`, so there is nothing to
contest and nothing to fix from a review.

## What changed in this run

| File | Task | Change |
|---|---|---|
| `docs/deployment.md` | T1 | The deploy-order decision backward compatibility 3 delegates here. Both false claims corrected. |
| `apps/api/prisma/migrations/20260828140000_spec_04_signature_providers/migration.sql` | T1 | Header comment only — it asserted the very claim the amended spec calls false. **No SQL changed.** |
| `apps/api/src/documents/envelopes.service.ts` | T8 | Void comment now cites requirement 40 as *delete-then-settle*, no re-read. Behaviour unchanged. |
| `apps/api/test/signwell-completion.spec.ts` | T8 | Same citation, in the suite header. No assertion touched. |
| `e2e/tests/signature-providers.spec.ts` | T11 | Stale testid comment describing a spec conflict that no longer exists. No selector changed. |

Five files, 60 insertions, 18 deletions. Nothing else on the branch was edited.

### T1 — the runbook deliverable (the only unbuilt work)

`docs/deployment.md:84` said "the deploy and the migration are independent and either order
must work" and `:278` said a green rollout with a red migration means "the environment is not
broken, the schema is behind". Backward compatibility 3 (spec lines 1180–1193) says both are
false for this migration and delegates the choice to this file. Corrected in place:

- **Additive makes the rollback safe, not the roll-out window.** The additive rule itself is
  restated rather than weakened — it is what leaves the ordering a runbook choice at all.
- **A release that adds columns to a table the running code reads migrates first**:
  `make migrate-<env>` then `make deploy-<env>`, because Prisma's client names columns in its
  `SELECT` and every such read fails `42703` until the migration lands. The deploy target's own
  migrate step then becomes a no-op.
- Named `push to main deploys dev by itself` (`infra/deploy.sh`, rollout then migration), so a
  release in this class has its migration applied **before** the merge.
- Named **spec 04 as the first release that needs it**, with the six columns and the two screens
  that would answer 500.
- The troubleshooting entry at `:278` now splits the two cases instead of asserting the benign
  one: reads of created columns → an outage to fix forward immediately; otherwise the schema is
  merely behind. Fix-forward-not-rollback is kept.

Migration header comment corrected for the same reason (it read "That is what makes
`make deploy-<env>` sound"). Verified this is safe before touching it: `prisma migrate deploy`
re-run against `devscribed_test` with the file modified reports *"No pending migrations to
apply"* — deploy does not re-verify checksums of applied migrations, and `predev` uses
`migrate deploy` too. The SQL is byte-identical; only the comment moved.

**Verified, not rebuilt** (T1's other half):

- One migration in this run, and only one: `git diff --stat 57d55ac...HEAD -- apps/api/prisma/migrations`
  lists `20260828140000_spec_04_signature_providers` alone. No second migration was created.
- Additive end to end: two `ALTER TYPE ... ADD VALUE`, `ADD COLUMN` with defaults on
  `Organization`/`Envelope`/`EnvelopeSigner`, one `CREATE TABLE`, two FKs `ON DELETE SET NULL`.
  No rename, no drop, no new `NOT NULL` on an existing table.
- `EnvelopeSigner.providerRef` carries **no** `@@unique([envelopeId, providerRef])`
  (`schema.prisma:438-441`, with the reason in the doc comment) — an empty string would collide
  across every internal signer.
- Configuration surface (req 34): `apps/api/.env.example:88-109` carries `SIGNWELL_API_KEY`,
  `SIGNWELL_API_APPLICATION_ID`, `SIGNWELL_TEST_MODE`, `SIGNWELL_WEBHOOK_SECRET`,
  `SIGNWELL_API_BASE_URL`, `SIGNWELL_DRIVER`, `PROVIDER_SYNC_STALE_SECONDS=120`;
  `apps/api/test/setup-env.ts:21` sets the webhook id the captured fixtures were signed with
  (`apps/api/test/signwell-webhook-fixtures.ts`); `e2e/playwright.config.ts:94` runs
  `SIGNWELL_DRIVER=stub`, so the suite never reaches the network.

### T8 / T11 — the stale citations

`grep -rn "delete-then-converge|envelope-download-button"` over `apps/`, `packages/`, `e2e/`,
`docs/` now returns nothing. The void path still calls `cancelRemoteSession` outside the
transaction and then voids locally with no re-read (`envelopes.service.ts:1325` → transaction at
`:1327`), which is what amended requirement 40 asks for; only the words above it changed.

## Verification against the amended requirements

Every task below was checked at the file and line named. Nothing was rewritten.

- **T2 — port and registry (req 2,4,5,6,7,18).** `signing-provider.ts:29-59` declares
  `key/capabilities/createSession/signerAccess/completedDocument/cancel` and the two narrowing
  interfaces; **no `remind`** (`:20-23` states why, req 18). `ProviderCapabilities` carries
  exactly the five keys of the table. No method touches the database or sends mail. No column
  and no cache holds an `embedded_signing_url` — `grep` over `apps/api/src` and
  `schema.prisma` finds it only in the wire types, the projection's *absence* note
  (`signwell-projection.ts:85`), the redaction key set, and the per-request read at
  `signwell-signing-provider.ts:338`. TC-04-UNIT-05 (the "no branch outside the adapter and the
  registry compares against `signwell`" guard) passes.
- **T3 — the in-house engine (req 8,9,10).** `internal-signing-provider.ts:50-54` declares
  `{ours, ours, ours, none, ours}`. **TC-04-INT-20 is the run of spec 02's suite**: 72 cases in
  `envelopes.spec.ts`, `signing.spec.ts`, `autofill.spec.ts` pass with no assertion edited.
  Diff audit of `apps/api/test`, `packages/validation/src`, `e2e/tests` from `57d55ac`: every
  file is new except three.
  - `packages/validation/src/envelopes.test.ts` — the single enumerated exception of req 10,
    fifteen → seventeen, plus a `toContain` per new value. Permitted verbatim by the spec.
  - `packages/validation/src/roles.test.ts` / `roles.ts` — spec 04's own role matrix adds
    `ViewSigningSettings` and `ManageSigningSettings`; `ROLE_CAPABILITIES` is asserted as an
    exhaustive list, so a new capability must appear in it. Nothing existing was removed,
    reordered or weakened, and this is spec 01/03's suite, not spec 02's, which req 10 scopes.
- **T4 — adapter and client (req 7,11,15,16,17,19,36,39).** Capability record at
  `signwell-signing-provider.ts:55-59`; `completed_pdf?url_only=false&audit_page=true` at
  `signwell-http-client.ts:206`; limits read from `x-ratelimit-limit`/`-remaining` at `:345-346`
  rather than hard-coded; hard 10s timeout (`:86`, `:404`); breaker at `:284`. The stub
  controller sits behind the existing `assertFixturesOpen`/`resolveFixtureScope` fence and 404s
  when the stub driver is not in use (`signwell-stub.controller.ts:1-15`).
- **T5 — text tags and the send path (req 1,5,12,13,14,26,38).** Create body carries
  `file_base64` (never `file_url`), `apply_signing_order`, `text_tags`, `embedded_signing`,
  `embedded_signing_notifications:false`, `reminders:false`, `expires_in`, `metadata`,
  `allow_decline:true`, `allow_reassign:false` (`:109-120`). A residual `{{...}}` **aborts** the
  send with `document_tags_unresolved` before anything exists on the provider
  (`envelopes.service.ts:1158-1167`). Materialization poll then `verifyMaterialized`, and a
  mismatch or a timeout `DELETE`s and raises `document_fields_not_materialized`
  (`signwell-signing-provider.ts:225-296`). Orphan recovery compares `metadata.envelope_id`
  client-side with an exact match (`:205-208`) because their list ignores filters.
- **T6 — webhook (req 20,22,25,35).** `HMAC-SHA256("{type}@{time}")` keyed by the webhook id,
  length-checked then `timingSafeEqual` (`signwell-notification.ts:40-46`); a bad hash is a bare
  `401` with an empty body (`signwell-webhook.guard.ts:79-87`); `200 {"received":true}` is one
  constant (`signwell-webhook.controller.ts:28`); redaction runs before the first write
  (`:69-71`) and a payload that fails to redact is not stored; dedupe is the composite unique in
  the schema (`:545`); rate limit 600/60s answering a bare `429`.
- **T7 — reconciliation (req 21,23,24,37,39,41,42).** Outcomes
  `converged | ignored_terminal | unknown_ref | error`; terminal envelopes short-circuit
  (`provider-reconciler.service.ts:211`); `provider_synced` records the provider key and their
  status string only (`:386-392`); staleness from `PROVIDER_SYNC_STALE_SECONDS` with a 120s
  default (`:617-620`); signer mismatch sets `providerError` and writes nothing (`:403`).
- **T9 — settings API (req 1,31,32,33).** `SessionGuard, OrgScopeGuard, CapabilityGuard`, read
  admin+manager, write admin only, queries by `session.organizationId` and never the path
  parameter (`signing-settings.controller.ts`, `signing-settings.service.ts:65,121,155`). Every
  user-facing string comes from `SIGNING_PROVIDER_MESSAGES` in `packages/validation`; none is
  inline.
- **T10 — the signing surface (req 6,12,15,16).** Surface decided server-side from the
  capability, not the key (`signing.service.ts:740-770`); the URL is fetched per request and
  never persisted; an unreachable provider is `503 provider_unavailable`, deliberately distinct
  from an invalid token, and the token is not consumed. `next.config.mjs:113` widens `frame-src`
  by exactly one build-time origin and leaves `script-src` alone (`:105`); `EmbeddedSigning.tsx`
  is a plain `<iframe>` with `event.origin` checked before anything is read (`:76`). No vendor
  script tag exists anywhere in `apps/web` — requirement 15 over the flow text (note N1).
- **T11 — the screens (req 31,32,33,34).** Save button is never disabled for validation, only
  `loading={saving}` (`settings/signing/page.tsx:170-176`), and is **not rendered** for a manager
  (`canManage &&`); `user`/`viewer` hit `notFound()` (`:40`) and get no sidebar entry
  (`Sidebar.tsx:144-156`, no dead links). The modal's confirm is the one permitted deliberate
  confirmation (`ChangeProviderModal.tsx:51`). All spacing, colour and size values are tokens;
  `1px solid var(--divider)` is the established repository idiom (42 occurrences). DS gaps —
  no Skeleton primitive, no selectable option row — are carried in the handoff's `dsGaps`; the
  spec has no DS gaps table to record them in, which is raised as note N2 rather than fixed here,
  since `specs/` is not mine to edit.

## Test cases

All spec-04 ids exist in code and were executed. Locations:

| Ids | File |
|---|---|
| TC-04-UNIT-01, -02, -03 | `packages/validation/src/signwell-text-tags.test.ts` |
| TC-04-UNIT-04, -06 | `packages/validation/src/signwell-webhook.test.ts` |
| TC-04-UNIT-05 | `packages/validation/src/signing-providers.test.ts` |
| TC-04-INT-01, -02, -03, -03a–03d, -22 | `apps/api/test/signwell-send.spec.ts` |
| TC-04-INT-04, -05, -07, -08 | `apps/api/test/signwell-webhook.spec.ts` |
| TC-04-INT-06, -10c, -11, -12 | `apps/api/test/signwell-reconcile.spec.ts` |
| TC-04-INT-09, -10, -10a, -10b, -13 | `apps/api/test/signwell-completion.spec.ts` |
| TC-04-INT-14, -15 | `apps/api/test/signing-embedded.spec.ts` |
| TC-04-INT-16, -17, -18, -19 | `apps/api/test/signing-settings.spec.ts` |
| TC-04-INT-21 | `apps/api/test/signwell-client.spec.ts` |
| TC-04-INT-20 | no file of its own by design — it *is* spec 02's suite run unedited (see below) |
| TC-04-E2E-01 … -05 | `e2e/tests/signature-providers.spec.ts` (not run here — see below) |

## What was run

```
npm run test:unit                                   19 files, 941 tests, all pass
apps/api: npx tsc --noEmit -p tsconfig.json         clean
apps/web: npx tsc --noEmit                          clean
apps/api: npm test -- test/envelopes.spec.ts test/signing.spec.ts test/autofill.spec.ts
                                                    3 suites, 72 tests, all pass   (TC-04-INT-20)
apps/api: npm test -- test/signwell-send.spec.ts test/signwell-webhook.spec.ts \
          test/signwell-reconcile.spec.ts test/signwell-completion.spec.ts \
          test/signwell-client.spec.ts test/signing-settings.spec.ts \
          test/signing-embedded.spec.ts             7 suites, 42 tests, all pass
```

Targeted files as positional paths (Jest 29). E2E was not run and the integration suite was not
run in full, per CLAUDE.md — both are the deploy gate's and QA's.

**Local environment note, not a defect:** this machine carries an untracked
`docker-compose.override.yml` publishing Postgres on **5434** because a native Postgres holds
5433, so the integration commands above were run with
`TEST_DATABASE_URL=postgresql://devscribed:devscribed@localhost:5434/devscribed_test`. The
default in `apps/api/test/database-url.ts` is unchanged; the override file documents this.

## Observations for the reviewer (no change made)

1. `envelopes.service.ts:1711` returns `certificateIssued` on the envelope detail payload and
   `apps/web` renders no certificate control for either provider, so TC-04-E2E-05's
   `envelope-certificate-link` absence assertion is trivially true. Requirement 28 (no
   certificate *generated* under SignWell) is satisfied and asserted at integration
   (TC-04-INT-09). Adding a certificate control is spec 02's surface and outside this handoff's
   globs; recorded rather than improvised.
2. `signing.service.ts:751` compares `providerKey === 'internal'` in the branch that runs only
   when the registry has no adapter for the key. TC-04-UNIT-05's guard covers `'signwell'`, and
   the fallback exists so an unregistered internal provider still serves our own surface rather
   than a 503. Left as shipped.
