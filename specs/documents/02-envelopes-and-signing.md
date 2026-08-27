---
id: "02"
title: Envelopes & Signing
routes: ["/org/{orgId}/documents", "/org/{orgId}/documents/{envelopeId}", "/sign/{token}"]
api: ["GET/POST .../envelopes", "PUT .../envelopes/{id}", "POST .../envelopes/{id}/send", "POST .../envelopes/{id}/void", "POST .../envelopes/{id}/signers/{signerId}/resend", "GET .../envelopes/{id}/document", "GET .../envelopes/{id}/audit", "GET/POST /api/sign/{token}"]
entities: [Envelope, EnvelopeSigner, SigningToken, EnvelopeEvent]
tags: [envelope, signing, magic-link, signature, consent, audit-trail, hash-chain, pdf, void, decline, expiry, terraform, s3, ses, lambda, sqs]
depends-on: ["01"]
---

# 02 — Envelopes & Signing

## Summary

An **envelope** is one contract in flight: a pinned template version, the values filled into it,
two named signers, and the trail of everything that happened to it. An admin creates an envelope
from a published template, fills the sender-owned fields, names both signers, and sends it. Each
signer receives a single-use magic link by email, opens the document without logging in, fills
their own fields, consents to sign electronically, and draws or types a signature. When both have
signed, the system renders a PDF with both signatures and a Certificate of Completion, stores it
immutably, and emails it to both parties.

The signature class is a **Simple Electronic Signature** backed by a verifiable audit trail. The
signing transport sits behind a `SignatureProvider` port so a third-party provider (Dropbox Sign,
Documenso, DocuSign) can be added later without touching the state machine, the data model, or
any API contract in this spec.

**Depends on:** Spec 01 (DocumentTemplate, DocumentTemplateVersion, TemplateField).

## Actors & Preconditions

- **Actors:** `admin` and `manager` create, fill, send, void, and download envelopes.
  `user` and `viewer` have no access to the org-scoped surface. **Signers** are anyone with a
  valid signing link — they need no account and may be outside the organization entirely.
- **Preconditions:** at least one published template (spec 01). For sending, a configured mail
  transport and document storage.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer | signer (token) |
|---|---|---|---|---|---|
| `ViewEnvelopes` — list and open | ✅ | ✅ | ❌ | ❌ | own envelope only |
| `ManageEnvelopes` — create, fill, send, resend | ✅ | ✅ | ❌ | ❌ | ❌ |
| `VoidEnvelope` | ✅ | ✅ | ❌ | ❌ | ❌ |
| `DownloadSignedDocument` | ✅ | ✅ | ❌ | ❌ | ✅ after completion |
| `ViewEnvelopeAudit` | ✅ | ✅ | ❌ | ❌ | ❌ |
| Sign / decline | — | — | — | — | ✅ |

A signer who is also a member gets no extra rights from their session; the signing surface is
authorized solely by the token.

## Functional Requirements

### Envelope creation

1. An envelope is created from a **published** template. The current version id is copied into
   `TemplateVersionId` and never changes. Creating from a `draft` or `archived` template is
   rejected.
2. The envelope title defaults to the template name and is editable.
3. On creation the system materializes one `EnvelopeSigner` per signer role of the pinned version,
   in the role's order, with empty name and email.
4. Fields with an `AutofillSource` are resolved at creation time and written into `FieldValues`
   (spec 03). Autofilled values are editable — autofill is a starting point, not a lock.
5. `ExpiresAt` defaults to 30 days after sending and is configurable per envelope between 1 and
   365 days.

### Filling and sending

6. Only a `draft` envelope may be edited. Every other status rejects edits with `409`.
7. Before sending, every **required** field whose `FilledBy` is `sender` must have a non-empty
   value. Signer-owned fields are left for the signing page.
8. Both signers must have a name (1–100 characters) and a valid email. Signing order is set here
   and defaults to the template's role order.
9. The two signers may share an email address. This is legal and the UI warns; each signer still
   receives a distinct token and must complete their own signing turn.
10. On send, inside a single transaction, the system: renders the document HTML from the pinned
    version plus the current values; computes `DocumentHash = SHA-256(RenderedHtml)`; freezes both
    onto the envelope; sets status `sent` and `SentAt`; issues a `SigningToken` for the
    **first** signer only; writes `created`-then-`sent` events; and hands the email to the mail
    transport.
11. If the mail transport rejects the message, the whole transaction rolls back and the envelope
    remains `draft`. An envelope is never marked `sent` for a message that was never accepted.
12. Sending an envelope that is not `draft` returns `409`. Concurrent sends resolve to exactly one
    winner via a row lock on the envelope.
13. `resend` re-issues a fresh token for the **current** signer, invalidates their previous token,
    and sends the email again. It does not change the envelope status. Rate-limited to one resend
    per signer per minute.

### Signing order

14. Signing is strictly **sequential**. The signer with `Order = 1` receives a link on send; the
    signer with `Order = 2` receives theirs the moment the first signs.
15. A token belonging to a signer whose turn has not arrived is rejected with "It is not your turn
    to sign yet". Under normal operation such a token does not exist; the check defends against a
    leaked or guessed one.

### The signing surface

16. The signing page is public, session-less, and served at `/sign/{token}`. It sets no cookies
    and is excluded from the application shell.
17. Opening a valid link records a `viewed` event once per signer (idempotent — repeat opens do
    not multiply events) and sets the signer status to `viewed`.
18. The page renders the frozen `RenderedHtml` inside a sandboxed iframe with neither
    `allow-scripts` nor `allow-same-origin`.
19. Sender-owned field values are displayed as part of the document and are **read-only**. The
    server ignores any attempt to submit values for a field the signer does not own.
20. Fields owned by this signer are presented as a form beneath the document. Required ones block
    submission until filled.
21. The signer must tick a consent checkbox — "I agree to sign this document electronically and
    that my electronic signature is legally binding" — before signing. `ConsentAcceptedAt` is
    recorded. This is the ESIGN/UETA consent record.
22. A signature is either **drawn** (canvas, stored as a PNG data URI) or **typed** (a name,
    rendered into an image at completion). A drawn signature with no ink is rejected; a typed
    signature must be 1–100 non-whitespace characters.
23. Before applying a signature the server recomputes the hash of `RenderedHtml` and compares it
    to `DocumentHash`. A mismatch aborts with `500`, writes a `tamper_detected` event, and raises
    an operational alarm.
24. Signing is **idempotent**: `SigningToken.UsedAt` is set inside the same transaction as the
    signature. A duplicate submission returns the completed state, not an error.
25. After signing, the signer's link becomes a read-only view of the document plus, once the
    envelope completes, a download link valid for 30 days after completion.
26. A signer may **decline** with an optional reason (max 500 characters). Declining moves the
    envelope to `declined`, invalidates every outstanding token, notifies the sender, and records
    the reason.

### Completion

27. When the last signer signs, the envelope moves to `completed`, `CompletedAt` is set, and a
    final-document render job is enqueued.
28. The final PDF contains the signed document followed by a **Certificate of Completion** page
    listing: envelope id, template name and version, document hash, and per signer — name, email,
    signature image, signed timestamp in UTC and in the organization timezone, IP address, user
    agent, and consent timestamp.
29. The PDF is hashed (`SignedPdfHash`) and written to storage under a key that is never reused.
    It is **write-once**: a completed document is never re-rendered.
30. Both parties are emailed a completion notice with a download link.
31. If rendering or storage fails, the envelope **stays** `completed` with `PdfStatus = failed`.
    The signatures are legally captured and must not be lost because a renderer crashed. The UI
    shows a banner and a retry action; the job also retries automatically with backoff before
    landing in the dead-letter queue.

### Voiding and expiry

32. An `admin` or `manager` may void a `sent` or `partially_signed` envelope with a reason
    (required, max 500 characters). Voiding invalidates every outstanding token and notifies every
    signer who had been notified.
33. Signatures already captured are retained in the audit trail. No completed PDF is produced for
    a voided envelope.
34. **Expiry is lazy and authoritative:** any read of an envelope or validation of a token treats
    `ExpiresAt < now()` as expired, regardless of the stored status. A scheduled sweep materializes
    the status and emits `expired` events, but correctness never depends on the sweep having run.
35. An expired envelope's links show an expiry page with a "Request a new link" action that
    notifies the sender. It never issues a token by itself.
36. Terminal statuses — `completed`, `declined`, `voided`, `expired` — accept no further
    transitions.

### Audit trail

37. Every state transition and every signer status change writes exactly one `EnvelopeEvent` in
    the same database transaction. There are no events without transitions and no transitions
    without events.
38. Events form a hash chain. For each event:
    ```
    EventHash = SHA-256( PreviousEventHash ‖ EnvelopeId ‖ Type ‖ OccurredAt(ISO-8601)
                         ‖ (ActorAccountId ?? ActorEmail ?? '') ‖ canonicalJson(Metadata) )
    ```
    The first event of an envelope uses an empty `PreviousEventHash`.
39. `GET .../audit` returns the chronology; `GET .../audit/verify` recomputes the chain and reports
    the first divergence. An edited or deleted row is therefore detectable rather than merely
    unlikely.
40. `Metadata` never contains field values. The audit trail records that a document was signed, not
    what was written in it — PII stays out of the log.
41. IP address and user agent are captured for every signer-originated event. The IP is taken from
    the trusted proxy header chain, and only the first hop the platform vouches for.

## Data Model

### Envelope

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `OrganizationId` | Guid (FK) | Cascade delete. |
| `TemplateVersionId` | Guid (FK) | Pinned. Restrict delete. |
| `Title` | string(200) | |
| `Status` | enum | `draft`, `sent`, `partially_signed`, `completed`, `declined`, `voided`, `expired` |
| `FieldValues` | Json | `{ key: value }`, accumulated from sender and signers. |
| `RenderedHtml` | text? | Frozen at send. |
| `DocumentHash` | char(64)? | SHA-256 of `RenderedHtml`, frozen at send. |
| `SignedPdfKey` | string(255)? | Storage object key of the final PDF. |
| `SignedPdfHash` | char(64)? | SHA-256 of the final PDF bytes. |
| `PdfStatus` | enum | `not_required`, `pending`, `ready`, `failed` |
| `SubjectMembershipId` | Guid? (FK) | Autofill subject (spec 03). |
| `ProviderKey` | string(40) | `internal` today. |
| `ProviderRef` | string(255) | Provider-side identifier; equals `Id` for `internal`. |
| `ExpiresAt` | DateTime? | Set at send. |
| `SentAt`, `CompletedAt`, `VoidedAt` | DateTime? | |
| `VoidedByAccountId` | Guid? (FK) | |
| `VoidReason` | string(500)? | |
| `CreatedAt` | DateTime | |
| `CreatedByAccountId` | Guid (FK) | |

### EnvelopeSigner

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `EnvelopeId` | Guid (FK) | Cascade delete. |
| `RoleKey` | string(64) | Matches a signer role of the pinned version. |
| `Name` | string(100) | |
| `Email` | string(254) | Normalized to lowercase. |
| `Order` | int | 1 or 2. |
| `Status` | enum | `pending`, `notified`, `viewed`, `signed`, `declined` |
| `MembershipId` | Guid? (FK) | Set when the signer is a member; informational only. |
| `SignedAt`, `DeclinedAt` | DateTime? | |
| `DeclineReason` | string(500)? | |
| `SignatureImage` | text? | PNG data URI. |
| `SignatureType` | enum? | `drawn`, `typed` |
| `SignatureTypedName` | string(100)? | The typed name, kept alongside its rendering. |
| `ConsentAcceptedAt` | DateTime? | |

