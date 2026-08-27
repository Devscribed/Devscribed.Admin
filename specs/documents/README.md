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

## Product decisions

| Decision | Choice | Rationale |
|---|---|---|
| Signature engine | Built in-house behind a `SignatureProvider` port | 80% of the value here is templates, fields, and binding to our own records — that is our code under any provider. The signing transport is the swappable part. Dropbox Sign / Documenso / DocuSign adapters are a later class + env var, not a migration. |
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
| Submit CTA is never disabled for validation (inherited from user-management spec 01) | user-management/01 | 01, 02 |

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

## Dependency Graph

```
01 Document Templates
└─► 02 Envelopes & Signing
     └─► 03 Field Autofill
```

Spec 03 depends on both: it binds template fields (01) to member data and applies them when an
envelope is created (02).

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
7. **The provider port is present from day one.** `Envelope.ProviderKey` and
   `Envelope.ProviderRef` exist in the first migration, so adding a Dropbox Sign, Documenso, or
   DocuSign adapter is a new class plus an environment variable — no migration, no API change, no
   change to the state machine.
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
| The dev stand carries `/api/test/*` fixtures the product has no replacement for: a simulated mailbox, a membership move, a role switch, and an envelope-expiry write | The suite cannot build its own preconditions otherwise — the signing link exists only inside the message, there is no invite flow, and nothing can age an envelope. One token opens all four; `prod` creates none, so every route is 404 there. The three that write additionally require a session that is already an **admin of the organization** being written to, so the token alone is not authority over anything | A mail provider retires the sink; spec 04 retires the membership and role fixtures. `test_fixtures_enabled` goes false and the routes are deleted with them |

