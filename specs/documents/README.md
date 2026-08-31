# Document Builder Specifications

Functional specifications for the document-builder surface of Devscribed.Admin — contract
templates, field filling, and two-party electronic signature. Each spec is self-contained with
requirements, UI, API contracts, and test cases. Specs use YAML frontmatter (`tags`, `routes`,
`api`, `entities`) for discoverability — grep frontmatter to find relevant specs.

## Why this area exists

Onboarding a contractor or signing a client agreement today happens outside the product. This
area brings it in: an admin stores a contract template once (contractor BY, contractor US,
client US, NDA — the specific contracts are not the system's concern), fills the variable
parts, and both parties sign by email. Spec 03 layers automatic field filling from the member
profile on top of that mechanism.

## Spec Index

| # | Spec | Design | Tags |
|---|------|--------|------|
| 01 | [Document Templates](01-document-templates.md) | — | template, html, placeholder, field, version, publish, archive, sanitize |
| 02 | [Envelopes & Signing](02-envelopes-and-signing.md) | — | envelope, signing, magic-link, signature, audit-trail, pdf, void, decline, expiry |
| 03 | [Field Autofill](03-field-autofill.md) | — | autofill, member-profile, pii, binding, subject |
| 04 | [Signature Providers & SignWell](04-signature-providers.md) | — | signature-provider, signwell, port, adapter, webhook, embedded-signing, test-mode, idempotency, reconciliation |

## Product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Signature engine | Built in-house behind a provider port | 80% of the value here is templates, fields, and binding to our own records — that is our code under any provider. The signing transport is the swappable part. |
| Shape of that port | **Revised in spec 04.** Session-scoped, asynchronous, with a capability record | The original `SignatureProvider` — `issueInvitation` / `applySignature` / `finalize` — assumed we mint the token, host the page, capture the ink and build the PDF. A real vendor does all four itself. The columns did survive as promised; the interface did not. The revised port's unit of work is the whole signing session, and the envelope service branches on *what a provider does*, never on *which provider it is*. |
| Provider choice | Per organization, pinned per envelope | An envelope's provider is written once at creation and never changes, so switching can never reach an in-flight contract. A per-envelope choice was rejected: a sender would need a reason to choose, and the product cannot express one. |
| SignWell signing surface | Embedded widget on our origin | The counterparty stays in our product, the invitation comes from our address, and the link cannot outlive our access control. The cost is that our own signing canvas and consent capture are unused for that provider. |
| SignWell record of execution | Their completed PDF with their audit page | Two documents claiming to be the evidence is worse than one. Our `EnvelopeEvent` chain keeps running as the operational journal, fed by reconciliation. |
| Trust in a webhook body | None | SignWell's `event.hash` covers `type@time` only, and its key is the webhook id. Every notification triggers a re-read of the document from the API; nothing is written from a payload. This makes replay, reordering and duplication harmless by construction. |
| Signature class | Simple Electronic Signature (SES) with a full audit trail | Sufficient for B2B agreements in BY and the US when the contract itself records that the parties accept electronic signature. Note that DocuSign would be the same class in Belarus — only a ГосСУОК/НЦЭУ certificate is a qualified signature there, and no SaaS vendor provides one. |
| Template format | HTML with `{{placeholders}}`, rendered to PDF server-side | Versions diff as text, the field list is derivable from the body, and substitution is trivial. Uploaded PDF/DOCX templates are out of scope. |
| External signer | Magic link, no account required | Reuses the existing single-use token pattern; works identically for staff and outside counterparties. |
| Signing order | Strictly sequential, order configurable per envelope | The second party receives a document already signed by the first. Parallel signing is a later flag — the `Order` column exists from day one. |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Template versions are immutable once published; a new edit creates a new draft version | 01 | 02, 03 |
| An envelope pins `TemplateVersionId` — template edits never alter a sent or completed document | 01 | 02 |
| Placeholder syntax is `{{snake_case_key}}`; no logic, no loops, no nesting | 01 | 02, 03 |
| Template HTML is sanitized server-side on save; the stored value is the sanitized one | 01 | 02 |
| Field values are HTML-escaped at substitution time | 01 | 02 |
| Signing tokens: 32 random bytes, URL-safe base64, only the SHA-256 hash is stored | 02 | — |
| Every state transition writes an `EnvelopeEvent` in the same transaction | 02 | 03 |
| `EnvelopeEvent` rows form a hash chain; the log is verifiable, not merely present | 02 | — |
| Signed PDFs are write-once and never re-rendered | 02 | — |
| All timestamps are stored in UTC; display adds the organization timezone | 02 | — |
| Capability checks run on the normalized role (see role-enum note below) | 01 | 02, 03 |
| Submit CTA is never disabled for validation (inherited from user-management spec 01) | user-management/01 | 01, 02, 04 |
| A provider's state is read from the provider, never from a notification body | 04 | 02 |
| `Envelope.providerKey` is written at send and never changes afterwards; a draft has no provider yet | 04 | 02 |
| No provider call runs inside a database transaction | 04 | 02 |
| A contract field value never reaches a provider-forensics row, a log, or the audit trail | 02 (req 40), 04 (req 35–37) | 03 |

## Role enum debt

`Membership.role` is a free-form `String` holding `admin` / `member` today, while
`specs/user-management/README.md` and spec 04 declare the target enum
`admin | manager | user | viewer`. This area introduces the first role-based authorization in
the codebase and must not silently pick a side.

**Rule:** capability checks run against `normalizeRole()` (to be added to
`@devscribed/validation`), which maps the legacy `member` to `user` and passes the four target
roles through unchanged. Permissions therefore work against today's data and survive the enum
migration without a change in this area.

## New infrastructure introduced by this area

**The platform is AWS**, provisioned with Terraform in this repository under `infra/terraform/`,
in **two environments — `dev` and `prod`** — that are complete, independent copies of the topology.
This area established the account layout, the state backend, and the deployment workflow, and `dev`
is deployed.

> The table below was written before the deployment and assumed the application would run on
> Vercel. It no longer does: the whole product runs on ECS Fargate, Postgres moved from Neon to RDS,
> and three of the rows below changed as a direct consequence. The current topology, and a row-by-row
> account of what changed and why, is the **AWS Infrastructure** section of spec 02.

| Capability | AWS service | Notes |
|---|---|---|
| Document storage | **S3** | One private bucket per environment. Versioning on, SSE-KMS with a customer-managed key, public access fully blocked, Object Lock in governance mode for signed documents. Delivery only via presigned `GET` with a 15-minute TTL. |
| Email delivery | **SES v2** | Verified **address** identity today — the account owns no domain — with a configuration set and an SNS event destination. A domain identity with DKIM and a custom `MAIL FROM` is the target state and a prerequisite for sending to real counterparties. Delivery events reach SNS but do not yet feed `EnvelopeEvent`. |
| PDF rendering | ~~Lambda~~ **the API container** | Superseded. The function existed only because a Chromium binary does not fit a Vercel bundle; on Fargate the API carries the browser. `PdfRenderer` is still a port, and `lambda-pdf-renderer.ts` is still in the tree. |
| Async work | ~~SQS + Lambda~~ **inline** | Superseded with the row above. A long-running process needs no queue to outlive the response. `JobQueue` is still a port. |
| Scheduled work | **EventBridge Scheduler** | Cron rule invoking the sweep Lambda for expiry materialization and reminders. Expiry *correctness* stays lazy (evaluated on read) so the system is right even if the schedule is down. |
| Secrets | **SSM Parameter Store** | `SecureString` parameters, free where Secrets Manager is $0.40/month each. Values are generated by Terraform and never seen by a person. Nothing is committed to the repository or to `.tfvars`. |
| Observability | **CloudWatch** | Log groups with retention, metric filters and alarms on render failures, SES bounce rate, and DLQ depth. |
| Role authorization | — | `CapabilityGuard` + `@RequireCapability()` in the API, layered after `SessionGuard` and `OrgScopeGuard`. |

Application-side abstractions sit in front of each service so dev and test never touch AWS:
`FileStorage` (`local` | `s3`), `MailService` (`memory` | `console` | `ses`), `PdfRenderer`
(`local-chromium` | `lambda`), `JobQueue` (`inline` | `sqs`). The in-memory and local drivers
remain the default whenever `NODE_ENV !== 'production'`, which is what keeps the Playwright suite
hermetic and free.

See spec 02 for the full AWS topology, IAM policies, Terraform layout, environment variables, and
the failure and cost characteristics of each service.

## Cross-Spec Side Effects

| Trigger | Source | Effect | Target |
|---------|--------|--------|--------|
| Template published | 01 | New envelopes bind to the new version; in-flight envelopes are unaffected | 02 |
| Template archived | 01 | No new envelopes may be created from it; existing ones continue | 02 |
| Envelope sent | 02 | Document HTML and hash frozen; signing token issued to signer 1 only | 02 |
| First signer signs | 02 | Envelope → `partially_signed`; token issued to signer 2 | 02 |
| Last signer signs | 02 | Envelope → `completed`; PDF rendered, hashed, stored; both parties emailed | 02 |
| Signer declines | 02 | Envelope → `declined`; every outstanding token invalidated; sender notified | 02 |
| Envelope voided | 02 | Outstanding tokens invalidated; captured signatures retained in the audit trail | 02 |
| Member removed (user-management 04) | 02 | In-flight envelopes continue (signature is bound to the email, not the account); UI flags the signer as no longer a member | 02 |
| Member profile updated | 03 | Affects only envelopes created afterwards — values are snapshotted at envelope creation | 02, 03 |
| Organization provider changed | 04 | New envelopes bind to the new provider; in-flight envelopes keep the one they were created with | 02 |
| Envelope sent under a remote provider | 04 | The document is created on the provider before the `sent` transaction; a provider failure leaves the envelope in `draft` | 02 |
| Provider notification received | 04 | State is re-read from the provider and our rows converge; every difference writes its `EnvelopeEvent` in one transaction | 02 |
| Remote envelope completes | 04 | The provider's PDF is stored before the envelope is marked complete, and no Certificate of Completion is issued | 02 |
| Signer-owned placeholder present at send | 04 | Translated into a provider text tag; any residual `{{…}}` aborts the send | 01, 02 |

## Dependency Graph

```
01 Document Templates
└─► 02 Envelopes & Signing
     ├─► 03 Field Autofill
     └─► 04 Signature Providers & SignWell
```

Spec 03 depends on both 01 and 02: it binds template fields (01) to member data and applies them
when an envelope is created (02).

Spec 04 depends on 02 for the envelope, its state machine and its audit trail, and on 01 for the
placeholder syntax it has to translate. It changes no requirement of either — it replaces the port
behind them and adds a second implementation.

## Blast Radius

What this area disturbs outside itself. Everything not listed here is untouched.

### Database

**Strictly additive.** Nine new models. None of the four existing models — `Account`,
`Organization`, `Membership`, `PasswordResetToken` — changes a column; they gain back-relations
only. No renames, no drops, no new `NOT NULL` on an existing table.

This matters operationally: `.github/workflows/migrate.yml` runs `prisma migrate deploy` on every
push to `main`, independently of the Vercel deploy. Because the migration is additive, the two can
land in either order without breaking the running application, and a code rollback needs no
database rollback.

### Shared code that breaks on contact

| Touched | What breaks | Mitigation |
|---|---|---|
| `MailService` abstract class gains signing methods | `ConsoleMailService`, `InMemoryMailService`, and `test-mail.controller.ts` stop compiling | All three are updated in the same change. `InMemoryMailService.lastFor()` grows a message-type discriminator so E2E can ask for the invitation specifically. |
| `app.module.ts` — today one flat module holding every controller | Six more controllers make it unreadable | Introduce `DocumentsModule`, the first real feature module in the codebase. This is a structural precedent, and it is deliberate. |
| `packages/validation` | Compiled `dist/` is consumed by both web and API | New rules are added; no existing rule or message is modified. `normalizeRole()` is new surface, not a change to an existing export. |
| `apps/web/src/layout/Sidebar.tsx` — one hardcoded nav array | A Documents section is added | Gated on capability so nothing dead ever renders, per the existing rule. |
| Member detail `Tabs` (user-management spec 05) | A Contract details tab is added | Additive; no existing tab changes. |
| Route surface | `/sign/{token}` is the **first route in the application with no session** | It lives at the top level (`apps/web/app/sign/[token]/`), so the client-side gate in `app/org/[orgId]/layout.tsx` never sees it. It uses its own `SigningLayout` and fetches no session. |

### Security surface

Three genuinely new exposures, each with a named mitigation:

1. **Author-controlled HTML rendered in the app.** Template bodies are written by admins and
   rendered both in the editor preview and on the public signing page. On a shared origin an XSS in
   a template would be session theft. Mitigations, all four required: server-side allow-list
   sanitization on save (spec 01); rendering only inside `<iframe sandbox="">` with neither
   `allow-scripts` nor `allow-same-origin`; HTML-escaping of every substituted value; a restrictive
   CSP on `/sign/*`.
2. **The first unauthenticated API surface.** `/api/sign/*` accepts requests from anyone with a
   link. Mitigations: 256-bit tokens with only their hash stored; per-IP rate limiting; identical
   responses for unknown and unauthorized tokens; no cookies set; no CORS widening.
3. **New PII.** `MemberProfile` stores addresses, tax ids, dates of birth, identity document
   numbers, and bank details. Mitigations in spec 03: capability-gated reads, masking for callers
   without `ViewMemberProfilePii`, exclusion from logs and from the audit trail, and a mask-write
   guard. Column-level encryption is an accepted, recorded gap.

### Operations

- **There is no CI that runs tests.** `.github/workflows/` contains only `migrate.yml`. This area
  adds roughly 60 test cases that nothing would execute. A `test.yml` workflow (unit → integration
  against a service Postgres → Playwright) is **in scope and a merge blocker**, not a follow-up.
- **First AWS footprint, and the first Terraform in the repository.** Account baseline, the S3
  state backend, OIDC trust from both Vercel and GitHub Actions, and the plan/apply pipeline all
  come into existence here. Budget for it as infrastructure work, not as a library integration.
- **Two environments, `dev` and `prod`**, provisioned from one root module with separate state
  files and separate `.tfvars` — no workspaces, no shared resources, and `apply-prod` gated on a
  manual approval. Spec 02 holds the full layout and the table of every input that differs between
  them; anything differing beyond that table is a bug.
- **SES production access has lead time.** A new SES identity starts in the sandbox and can only
  send to verified addresses. The request must go in early or the first real contract cannot be
  sent.
- **New environment variables** across `.env.example`, Vercel, and `e2e/playwright.config.ts`:
  `STORAGE_DRIVER`, `DOCUMENTS_BUCKET`, `AWS_REGION`, `MAIL_TRANSPORT`, `MAIL_FROM`,
  `SES_CONFIGURATION_SET`, `PDF_RENDERER`, `PDF_RENDER_FUNCTION`, `JOB_QUEUE`,
  `PDF_RENDER_QUEUE_URL`, `SIGNATURE_PROVIDER`, `APP_PUBLIC_URL`, `SIGNING_TOKEN_TTL_DAYS`,
  `ENVELOPE_EXPIRY_DAYS`, `INTERNAL_TASK_SECRET`.
- **Cold start and timeout.** PDF rendering is the only CPU-heavy path in the product. It is
  deliberately off the request path for final documents; synchronous preview must be measured
  before release.

## Backward Compatibility

1. **The migration is additive**, as above — deploy order does not matter and rollback needs no
   database change.
2. **The role enum is not silently redefined.** See the role-enum note above: capability checks run
   on `normalizeRole()`, so permissions work against today's `admin`/`member` data and keep working
   after the enum migration described in user-management spec 04, with no change to this area.
3. **Template version immutability is the core guarantee of the feature itself.** An envelope pins
   `TemplateVersionId`. Editing, republishing, archiving, or deleting a template cannot alter any
   document that has been sent or signed. A published version is never edited — it only ever
   spawns a successor.
4. **Signed PDFs are write-once.** A completed document is never re-rendered; the stored artifact
   is always what is served. Changing the rendering engine later cannot alter a document signed
   under the old one.
5. **No existing API route changes.** Everything new lives under
   `/api/organizations/{orgId}/document-templates`, `/api/organizations/{orgId}/envelopes`,
   `/api/sign`, and `/api/internal`. No existing integration or E2E test should need editing — if
   one does, shared code was disturbed beyond the `MailService` change listed above, and that is a
   signal to stop and look.
6. **The audit format is versioned.** `EnvelopeEvent.SchemaVersion` lets the hash-chain algorithm
   evolve without invalidating chains written under the old one.
7. **The provider columns are present from day one.** `Envelope.ProviderKey` and
   `Envelope.ProviderRef` exist in the first migration, so a third-party adapter needs no
   migration to carry its foreign identifiers, and no change to the state machine.

   > Corrected by spec 04. This row originally claimed the whole adapter was "a new class plus an
   > environment variable". The columns held; the *interface* did not. The first real vendor
   > showed that `issueInvitation` / `applySignature` / `finalize` describe our own engine rather
   > than a signing transport, because a vendor hosts the page, mints the link, captures the
   > signature and produces the PDF itself. Spec 04 replaces the port and rewrites the in-house
   > provider onto it. The columns, the state machine and the audit trail all survived unchanged,
   > which is the part of the original bet that paid.
8. **Autofill snapshots rather than binds.** A profile edit never reaches back into an existing
   envelope, so member data can be corrected freely without any risk to documents in flight.

## Known Gaps

Recorded deliberately, each with the reason it is acceptable for this release:

| Gap | Why it is acceptable now | What closes it |
|---|---|---|
| A signer can forward their link; possession of the email is the only identity proof | Matches the Simple Electronic Signature class we chose; the audit trail records what actually signed | Email OTP before signing |
| No PAdES/LTV certificate in the PDF, no RFC-3161 timestamp | The hash chain plus the Certificate of Completion is our tamper evidence | A signing certificate and a timestamp authority |
| No column-level encryption of PII | Database is encrypted at rest and reads are capability-gated | Application-level field encryption |
| Deleting an organization cascades away completed envelopes | S3 Object Lock preserves the objects, but the linking metadata would be lost | A delete guard when completed envelopes exist |
| No client entity, so autofill covers members only | Clients do not exist in the schema today | A `Client` model and a fourth spec in this area |
| Reminder cadence is fixed at one reminder | Configurability is not what makes the feature useful | Per-envelope reminder settings |
| SES delivery and bounce events reach SNS but do not become `EnvelopeEvent` rows | The signing flow works without them; a bounce is still visible in the SNS email subscription | An in-VPC consumer on the topic — an SNS HTTPS subscription cannot reach an API with no public address |
| Mail is sent from an address identity, and the account is in the SES sandbox | Every environment can be exercised end to end among verified addresses | A registered domain verified with DKIM, plus an SES production-access request. Both are lead-time items |
| The signing rate limiter counts in one process's memory | One task per service today, so the count is global by accident | A database-backed counter, or a WAF rule in front of the load balancer |
| The dev stand carries `/api/test/*` fixtures the product has no replacement for: a simulated mailbox, an envelope-expiry write, and the user-management area's own preconditions | The suite cannot build them otherwise — the signing link exists only inside the message, and nothing ages an envelope or fast-forwards a seven-day invitation. One token opens them all; `prod` creates none, so every route is 404 there. The envelope-expiry write additionally requires a session that is already an **admin of the organization** it writes to, so the token alone is not authority over anything. The membership move and the role switch that used to be here are **gone**: spec 04's invitations and spec 05's `PUT .../members/:memberId` replaced them, and the suite now builds its people the way a person does | A mail provider retires the sink. `test_fixtures_enabled` goes false and the routes are deleted with it |
| Where mail is simulated, an admin or manager can read their own organization's outbox on screen (`/org/:orgId/outbox`) — including live signing links | Without a provider the message is delivered nowhere and the signing link exists nowhere else, so "send it and open what the signer got" is otherwise impossible on a deployment. It is a product screen with the ordinary guard stack — session, org scope, `ManageEnvelopes` — scoped to the caller's own organization, and password resets are excluded because a reset link is an account takeover | A mail provider. `MailService` stops being the in-memory sink, every route answers 404, `features.mailOutbox` goes false, and the screen is not drawn |

## Open bug investigations

Both are follow-ups the spec owes before spec 04's SignWell path can work, per
[specs/bugs](../bugs/README.md):

- **[BUG-001](../bugs/BUG-001-signwell-text-tags-materialize-no-fields.md)** — `SPEC-DEFECT`.
  Requirement 13's recorded observation does not reproduce: SignWell materializes no fields
  from text tags, so requirements 14 and 38 rest on a premise that does not hold and need
  rewriting before any code changes.
- **[BUG-003](../bugs/BUG-003-embedded-signing-url-refuses-framing.md)** — `SPEC-GAP`. The
  provider's signing URL refuses framing until asked with `signwell_embedded_iframe=1`; this
  also settles the SDK contradiction between requirement 15 and the Flows section, in
  requirement 15's favour.
- **[BUG-004](../bugs/BUG-004-field-geometry-sent-in-points-not-provider-pixels.md)** —
  `SPEC-GAP`. Requirement 14e's grid is in points and says nothing about the unit the field
  list leaves in; the provider places in CSS pixels, so every signature landed a row high.
- **[BUG-002](../bugs/BUG-002-email-validation-looser-than-the-provider.md)** — `SPEC-GAP`.
  Two edge cases missing: a signer address the provider will not accept, and a provider `4xx`
  reported to the sender as an outage.