`@@unique([EnvelopeId, RoleKey])`, `@@unique([EnvelopeId, Order])`

### SigningToken

Mirrors `PasswordResetToken` exactly — the raw token exists only in the email and the URL.

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `EnvelopeSignerId` | Guid (FK) | Cascade delete. |
| `TokenHash` | char(64) | SHA-256 hex of 32 random bytes, URL-safe base64 encoded. Unique. |
| `ExpiresAt` | DateTime | |
| `UsedAt` | DateTime? | |
| `IsInvalidated` | bool | Set by decline, void, or resend. |
| `CreatedAt` | DateTime | |

### EnvelopeEvent

Append-only. No update or delete path exists in the application.

| Field | Type | Description |
|---|---|---|
| `Id` | Guid | Primary key |
| `EnvelopeId` | Guid (FK) | Cascade delete. |
| `EnvelopeSignerId` | Guid? (FK) | |
| `Type` | enum | `created`, `sent`, `email_accepted`, `email_delivered`, `email_bounced`, `viewed`, `signed`, `declined`, `reminded`, `voided`, `expired`, `completed`, `downloaded`, `pdf_failed`, `tamper_detected` |
| `ActorAccountId` | Guid? (FK) | For member-originated events. |
| `ActorEmail` | string(254)? | For signer-originated events. |
| `IpAddress` | string(45)? | IPv4 or IPv6. |
| `UserAgent` | string(400)? | |
| `DocumentHash` | char(64)? | The hash in force at the time. |
| `Metadata` | Json? | Never contains field values. |
| `SchemaVersion` | int | Hash-chain algorithm version, starts at 1. |
| `OccurredAt` | DateTime | Server time, UTC. |
| `PreviousEventHash` | char(64)? | |
| `EventHash` | char(64) | |

`@@index([EnvelopeId, OccurredAt])`

### New Enums

- **`EnvelopeStatus`**: `Draft`, `Sent`, `PartiallySigned`, `Completed`, `Declined`, `Voided`, `Expired`
- **`SignerStatus`**: `Pending`, `Notified`, `Viewed`, `Signed`, `Declined`
- **`SignatureType`**: `Drawn`, `Typed`
- **`PdfStatus`**: `NotRequired`, `Pending`, `Ready`, `Failed`
- **`EnvelopeEventType`**: as listed above

### New Capabilities (extend `Capability` enum)

- `ViewEnvelopes` (admin, manager)
- `ManageEnvelopes` (admin, manager)
- `VoidEnvelope` (admin, manager)
- `DownloadSignedDocument` (admin, manager)
- `ViewEnvelopeAudit` (admin, manager)

## State Machine

```
                      ┌───────────────── void ──────────────────┐
                      │                                         ▼
  draft ──send──►  sent ──signer 1 signs──► partially_signed ──signer 2 signs──► completed
    │                 │                            │                                 │
  delete              └────── decline / expire ────┴──► declined / expired           │
                                                                                     ▼
                                                                     PDF render (async, retried)
```

Invariants:

1. Only `draft` may be edited or deleted.
2. Only `sent` and `partially_signed` may be voided.
3. `completed`, `declined`, `voided`, `expired` are terminal.
4. Every transition writes exactly one `EnvelopeEvent` in the same transaction.
5. `RenderedHtml` and `DocumentHash` are written exactly once, at send, and never again.
6. `SignedPdfKey` is written exactly once, on the first successful render.

## AWS Infrastructure

The whole product runs on AWS — web, API, database, storage, and mail — provisioned by Terraform in
this repository under `infra/terraform/`. Nothing is created by hand in the console: a resource that
exists only in the console is a resource nobody can rebuild, and signed contracts are the wrong
place to discover that.

> **This section was rewritten when the area was actually deployed.** The original assumed the
> application would run on Vercel with Neon for Postgres, and everything downstream of that
> assumption changed: the PDF renderer, the render queue, the sweep, and the trust model all existed
> to work around a platform the product no longer runs on. What each of those turned into, and why,
> is recorded under *What changed from the original plan* at the end.

### Topology

```
   the internet
        │  HTTPS, AWS-issued certificate
        ▼
 ┌──────────────────────────── AWS account, one VPC per environment ─────────────────────────┐
 │                                                                                           │
 │  ┌───────────────────────┐                                                                │
 │  │ ALB  (Express Mode    │   public subnets, no NAT gateway                                │
 │  │       creates + owns) │                                                                │
 │  └───────────┬───────────┘                                                                │
 │              ▼                                                                            │
 │  ┌───────────────────────┐   /api/* via next.config.mjs rewrite                            │
 │  │ web   Fargate         ├──────────────────────┐                                          │
 │  │       Next.js         │                      │  http://api.devscribed-{env}.internal    │
 │  └───────────────────────┘                      ▼  (Cloud Map, A record per task)          │
 │                                     ┌───────────────────────┐                              │
 │                                     │ api   Fargate         │   no load balancer,          │
 │                                     │       NestJS          │   no public address          │
 │                                     │       + Chromium      │                              │
 │                                     └───┬────┬────┬─────────┘                              │
 │                                         │    │    │                                        │
 │              ┌──────────────────────────┘    │    └──────────────┐                         │
 │              ▼                               ▼                   ▼                         │
 │   ┌────────────────────┐         ┌────────────────────┐  ┌────────────────────┐            │
 │   │ RDS PostgreSQL     │         │ S3  documents      │  │ SES v2             │            │
 │   │ private subnets,   │         │ SSE-KMS, versioned,│  │ configuration set  │            │
 │   │ no route out       │         │ Object Lock (prod) │  └─────────┬──────────┘            │
 │   └────────────────────┘         └────────────────────┘            │ bounce/complaint      │
 │                                                                    ▼                       │
 │   ┌────────────────────┐    hourly    ┌────────────────────┐   ┌──────────┐                │
 │   │ EventBridge        ├─────────────►│ sweep  Fargate     │   │ SNS      │                │
 │   │ Scheduler          │   RunTask    │ (the API's image)  │   └──────────┘                │
 │   └────────────────────┘              └─────────┬──────────┘                               │
 │                                                 │ POST /api/internal/envelopes/sweep       │
 │                                                 └──────────────► api                       │
 └───────────────────────────────────────────────────────────────────────────────────────────┘
```

Two properties of that picture carry most of the design.

**Exactly one thing has a public address.** The web service does; the API does not, the database
does not, the bucket does not. The API needs no public address because every route it serves is
behind either a session or a signing token, and the signing links themselves point at the *web*
app — so there is no request in this product that has to arrive at the API from outside the VPC.
The browser therefore only ever talks to one origin, which is also what keeps the session cookie
same-origin with no CORS involved.

**The mechanism that makes that possible already existed.** `apps/web/next.config.mjs` rewrites
`/api/*` to `API_ORIGIN`, and has since the first commit, because local development needed it. In
the deployed environment `API_ORIGIN` is a Cloud Map name that resolves only inside the VPC. No
application code was written for this topology.

### Compute — ECS Fargate

| | web | api |
|---|---|---|
| Kind | ECS Express Mode service | plain ECS service |
| Public | yes — AWS-issued HTTPS endpoint | **no address of any kind** |
| Load balancer | created and owned by Express Mode, shared | none |
| Discovery | — | Cloud Map private DNS, `api.devscribed-{env}.internal` |
| Size | 0.25 vCPU / 512 MiB | 0.25 vCPU / 1024 MiB |
| Health check | ALB `GET /login` | container `GET /api/health` |
| Scaling | Express Mode target-tracking, average CPU | `aws_appautoscaling_*`, same metric and target |
| Architecture | x86_64 | x86_64 |

**Why Express Mode for the web app.** It creates and maintains the load balancer, target group,
listener, TLS certificate, DNS name, security group, and scaling policy. That is worth roughly 700
lines of Terraform, and it supplies a public HTTPS endpoint on a domain this account does not have
to own — which matters, because it does not own one. The price is named rather than hidden: Express
Mode exposes no capacity provider strategy and no architecture setting, so there is **no Fargate
Spot and no Graviton**, both of which are about a fifth off the compute bill.

**Why not Express Mode for the API.** Express Mode always builds a load balancer and owns its
security group, so an Express API could not have been closed to the internet. Being unable to close
it is the whole objection.

**x86_64, not Graviton, and the reason is consistency rather than preference.** Express Mode runs
x86_64 and offers no choice; running the API on ARM would mean building and maintaining two
architectures of every image for a saving of about a dollar a month.

### Network

| Setting | Value | Why |
|---|---|---|
| VPC | `10.10.0.0/16` (dev), `10.20.0.0/16` (prod) | Distinct, so the two could be peered later without renumbering |
| Zones | Two | An ALB requires two, and so does an RDS subnet group — even Single-AZ |
| Public subnets | Tasks and the load balancer, `map_public_ip_on_launch` | See below |
| Private subnets | The database, and nothing else. **No default route at all** | The absence is the control: no security group written later can expose it |
| NAT Gateway | **None** | $32/month per environment, which is most of this product's compute bill |
| S3 | Gateway VPC endpoint | Free, keeps signed contracts off the public internet, removes egress cost on every PDF |

**There is no NAT Gateway, and the tasks are in public subnets.** "Public" describes the route
table, not the exposure. A Fargate task in a public subnet with a public address can pull from ECR
and reach SES; its security group is what decides who can reach *it*, and the web tasks accept only
from inside the VPC while the API tasks accept only from the web tasks' security group. The
alternative — private subnets plus interface endpoints for ECR, ECR-dkr, CloudWatch Logs, SSM, and
Secrets Manager — is five endpoints at roughly $8/month, which is *more* than the NAT it avoids.

### Database — RDS PostgreSQL

| Setting | Value | Why |
|---|---|---|
| Engine | PostgreSQL 17, `db.t4g.micro`, Single-AZ | Graviton at the same price list as `t3` |
| Storage | 20 GB gp3, autoscaling to 100 GB, encrypted | The event log only ever grows |
| Network | Private subnets, `publicly_accessible = false` | Two locks on the same door |
| TLS | `rds.force_ssl = 1`, `sslmode=require` in the URL | In-VPC traffic is not automatically private traffic |
| Backups | 7 days, final snapshot required in prod | |
| Deletion protection | off in dev, **on in prod** | |

`DATABASE_URL` and `DIRECT_URL` hold the same string. Neon needed them to differ because Prisma
Migrate takes advisory locks and runs DDL in transactions, neither of which survives pgbouncer;
there is no pooler in front of this instance, so the distinction is vestigial — and both are still
set, because `schema.prisma` declares both and `migrate deploy` fails at the least convenient moment
without them.

**Aurora Serverless v2 was evaluated and rejected.** It can now scale to zero ACUs and pause, which
reads like the obvious choice for an environment nobody uses at 3am. It is not: pausing requires no
open connections, and the API holds a Prisma pool for as long as its task runs. The cluster would
never pause, and the 0.5-ACU floor bills about $44/month against this instance's $15.

**Migrations run as a one-off Fargate task**, from the same image the API runs, started by
`make migrate-<env>`. They have to run inside the VPC because the database has no route out of it,
and running them from the API's own image is what stops the schema and the code that depends on it
being built from different commits. They run *after* the rollout, which is safe by the rule this
repository already holds itself to: migrations are additive, so the deploy and the migration are
independent and either order must work.

### S3 — document storage

Unchanged from the original design, and still correct.

| Setting | Value | Why |
|---|---|---|
| Bucket | `devscribed-documents-{env}-{account}` | One per environment, never shared. |
| Public access | Block all four settings | Signed contracts must never be reachable by URL guessing. |
| Encryption | SSE-KMS with a customer-managed key, bucket key enabled | Key rotation and an auditable `kms:Decrypt` trail; bucket key keeps request cost down. |
| Versioning | Enabled | A bad overwrite is recoverable. |
| Object Lock | Governance mode, 7-year default retention (prod only) | Signed documents are records. Governance lets a break-glass role delete after review; compliance would make mistakes permanent. |
| Lifecycle | Transition `signed/` to STANDARD_IA at 90 days; expire `render-tmp/` at 1 day | Signed documents are read rarely but must never be deleted — no expiration rule on `signed/`. |
| Key layout | `signed/{orgId}/{envelopeId}/{sha256}.pdf`, `render-tmp/{jobId}.html` | Content-addressed names make the write-once rule structural. |
| Access | Presigned `GET`, 15-minute TTL, `ResponseContentDisposition=attachment` | No object is ever public; each download is a fresh, short-lived, logged grant. |
| Logging | Server access logging to a separate log bucket | Independent record of every object read. |

> The lifecycle habit of expiring non-current versions after 90 days (seen in the sibling meetwave
> infrastructure) **must not** be copied here. Signed contracts are retained, not aged out.

### PDF rendering — in the API container

The renderer runs Chromium **inside the API container**. `PDF_RENDERER=local-chromium`,
`JOB_QUEUE=inline`, and there is no render function, no Chromium layer, and no queue.

The original design put the renderer in Lambda for exactly one reason, and the spec said so: a
Chromium binary does not fit a Vercel function bundle. On Fargate the API is a long-running process
in an image this repository builds, so it simply carries the browser — `apps/api/Dockerfile` installs
it, along with fonts covering Cyrillic.

This is not a convenience. `fallback-pdf.ts` — the writer the renderer degrades to when no browser
can be resolved — emits **Latin-1** text on a single page. A Russian contract through that path is
mojibake, so a signed document produced without Chromium would be worthless. Requirement 31 still
holds (a captured signature is never lost to a render failure), which is why the fallback still
exists; a CloudWatch metric filter on its warning raises an alarm whenever it is used, because
nothing else in the system would ever say so.

`PdfRenderer` remains an abstraction and `lambda-pdf-renderer.ts` remains in the tree. The port is
what makes the driver a one-line decision, and that was worth keeping even though today every
environment selects the same driver.

### SES v2 — email

`MailService` (`apps/api/src/mail/mail.service.ts`) is an abstract class used directly as the DI
token, with four implementations behind it: an in-memory sink for tests, a console logger, and
`SesMailService` for production. The infrastructure provisions what `MAIL_TRANSPORT=ses` needs and
touches nothing else.

| Setting | Value |
|---|---|
| Identity | **Email-address identities**, not a domain — this account owns no domain |
| Configuration set | One per environment, reputation metrics on, `tls_policy = REQUIRE` |
| Event destination | SNS topic receiving `send`, `delivery`, `bounce`, `complaint`, `reject`, `rendering_failure` |
| Suppression | Bounces and complaints |
| Templates | Rendered in the API; SES templates are not used, so message content stays versioned in git |

**Two lead-time items stand between this and a real contract sent to a real counterparty**, and
neither is a deploy step:

1. **A domain.** Address identities work, but mail sent from a `gmail.com` address fails DMARC at
   the recipient. The target state is a domain identity with Easy DKIM and a custom MAIL FROM
   subdomain, which is what the module should grow into once a domain exists.
2. **SES production access.** While the account is sandboxed, delivery succeeds **only to verified
   addresses** — a signer whose address is not in `verified_emails` never receives their invitation.

Delivery events reach the SNS topic. Turning them into `EnvelopeEvent` rows of type
`email_delivered` / `email_bounced` is **not deployed**: an SNS HTTPS subscription cannot reach an
API with no public address, and the in-VPC consumer that would is separate work. Recorded in
*Known Gaps*.

### Sweep — a container task, not a function

An hourly EventBridge Scheduler rule with an `ecs:RunTask` target, running the API's own image with
a one-line `node -e` command that posts to `/api/internal/envelopes/sweep` with an SSM-held bearer
token.

A Lambda would have to live in the VPC to reach the API, which means a zip artifact to build,
version, and keep in step with the API it calls. A task started from the API's own image has none of
that, and costs about three cents a month. The sweep remains an optimisation and never correctness:
expiry is lazily authoritative on read, so a missed hour is not an incident.

### IAM

Four roles, each least-privilege, and the separation is the point.

- **Execution role** — used by the ECS agent *before* the container starts: pull the image, create
  the log stream, resolve the four SSM parameters that become container secrets. It is not the
  application's identity and the application never holds it.
- **Infrastructure role** — assumed by ECS itself to build and maintain what Express Mode manages.
  Carries the AWS-managed `AmazonECSInfrastructureRoleforExpressGatewayServices`.
- **API task role** — the application's identity: object-level S3 on this environment's bucket,
  `kms:Encrypt`/`Decrypt` on this environment's key, `ses:SendEmail` on this environment's identity
  and configuration set, and the SSM channel permissions for `aws ecs execute-command`.
- **Web task role** — deliberately almost empty. The web container proxies to the API and calls no
  AWS API; giving it the API's permissions "just in case" would make the browser-facing container
  the one holding the keys to the contracts.

Every ARN in the API task role's policy names *this environment's* resources explicitly. The dev
role has no statement mentioning a prod bucket or key at all, which is what makes the isolation real
rather than conventional.

No role has `s3:DeleteObject` on `signed/`. Deletion requires a separate break-glass role that the
application does not use.

### Terraform and environments

**Two environments: `dev` and `prod`**, complete and independent copies — their own VPC, database,
bucket, KMS key, SES identity, registries, and roles. No resource is shared, and in particular dev
can never read or write a prod document.

```
infra/
  bootstrap.sh               creates the state bucket; the only hand-run step, and it is idempotent
  deploy.sh                  build → push → resolve digest → apply → migrate
  migrate.sh                 prisma migrate deploy, as a one-off task inside the VPC
  terraform/
    main.tf                  composes the modules; the only root module
    variables.tf             every input, typed and described
    outputs.tf               what the Makefile and a human read after an apply
    versions.tf              terraform >= 1.10, aws ~> 6.38
    modules/
      network/               VPC, subnets, routes, security groups, S3 gateway endpoint
      database/              RDS instance, subnet group, parameter group, connection parameters
      registry/              ECR repositories and their lifecycle policies
      app/                   cluster, Cloud Map, IAM, log groups, secrets, both services, migrations
      storage/               S3 bucket, KMS CMK, lifecycle, Object Lock, access-log bucket
      mail/                  SES identities, configuration set, event destination, SNS topic
      sweep/                 EventBridge schedule + the sweep task definition
      observability/         alarms, the PDF-fallback metric filter, the alarm topic
      cicd/                  GitHub OIDC provider and the deploy role
    environments/
      dev.tfbackend  dev.tfvars  prod.tfbackend  prod.tfvars
Makefile                     at the repository root — every entry point
```

**No workspaces.** One root module composed per environment through `-backend-config` and
`-var-file`. A mistyped `terraform workspace select` is a one-keystroke path from a dev change to a
prod bucket; separate state files with separate backend configs make that mistake impossible to make
silently.

#### State

| | dev | prod |
|---|---|---|
| Backend | S3 | S3 |
| Bucket | `devscribed-tfstate-{account}` | same |
| Key | `app/dev/terraform.tfstate` | `app/prod/terraform.tfstate` |
| Locking | S3 native (`use_lockfile = true`) | same |
| Versioning | enabled, 90 days of old versions | same |

`infra/bootstrap.sh` creates that bucket — versioned, encrypted, TLS-only, public access blocked —
and is the only thing in this design run outside Terraform. It is a script rather than a Terraform
root module because a root module that creates its own backend has to keep its first state file
somewhere else, and that file becomes the thing nobody can rebuild.

#### What differs between the environments

Everything else is identical, and deliberately so: an environment that behaves differently from prod
stops being a test of prod. **Every value that should be the same in both lives in `variables.tf`,
not in a tfvars file** — a value that appears in both tfvars files is a value someone can edit in one
of them by accident. This table is the contract; a difference not listed here is a bug.

| Input | dev | prod | Why |
|---|---|---|---|
| `env` | `dev` | `prod` | Suffixes every resource name |
| `vpc_cidr` | `10.10.0.0/16` | `10.20.0.0/16` | Distinct address space |
| `object_lock_years` | `0` (off) | `7` | Locked dev objects cannot be cleaned up, which makes dev unusable within weeks |
| `bucket_force_destroy` | `true` | `false` | A prod bucket must never be destroyable by a `terraform destroy` typo |
| `db_deletion_protection` | `false` | `true` | Same reasoning, for the database |
| `db_skip_final_snapshot` | `true` | `false` | Same |
| `log_retention_days` | `14` | `365` | Prod logs are part of the evidentiary picture |
| `create_github_oidc_provider` | `true` | `false` | Exactly one per account; dev is applied first |
| `github_allowed_refs` | `environment:dev` | `environment:prod` | Prod's is where required reviewers attach |

Task sizes, scaling targets, the database class, the token lifetimes, and the expiry default appear
in **neither** file. They are defaults in `variables.tf`, which is what makes dev a rehearsal for
prod rather than a smaller thing that resembles it. Scaling either environment is editing those
numbers, once.

#### Deploy

```bash
make bootstrap        # once per AWS account: the Terraform state bucket
make deploy-dev       # build, push, roll out, and migrate — both services
make deploy-dev-api   # the API alone; web keeps the digest it is already running
make deploy-dev-web   # and the reverse
make plan-dev         # what an apply would change
make infra-dev        # apply infrastructure without rebuilding images
make migrate-dev      # prisma migrate deploy, inside the VPC
make url-dev          # the address people open
make logs-dev-api     # tail
make stop-dev         # scale both services to zero
make start-dev        # bring them back
```

Every target exists for prod. `deploy-prod` and `infra-prod` are deliberately the same number of
keystrokes as their dev counterparts, so nobody builds a habit that ends at the wrong environment;
`infra-prod` is not auto-approved.

Images are deployed **by digest, never by tag**. A tag is a pointer somebody else can move, and the
image a plan promises has to be the image that runs. Deploying one service reads the other's current
digest out of the state, so a web deploy cannot silently roll the API forward or back.

`wait_for_steady_state` is set on both services: an apply that returns before the service is healthy
is an apply that reports success for a broken deploy.

#### Pausing an environment

`make stop-dev` scales both services to zero and disarms the alarms and the hourly sweep with them —
an environment stopped on purpose must not page anyone. The load balancer and the database keep
running and keep billing; this stops the compute half, which for dev is most of it. Nothing is
destroyed.

#### CI/CD

`.github/workflows/deploy.yml`, **off by default behind three separate switches**: the repository
variable `DEPLOY_ENABLED` must be `true`, the role ARN variables must be set, and the automatic
`push` trigger is commented out, so even a fully configured repository only deploys when somebody
presses the button.

The workflow runs `infra/deploy.sh` — the same script a developer runs. One code path, so what CI
does is what somebody has already done by hand, and an image deployed from CI is recorded in the
same state rather than drifting away from it.

Authentication is GitHub OIDC. **No AWS access key exists** in the repository, in its secrets, or in
the account. The role's trust policy matches `repo:{owner}/{repo}:environment:{env}`, and because
that claim only takes the `environment:` form when the job declares an environment, GitHub's
required-reviewers setting on `prod` becomes part of the credential rather than part of the UI.

#### Secrets

**No secret is ever written to a `.tfvars` file**, and none is ever typed by a person. The session
secret and the internal task secret are generated by Terraform and stored as SSM `SecureString`
parameters; the container resolves them through the execution role. Nobody ever sees either value,
which is the point — a secret a person knows is a secret that ends up in a chat message.

SSM Parameter Store rather than Secrets Manager: `SecureString` parameters are free, Secrets Manager
is $0.40 per secret per month, ECS reads both through the same `secrets` block, and nothing here
rotates on a schedule. Rotating one is `terraform taint` plus a redeploy — which for the session
secret invalidates every session, exactly as intended.

> **An amendment to the original rule, stated plainly.** The original spec said Terraform never
> reads a secret value, so no secret can land in the state file. That no longer holds for one value:
> the database password is generated by `random_password` and is therefore in state. The alternative
> — an RDS-managed master password in Secrets Manager — keeps it out of state but stores it as JSON
> the application would have to assemble a URL from at startup, which means a container entrypoint
> script permanently between the image and `node dist/main.js`. State lives in a versioned,
> encrypted, TLS-only, block-public-access bucket; the entrypoint script would be a permanent moving
> part. If this product ever holds real customer contracts, revisit — that is the point at which the
> trade flips.
>
> The correction this rule was written against still stands: the sibling `meetwave-serverless-lambda`
> repository commits API keys in plaintext `.tfvars`, and nothing here does.

#### Account model

Both environments live in **one AWS account**, isolated by resource naming and by per-environment
IAM roles whose policies name the environment's ARNs explicitly.

This is the pragmatic starting point for a team of this size, and it is a deliberate trade: a
separate prod account would give a hard blast-radius boundary that IAM policy alone cannot. If the
volume of signed contracts or a client's security review makes that boundary necessary, the module
layout is already account-agnostic — moving prod is a new backend config and a new `provider` block,
not a rewrite.

### Cost characteristics

Measured against the AWS Pricing API for `us-west-1`, per environment, per month:

| Line | $ |
|---|---|
| ALB (created by Express Mode) | 18.40 |
| Fargate — web, 0.25 vCPU / 0.5 GiB | 10.37 |
| Fargate — api, 0.25 vCPU / 1 GiB | 12.23 |
| RDS `db.t4g.micro` + 20 GB gp3 | 18.09 |
| S3, ECR, SSM, CloudWatch, SES | ~3 |
| **Total** | **≈ 62** |

The shape of that bill matters more than the number: **it is almost entirely fixed**. The load
balancer and the database bill identically whether the product serves one envelope a month or ten
thousand, and per-envelope cost is rounded to zero at this volume. `make stop-dev` removes the
Fargate lines and brings an idle dev environment to roughly $40.

Two known premiums, both consequences of Express Mode and both quantified here rather than
discovered later: no Fargate Spot (~$17/month on dev, where Spot interruption is acceptable) and no
Graviton (~$4.50/month). A hand-rolled ECS service would recover both at the cost of roughly 700
lines of Terraform to own.

### Local development and tests

Unchanged, and deliberately so. Nothing in the Playwright or Jest suites touches AWS: `FileStorage`
uses a local-disk driver, `MailService` uses the in-memory sink, `PdfRenderer` uses a locally
resolved Chromium, and `JobQueue` runs inline. The AWS drivers are selected only when
`NODE_ENV === 'production'` or when the corresponding environment variable names them.

The deployed `dev` environment is therefore **not** what the test suite runs against. It exists to
exercise the real S3, SES, RDS, and container path before prod does, and to catch the failures that
only appear against real services: IAM policy gaps, SES identity misconfiguration, image pull time,
presigned-URL expiry. Local development and CI stay hermetic and cost nothing, which is what keeps
the suite fast enough to run on every change.

### What changed from the original plan

| Original | Now | Why |
|---|---|---|
| Vercel (web + API) | ECS Fargate, both services | The product is hosted entirely on AWS |
| Neon Postgres | RDS PostgreSQL | Same wire protocol, same Prisma client, same migrations |
| `pdf-render` Lambda + Chromium layer | Chromium in the API container | The Lambda existed only because a browser does not fit a Vercel bundle |
| SQS FIFO render queue + DLQ | `JOB_QUEUE=inline` | A long-running process needs no queue to survive the response |
| `envelope-sweep` Lambda | EventBridge Scheduler → ECS task, API image | No zip artifact to keep in step with the API it calls |
| API role assumed from Vercel via OIDC | ECS task role | There is no Vercel |
| SES **domain** identity, DKIM, custom MAIL FROM | SES **address** identity | This account owns no domain. The domain remains the target state |
| SNS → `ses-events` Lambda → `EnvelopeEvent` | SNS topic only | An SNS subscription cannot reach an API with no public address. Recorded in *Known Gaps* |
| Secrets Manager containers, values set out of band | SSM `SecureString`, values generated by Terraform | Free, and no human ever sees a value |
| `terraform >= 1.9, aws ~> 5.0` | `>= 1.10, ~> 6.38` | S3 native locking; `aws_ecs_express_gateway_service` |

## Screens

### Documents list — `/org/{orgId}/documents`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Documents                                        [ New document ]       │
│                                                                          │
│  [ Search              ]  Status: [ All ▾ ]  Template: [ All ▾ ]         │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ Title                        Signers            Status      Sent   │ │
│  │ ─────────────────────────────────────────────────────────────────  │ │
│  │ Contractor agreement — A.K.  Company ✓          ◐ Partially  20 Aug│ │
│  │                              A. Kaminski ●        signed           │ │
│  │ NDA — Northwind              Company ✓          ✓ Completed  12 Aug│ │
│  │                              J. Doe ✓                              │ │
│  │ Client agreement — Acme      Company ●          ● Sent       24 Aug│ │
│  │                              M. Smith ○                            │ │
│  │ Contractor agreement — draft —                  ○ Draft      —     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### Envelope detail — `/org/{orgId}/documents/{envelopeId}`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Contractor agreement — A. Kaminski          ◐ Partially signed          │
│  From: Contractor agreement BY v3                    [ Void ]  [ ⤓ PDF ] │
│                                                                          │
│  [ DOCUMENT ]   Signers   Activity                                       │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │   AGREEMENT No. DS-2026-014                                        │ │
│  │   Minsk                                        24 August 2026      │ │
│  │                                                                    │ │
│  │   Devscribed LLC, represented by Ivan Demchenko, and               │ │
│  │   Alex Kaminski, УНП 191234567, residing at …                      │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  Document hash  4f3a…9c21          Expires  23 September 2026            │
└──────────────────────────────────────────────────────────────────────────┘
```

### Envelope detail — Signers tab

```
┌─ Signers ────────────────────────────────────────────────────────────────┐
│                                                                          │
│  1.  Company            Ivan Demchenko                        ✓ Signed   │
│      ivan@devscribed.io                       20 Aug 2026, 14:02 UTC     │
│                                                                          │
│  2.  Contractor         Alex Kaminski                       ● Notified   │
│      alex@example.com                                    [ Resend link ] │
│      ⚠ Invitation bounced — check the address                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Envelope detail — Activity tab

```
┌─ Activity ───────────────────────────────────────────────────────────────┐
│  ✓ Chain verified                                                        │
│                                                                          │
│  20 Aug 2026, 14:05 UTC   Viewed        Alex Kaminski   91.149.x.x        │
│  20 Aug 2026, 14:02 UTC   Signed        Ivan Demchenko  178.124.x.x       │
│  20 Aug 2026, 13:58 UTC   Delivered     alex@example.com                  │
│  20 Aug 2026, 13:57 UTC   Sent          Ivan Demchenko                    │
│  20 Aug 2026, 13:41 UTC   Created       Ivan Demchenko                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### New document — fill form (draft)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  New document                                                            │
│                                                                          │
│  Template *   [ Contractor agreement BY (v3)          ▾ ]                │
│  Subject      [ Alex Kaminski                         ▾ ]  ← autofill    │
│  Title        [ Contractor agreement — A. Kaminski      ]                │
│  Expires in   [ 30 ] days                                                │
│                                                                          │
│  ┌─ Fields you fill ──────────────────────────────────────────────────┐ │
│  │  Full name *      [ Alex Kaminski            ]  ⟲ from profile     │ │
│  │  УНП *            [ 191234567                ]                     │ │
│  │  Address *        [ Minsk, …                 ]  ⟲ from profile     │ │
│  │  Contract date *  [ 2026-08-24               ]  ⟲ today            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ Fields the contractor fills ──────────────────────────────────────┐ │
│  │  Bank details          (filled during signing)                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ Signers ──────────────────────────────────────────────────────────┐ │
│  │  1. Company      [ Ivan Demchenko ]  [ ivan@devscribed.io       ]  │ │
│  │  2. Contractor   [ Alex Kaminski  ]  [ alex@example.com         ]  │ │
│  │  ⇅ Swap signing order                                              │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│                      [ Save draft ]   [ Preview ]   [ Send for signature ]│
└──────────────────────────────────────────────────────────────────────────┘
```

### Signing page — `/sign/{token}`

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Devscribed                                                              │
│                                                                          │
│  Contractor agreement — A. Kaminski                                      │
│  Devscribed LLC has sent you this document to sign.                      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │   AGREEMENT No. DS-2026-014                                        │ │
│  │   …                                            (scrollable)        │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ Your details ─────────────────────────────────────────────────────┐ │
│  │  Bank details *                                                    │ │
│  │  [                                                              ]  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ Your signature ───────────────────────────────────────────────────┐ │
│  │  [ Draw ]  Type                                                    │ │
│  │  ┌──────────────────────────────────────────────┐   [ Clear ]      │ │
│  │  │                                              │                  │ │
│  │  └──────────────────────────────────────────────┘                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ☐ I agree to sign this document electronically and that my electronic   │
│    signature is legally binding.                                         │
│                                                                          │
│           [ Decline to sign ]              [ Sign document ]             │
│                                                                          │
│  Document hash 4f3a…9c21 · Link expires 23 Sep 2026                      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Signing page — terminal states

```
┌─────────── Not valid ────────────┐  ┌─────────── Expired ──────────────┐
│                                  │  │                                  │
│  This signing link is not valid. │  │  This link expired on            │
│                                  │  │  23 September 2026.              │
│  If you believe this is a        │  │                                  │
│  mistake, contact the sender.    │  │  [ Request a new link ]          │
└──────────────────────────────────┘  └──────────────────────────────────┘

┌─────────── Withdrawn ────────────┐  ┌─────────── Already signed ───────┐
│                                  │  │                                  │
│  This document was withdrawn by  │  │  You signed this document on     │
│  the sender on 21 Aug 2026.      │  │  20 Aug 2026, 14:02 UTC.         │
│                                  │  │                                  │
│  Reason: terms renegotiated      │  │  [ ⤓ Download signed PDF ]       │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

### Void modal

```
┌──────────────── Void document ─────────────────────┐
│                                                     │
│  Voiding stops the signing process. Signing links   │
│  stop working immediately and both parties are      │
│  notified. This cannot be undone.                   │
│                                                     │
│  Reason *                                           │
│  [ Terms renegotiated                        ]      │
│                                                     │
│            [ Cancel ]  [ Void document ]            │
└─────────────────────────────────────────────────────┘
```

## Flows

### Flow: Admin creates, fills, and sends an envelope

1. Admin opens `/org/{orgId}/documents` and clicks "New document".
2. Admin picks a published template and, optionally, a subject member.
3. System sends `POST .../envelopes`, which pins the current template version, materializes two
   signers, and applies autofill (spec 03).
4. Admin fills the sender-owned fields, names both signers, and confirms the signing order.
5. Each save sends `PUT .../envelopes/{id}`.
6. Admin clicks "Preview" and reviews the document with real values in a sandboxed frame.
7. Admin clicks "Send for signature" and confirms.
8. System sends `POST .../envelopes/{id}/send`.
9. On success: toast "Sent for signature", status becomes Sent, the first signer shows Notified,
   and the fill form becomes read-only.

### Flow: First signer signs

1. Signer receives the email and opens the magic link.
2. `GET /api/sign/{token}` returns the document and their fields; a `viewed` event is recorded.
3. Signer reads the document, fills their fields, ticks consent, draws a signature.
4. Signer clicks "Sign document" → `POST /api/sign/{token}/sign`.
5. System verifies the document hash, records the signature, marks the token used, moves the
   envelope to `partially_signed`, issues a token for the second signer, and emails them.
6. The page shows a confirmation with the signed timestamp.

### Flow: Second signer signs and the envelope completes

1. Second signer opens their link and signs the same way.
2. System records the signature, moves the envelope to `completed`, sets `PdfStatus = pending`,
   and enqueues the render job.
3. The render Lambda produces the PDF with both signatures and the Certificate of Completion,
   writes it to S3 under a content-addressed key, and reports back.
4. System sets `SignedPdfKey`, `SignedPdfHash`, `PdfStatus = ready`, writes a `completed` event,
   and emails both parties a download link.

### Flow: Admin voids an in-flight envelope

1. Admin opens the envelope and clicks "Void".
2. Admin enters a reason and confirms → `POST .../envelopes/{id}/void`.
3. System invalidates every outstanding token, moves the envelope to `voided`, notifies every
   notified signer, and records the reason.
4. Any captured signature remains visible on the Signers tab and in the audit trail.

### Alt Flow: Required sender field missing (branches from send, step 8)

8a. API returns `400` with `{ "error": "missing_required_fields", "keys": ["contractor_tax_id"] }`.
8b. The form focuses the first missing field and shows an inline error. The envelope stays `draft`.

### Alt Flow: Mail transport fails (branches from send, step 8)

8a. API returns `502` with `{ "error": "mail_delivery_failed" }`.
8b. The envelope is still `draft` — the transaction rolled back. Toast: "We could not send the
    invitation. Please try again." Nothing was sent and no token exists.

### Alt Flow: Invitation bounces (after send)

1. SES reports a bounce; the `ses-events` Lambda posts it to the API.
2. An `email_bounced` event is recorded and the Signers tab shows "Invitation bounced — check the
   address" with "Resend link".
3. The envelope status is unchanged — a bounce is a delivery problem, not a signing outcome.

### Alt Flow: Signer declines (branches from first-signer flow, step 3)

3a. Signer clicks "Decline to sign", optionally enters a reason, confirms.
3b. `POST /api/sign/{token}/decline` moves the envelope to `declined`, invalidates all tokens, and
    emails the sender.
3c. The page shows a decline confirmation.

### Alt Flow: Link expired (branches from first-signer flow, step 1)

1a. `GET /api/sign/{token}` returns `410` with `{ "error": "expired" }`.
1b. The expiry page offers "Request a new link", which notifies the sender and issues nothing.

### Alt Flow: PDF render fails (branches from completion, step 3)

3a. The render job exhausts its retries and lands in the DLQ.
3b. The envelope stays `completed` with `PdfStatus = failed`; a `pdf_failed` event is recorded.
3c. The envelope detail shows "The signed PDF could not be generated" with a "Retry" action, and a
    CloudWatch alarm fires on DLQ depth.

### Alt Flow: Network/server error (any mutation)

- Error toast "Something went wrong. Please try again." Form values are retained and buttons
  re-enable.

## API Contracts

### GET /api/organizations/{orgId}/envelopes

**Authentication:** required. `ViewEnvelopes`.

Query: `status`, `templateId`, `q` (title substring), `page`, `pageSize` (default 25, max 100).

**Response `200`:**
```json
{
  "envelopes": [
    {
      "id": "uuid",
      "title": "Contractor agreement — A. Kaminski",
      "templateName": "Contractor agreement BY",
      "templateVersionNumber": 3,
      "status": "partially_signed",
      "pdfStatus": "not_required",
      "sentAt": "2026-08-20T13:57:00Z",
      "expiresAt": "2026-09-19T13:57:00Z",
      "signers": [
        { "id": "uuid", "roleKey": "company", "name": "Ivan Demchenko", "order": 1, "status": "signed" },
        { "id": "uuid", "roleKey": "contractor", "name": "Alex Kaminski", "order": 2, "status": "notified" }
      ]
    }
  ],
  "total": 42,
  "canManage": true
}
```

### POST /api/organizations/{orgId}/envelopes

**Authentication:** required. `ManageEnvelopes`.

**Request:**
```json
{ "templateId": "uuid", "subjectMembershipId": "uuid", "title": null, "expiresInDays": 30 }
```

**Success `201`:**
```json
{
  "id": "uuid",
  "templateVersionId": "uuid",
  "templateVersionNumber": 3,
  "title": "Contractor agreement BY",
  "status": "draft",
  "fieldValues": { "contractor_full_name": "Alex Kaminski", "contract_date": "2026-08-24" },
  "autofilled": ["contractor_full_name", "contract_date"],
  "signers": [
    { "id": "uuid", "roleKey": "company", "label": "Company", "order": 1, "name": "", "email": "" },
    { "id": "uuid", "roleKey": "contractor", "label": "Contractor", "order": 2, "name": "", "email": "" }
  ]
}
```

**Errors:**
- `400`: `{ "error": "template_not_published" }`
- `400`: `{ "error": "template_archived" }`
- `400` (validation): `{ "errors": { "expiresInDays": "Expiry must be between 1 and 365 days" } }`
- `404`: template not found in this organization.

### GET /api/organizations/{orgId}/envelopes/{id}

**Response `200`:**
```json
{
  "id": "uuid",
  "title": "Contractor agreement — A. Kaminski",
  "status": "partially_signed",
  "template": { "id": "uuid", "name": "Contractor agreement BY", "versionNumber": 3 },
  "fields": [
    {
      "key": "contractor_tax_id",
      "label": "УНП",
      "type": "text",
      "required": true,
      "filledBy": "sender",
      "value": "191234567",
      "autofilled": false
    }
  ],
  "signers": [
    {
      "id": "uuid",
      "roleKey": "company",
      "label": "Company",
      "name": "Ivan Demchenko",
      "email": "ivan@devscribed.io",
      "order": 1,
      "status": "signed",
      "signedAt": "2026-08-20T14:02:00Z",
      "lastEmailStatus": "delivered"
    }
  ],
  "renderedHtml": "<html>…</html>",
  "documentHash": "4f3a…9c21",
  "pdfStatus": "not_required",
  "expiresAt": "2026-09-19T13:57:00Z",
  "sentAt": "2026-08-20T13:57:00Z",
  "canEdit": false,
  "canSend": false,
  "canVoid": true,
  "canDownload": false
}
```

`renderedHtml` is present only once the envelope has been sent; before that the client renders a
live preview from the template and current values.

### PUT /api/organizations/{orgId}/envelopes/{id}

**Authentication:** required. `ManageEnvelopes`. Only status `draft`.

**Request:**
```json
{
  "title": "Contractor agreement — A. Kaminski",
  "expiresInDays": 30,
  "fieldValues": { "contractor_tax_id": "191234567" },
  "signers": [
    { "id": "uuid", "name": "Ivan Demchenko", "email": "ivan@devscribed.io", "order": 1 },
    { "id": "uuid", "name": "Alex Kaminski", "email": "alex@example.com", "order": 2 }
  ]
}
```

**Success `200`:** the same shape as `GET`.

**Errors:**
- `409`: `{ "error": "not_draft", "message": "This document has already been sent and cannot be edited" }`
- `400` (validation): `{ "errors": { "signers[1].email": "Enter a valid email address" } }`
- `400` (unknown field key): `{ "error": "unknown_field", "keys": ["nope"] }`
- `400` (value too long): `{ "errors": { "fieldValues.contractor_address": "Address must be at most 200 characters" } }`

### POST /api/organizations/{orgId}/envelopes/{id}/send

**Success `200`:**
```json
{
  "status": "sent",
  "sentAt": "2026-08-24T10:00:00Z",
  "expiresAt": "2026-09-23T10:00:00Z",
  "documentHash": "4f3a…9c21",
  "notifiedSignerId": "uuid"
}
```

**Errors:**
- `409`: `{ "error": "not_draft" }`
- `400`: `{ "error": "missing_required_fields", "keys": ["contractor_tax_id"] }`
- `400`: `{ "error": "incomplete_signers", "message": "Both signers need a name and an email address" }`
- `502`: `{ "error": "mail_delivery_failed", "message": "We could not send the invitation. Please try again." }`

### POST /api/organizations/{orgId}/envelopes/{id}/void

**Request:** `{ "reason": "Terms renegotiated" }`

**Success `200`:** `{ "status": "voided", "voidedAt": "…", "invalidatedTokens": 1 }`

**Errors:**
- `409`: `{ "error": "invalid_status", "message": "Only sent or partially signed documents can be voided" }`
- `400`: `{ "errors": { "reason": "A reason is required" } }`

### POST /api/organizations/{orgId}/envelopes/{id}/signers/{signerId}/resend

**Success `200`:** `{ "sentAt": "…" }`

**Errors:**
- `409`: `{ "error": "not_current_signer", "message": "This signer's turn has not started yet" }`
- `429`: `{ "error": "rate_limited", "retryAfterSeconds": 41 }`

### GET /api/organizations/{orgId}/envelopes/{id}/document

**Success `200`:** `{ "url": "https://…", "expiresInSeconds": 900, "sha256": "…" }`

**Errors:**
- `409`: `{ "error": "pdf_not_ready", "pdfStatus": "pending" }`
- `409`: `{ "error": "pdf_failed" }`
- `404`: envelope not completed.

Every successful call records a `downloaded` event.

### GET /api/organizations/{orgId}/envelopes/{id}/audit

**Success `200`:**
```json
{
  "events": [
    {
      "id": "uuid",
      "type": "signed",
      "occurredAt": "2026-08-20T14:02:00Z",
      "actor": { "kind": "signer", "name": "Ivan Demchenko", "email": "ivan@devscribed.io" },
      "ipAddress": "178.124.0.0",
      "userAgent": "Mozilla/5.0 …",
      "documentHash": "4f3a…9c21"
    }
  ],
  "chain": { "valid": true, "firstInvalidEventId": null }
}
```

### POST /api/internal/envelopes/sweep

**Authentication:** `Authorization: Bearer {INTERNAL_TASK_SECRET}`. Never exposed to the browser.

**Success `200`:** `{ "expired": 3, "remindersSent": 5 }`

### Public signing surface

Session-less. No cookies are set. Rate-limited to 10 requests per minute per IP across all
`/api/sign/*` routes; the limit is per IP and per token prefix so one abusive client cannot lock
out an unrelated signer.

#### GET /api/sign/{token}

**Success `200`:**
```json
{
  "state": "ready_to_sign",
  "envelope": {
    "title": "Contractor agreement — A. Kaminski",
    "senderOrganizationName": "Devscribed LLC",
    "renderedHtml": "<html>…</html>",
    "documentHash": "4f3a…9c21",
    "expiresAt": "2026-09-19T13:57:00Z"
  },
  "signer": { "name": "Alex Kaminski", "roleLabel": "Contractor" },
  "fields": [
    { "key": "contractor_bank", "label": "Bank details", "type": "multiline", "required": true, "maxLength": 2000 }
  ],
  "consentText": "I agree to sign this document electronically and that my electronic signature is legally binding."
}
```

`state` is one of `ready_to_sign`, `already_signed`, `declined`, `voided`, `expired`,
`not_your_turn`, `completed`.

**Errors:**
- `404`: `{ "error": "invalid_link" }` — unknown or malformed token. The response is byte-identical
  whether or not an envelope exists, and carries no timing signal.
- `410`: `{ "error": "expired", "expiredAt": "…" }`
- `409`: `{ "error": "voided", "voidedAt": "…", "reason": "…" }`
- `403`: `{ "error": "not_your_turn" }`
- `429`: `{ "error": "rate_limited", "retryAfterSeconds": 30 }`

#### POST /api/sign/{token}/view

**Success `204`.** Idempotent — only the first call per signer writes a `viewed` event.

#### POST /api/sign/{token}/sign

**Request:**
```json
{
  "fieldValues": { "contractor_bank": "IBAN BY…" },
  "signature": { "type": "drawn", "value": "data:image/png;base64,iVBOR…" },
  "consentAccepted": true
}
```

For `type: "typed"`, `value` is the typed name.

**Success `200`:**
```json
{
  "state": "already_signed",
  "signedAt": "2026-08-20T14:02:00Z",
  "envelopeStatus": "partially_signed",
  "downloadAvailable": false
}
```

A duplicate submission with the same token returns this same `200` payload — signing is
idempotent, not an error to repeat.

**Errors:**
- `400`: `{ "errors": { "contractor_bank": "Bank details is required" } }`
- `400`: `{ "error": "consent_required", "message": "You must agree to sign electronically" }`
- `400`: `{ "error": "empty_signature", "message": "Please draw your signature" }`
- `400`: `{ "error": "invalid_typed_signature", "message": "Enter your full name to sign" }`
- `400`: `{ "error": "signature_too_large", "message": "Signature image is too large" }` (cap 512 KB)
- `403`: `{ "error": "not_your_turn" }`
- `409`: `{ "error": "voided" }` / `{ "error": "declined" }`
- `410`: `{ "error": "expired" }`
- `500`: `{ "error": "document_integrity_failure" }` — the frozen hash no longer matches.

#### POST /api/sign/{token}/decline

**Request:** `{ "reason": "Terms are not acceptable" }` (optional, max 500 characters)

**Success `200`:** `{ "state": "declined", "declinedAt": "…" }`

#### GET /api/sign/{token}/document

**Success `200`:** `{ "url": "https://…", "expiresInSeconds": 900 }`

Available only when the envelope is `completed`, `PdfStatus = ready`, and within 30 days of
completion. Records a `downloaded` event with the signer as actor.

## Validation Rules

1. **Title**: required, 1–200 characters. Error: "Document title is required".
2. **ExpiresInDays**: integer 1–365. Error: "Expiry must be between 1 and 365 days".
3. **Signer name**: required before sending, 1–100 characters. Error: "Signer name is required".
4. **Signer email**: required before sending, valid and ≤254 characters, normalized to lowercase
   (reusing the email rules already in `@devscribed/validation`). Error: "Enter a valid email
   address".
5. **Field values**: keys must exist in the pinned version; each value respects its field's
   `MaxLength` and type. Errors: "{Label} is required", "{Label} must be at most {n} characters",
   "Enter a valid date", "Enter a number", "Enter a valid email address".
6. **Required sender fields**: all filled before sending. Error: "Fill in every required field
   before sending".
7. **Consent**: must be `true`. Error: "You must agree to sign electronically".
8. **Drawn signature**: a PNG data URI, ≤512 KB, with at least one non-transparent pixel. Errors:
   "Please draw your signature", "Signature image is too large".
9. **Typed signature**: 1–100 characters after trimming. Error: "Enter your full name to sign".
10. **Void reason**: required, 1–500 characters. Error: "A reason is required".
11. **Decline reason**: optional, max 500 characters. Error: "Reason must be at most 500 characters".

Client-side validation mirrors these on blur and submit; the submit CTA is never disabled for
validation. The consent checkbox is a deliberate confirmation, not a validation — the Sign button
stays enabled and clicking without consent shows the consent error, consistent with the repository
rule established for the "I understand" gate in user-management spec 03.

Server-side validation re-runs everything regardless of UI state, and additionally enforces field
ownership: values submitted for a field this signer does not own are silently ignored, never
merged.

## Error Messages

| Context | Message |
|---|---|
| Title empty | "Document title is required" |
| Expiry out of range | "Expiry must be between 1 and 365 days" |
| Signer name empty | "Signer name is required" |
| Signer email invalid | "Enter a valid email address" |
| Required field empty (fill form) | "{Label} is required" |
| Value too long | "{Label} must be at most {n} characters" |
| Send with missing fields | "Fill in every required field before sending" |
| Send with incomplete signers | "Both signers need a name and an email address" |
| Edit after send | "This document has already been sent and cannot be edited" |
| Send twice | "This document has already been sent" |
| Mail failure | "We could not send the invitation. Please try again." |
| Void without reason | "A reason is required" |
| Void wrong status | "Only sent or partially signed documents can be voided" |
| Resend too soon | "Please wait a moment before resending" |
| Resend wrong signer | "This signer's turn has not started yet" |
| PDF not ready | "The signed PDF is still being prepared" |
| PDF failed | "The signed PDF could not be generated" |
| Template not published | "Select a published template" |
| Template archived | "This template is archived and cannot be used for new documents" |
| Signing — invalid link | "This signing link is not valid." |
| Signing — expired | "This link expired on {date}." |
| Signing — voided | "This document was withdrawn by the sender on {date}." |
| Signing — declined | "This document was declined and is no longer available for signature." |
| Signing — not your turn | "It is not your turn to sign yet. We will email you when the document is ready." |
| Signing — consent missing | "You must agree to sign electronically" |
| Signing — empty drawn signature | "Please draw your signature" |
| Signing — typed signature empty | "Enter your full name to sign" |
| Signing — signature too large | "Signature image is too large" |
| Signing — integrity failure | "We could not verify this document. Please contact the sender." |
| Signing — rate limited | "Too many requests. Please try again in a moment." |
| Bounce notice | "We could not deliver the invitation to {email}" |
| No permission | "You do not have permission to manage documents" |
| Network/server error | "Something went wrong. Please try again." |
| Toast — draft saved | "Draft saved" |
| Toast — sent | "Sent for signature" |
| Toast — resent | "Signing link resent" |
| Toast — voided | "Document voided" |
| Toast — signed (signer) | "Thank you. Your signature has been recorded." |
| Toast — declined (signer) | "You declined to sign this document." |
| Empty state — no documents | "No documents yet. Create one from a template to get started." |

## UI Description

### Documents list (`documents-page`)

- `SearchField` (`envelope-search-input`), status `Select` (`envelope-status-filter`), template
  `Select` (`envelope-template-filter`).
- DS `Table` (`envelopes-table`); rows `envelope-row-{id}` show title, both signers with per-signer
  status dots (`envelope-signer-status-{id}-{order}`), envelope status `Badge`
  (`envelope-status-{id}`), and the sent date.
- Status badge tones: Draft neutral, Sent info, Partially signed info, Completed success,
  Declined danger, Voided neutral, Expired warning.
- "New document" `Button` (`envelope-new-btn`), gated on `canManage`.
- Empty state `envelope-empty`.

### Envelope detail (`envelope-detail`)

- `PageHeader` with title, status badge (`envelope-status`), and source template line.
- Header actions: `envelope-void-btn`, `envelope-download-btn` (visible only when `canDownload`),
  `envelope-send-btn` (draft only).
- `Tabs` (`envelope-tabs`): Document (`envelope-tab-document`), Signers
  (`envelope-tab-signers`), Activity (`envelope-tab-activity`).
- Document tab: sandboxed iframe (`envelope-document-frame`) for a sent envelope; the fill form
  (`envelope-fill-form`) for a draft.
- Signers tab: rows `envelope-signer-row-{order}` with name, email, status badge, timestamps, a
  bounce warning (`envelope-signer-bounce-{order}`) and `envelope-resend-btn-{order}`.
- Activity tab: chain verification badge (`envelope-chain-status`) and the event list
  (`envelope-audit-list`, rows `envelope-audit-row-{id}`).
- A `pdf_failed` banner (`envelope-pdf-failed-banner`) with `envelope-pdf-retry-btn`.

### Fill form (`envelope-fill-form`)

- Template `Select` (`envelope-template-select`) and subject `Select`
  (`envelope-subject-select`), both locked once the envelope exists.
- Two grouped sections: fields the sender fills, and a read-only list of the fields the signer will
  fill (`envelope-signer-fields-preview`).
- Autofilled inputs carry a "from profile" affordance (`envelope-field-autofill-{key}`) and remain
  editable.
- Signer rows `envelope-signer-input-{order}` with name and email inputs and a swap-order control
  (`envelope-swap-order-btn`).
- A same-email warning banner (`envelope-same-email-warning`) when both addresses match.

### Signing page (`signing-page`)

Rendered outside the application shell by a dedicated `SigningLayout` — no sidebar, no top bar, no
session fetch. Single column, max 720px, the organization name as the only branding.

- Document frame `signing-document-frame`, sandboxed with `sandbox=""`.
- Signer field form `signing-fields-form`, inputs `signing-field-{key}`.
- Signature control `signing-signature` with a Draw/Type `Tabs` (`signing-signature-mode`), canvas
  `signing-signature-canvas`, typed input `signing-signature-typed-input`, and
  `signing-signature-clear-btn`.
- Consent checkbox `signing-consent-checkbox` with the consent text rendered in full.
- `signing-submit-btn` and `signing-decline-btn`.
- Footer showing the document hash (`signing-document-hash`) and the link expiry.
- Terminal-state panels: `signing-state-invalid`, `signing-state-expired`,
  `signing-state-voided`, `signing-state-declined`, `signing-state-not-your-turn`,
  `signing-state-signed`, each with its own copy and, where relevant,
  `signing-request-new-link-btn` or `signing-download-btn`.

### States

| State | Behavior |
|---|---|
| **Loading** | `Spinner` (`envelope-loading` / `signing-loading`). |
| **Draft** | Fill form editable; Send enabled; Void and Download absent. |
| **Sent / Partially signed** | Everything read-only; Void available; Download absent. |
| **Completed, PDF pending** | Download button shows a spinner and the tooltip "Preparing the signed PDF". |
| **Completed, PDF failed** | Banner plus Retry; Download disabled. |
| **Voided / Declined / Expired** | Read-only, with the reason and timestamp shown in the header. |
| **Signing, submitting** | Submit disabled with a loading indicator; the canvas and fields are locked (an in-flight guard, not a validation gate). |
| **Signing, offline** | Submit surfaces the network error and retains the drawn signature — a redrawn signature after a failed submit is the worst possible UX here. |

## Required `data-testid` Attributes

**Documents list:**
- `documents-page`, `envelopes-table`, `envelope-row-{id}`, `envelope-status-{id}`,
  `envelope-signer-status-{id}-{order}`, `envelope-search-input`, `envelope-status-filter`,
  `envelope-template-filter`, `envelope-new-btn`, `envelope-empty`, `envelope-loading`

**Envelope detail:**
- `envelope-detail`, `envelope-status`, `envelope-tabs`, `envelope-tab-document`,
  `envelope-tab-signers`, `envelope-tab-activity`, `envelope-document-frame`,
  `envelope-document-hash`, `envelope-expires-at`,
  `envelope-send-btn`, `envelope-void-btn`, `envelope-download-btn`,
  `envelope-pdf-failed-banner`, `envelope-pdf-retry-btn`

**Fill form:**
- `envelope-fill-form`, `envelope-template-select`, `envelope-subject-select`,
  `envelope-title-input`, `envelope-expires-input`,
  `envelope-field-{key}`, `envelope-field-autofill-{key}`, `field-error-{key}`,
  `envelope-signer-fields-preview`,
  `envelope-signer-input-{order}`, `envelope-signer-name-{order}`,
  `envelope-signer-email-{order}`, `envelope-swap-order-btn`,
  `envelope-same-email-warning`, `envelope-save-draft-btn`, `envelope-preview-btn`

**Signers tab:**
- `envelope-signer-row-{order}`, `envelope-signer-status-{order}`,
  `envelope-signer-signed-at-{order}`, `envelope-signer-bounce-{order}`,
  `envelope-resend-btn-{order}`

**Activity tab:**
- `envelope-audit-list`, `envelope-audit-row-{id}`, `envelope-chain-status`

**Void modal:**
- `envelope-void-modal`, `envelope-void-reason-input`, `envelope-void-confirm-btn`,
  `envelope-void-cancel-btn`, `field-error-reason`

**Signing page:**
- `signing-page`, `signing-loading`, `signing-document-frame`, `signing-document-hash`,
  `signing-fields-form`, `signing-field-{key}`, `field-error-{key}`,
  `signing-signature`, `signing-signature-mode`, `signing-signature-canvas`,
  `signing-signature-typed-input`, `signing-signature-clear-btn`,
  `signing-consent-checkbox`, `signing-consent-error`,
  `signing-submit-btn`, `signing-decline-btn`,
  `signing-decline-modal`, `signing-decline-reason-input`, `signing-decline-confirm-btn`,
  `signing-state-invalid`, `signing-state-expired`, `signing-state-voided`,
  `signing-state-declined`, `signing-state-not-your-turn`, `signing-state-signed`,
  `signing-request-new-link-btn`, `signing-download-btn`

**Toasts:**
- `toast-envelope-saved`, `toast-envelope-sent`, `toast-envelope-resent`,
  `toast-envelope-voided`, `toast-signing-signed`, `toast-signing-declined`

## Out of Scope

- Parallel signing and envelopes with more than two signers; CC-only recipients and witnesses.
- Identity verification beyond possession of the emailed link: OTP, SMS, knowledge-based
  authentication, document scanning. **This is the acknowledged limitation of the chosen signature
  class** — a signer can forward their link, and the audit trail records the IP and user agent that
  actually signed, not a verified identity. OTP is the first planned strengthening.
- PAdES/LTV digital signing of the PDF with an X.509 certificate, and RFC-3161 external
  timestamping. The hash chain is our tamper evidence in this release.
- Scheduled reminder cadence configuration (the sweep sends one reminder at the halfway point;
  configuring it is later work).
- In-person signing, bulk send, and templates with pre-bound counterparties.
- Third-party provider adapters (Dropbox Sign, Documenso, DocuSign) — this release ships the port
  and one implementation.
- Column-level encryption of PII, legal hold, and retention policy management beyond the S3 Object
  Lock default.
- Restricting organization deletion when completed envelopes exist. **Recorded as a known gap:**
  the cascade would remove signed-document records. Object Lock preserves the S3 objects, but the
  metadata linking them would be gone.
- Editing a sent document, or partial resends of a changed document (the correct action is void and
  re-send).

## Test Cases

### TC-02-UNIT-01: Event hash chain

- **Level:** Unit
- **Steps:**
  1. Compute the hash for a fixed event twice.
  2. Compute a chain of three events; recompute and verify.
  3. Alter `Type` of the second event and re-verify.
  4. Alter `OccurredAt` of the second event and re-verify.
  5. Remove the second event entirely and re-verify.
- **Expected Result:**
  1. Identical — the function is deterministic.
  2. Valid; each event's `PreviousEventHash` equals its predecessor's `EventHash`.
  3–5. Invalid, with the second event reported as the first divergence.

### TC-02-UNIT-02: State machine transitions

- **Level:** Unit
- **Steps:** for every (status, action) pair, ask the transition table whether it is legal.
- **Expected Result:** `draft`→send legal; `sent`→send illegal; `sent`→void legal;
  `completed`→void illegal; `voided`→sign illegal; `declined`→void illegal;
  `expired`→sign illegal; `draft`→void illegal; `draft`→delete legal; `sent`→delete illegal.

### TC-02-UNIT-03: Drawn signature validation

- **Level:** Unit
- **Steps:** validate a fully transparent PNG, a PNG with ink, a 600 KB PNG, a non-PNG data URI,
  and a plain string.
- **Expected Result:** rejected (empty); accepted; rejected (too large); rejected (bad type);
  rejected (not a data URI).

### TC-02-UNIT-04: Typed signature validation

- **Level:** Unit
- **Steps:** validate `""`, `"   "`, `"Ivan Demchenko"`, a 101-character name.
- **Expected Result:** rejected; rejected; accepted; rejected.

### TC-02-UNIT-05: Field ownership filter

- **Level:** Unit
- **Preconditions:** fields `a` (sender), `b` (signer:contractor), `c` (signer:company).
- **Steps:** filter a submitted payload `{a, b, c}` for the `contractor` signer.
- **Expected Result:** only `b` survives; `a` and `c` are dropped without error.

### TC-02-UNIT-06: Capability map

- **Level:** Unit
- **Steps:** resolve every capability for `admin`, `manager`, `user`, `viewer`, and the legacy
  `member`.
- **Expected Result:** matches the permission matrix; `member` resolves identically to `user`.

### TC-02-INT-01: Create an envelope from a published template

- **Level:** Integration
- **Preconditions:** published template T (v1) with two sender fields and two signer roles.
- **Steps:** `POST .../envelopes` with `templateId`, then `GET`.
- **Expected Result:** `201`, status `draft`, `TemplateVersionId` equals T's current version, two
  signers materialized in role order with empty name and email.

### TC-02-INT-02: Version pinning survives a template republish

- **Level:** Integration
- **Preconditions:** envelope E created from template T v1.
- **Steps:**
  1. Publish T v2 with a different body (spec 01).
  2. `GET .../envelopes/{E.id}`.
  3. Send E and read `renderedHtml`.
- **Expected Result:** E still reports version 1 and renders v1's body. The republish is invisible
  to E.

### TC-02-INT-03: Create from a draft or archived template is rejected

- **Level:** Integration
- **Steps:** `POST .../envelopes` against a never-published template, then against an archived one.
- **Expected Result:** `400 { "error": "template_not_published" }` and
  `400 { "error": "template_archived" }`.

### TC-02-INT-04: Send happy path

- **Level:** Integration
- **Preconditions:** draft envelope E with all required sender fields and both signers complete.
- **Steps:** `POST .../envelopes/{id}/send`, then `GET`, then read the mail sink.
- **Expected Result:** `200`; status `sent`; `RenderedHtml` and `DocumentHash` populated;
  `ExpiresAt` set; exactly one `SigningToken` exists and it belongs to signer order 1; exactly one
  email was sent, to signer 1; audit contains `created` then `sent`; the chain verifies.

### TC-02-INT-05: Send rejected for a missing required field

- **Level:** Integration
- **Preconditions:** draft envelope with one empty required sender field.
- **Steps:** `POST .../send`.
- **Expected Result:** `400 { "error": "missing_required_fields", "keys": [...] }`; status still
  `draft`; no token; no email.

### TC-02-INT-06: Send rolls back when the mail transport fails

- **Level:** Integration
- **Preconditions:** complete draft envelope; `InMemoryMailService.failNextSend()` armed.
- **Steps:** `POST .../send`, then `GET`, then count tokens and events.
- **Expected Result:** `502`; status still `draft`; `RenderedHtml` and `DocumentHash` still null;
  zero tokens; no `sent` event. Nothing partially applied.

### TC-02-INT-07: Double send

- **Level:** Integration
- **Steps:** `POST .../send` twice sequentially, then twice concurrently on a fresh envelope.
- **Expected Result:** sequential — `200` then `409 { "error": "not_draft" }`. Concurrent — exactly
  one `200` and one `409`; exactly one token and one invitation email exist.

### TC-02-INT-08: Second signer has no token until the first signs

- **Level:** Integration
- **Preconditions:** sent envelope E.
- **Steps:**
  1. Count tokens.
  2. Sign as signer 1.
  3. Count tokens; read the mail sink.
- **Expected Result:** 1 token before; 2 after (the first now used); the second signer received
  exactly one email; envelope status `partially_signed`.

### TC-02-INT-09: Signing idempotency under concurrency

- **Level:** Integration
- **Preconditions:** sent envelope; signer 1's raw token captured.
- **Steps:** fire two `POST /api/sign/{token}/sign` requests simultaneously with identical bodies.
- **Expected Result:** both return `200`; exactly one signature is stored; exactly one `signed`
  event exists; exactly one token was issued to signer 2. No double-transition.

### TC-02-INT-10: Signer cannot overwrite a sender field

- **Level:** Integration
- **Preconditions:** sent envelope; sender field `contractor_tax_id` = `191234567`.
- **Steps:** sign with `fieldValues` containing `contractor_tax_id: "000000000"` plus the signer's
  own field.
- **Expected Result:** `200`; the stored value of `contractor_tax_id` is unchanged; the signer's own
  field is stored.

### TC-02-INT-11: Consent is mandatory

- **Level:** Integration
- **Steps:** `POST .../sign` with `consentAccepted: false`.
- **Expected Result:** `400 { "error": "consent_required" }`; no signature; no event;
  `ConsentAcceptedAt` still null.

### TC-02-INT-12: Empty and oversized signatures

- **Level:** Integration
- **Steps:** sign with a fully transparent PNG; with a 600 KB PNG; with `type: "typed"` and
  `value: "  "`.
- **Expected Result:** `400 empty_signature`; `400 signature_too_large`;
  `400 invalid_typed_signature`. No signature recorded in any case.

### TC-02-INT-13: Out-of-turn token rejected

- **Level:** Integration
- **Preconditions:** sent envelope; a token minted directly for signer 2 in test setup.
- **Steps:** `GET /api/sign/{token2}` and `POST .../sign`.
- **Expected Result:** `403 { "error": "not_your_turn" }` for both; nothing recorded.

### TC-02-INT-14: Decline invalidates every token

- **Level:** Integration
- **Preconditions:** partially signed envelope with signer 2's token outstanding.
- **Steps:** decline as signer 2, then attempt `GET` with signer 1's old token and signer 2's token.
- **Expected Result:** envelope `declined`; every token has `IsInvalidated = true`; both `GET`s
  return the declined state; the sender received a decline email carrying the reason.

### TC-02-INT-15: Void after the first signature

- **Level:** Integration
- **Preconditions:** partially signed envelope (signer 1 signed).
- **Steps:** `POST .../void` with a reason; then `GET .../envelopes/{id}` and the signing link.
- **Expected Result:** `200`; status `voided`; signer 1's signature and `SignedAt` retained;
  outstanding token invalidated; no PDF produced; the signing link shows the withdrawn state with
  the void date.

### TC-02-INT-16: Void from a terminal status is rejected

- **Level:** Integration
- **Steps:** void a `completed` envelope, then a `declined` one, then a `draft` one.
- **Expected Result:** `409 { "error": "invalid_status" }` in all three cases.

### TC-02-INT-17: Lazy expiry is authoritative

- **Level:** Integration
- **Preconditions:** sent envelope with `ExpiresAt` moved into the past directly in the database,
  status still `sent`, sweep never run.
- **Steps:**
  1. `GET .../envelopes/{id}`.
  2. `GET /api/sign/{token}` and `POST .../sign`.
  3. Run `POST /api/internal/envelopes/sweep`.
  4. `GET .../envelopes/{id}`.
- **Expected Result:**
  1. Reports `expired`.
  2. `410 { "error": "expired" }`; signing refused.
  3. `{ "expired": 1 }`.
  4. Stored status is now `expired` and an `expired` event exists exactly once — re-running the
     sweep does not duplicate it.

### TC-02-INT-18: Completion renders, stores, and notifies

- **Level:** Integration
- **Preconditions:** partially signed envelope; both signers ready.
- **Steps:** sign as signer 2; wait for the inline render driver; `GET .../envelopes/{id}` and
  `GET .../document`.
- **Expected Result:** status `completed`; `PdfStatus = ready`; `SignedPdfKey` and `SignedPdfHash`
  set; the download endpoint returns a URL; both parties received a completion email; the audit
  contains `signed`, `signed`, `completed`.

### TC-02-INT-19: Completion survives a render failure

- **Level:** Integration
- **Preconditions:** the `PdfRenderer` driver is stubbed to throw.
- **Steps:** complete the signing; `GET`; then repair the stub and `POST .../pdf/retry`.
- **Expected Result:** status `completed` with `PdfStatus = failed` and a `pdf_failed` event — the
  signatures are intact. After retry, `PdfStatus = ready` and the document downloads. The envelope
  never left `completed`.

### TC-02-INT-20: Signed PDF is write-once

- **Level:** Integration
- **Preconditions:** completed envelope with `PdfStatus = ready`.
- **Steps:** invoke the render job again for the same envelope (simulating an SQS redelivery).
- **Expected Result:** `SignedPdfKey` and `SignedPdfHash` are unchanged; no second object is
  written; no additional `completed` event.

### TC-02-INT-21: Document integrity check

- **Level:** Integration
- **Preconditions:** sent envelope; `RenderedHtml` altered directly in the database.
- **Steps:** `POST /api/sign/{token}/sign`.
- **Expected Result:** `500 { "error": "document_integrity_failure" }`; no signature recorded; a
  `tamper_detected` event written.

### TC-02-INT-22: Audit chain verification

- **Level:** Integration
- **Preconditions:** completed envelope with a full event history.
- **Steps:**
  1. `GET .../audit/verify`.
  2. `UPDATE` one event's `IpAddress` directly in the database.
  3. `GET .../audit/verify`.
- **Expected Result:** valid; then invalid, naming that event as the first divergence.

### TC-02-INT-23: Audit contains no field values

- **Level:** Integration
- **Preconditions:** completed envelope whose fields include a tax id.
- **Steps:** read every `EnvelopeEvent.Metadata` for the envelope.
- **Expected Result:** no metadata contains any field value; the tax id appears nowhere in the
  audit trail.

### TC-02-INT-24: Unknown token leaks nothing

- **Level:** Integration
- **Steps:** `GET /api/sign/{random}` and `GET /api/sign/{valid-but-other-envelope}` after
  invalidation.
- **Expected Result:** identical `404 { "error": "invalid_link" }` bodies; no header, field, or
  status distinguishes "no such token" from "token for an envelope you may not see".

### TC-02-INT-25: Rate limiting on the public surface

- **Level:** Integration
- **Steps:** issue 15 `GET /api/sign/{token}` requests within a minute from one IP.
- **Expected Result:** the first 10 succeed; the rest return `429` with `retryAfterSeconds`; the
  limit resets after the window.

### TC-02-INT-26: Resend

- **Level:** Integration
- **Preconditions:** sent envelope.
- **Steps:**
  1. `POST .../signers/{signer1}/resend`; try the old token.
  2. Immediately resend again.
  3. `POST .../signers/{signer2}/resend`.
- **Expected Result:**
  1. `200`; a new email sent; the old token is invalidated and now returns `404`.
  2. `429 rate_limited`.
  3. `409 not_current_signer`.

### TC-02-INT-27: Capability and organization scoping

- **Level:** Integration
- **Steps:** as `user` and `viewer`, call list, create, send, void, and download. As an admin of
  another organization, `GET` the envelope.
- **Expected Result:** `403` for every `user`/`viewer` call; `404` for the cross-organization read.

### TC-02-INT-28: Shared signer email

- **Level:** Integration
- **Preconditions:** draft envelope where both signers use `same@example.com`.
- **Steps:** send; sign with the first token; then sign with the second.
- **Expected Result:** two distinct tokens issued; two separate emails; both signatures recorded
  independently; the envelope completes normally.

### TC-02-INT-29: Deleting a draft; deleting a sent envelope

- **Level:** Integration
- **Steps:** delete a `draft` envelope; delete a `sent` one.
- **Expected Result:** `204` and gone; `409` and untouched.

### TC-02-E2E-01: Admin creates and sends a document

- **Level:** E2E
- **Preconditions:** logged in as admin; one published template with two sender fields, one signer
  field, and two signer roles.
- **Steps:**
  1. Open `/org/{orgId}/documents`, click "New document".
  2. Pick the template. Verify the fill form lists the sender fields and previews the signer field
     as read-only.
  3. Fill the sender fields; enter both signers' names and emails.
  4. Click "Send for signature" and confirm.
  5. Verify toast "Sent for signature", status badge Sent, signer 1 Notified, signer 2 Pending.
  6. Verify the fill form is now read-only.
- **Selectors:** `documents-page`, `envelope-new-btn`, `envelope-template-select`,
  `envelope-fill-form`, `envelope-field-{key}`, `envelope-signer-fields-preview`,
  `envelope-signer-name-1`, `envelope-signer-email-1`, `envelope-signer-name-2`,
  `envelope-signer-email-2`, `envelope-send-btn`, `toast-envelope-sent`, `envelope-status`,
  `envelope-signer-status-1`, `envelope-signer-status-2`.

### TC-02-E2E-02: Full two-party signing to completion

- **Level:** E2E
- **Preconditions:** an envelope sent to two distinct addresses (created through the UI in
  TC-02-E2E-01 or via API setup).
- **Steps:**
  1. Fetch signer 1's invitation from `GET /api/test/mail/latest?email=` and extract the link.
  2. Open the link in a **fresh browser context** (no session).
  3. Verify the document frame renders the filled values and that no sender field is editable.
  4. Draw a signature on the canvas.
  5. Click "Sign document" without ticking consent; verify the consent error and that nothing was
     submitted.
  6. Tick consent, click "Sign document"; verify the signed confirmation state.
  7. Fetch signer 2's invitation, open it in another fresh context.
  8. Fill the signer-owned field, switch to the Type tab, type a name, tick consent, sign.
  9. Verify the completion state and that a signed PDF download is offered.
  10. Back in the admin session, reload the envelope and verify status Completed and both signers
      Signed.
- **Selectors:** `signing-page`, `signing-document-frame`, `signing-signature-canvas`,
  `signing-consent-checkbox`, `signing-consent-error`, `signing-submit-btn`,
  `signing-state-signed`, `signing-signature-mode`, `signing-signature-typed-input`,
  `signing-field-{key}`, `signing-download-btn`, `envelope-status`,
  `envelope-signer-status-1`, `envelope-signer-status-2`.

### TC-02-E2E-03: Second link does not exist before the first signature

- **Level:** E2E
- **Preconditions:** a freshly sent envelope.
- **Steps:**
  1. Query the mail sink for signer 2's address.
  2. Sign as signer 1.
  3. Query the mail sink for signer 2 again.
- **Expected Result:** no invitation before step 2; exactly one after.

### TC-02-E2E-04: Signer declines

- **Level:** E2E
- **Preconditions:** sent envelope; signer 1's link available.
- **Steps:**
  1. Open the link, click "Decline to sign", enter a reason, confirm.
  2. Verify the declined state on the signing page.
  3. In the admin session, verify status Declined and that the reason is visible on the Signers
     tab.
- **Selectors:** `signing-decline-btn`, `signing-decline-modal`, `signing-decline-reason-input`,
  `signing-decline-confirm-btn`, `signing-state-declined`, `envelope-status`,
  `envelope-signer-row-1`.

### TC-02-E2E-05: Void invalidates an outstanding link

- **Level:** E2E
- **Preconditions:** sent envelope; signer 1's link captured but not yet opened.
- **Steps:**
  1. As admin, void the envelope with a reason.
  2. Open the captured link in a fresh context.
- **Expected Result:** status Voided in the admin UI; the signing page shows the withdrawn state
  with the void date and reason.
- **Selectors:** `envelope-void-btn`, `envelope-void-modal`, `envelope-void-reason-input`,
  `envelope-void-confirm-btn`, `toast-envelope-voided`, `envelope-status`,
  `signing-state-voided`.

### TC-02-E2E-06: A used link becomes read-only

- **Level:** E2E
- **Preconditions:** signer 1 has signed.
- **Steps:** reopen signer 1's link.
- **Expected Result:** the already-signed panel with the signed timestamp; no signature control and
  no submit button.
- **Selectors:** `signing-state-signed`, `signing-submit-btn` (asserted absent),
  `signing-signature-canvas` (asserted absent).

### TC-02-E2E-07: Expired link

- **Level:** E2E
- **Preconditions:** sent envelope whose `ExpiresAt` was moved into the past in setup.
- **Steps:** open the link.
- **Expected Result:** the expiry panel with the date and a "Request a new link" action; no signing
  control.
- **Selectors:** `signing-state-expired`, `signing-request-new-link-btn`,
  `signing-submit-btn` (asserted absent).

### TC-02-E2E-08: Invalid link

- **Level:** E2E
- **Steps:** open `/sign/not-a-real-token`.
- **Expected Result:** the generic invalid panel. No envelope title, organization name, or signer
  name appears anywhere on the page.
- **Selectors:** `signing-state-invalid`.

### TC-02-E2E-09: A Cyrillic contract renders correctly

- **Level:** E2E
- **Preconditions:** a published template whose body and field labels are entirely in Russian, with
  Cyrillic field values.
- **Steps:** create, send, sign with both parties, download the completed PDF, extract its text.
- **Expected Result:** the extracted text contains the expected Cyrillic strings with no
  replacement characters; the Certificate of Completion page is present and legible.
- **Selectors:** `envelope-download-btn`.

### TC-02-E2E-10: Activity tab shows the verified chain

- **Level:** E2E
- **Preconditions:** a completed envelope.
- **Steps:** open the envelope, switch to Activity.
- **Expected Result:** events in reverse-chronological order including created, sent, viewed,
  signed ×2, and completed; each signer event shows an IP and a timestamp; the chain badge reads
  verified.
- **Selectors:** `envelope-tab-activity`, `envelope-audit-list`, `envelope-audit-row-{id}`,
  `envelope-chain-status`.

### TC-02-E2E-11: Sent documents cannot be edited

- **Level:** E2E
- **Preconditions:** a sent envelope.
- **Steps:** open it and attempt to edit a field.
- **Expected Result:** every field input is read-only or absent; Send is absent; Void is present.
- **Selectors:** `envelope-fill-form`, `envelope-send-btn` (asserted absent),
  `envelope-void-btn`.

### TC-02-E2E-12: Regular user has no access to documents

- **Level:** E2E
- **Preconditions:** logged in as a `user`; one envelope exists.
- **Steps:** check the sidebar; navigate directly to `/org/{orgId}/documents`.
- **Expected Result:** no Documents nav item; the not-found page renders.
- **Selectors:** `nav-documents` (asserted absent), `documents-page` (asserted absent).
