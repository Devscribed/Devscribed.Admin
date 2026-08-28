---
id: "04"
title: Signature Providers & SignWell
routes: ["/org/{orgId}/settings/signing", "/sign/{token}", "/org/{orgId}/documents/{envelopeId}"]
api:
  [
    "GET /api/organizations/{orgId}/settings/signing",
    "PUT /api/organizations/{orgId}/settings/signing",
    "POST /api/webhooks/signwell",
    "GET /api/sign/{token}",
  ]
entities: [Organization, Envelope, EnvelopeSigner, EnvelopeEvent, ProviderWebhookEvent]
tags:
  [
    signature-provider,
    signwell,
    port,
    adapter,
    webhook,
    embedded-signing,
    iframe,
    test-mode,
    idempotency,
    hmac,
    reconciliation,
    text-tags,
  ]
depends-on: ["01", "02"]
---

# 04 — Signature Providers & SignWell

## Summary

This spec replaces the `SignatureProvider` port with one that can actually carry a third-party
signing service, rewrites the in-house engine onto it, adds a SignWell adapter running in test
mode, and gives an administrator a screen to choose which provider an organization signs with.

The structural decision it turns on is this: **the existing port is a document-assembly port, not
a signing-transport port.** Its three methods — `issueInvitation`, `applySignature`, `finalize` —
all assume we mint the token, host the page, capture the ink, and build the PDF. SignWell does all
four itself and tells us what happened afterwards over a webhook. The area README's promise that a
third-party adapter is "a class and an env var, not a migration" is therefore only half true: the
columns are indeed already there (`Envelope.providerKey`, `Envelope.providerRef`), but the
interface behind them is shaped for exactly one implementation. The new port's unit of work is the
**signing session** — the whole envelope, over its whole life — and its central rule is that a
remote provider's state is asynchronous and is never taken from a notification body.

The second decision follows from the first: for a SignWell envelope, **SignWell's completed PDF
with its audit page is the record of execution.** Our `EnvelopeEvent` hash chain keeps running as
an operational journal fed by reconciliation, and our own Certificate of Completion is not issued —
two documents claiming to be the evidence is worse than one.

**Depends on:** Spec 01 (Template, TemplateVersion), Spec 02 (Envelope, EnvelopeSigner,
SigningToken, EnvelopeEvent, the state machine, S3, SES).

> **Verified against the live sandbox on 28 Aug 2026**, account plan `business`, `test_mode:
> true`. A document was created with the exact body requirement 13 specifies, read back, and
> deleted; a webhook was registered against a tunnel and two real deliveries — `document_created`
> and `document_sent` — were captured and their hashes checked. Every statement below marked
> *observed* comes from that run rather than from SignWell's documentation, and five of them
> contradict it. The account was left with no documents and no webhooks. What is still
> unverified is listed in Known Gaps.

## What exists and what must be built

Reconnaissance first, because most of the cost here is not the adapter.

### Exists, and is reused unchanged

| Thing | Path | How this spec uses it |
|---|---|---|
| The provider columns | `apps/api/prisma/schema.prisma` — `Envelope.providerKey`, `providerRef` | Already present with defaults; no migration needed to carry SignWell's identifiers. |
| The event hash chain | `apps/api/src/documents/envelope-events.service.ts` | Takes a transaction client as a parameter, so an event cannot be written outside a transaction. Reconciliation writes through it, unchanged. |
| Write-once completion | `apps/api/src/documents/envelope-completion.ts` | The content-addressed S3 key and the `updateMany` guard that makes exactly one writer win are reused verbatim; only the *source* of the bytes changes. |
| The PDF renderer port | `apps/api/src/pdf/pdf-renderer.ts` | Still needed — SignWell is given a PDF, and we produce it from the frozen HTML. |
| File storage | `apps/api/src/storage/file-storage.ts` | SignWell's completed PDF lands in the same bucket under the same key layout. |
| The job queue port | `apps/api/src/queue/job-queue.ts` | Webhook handling runs off the request thread through it. |
| Token minting | `apps/api/src/signature/signing-token.ts` | Unchanged. Our token still gates `/sign/{token}` even when SignWell renders inside it. |
| The shared-secret guard shape | `apps/api/src/internal/internal-task.guard.ts` | The webhook endpoint is a session-less route with its own guard; this is the pattern it copies. |
| Captured webhook deliveries | `apps/api/test/signwell-webhook-fixtures.ts` | Three real deliveries — `document_created`, `document_sent`, `document_canceled` — with their original `type`, `time` and `hash`, so the reconciler is tested against what SignWell sends and our HMAC is checked against a hash SignWell produced. Written while verifying this spec. |
| Guards | `apps/api/src/auth/session.guard.ts`, `org-scope.guard.ts`, `capability.guard.ts` | The settings endpoints use the ordinary stack. |
| The signing page shell | `apps/web/app/sign/[token]/` | Kept. Under SignWell its body becomes an iframe instead of our document + canvas. |

### Must be built from zero

| Thing | Why it is not a small change |
|---|---|
| The `SigningProvider` port | A different shape from today's: session-scoped, asynchronous, with a capability record so the envelope service branches on *what a provider does*, not on *which provider it is*. |
| `InternalSigningProvider`, rewritten | The in-house engine keeps every behaviour spec 02 requires but is re-expressed against the new port. This is the risky half of the work: it touches a working, shipped signature engine. |
| `SignWellSigningProvider` | HTTP client, rate-limit handling, error mapping, test-mode flag, recipient mapping. |
| Text-tag emission | Our templates carry `{{placeholder}}`. SignWell's text tags are **also** `{{...}}`. See requirement 14 — this collision is the single most dangerous detail in the integration. |
| Webhook receiver | Endpoint, hash verification, replay store, and a converge-to-state reconciler that re-reads from the API rather than trusting the body. |
| Reconciliation sweep | So a dropped webhook costs timeliness and never correctness. |
| Organization signing settings | There is **no organization-settings surface in the product today** — the routes are `documents`, `members`, `outbox`, `requests`, and `account/settings`. This spec introduces the first one. |
| The embedded signing host | Our `/sign/{token}` page hosting SignWell's iframe, and the `postMessage` events it must handle. |

## Actors & Preconditions

| Actor | Preconditions |
|---|---|
| **Admin** | Signed in, `ManageSigningSettings`. Chooses the organization's provider. |
| **Sender** (admin or manager) | `ManageEnvelopes`. Creates and sends envelopes; does not choose the provider per envelope. |
| **Signer** | Holds a valid `/sign/{token}` link. No account, no session. Identical for both providers — this is the point of hosting the iframe ourselves. |
| **SignWell** | A machine actor. POSTs to `/api/webhooks/signwell`. Holds no session and is never trusted beyond "something rang the doorbell". |
| **Reconciler** | The sweep container (spec 02, "Sweep — a container task, not a function"), plus lazy convergence on read. |

Environment preconditions for the SignWell provider:

1. `SIGNWELL_API_KEY` is present (SSM `SecureString` → ECS task environment).
2. `SIGNWELL_API_APPLICATION_ID` is present. *Observed: optional.* Embedded signing works
   without it — a document created with `embedded_signing: true` and no application still
   returns an `embedded_signing_url` for every recipient. The application exists to brand the
   widget with our colours and logo (`preferences.primary_color`, `custom_logo_file`), which is
   reason enough to require it: a counterparty signing our contract should see our brand and not
   SignWell's default. It is a configuration item, not a precondition.
3. **There is no domain allowlist.** *Observed:* the API Application object carries `id`, `name`,
   `callback_urls` and branding `preferences` — and no field for permitted origins. An earlier
   draft of this spec required registering our origin, which was a convention carried over from
   other vendors and is not SignWell's. Nothing has to be allowlisted for the iframe to load,
   from any origin, including `localhost`.
4. A webhook is registered pointing at `{API_PUBLIC_URL}/api/webhooks/signwell`, and its id is
   stored as `SIGNWELL_WEBHOOK_SECRET` — see requirement 20 for why the id *is* the secret and
   why that is not enough.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer | Signer (link) | SignWell |
|---|---|---|---|---|---|---|
| `ViewSigningSettings` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `ManageSigningSettings` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ManageEnvelopes` (existing) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Open `/sign/{token}` | — | — | — | — | ✅ | ❌ |
| POST `/api/webhooks/signwell` | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

`ManageSigningSettings` is **admin only** while `ManageEnvelopes` is admin and manager: choosing
the provider changes where every future contract of the organization is executed and who holds the
evidence, which is a different order of decision from sending one document.

Capability checks run on `normalizeRole()` — the area README's role-enum rule applies here
unchanged.

## Functional Requirements

### The provider port

1. A signature provider is selected per **organization** and pinned per **envelope at send**.
   `Organization.signatureProviderKey` is what the send path reads; `Envelope.providerKey` is
   written in the same transaction that flips the envelope to `sent`, and never changes
   afterwards.

   **At send and not at creation**, deliberately, because the difference is observable. A draft
   can sit for days, and nothing provider-side exists for it until it is sent — no remote
   document, no `providerRef` (requirement 5). Pinning earlier would therefore buy no safety,
   while letting a draft go out through a provider the organization has deliberately left:
   producing our own Certificate of Completion for an organization whose record of execution is
   now SignWell's audit page. The property that actually matters is the other one, and
   invariant 7 states it: an envelope **that has been sent** never changes provider.

   While an envelope is a draft, `providerKey` holds the organization's setting as it stood at
   creation — `apps/api/src/documents/envelopes.service.ts` writes it there today and continues
   to, so the draft's detail screen can say which provider it would use. Nothing reads it as
   authority before send, and the send overwrites it.
2. Every provider declares a `ProviderCapabilities` record. The envelope service branches on the
   capability, never on the key, so a third provider needs no new `if` in the service:

   | Capability | Values | Consumer |
   |---|---|---|
   | `invitationMail` | `ours` \| `provider` | The send path: whether to dispatch through SES. |
   | `signingSurface` | `ours` \| `embedded` | `/sign/{token}`: our document + canvas, or an iframe. |
   | `completedDocument` | `ours` \| `provider` | Completion: render from frozen HTML, or download. |
   | `notifications` | `none` \| `webhook` | Whether reconciliation exists at all for this provider. |
   | `signingOrder` | `ours` \| `provider` | Whether we issue turn *n+1* or the provider does. |

3. The port is one abstract class plus two narrowing interfaces, so a provider cannot be asked to
   do something it declared it does not do:

   ```ts
   abstract class SigningProvider {
     abstract readonly key: string;
     abstract readonly capabilities: ProviderCapabilities;
     abstract createSession(r: CreateSessionRequest): Promise<CreatedSession>;
     abstract signerAccess(r: SignerAccessRequest): Promise<SignerAccess>;
     abstract completedDocument(r: CompletedDocumentRequest): Promise<CompletedDocument>;
     abstract cancel(r: CancelRequest): Promise<void>;
   }

   /** Only when capabilities.signingSurface === 'ours'. */
   interface LocallySigned {
     applySignature(r: SignatureRequest): Promise<AppliedSignature>;
   }

   /** Only when capabilities.notifications === 'webhook'. */
   interface RemotelyTracked {
     parseNotification(raw: RawNotification): Promise<ParsedNotification | null>;
     fetchState(providerRef: string): Promise<ProviderState>;
   }
   ```

4. **No method on the port touches the database, sends mail, or writes an event.** This survives
   from the current port and is the reason a provider swap cannot corrupt the audit trail: the
   envelope service owns the transaction, the chain, and the mail under every provider.
5. `createSession` is called exactly once per envelope, inside the send path, **before** the
   transaction that flips the envelope to `sent`. A provider failure at this point leaves the
   envelope in `draft` with nothing partially applied.
6. `signerAccess` is called **every time** a signer's page is opened, and its result is never
   persisted. *Observed:* SignWell's `embedded_signing_url` is a stable short link
   (`https://www.signwell.com/docs/{id}/`), returned at creation for **every** recipient — so it
   is neither a nonce nor short-lived, and the original reason for re-fetching was wrong. The
   real reason is stronger: storing a live signing URL would create a second credential for the
   document, one that our own access control does not gate and our token expiry does not reach.
   The provider's link is held only for the duration of a request that we have already
   authorized.
7. `fetchState` returns the provider's authoritative view, normalized to our vocabulary:
   per-signer status, envelope status, decline reason, and the provider's own status string kept
   verbatim for support. It is the **only** source of remote state (requirement 21).

### The internal provider, rewritten

8. `InternalSigningProvider` declares `{ invitationMail: 'ours', signingSurface: 'ours',
   completedDocument: 'ours', notifications: 'none', signingOrder: 'ours' }` and implements
   `LocallySigned`.
9. Every behaviour spec 02 requires of the in-house engine is preserved exactly: token minting and
   hashing, the `/sign/{token}` route, consent capture, drawn and typed signatures, the
   pre-signature document-hash check, single-use tokens, the Certificate of Completion, and the
   hash-chained trail. **This spec changes no observable behaviour of an `internal` envelope.**
10. The rewrite is verified by the existing spec 02 test suite passing unchanged. A test that has
    to be edited to accommodate the new port is a signal that behaviour moved, and is a defect of
    this spec's implementation, not of the test.

### The SignWell provider

11. `SignWellSigningProvider` declares `{ invitationMail: 'ours', signingSurface: 'embedded',
    completedDocument: 'provider', notifications: 'webhook', signingOrder: 'provider' }` and
    implements `RemotelyTracked`.
12. `invitationMail: 'ours'` is deliberate. The invitation is sent by our SES identity with our
    copy and a link to **our** `/sign/{token}`, so the counterparty never receives mail from a
    vendor they have no relationship with, and the link cannot outlive our access control. The
    SignWell document is therefore created with `embedded_signing: true` and
    `embedded_signing_notifications: false`.
13. At send, `createSession` posts to `POST https://www.signwell.com/api/v1/documents` with:

    | Field | Value | Why |
    |---|---|---|
    | `test_mode` | from `SIGNWELL_TEST_MODE` | This release ships `true`. Requirement 24. |
    | `draft` | `false` | The document is complete at send; there is nothing left to edit. |
    | `files` | one item, `{ name, file_base64 }` | The frozen document rendered to PDF by our own `PdfRenderer`. `file_url` is rejected — it would require exposing a public URL to an unsigned contract. |
    | `recipients` | one per `EnvelopeSigner`, in `order` | `signing_order` mirrors ours. |
    | `apply_signing_order` | `true` | Spec 02's sequential rule, enforced on their side too. |
    | `text_tags` | `true` | Field placement — requirement 14. |
    | `embedded_signing` | `true` | Requirement 12. |
    | `embedded_signing_notifications` | `false` | We send the mail. |
    | `reminders` | `false` | Our sweep sends reminders, so there is one reminder policy, not two. |
    | `expires_in` | the envelope's remaining days | Kept consistent with our own expiry. |
    | `metadata` | `{ envelope_id, organization_id }` | Correlation without trusting a webhook body to tell us who it is about. |
    | `api_application_id` | `SIGNWELL_API_APPLICATION_ID` | Brands the widget. Optional — see Actors & Preconditions, item 2. |
    | `allow_decline` | `true` | Spec 02 requirement 26 keeps its meaning. |
    | `allow_reassign` | `false` | Reassignment would break the binding between a signer row and an email address. |

    *Observed:* the call answers `201` with `status: "Created"`, `files[0].pages_number: 0` and
    `fields: []` — the PDF has not been read yet. Creation is **two-phase and asynchronous**:
    SignWell parses the file, materializes the text tags into fields, and moves the document to
    `Sent` on its own, with no second call from us. Requirement 38 is the consequence.

14. **The placeholder collision.** SignWell's text tags are delimited by `{{` and `}}` — byte for
    byte, our own placeholder syntax (spec 01, Shared Rules). At send the frozen HTML deliberately
    still carries `{{signer_owned_key}}` literally, because those values do not exist yet. Under
    SignWell:

    a. Signer-owned placeholders are **translated** into SignWell tag syntax before rendering —
       `{{contractor_signature}}` becomes a signature tag bound to that signer's index, and a
       signer-owned text field becomes a text tag.
    b. Signature blocks, which carry `data-signer-role` in our renderer, emit a signature tag
       sized to the block.
    c. After translation the renderer **asserts that no `{{…}}` remains** that is not a tag it
       emitted. Any residual — a sender value that itself contained braces, an unbound
       placeholder, a template that slipped through spec 01's validation — aborts the send with
       `document_tags_unresolved` before a document is created and before a webhook can exist.
       Sending anyway would let a contract be signed with a stray field on it.
    d. Tags are rendered in the page background colour so they do not appear in the signed PDF.
       SignWell does not strip them. This is why (c) has to be an abort and not a warning: an
       unresolved placeholder would be *invisible* in the output and still consume a field.

15. `signerAccess` calls `GET /documents/{id}` and returns the current
    `recipients[n].embedded_signing_url` for the signer whose turn it is. It is never persisted.
16. A signer whose turn has not started gets our existing "not your turn yet" screen, decided
    from our own rows before any call to SignWell is made.

    This is a security rule, not an optimization. *Observed:* the embedded URL for recipient 2 is
    handed out at creation and is byte-identical before and after recipient 1's turn, while only
    `recipients[].status` distinguishes them (`sent` versus `waiting`). Possession of the URL is
    therefore not proof that a signer's turn is open, and our own row is what decides. It also
    keeps a wrong-turn visitor from spending an API call.
17. `completedDocument` calls `GET /documents/{id}/completed_pdf?url_only=false&audit_page=true`
    and returns the bytes. `audit_page=true` is not optional: it is what makes their PDF the
    record of execution rather than an unsigned-looking rendering.

    *Observed:* on a document that exists but is not complete, this route answers `404` with
    `meta.error = "record_not_found"` and the message "Couldn't find the document requested" —
    **the same body a genuinely unknown id produces.** A `404` here therefore carries no
    information, and the reconciler must never read it as "the document is gone". Completion is
    established from `GET /documents/{id}` first; the download is attempted only after that says
    `Completed`, and a `404` at that point is a transient failure to retry, never a terminal
    state.
18. **Reminders are ours under every provider**, which is what requirement 13's
    `reminders: false` exists to guarantee: one reminder policy, not two.
    `apps/api/src/internal/envelope-sweep.service.ts` sends the halfway reminder through SES
    with our own `/sign` link, exactly as it does today, and does not consult the provider.

    There is therefore **no `remind` method on the port.** A provider that had to send its own
    reminders would add a `reminders: ours | provider` capability and a caller that branches on
    it; inventing the method before such a provider exists would leave a port method with no
    caller, which is the shape the previous port failed in. For the record, and so the next
    person does not have to find it again: SignWell's is `POST /documents/{id}/remind`,
    optionally naming recipients, and omitting them reminds everyone who has not signed.

    `cancel` has **no counterpart.** *Observed and confirmed against the endpoint index:*
    SignWell exposes no cancel or void route. `POST /documents/{id}/send` only updates and sends
    a draft. The single mechanism that stops an in-flight document is
    `DELETE /documents/{id}` — a hard delete which, in SignWell's own words, "will also cancel
    document signing (if in progress)". Verified: `204` on a sent document, and `GET` on it
    afterwards answers `404`.

    So voiding a SignWell envelope **deletes it on their side**, and requirement 30 narrows
    accordingly. This is the correct trade and not merely the only one available: a voided
    envelope has no executed artefact to preserve, and leaving the document open would leave a
    counterparty holding a working signing URL for a contract we consider void — our void has to
    actually stop signing, or it is theatre. See requirement 40 for the ordering and the race.
19. Rate limits are read from the response, not assumed. Every reply carries
    `x-ratelimit-limit` and `x-ratelimit-remaining`, and the client tracks them per route
    family rather than hard-coding the documented figures — which are wrong. *Observed:* reads
    (`/me`, `GET /hooks`, `GET /documents/{id}`, `completed_pdf`, `DELETE`) report a limit of
    **120**; `POST /hooks` reports **30**; `POST /documents` reports **10**, against the 30 the
    documentation claims. The
    client serializes per organization, retries `429` with exponential backoff and jitter, five
    attempts, then surfaces `provider_unavailable`. A retried `POST /documents` is **not** safe
    to repeat blindly — see requirement 26.

### Notifications and reconciliation

20. **The webhook is a doorbell, not a delivery.** *Observed:* the delivery is a POST with
    `User-Agent: SignWell`, `Content-Type: application/json`, and **no signature header of any
    kind** — the hash exists only in the body. Its shape is exactly:

    ```json
    { "event": { "hash": "…", "time": 1787922482, "type": "document_sent" },
      "data":  { "object": { … }, "account_id": "…", "workspace_id": "…" } }
    ```

    `related_signer` appears only on signer-related events; it was absent from both captured
    deliveries, which is why requirement 22's dedupe key defaults it to the empty string rather
    than requiring it.

    The documented algorithm is **confirmed**: `HMAC-SHA256("{type}@{time}")` keyed by the
    webhook id reproduced `event.hash` on both deliveries. Two consequences remain, and both are
    load-bearing:

    a. The hash covers only the type and the timestamp. It says nothing about the payload, so a
       verified request may still carry a body altered in transit or replayed with different
       contents.
    b. The "secret" is the webhook id, an identifier `GET /api/v1/hooks` hands to any holder of
       the API key.

    Therefore the hash is used to **cheaply reject noise**, never to authenticate a state
    change.

21. On every accepted notification the reconciler calls `fetchState(providerRef)` and converges
    our rows to what the API returns. Nothing in the webhook body is written to the database
    except the fact that a notification arrived. This makes replay, reordering, and duplicate
    delivery harmless by construction rather than by careful handling.

    *Observed, and this turned out to be a much stronger argument than the forgery one it was
    written for:* **the body is not merely untrusted, it is stale and incomplete.** The
    `document_sent` delivery carried `status: "Sending"` — a transient the API had already left
    by the time it was read — and every `recipients[].status` in it was `null`, while a `GET`
    moments later returned `created` / `sent` / `waiting` correctly. A handler that wrote state
    from the payload would have recorded a status that was never true for longer than a second,
    and would have had no signer statuses at all.
22. Notifications are deduplicated in a `ProviderWebhookEvent` row, unique on
    `(providerKey, providerRef, eventType, eventTime, relatedSignerEmail)`. SignWell issues no
    event id, so this composite is the best key available; see Known Gaps.
23. Reconciliation is **converge-to-state**, not apply-delta. It computes the difference between
    the provider's view and ours and writes the events that difference implies, in order, through
    `EnvelopeEventsService` inside one transaction. An envelope already in a terminal state is
    never moved out of it.
24. **A dropped notification costs timeliness, never correctness.** Two mechanisms:

    a. **Lazily, on read.** Any read of a non-terminal envelope whose `providerKey` is remote and
       whose `providerSyncedAt` is older than `PROVIDER_SYNC_STALE_SECONDS` (default 120) triggers
       a synchronous re-fetch before the response is composed.
    b. **On a schedule.** The existing sweep walks non-terminal remote envelopes older than an
       hour and reconciles them.

    The scheduler materializes what is already true; it is not the source of truth.

25. The webhook endpoint answers `200` to any request whose hash verifies, including one naming a
    `providerRef` we do not know — confirming which documents we hold would leak. An unknown
    reference increments a counter and logs a warning, so a misconfigured webhook is visible in
    operations without being visible to a caller. A bad hash gets `401` with an empty body.
26. `POST /documents` is not idempotent on SignWell's side and our retry must not create two
    documents for one envelope. Before retrying a create that failed without a response, the
    client looks for a document already carrying this envelope's id in `metadata`.

    **The search is client-side, and that is not a preference.** *Observed:* `GET /documents`
    exists — undocumented in SignWell's own endpoint index — and returns
    `{documents, current_page, next_page, previous_page, total_count, total_pages}` with
    `metadata` on each row. But it **silently ignores filters**: `?metadata[envelope_id]=` with a
    value matching nothing still returned every document, and so did `?query=`. A filter that is
    ignored rather than rejected is the most dangerous kind, because the naive implementation of
    this requirement would "find" an unrelated document and adopt it — attaching our envelope to
    somebody else's contract, which is worse than the duplicate it was trying to prevent.

    So: page the list, compare `metadata.envelope_id` in our own code, and adopt only on an exact
    match. Stop after twenty pages. If the list is unavailable or the cap is reached, the send
    fails with `provider_unavailable` and the envelope stays in `draft` — a failed send is
    recoverable, a duplicated or misattributed contract is not.

### Completion and the artefact

27. On convergence to `completed`, the **provider's PDF is downloaded and written to S3 before the
    envelope is marked complete.** Under SignWell the completed PDF and its audit page are the
    irreplaceable thing: we did not produce them and cannot reproduce them. The order is
    download → `put` (content-addressed, write-once) → transactional status update. A failure
    between them leaves `pdfStatus = pending` and retries; it never leaves an envelope that claims
    to be complete with no document behind it.
28. For a SignWell envelope our Certificate of Completion is **not** generated. Their audit page
    is the certificate. Issuing both would put two documents in the record with different
    timestamps for the same act.
29. `Envelope.documentHash` keeps its meaning — the hash of the frozen HTML at send, which is what
    we sent them. `Envelope.signedPdfHash` is the hash of the bytes they returned. Those are two
    different documents and the spec says so rather than pretending one verifies the other.
30. We never delete a **completed** document. Delete is a hard delete and is reserved for the
    void path (requirement 18). A test-mode document may also be purged on their side without
    our asking; our S3 copy is the durable one either way.

### Choosing a provider

31. `/org/{orgId}/settings/signing` shows the current provider, whether it is in test mode, and a
    live connection check. Changing the provider requires `ManageSigningSettings`.
32. A provider cannot be selected unless it is **configured**, and *configured* means
    configuration is present: for SignWell, `SIGNWELL_API_KEY`, `SIGNWELL_API_APPLICATION_ID`
    and `SIGNWELL_WEBHOOK_SECRET`. That is the whole gate.

    `reachable` and `webhookRegistered` are **live checks displayed beside the option, never
    gates on it.** Making a live registration a precondition would make SignWell unselectable in
    every deployed environment, because none has a public address SignWell can reach — see the
    Infrastructure section — while the same section says those environments run on convergence
    alone. A provider whose webhook is unregistered works; it is merely slower, which is
    precisely the degradation requirement 24 is built to absorb.

    An unconfigured provider is listed, disabled, with the missing items named — a control
    nobody can use is not hidden here, because the admin needs to know the option exists and
    what is absent.
33. Changing the provider shows a confirmation naming the count of in-flight envelopes that will
    stay on the old provider. This is one of the deliberate confirmations `CLAUDE.md` allows a
    disabled submit for: the checkbox gates the button, the validation never does.
34. The envelope detail screen shows which provider executed the document and, in test mode, an
    unmissable badge. A test-mode document has no legal weight and must never be mistaken for one
    that does.

### Provider data and PII

35. **A notification payload is redacted before it is stored, and the signing URL is the first
    thing redacted.** *Observed:* every delivery carries the whole document, and that includes
    `recipients[].embedded_signing_url` — a working link that signs **as that recipient** — next
    to each recipient's email address. A payload stored verbatim would therefore put live
    signing credentials in a forensics table, at rest, for as long as the row lives. That is a
    worse leak than the one this requirement was originally written for.

    The body also carries `fields[].value` on every field — `""` and `null` in the captured
    deliveries only because nothing had been filled in yet — which under spec 03 can be a tax
    id, a bank account, or an identity document number. Storing those verbatim would put PII in
    a forensics table adjacent to the audit trail that spec 02 requirement 40 keeps field values
    out of. Each field also carries an `api_id` SignWell assigns (`Signature_1`, `TextField_1`),
    and that is what a redacted row keeps in place of the value.

    `ProviderWebhookEvent.payload` therefore stores the body with three things replaced by
    `"[redacted]"`: every `recipients[].embedded_signing_url`, every `value` under
    `data.object.fields`, and every `data.object.metadata` key outside our own two. Redaction
    happens before the first write and never on read, and a payload that fails to redact is not
    stored at all.
36. **A provider response is never logged in full.** `fetchState` and `completedDocument`
    responses pass through a projection that keeps status, timestamps, recipient identity and
    decline reasons, and drops field values. Only the projection may be logged.
37. **`EnvelopeEvent.metadata` gains nothing from the provider.** The existing rule stands
    unchanged: no field values, no field keys. A `provider_synced` event records the provider key
    and the provider's status string, and nothing else.

### Verified provider behaviour

38. **The send is not finished when `createSession` returns.** Because creation is asynchronous
    (requirement 13), the field list does not exist yet at `201`. The send path therefore polls
    `GET /documents/{id}` until `status` leaves `Created` — at most ten attempts over thirty
    seconds — and then **verifies that the parsed fields are the ones our translation emitted**:
    one signature field per signer, each bound to the right recipient, plus one field per
    signer-owned template field with the expected `required` flag.

    A mismatch is not a warning. A text tag that failed to parse produces a contract with a
    missing signature line that nobody notices until a counterparty cannot sign it, or worse,
    signs a document whose other party never can. On mismatch the send deletes the document
    (requirement 18), leaves the envelope in `draft`, and reports
    `document_fields_not_materialized` naming what was expected and what came back.

    *Observed:* the three tags in the verification document produced exactly three fields —
    `signature` for recipient 1, `signature` and a non-required `text` for recipient 2 — with
    coordinates derived from each tag's position and size, and `:n` correctly yielding
    `required: false`.
39. **Turn is read from `recipients[].status`, not inferred.** *Observed values:* `created`
    before send, then `sent` for the recipient whose turn is open and `waiting` for the rest.
    Convergence maps `waiting` → our `pending`, `sent` → `notified`, and takes `viewed`,
    `signed` and `declined` at face value.
40. **Voiding is delete-then-converge, and the race is resolved in favour of the truth.** The
    order is: call `DELETE`, then re-read. A `404` on the re-read is the expected outcome and
    confirms the void. A `204` followed by a *successful* read is impossible and is treated as a
    provider fault. If the `DELETE` itself returns `404`, the document is already gone — either
    someone deleted it in SignWell's UI or it never committed — and the envelope is voided
    locally with `providerError` set, because our void must not be blocked by their state.

    If the last signer signs between our decision and the `DELETE` landing, the delete still
    succeeds and the completed document is destroyed. This is a real and accepted loss: a void
    is an instruction to stop, the window is milliseconds wide, and the alternative — reading
    first and deleting second — widens the window rather than closing it. The captured
    signatures remain in our own trail, which spec 02 requirement 26 already guarantees.
41. **Our own delete comes back to us as `document_canceled`.** *Observed:* deleting a sent
    document fired a verified `document_canceled` delivery within seconds. The reconciler must
    recognize it as self-inflicted — the envelope is already `voided` locally — and treat it as
    settled rather than converging, because converging would call `fetchState` on a document
    that no longer exists and read the resulting `404` as a provider fault. The notification is
    still recorded, with `outcome = ignored_terminal`.

42. **A voided SignWell envelope has no remote record at all.** Delete is total: `GET` answers
    `404` afterwards. For that envelope our `EnvelopeEvent` chain is therefore not a mirror but
    the **only** record, which is the one case where the decision in the area README — their
    artefact is the record, ours is the journal — inverts. The reconciler must treat `404` on a
    voided envelope as the settled state and stop calling.

## Edge Cases

| # | Situation | Behaviour |
|---|---|---|
| 1 | A sender value contains `{{` | Send aborts with `document_tags_unresolved` naming the offending key. Nothing is created on the provider. |
| 2 | A signer-owned placeholder matches no signer role | Same abort. Spec 01 validation should have caught it; this is the second gate, and it is the one that matters, because the field would be invisible in the PDF. |
| 3 | Two signature blocks carry the same `data-signer-role` | Both emit tags bound to the same recipient. Permitted — one signer may sign in two places. |
| 4 | `createSession` succeeds but the transaction recording `providerRef` fails | An orphan document exists on their side. The next send adopts it by `metadata.envelope_id` (requirement 26); the envelope stays `draft` meanwhile. |
| 5 | A webhook arrives before the send transaction commits | `providerRef` is not in our database yet, so it records `outcome = unknown_ref`. The lazy sync on first read converges it. Nothing is lost, because state is re-fetched rather than applied. |
| 6 | A webhook names a document of another SignWell account | No `providerRef` of ours matches. `unknown_ref`, `200`, counter incremented. |
| 7 | Two `document_completed` deliveries race | Exactly one writes the PDF and the event; the loser's `updateMany` matches zero rows and leaves the stored object alone (TC-04-INT-13). |
| 8 | `document_viewed` fires on every view | Each distinct `event.time` is a distinct `ProviderWebhookEvent`, but convergence is state-based, so `viewed` is written once per signer — spec 02 requirement 17 survives. |
| 9 | The provider reports a signer we do not have | Nothing is written for that recipient and `providerError` is set. We never create an `EnvelopeSigner` from provider data: the signer list is ours. |
| 10 | The provider reports fewer signers than we have | Same — `providerError` set, no rows deleted. |
| 11 | `completed_pdf` returns bytes that are not a PDF | Rejected on the magic-number check, `pdfStatus = pending`, retried. The envelope does not become `completed`. |
| 12 | `completed_pdf` returns a ZIP | `file_format=pdf` is always sent, so this is a provider fault and is treated as case 11. |
| 13 | An admin switches provider while a send is in flight | The send read the organization setting once, at its start, and finishes on that provider. A switch landing mid-send does not divert an envelope already being created on the other side. |
| 14 | A draft created before a provider switch is sent after it | It goes out on the **new** provider: the provider is read at send, not at creation (requirement 1). This is the case TC-04-INT-17 pins. |
| 15 | An admin switches away from SignWell with envelopes in flight | Those envelopes keep reconciling: the adapter is registered whenever it is configured, not when it is selected (backward compatibility 7). |
| 16 | `SIGNWELL_API_KEY` is removed while SignWell envelopes are in flight | The adapter unregisters, reconciliation stops, and the settings screen shows the provider unconfigured. Affected envelopes surface `providerError = provider_unconfigured` on read rather than silently stalling. |
| 17 | Test mode is switched off with test envelopes in flight | `providerTestMode` was written at send, alongside `providerKey`, so those envelopes stay marked as tests forever. Configuration does not relabel history. |
| 18 | A signer opens the link after completion | Spec 02 requirement 25 applies unchanged — read-only view plus download. No provider call is made. |
| 19 | The iframe reports `completed` but no webhook arrives | The page shows our confirmation; the envelope converges on the next read or sweep. A `postMessage` is never written to the database. |
| 20 | A `postMessage` arrives from an unexpected origin | Ignored. The listener checks `event.origin` against the embed host before reading anything. |
| 21 | The provider rate-limits us mid-signing | `signerAccess` fails, the signer sees the retry card, and the token is not consumed. |
| 22 | The circuit breaker is open when a send is attempted | The send fails fast with `provider_unavailable` and the envelope stays `draft` — the same observable outcome as a timeout, without spending a call. |
| 23 | `POST /documents` returns `201` but the document never leaves `Created` | The send's verification poll (requirement 38) times out after thirty seconds, deletes the document, and leaves the envelope in `draft` with `document_fields_not_materialized`. |
| 24 | Text tags parse into the wrong count or the wrong recipient | Same outcome as the row above. The document is deleted rather than left open, because a contract with a missing signature line is not a document anyone should be able to reach. |
| 25 | Void races the last signature | The `DELETE` wins and the completed document is destroyed on their side. Accepted (requirement 40); the captured signatures survive in our own trail. |
| 26 | `DELETE` returns `404` during a void | The document is already gone. The envelope voids locally with `providerError` set — our void is not blocked by their state. |
| 27 | `GET /documents/{id}` returns `404` on a voided envelope | The settled post-delete state. The reconciler stops calling rather than treating it as an error. |
| 28 | `GET /documents/{id}` returns `404` on a **non**-voided envelope | A provider fault, not a state. `providerError` is set and the envelope is left alone — we never infer deletion we did not ask for. |
| 29 | `completed_pdf` returns `404` | Carries no information: an incomplete document and an unknown id answer identically. Status is established from `GET /documents/{id}` first, and a `404` here is retried, never treated as terminal (requirement 17). |
| 30 | A list filter is silently ignored during orphan recovery | Matching is client-side on `metadata.envelope_id`; an unmatched page is skipped, never adopted (requirement 26). |
| 31 | `event.time` is far from now | A skewed time produces a different hash and fails verification. A *correct* hash over a skewed time is indistinguishable from a delayed delivery, and convergence makes both harmless. |

## Data Model

Every change is additive: new nullable columns, new columns with defaults, one new table, new enum
values. No renames, no drops, no new `NOT NULL` on an existing table.

### Organization (extended)

| Field | Type | Description |
|---|---|---|
| `signatureProviderKey` | `String @default("internal")` | Provider for **new** envelopes. Existing rows default to today's behaviour. |
| `signatureProviderSetAt` | `DateTime?` | When it was last changed; shown on the settings screen. |
| `signatureProviderSetBy` | `String?` | FK → `Account`, `onDelete: SetNull`. |

### Envelope (extended)

| Field | Type | Description |
|---|---|---|
| `providerKey` | `String @default("internal")` | **Exists.** A display default while the envelope is a draft; written for real at send and never changed after (invariant 7). |
| `providerRef` | `String @default("")` | **Exists.** SignWell document id. |
| `providerTestMode` | `Boolean @default(false)` | Written at send with `providerKey`, and never read from config at display time — a config change must not relabel history. |
| `providerStatus` | `String?` | The provider's own status string, verbatim (`"Sent"`, `"Pending"`, `"Completed"`…). For support, never for logic. |
| `providerSyncedAt` | `DateTime?` | Drives lazy convergence (requirement 24a). |
| `providerError` | `String?` | Last provider-side error, cleared on the next successful sync. |

### EnvelopeSigner (extended)

| Field | Type | Description |
|---|---|---|
| `providerRef` | `String @default("")` | SignWell `recipients[].id`. Empty for `internal`. |

`@@unique([envelopeId, providerRef])` is **not** added — an empty string would collide across the
internal provider's signers. Uniqueness is enforced in the reconciler instead, which is the only
writer.

### ProviderWebhookEvent (new)

| Field | Type | Description |
|---|---|---|
| `id` | `String @id @default(uuid())` | |
| `providerKey` | `String` | |
| `providerRef` | `String` | The document id the notification named. |
| `envelopeId` | `String?` | FK → `Envelope`, `onDelete: SetNull`. Null when we do not recognize the reference. |
| `eventType` | `String` | SignWell's string, stored raw. |
| `eventTime` | `DateTime` | From the payload. |
| `relatedSignerEmail` | `String @default("")` | Normalized lowercase. |
| `hashVerified` | `Boolean` | |
| `payload` | `Json` | The body as received, redacted per requirement 35, for forensics. Never read by logic. |
| `processedAt` | `DateTime?` | Null until the reconciler has converged. |
| `outcome` | `String?` | `converged` \| `ignored_terminal` \| `unknown_ref` \| `error`. |
| `receivedAt` | `DateTime @default(now())` | |

`@@unique([providerKey, providerRef, eventType, eventTime, relatedSignerEmail])`
`@@index([processedAt])`

### New Enums

- **`EnvelopeEventType`** gains `provider_synced`, `provider_error`. Adding values to a Prisma
  enum is additive; existing rows are untouched.

### New Capabilities (extend `Capability` enum)

- `ViewSigningSettings` (admin, manager)
- `ManageSigningSettings` (admin)

## State Machine

The envelope state machine of spec 02 is **unchanged**. What changes is who causes a transition.

```
  internal:                            signwell:

  our controller                       SignWell
       │                                   │
       ▼                                   ▼  webhook (doorbell)
  transaction ──► EnvelopeEvent       reconciler ──► fetchState() ──► converge
                                                          │
                                            ┌─────────────┴─────────────┐
                                            │                           │
                                       our rows differ            our rows agree
                                            │                           │
                                     transaction ──► EnvelopeEvent   no-op
```

Invariants, extending spec 02's six:

7. `Envelope.providerKey` is written at send, in the transaction that sets `status = sent`,
   and never changes after that. No code path updates it on a sent, completed, declined, voided
   or expired envelope. On a draft it is a default the send overwrites.
8. Remote state is only ever written by the reconciler, and only from a `fetchState` response.
   No handler writes envelope or signer state from a notification body.
9. Convergence never moves an envelope out of a terminal state. A late `document_signed` for a
   voided envelope is recorded as a `ProviderWebhookEvent` with `outcome = ignored_terminal` and
   changes nothing.
10. For `completedDocument: 'provider'`, the bytes are in S3 before `status = completed` commits.
11. A provider call never runs inside a database transaction. Every adapter method is called
    before or after one, never within — a five-attempt backoff inside a transaction would hold a
    row lock for a minute.

## Infrastructure

Small, but not nothing: this spec adds the product's second unauthenticated route, its first
outbound dependency in the request path, and a secret that can create and destroy contracts.
The AWS topology itself is spec 02's and does not change.

### Configuration

| Variable | Where the value lives | Notes |
|---|---|---|
| `SIGNWELL_API_KEY` | SSM Parameter Store, `SecureString`, injected by the ECS task definition | The store the repository already uses for `SESSION_SECRET`, `INTERNAL_TASK_SECRET` and `TEST_FIXTURE_SECRET` — spec 02 records the choice and its reason, and a second secret store for two values would mean a second IAM policy shape for nothing. Terraform creates the parameter and the policy that reads it, never the value, so no secret reaches the state file. Rotating it is an out-of-band write plus a task restart. |
| `SIGNWELL_API_APPLICATION_ID` | Plain task environment | Not a secret: it names a branding profile. |
| `SIGNWELL_TEST_MODE` | Plain task environment | Boolean. Malformed values throw at boot (validation rule 6) rather than defaulting, because defaulting to `false` means real money and real contracts on a typo. |
| `SIGNWELL_WEBHOOK_SECRET` | SSM Parameter Store, `SecureString` | The webhook id. Treated as a secret because it is the only input to hash verification, while being an identifier `GET /api/v1/hooks` will hand to any holder of the API key — see requirement 20. |
| `PROVIDER_SYNC_STALE_SECONDS` | Plain task environment | Default 120. Behaviour-affecting, so it is identical in both environments. |

### What differs between environments

A contract, not a description: anything differing beyond this table is a bug.

| Input | `dev` | `prod` |
|---|---|---|
| `SIGNWELL_API_KEY` | The sandbox account's key | The production account's key |
| `SIGNWELL_TEST_MODE` | `true` | `true` **for this release** — going live is a deliberate later change with a legal review of the counterparty-facing copy, not a side effect of deploying |
| Webhook `callback_url` | `https://{dev host}/api/webhooks/signwell` | `https://{prod host}/api/webhooks/signwell` |
| `SIGNWELL_API_APPLICATION_ID` | The dev branding profile | The prod branding profile |

Everything behaviour-affecting — the stale threshold, retry counts, the circuit-breaker window,
the polling bound in requirement 38 — is identical, so `dev` remains a test of `prod`.

### Egress and the request path

The API makes outbound HTTPS calls to `www.signwell.com` while serving requests, which it did
not do before. Two consequences carried in Blast Radius and repeated here because they are
deployment concerns: a hard 10s timeout per call with a circuit breaker, and invariant 11 —
never inside a transaction.

The security group needs egress on 443. On Fargate in private subnets that is the NAT gateway
already provisioned in spec 02; no new network resource is created.

### The webhook route

`POST /api/webhooks/signwell` must be reachable from the public internet, which is the one
genuinely new exposure. It sits on the same load balancer as the rest of the API, on a path the
listener rule allows without a session, and it is rate limited (requirement 25).

**Lead time, not a deploy step:** the dev stand has no public address today — the area README
records the same obstacle for SNS delivery notifications, which reach SNS and go no further. Until
one exists, the webhook is registered against a developer tunnel and the deployed environments run
on convergence alone. That is a degradation in timeliness and not in correctness (requirement 24),
which is exactly why the spec was written that way.

A registration outlives the address it names, and a delivery carries live signing URLs. So a
registration is deleted the moment its callback address stops being ours, and the signing-settings
connection check reads `GET /api/v1/hooks` so a registration pointing somewhere unexpected is
visible on a screen rather than only in someone's memory.

### Local development and tests

Nothing in the suite touches SignWell. Integration tests stub the HTTP boundary and replay the
captured deliveries in `apps/api/test/signwell-webhook-fixtures.ts`; the E2E suite runs against
the internal provider except where a stubbed provider is explicitly seeded. A test that needed
the network would be slower, flakier, unparallelizable across Jest workers sharing one webhook
registration, and would spend a create budget of ten documents a minute — every property the
repository's test rules exist to avoid.

## Screens

### Signing settings — `/org/{orgId}/settings/signing`

```
┌────────────────────────────────────────────────────────────────────────┐
│  Settings › Signing                                                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Signature provider                                                    │
│  How documents from this organization are signed. Changing this        │
│  affects new documents only.                                           │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ ◉  Built-in                                            Active    │  │
│  │    Signed in Teammerly. We issue the link, capture the           │  │
│  │    signature, and produce the certificate.                       │  │
│  ├──────────────────────────────────────────────────────────────────┤  │
│  │ ○  SignWell                                     ⚠ Test mode      │  │
│  │    Signed in Teammerly through SignWell's embedded widget.       │  │
│  │    SignWell produces the signed PDF and its audit page.          │  │
│  │    Connection: ✓ reachable · Webhook: ✓ registered               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ⚠ Test mode is on. Documents signed through SignWell in test mode     │
│    carry no legal weight and are marked as tests everywhere they       │
│    appear.                                                             │
│                                                                        │
│  Last changed 12 Aug 2026 by Pat Owner                                 │
│                                        [ Save provider ]               │
└────────────────────────────────────────────────────────────────────────┘
```

Unconfigured provider:

```
  │ ○  SignWell                                        Not configured │
  │    Missing: API key, API application id.                          │
  │    Set them in the environment, then reload this page.            │
```

Change confirmation:

```
┌──────────────────────────────────────────────────────────┐
│  Change signature provider                               │
│                                                          │
│  New documents will be signed through SignWell.          │
│                                                          │
│  3 documents are currently in flight. They stay with     │
│  the built-in provider until they complete, decline,     │
│  or expire. Nothing about them changes.                  │
│                                                          │
│  ☐ I understand                                          │
│                          [ Cancel ]  [ Change provider ] │
└──────────────────────────────────────────────────────────┘
```

### Signing page — `/sign/{token}`, SignWell variant

Our shell, our token, our access rules. SignWell owns only the widget.

```
┌────────────────────────────────────────────────────────────────────────┐
│  Consulting Agreement — Acme Inc                    ⚠ TEST DOCUMENT    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │                                                              │     │
│   │              < SignWell embedded signing iframe >            │     │
│   │                                                              │     │
│   │   document, fields, and signature capture rendered by        │     │
│   │   SignWell at embedded_signing_url                           │     │
│   │                                                              │     │
│   └──────────────────────────────────────────────────────────────┘     │
│                                                                        │
│   Signed through SignWell on behalf of Acme Inc.                       │
└────────────────────────────────────────────────────────────────────────┘
```

Loading, before the URL is fetched:

```
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │     │
│   │  Preparing your document…                                    │     │
│   └──────────────────────────────────────────────────────────────┘     │
```

Provider unreachable:

```
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │  We can't open this document right now                       │     │
│   │  Nothing has been lost — your link still works. Try again    │     │
│   │  in a few minutes.                                [ Retry ]  │     │
│   └──────────────────────────────────────────────────────────────┘     │
```

### Envelope detail — provider row

```
│  Status      Completed · 14 Aug 2026                                   │
│  Signed via  SignWell  ⚠ test mode                                     │
│  Document    Consulting Agreement.pdf  (includes SignWell audit page)  │
│              [ Download ]                                              │
```

## Flows

### Flow: Admin switches the organization to SignWell

1. Admin opens `/org/{orgId}/settings/signing`.
2. `GET /api/organizations/{orgId}/settings/signing` returns the current provider and, for each
   available provider, whether it is configured and reachable.
3. Admin selects SignWell and presses **Save provider**.
4. The confirmation modal names the in-flight count. Admin ticks *I understand*, confirms.
5. `PUT …/settings/signing` writes `signatureProviderKey`, `signatureProviderSetAt`,
   `signatureProviderSetBy`.
6. Toast: "New documents will be signed through SignWell." Existing envelopes are untouched.

### Flow: Sender sends an envelope under SignWell

1. Sender fills and sends as spec 02 describes; nothing on the fill form changes.
2. The service freezes `renderedHtml` and computes `documentHash` — unchanged from spec 02.
3. The renderer translates signer-owned placeholders and signature blocks into SignWell text tags
   and asserts no other `{{…}}` survives (requirement 14).
4. `PdfRenderer` produces the PDF from the translated HTML.
5. `createSession` posts the document with `test_mode`, `embedded_signing`, `apply_signing_order`,
   and `metadata.envelope_id`.
6. On success, `providerKey`, `providerRef`, each signer's `providerRef`, and `providerTestMode`
   are written in the same transaction that flips the envelope to `sent` and records the `sent`
   event.
7. Our SES invitation goes to signer 1 with a link to our `/sign/{token}`.

### Flow: First signer signs

1. Signer opens `/sign/{token}`. Our token is validated by our own code; a `viewed` event is
   recorded once, as spec 02 requires.
2. `signerAccess` fetches a fresh `embedded_signing_url` for this recipient.
3. The page renders our shell with the URL in an iframe.
4. The signer completes the fields and signs inside the widget.
5. The `SignWellEmbed` `completed` event fires in the parent page; we show our own confirmation
   and **do not** treat the message as state — a `postMessage` is a hint from a frame, not a fact.
6. SignWell POSTs `document_signed` to our webhook.
7. The reconciler verifies the hash, records the notification, calls `fetchState`, sees signer 1
   signed and signer 2 pending, converges, writes the `signed` event, and moves the envelope to
   `partially_signed`.
8. Because `signingOrder: 'provider'`, SignWell has already started signer 2's turn; our send path
   issues no second invitation of its own, but our SES mail goes out with signer 2's `/sign` link.

### Flow: Envelope completes

1. Last signer signs; SignWell POSTs `document_completed`.
2. The reconciler re-fetches, sees `Completed`.
3. `completedDocument` downloads `completed_pdf?audit_page=true`.
4. Bytes are hashed and written to `signed/{orgId}/{envelopeId}/{hash}.pdf` — content-addressed
   and write-once, as spec 02 fixes it.
5. One transaction: `status = completed`, `signedPdfKey`, `signedPdfHash`, `pdfStatus = ready`,
   and the `completed` event.
6. Completion mail goes out through our SES, as under the internal provider.

### Alt Flow: Text tags unresolved (branches from send, step 3)

The assertion fails. No SignWell document is created, the envelope stays `draft`, and the sender
sees "This document still contains unresolved placeholders and cannot be sent." with the offending
keys listed. Nothing was spent and nothing is half-created.

### Alt Flow: `createSession` fails without a response (branches from send, step 5)

The client lists documents by `metadata.envelope_id`. If one exists, it is adopted and the flow
continues at step 6. If the list call also fails, the send fails with "Signing service is
unavailable. Nothing was sent — try again shortly." and the envelope stays `draft`.

### Alt Flow: Webhook never arrives (branches from any signing step)

Nothing breaks. The next read of the envelope older than `PROVIDER_SYNC_STALE_SECONDS` converges
it; the hourly sweep converges it regardless of whether anyone looks. The only cost is that the
sender sees the new status later than they would have.

### Alt Flow: Webhook arrives with a bad hash

`401`, empty body, nothing recorded beyond a metric. We do not tell a caller whether the reference
was known.

### Alt Flow: Completed PDF download fails (branches from completion, step 3)

`pdfStatus = pending`, `providerError` set, retried by the sweep with backoff. The envelope is
**not** marked completed until the bytes are ours — under this provider the PDF is the record, not
a derived artefact, so spec 02's "signatures are the asset, the PDF is derived" reasoning does not
carry over and is deliberately inverted here.

### Alt Flow: Signer declines in the widget

The widget reports `declined`; the webhook follows. The reconciler converges to `declined`, records
the reason from `fetchState` (never from the `postMessage`), invalidates our outstanding tokens,
and notifies the sender — the same observable outcome as spec 02 requirement 26.

### Alt Flow: Network/server error (any mutation)

The settings screen keeps the admin's selection, shows "Something went wrong. Your change was not
saved." and leaves the stored provider untouched. The signing page shows the retry card above.

## API Contracts

### GET /api/organizations/{orgId}/settings/signing

`SessionGuard`, `OrgScopeGuard`, `ViewSigningSettings`.

```json
{
  "current": "internal",
  "setAt": "2026-08-12T09:14:00.000Z",
  "setBy": { "id": "…", "name": "Pat Owner" },
  "inFlightCount": 3,
  "providers": [
    { "key": "internal", "name": "Built-in", "configured": true, "reachable": true, "testMode": false },
    {
      "key": "signwell",
      "name": "SignWell",
      "configured": true,
      "reachable": true,
      "testMode": true,
      "webhookRegistered": true
    }
  ]
}
```

**Errors:** `401` no session · `404` foreign `orgId` (never `403`) · `403`
`{"message":"You do not have access to this resource"}` for `user`/`viewer`.

### PUT /api/organizations/{orgId}/settings/signing

`SessionGuard`, `OrgScopeGuard`, `ManageSigningSettings`.

```json
{ "provider": "signwell", "confirmed": true }
```

`200 { "current": "signwell", "setAt": "…" }`

**Errors:**
- `400 {"errors":{"provider":"Unknown signature provider"}}`
- `400 {"errors":{"provider":"SignWell is not configured. Missing: API key."}}`
- `409 {"message":"Confirm the change before saving"}` when `confirmed` is not `true`
- `403` for manager, user, viewer · `404` foreign `orgId` · `401` no session

### POST /api/webhooks/signwell

**Public, session-less, no CSRF, no cookies.** Guarded by hash verification only. Rate limited to
600 requests per minute per source, above which it answers `429` — SignWell's own send rate is far
below this, so the limit only ever bites on abuse.

Request: SignWell's payload, verbatim.

```json
{
  "event": { "hash": "…", "time": 1787919224, "type": "document_completed",
             "related_signer": { "email": "sam@acme.com", "name": "Sam Signer" } },
  "data": { "object": { "id": "…", "status": "Completed", "metadata": { "envelope_id": "…" }, "…": "…" },
            "account_id": "…" }
}
```

`200 {"received":true}` — for every verified request, including an unknown `providerRef`.

**Errors:**
- `401` empty body — hash missing or does not verify
- `400 {"received":false}` — body is not JSON or has no `event.type`
- `429` empty body — rate limit

Non-leakage: the `200` body is byte-identical whether the document is ours, another account's, or
unknown. There is no timing branch — the reference lookup happens after the response is queued,
on the job queue.

### GET /api/sign/{token} (extended)

Spec 02's contract, with one added field:

```json
{
  "surface": "embedded",
  "embeddedSigningUrl": "https://www.signwell.com/embedded/…",
  "testMode": true,
  "…": "as spec 02"
}
```

`surface: "ours"` omits `embeddedSigningUrl` and returns spec 02's payload unchanged. The URL is
fetched per request and never cached (requirement 6).

**Errors:** as spec 02, plus `503 {"message":"Signing service is unavailable"}` when the provider
cannot be reached — deliberately distinct from an invalid token, because the signer's link is
still good and telling them otherwise would be wrong.

## Validation Rules

1. `provider` must be a known key — "Unknown signature provider".
2. `provider` must be configured — "SignWell is not configured. Missing: {list}."
3. `confirmed` must be `true` — "Confirm the change before saving".
4. At send, no unresolved `{{…}}` may remain — "This document still contains unresolved
   placeholders and cannot be sent: {keys}".
5. Every `EnvelopeSigner` must have a non-empty name and email before a remote session is created
   — "Every signer needs a name and an email address" (spec 02's rule, restated because SignWell
   rejects the document rather than accepting a blank recipient).
6. `SIGNWELL_TEST_MODE` must parse as a boolean at boot — a malformed value throws at startup
   rather than defaulting, because defaulting to `false` would mean spending real money and
   sending real contracts on a typo.

The client validates 1 and 3 for immediacy. The server re-validates all six on every request; 4, 5
and 6 exist only on the server.

## Error Messages

| Context | Message |
|---|---|
| Unknown provider key | Unknown signature provider |
| Provider not configured | SignWell is not configured. Missing: {list}. |
| Change not confirmed | Confirm the change before saving |
| Settings saved | New documents will be signed through {provider}. |
| Settings save failed | Something went wrong. Your change was not saved. |
| Unresolved placeholders at send | This document still contains unresolved placeholders and cannot be sent: {keys} |
| Signer incomplete at send | Every signer needs a name and an email address |
| Provider unavailable at send | Signing service is unavailable. Nothing was sent — try again shortly. |
| Provider unavailable on signing page | We can't open this document right now. Nothing has been lost — your link still works. Try again in a few minutes. |
| Test-mode banner (signing page) | TEST DOCUMENT — this signature has no legal effect. |
| Test-mode notice (settings) | Test mode is on. Documents signed through SignWell in test mode carry no legal weight and are marked as tests everywhere they appear. |
| In-flight notice (change modal) | {n} documents are currently in flight. They stay with the built-in provider until they complete, decline, or expire. Nothing about them changes. |
| Provider unavailable on the signing API | Signing service is unavailable |
| Signing page, before the widget loads | Preparing your document… |
| Signing page attribution | Signed through SignWell on behalf of {organization}. |
| Envelope detail, test document | Test document — no legal effect |
| Provider unconfigured while envelopes are in flight | This document is waiting on a signing provider that is no longer configured. |
| Permission denied | You do not have access to this resource |

All of these live in `packages/validation` so web and API cannot disagree.

## UI Description

| Component | `data-testid` | Notes |
|---|---|---|
| Settings page root | `signing-settings` | |
| Provider option | `signing-provider-option-{key}` | Radio row. Disabled when unconfigured. |
| Provider status | `signing-provider-status-{key}` | "Active" / "Not configured" / "⚠ Test mode". |
| Configuration gap | `signing-provider-missing-{key}` | The list of what is absent. |
| Save button | `signing-provider-save` | Never disabled for validation. |
| Change modal | `signing-change-modal` | |
| In-flight count | `signing-change-inflight` | |
| Confirm checkbox | `signing-change-confirm` | Gates the confirm button — a deliberate confirmation, not validation. |
| Confirm button | `signing-change-submit` | Disabled until the checkbox is ticked. |
| Saved toast | `toast-signing-provider-saved` | |
| Test-mode banner | `signing-test-mode-banner` | Settings page. |
| Embedded frame | `sign-embedded-frame` | The iframe on `/sign/{token}`. |
| Embedded loading | `sign-embedded-loading` | |
| Embedded error | `sign-embedded-error` | With `sign-embedded-retry`. |
| Signing test badge | `sign-test-badge` | On `/sign/{token}` when `testMode`. |
| Detail provider row | `envelope-provider` | "Signed via SignWell". |
| Detail test badge | `envelope-test-badge` | |

| State | Behavior |
|---|---|
| Loading (settings) | Skeleton rows; no provider is pre-selected until the response lands, so a slow network cannot show "Built-in" for an organization on SignWell. |
| Saving | Save button shows a spinner and is disabled — an in-flight guard, which is the one case `CLAUDE.md` permits. |
| Unconfigured provider | Row visible, radio disabled, gap named. Deliberately not hidden: the admin needs to know the option exists. |
| Manager viewing settings | Page renders read-only; the save button is not rendered at all. |
| `user` / `viewer` | The Settings nav item is not rendered and the route answers 404. |
| Embedded loading | Skeleton inside the frame's box, so the page does not reflow when the iframe arrives. |
| Embedded error | Retry card. The token is not consumed and the signer is told so. |
| Terminal envelope | The frame is replaced by the read-only view from spec 02 requirement 25. |

## Required data-testid Attributes

**Signing settings:** `signing-settings`, `signing-provider-option-internal`,
`signing-provider-option-signwell`, `signing-provider-status-signwell`, `signing-provider-save`, `signing-change-modal`,
`signing-change-inflight`, `signing-change-confirm`, `signing-change-submit`,
`toast-signing-provider-saved`, `signing-test-mode-banner`

**Signing page:** `sign-embedded-frame`, `sign-embedded-loading`, `sign-embedded-error`,
`sign-embedded-retry`, `sign-test-badge`, `sign-signature-canvas` (asserted absent under SignWell)

**Envelope detail:** `envelope-provider`, `envelope-test-badge`, `envelope-download-button`,
`envelope-certificate-link` (asserted absent under SignWell)

**Application shell:** `nav-settings` (asserted absent for `user` and `viewer`)

`signing-provider-missing-{key}` is deliberately **not** in this list. The unconfigured state is a
server decision, proved at integration by TC-04-INT-18; asserting it again in a browser would
spend a whole E2E case re-reading a string the API already decided.

## Blast Radius

| Area | What breaks on contact | Mitigation |
|---|---|---|
| **The in-house engine** | Rewriting `InternalSignatureProvider` onto a new port touches a shipped, working signature path. A regression here breaks executed contracts, not a screen. | Requirement 10: spec 02's suite must pass **unedited**. Any test that needs changing is a defect of this work. |
| **`envelopes.service.ts`** | The send path gains provider branching, and it is already the largest service in the area. | Branch on `capabilities`, never on `providerKey`; the switch exists in one place. |
| **`envelope-completion.ts`** | Two sources of PDF bytes instead of one. | The content-addressed key and the `updateMany` guard are unchanged; only the byte source is chosen earlier. |
| **`/sign/{token}`** | The route now has two bodies. Its guards, token validation and `viewed` recording stay common. | `surface` is decided server-side and the client renders one of two bodies; the access rules are not duplicated. |
| **The event chain** | A second writer (the reconciler) joins the controllers. | It writes through `EnvelopeEventsService` like everything else, so invariant 4 holds by construction. |
| **Public attack surface** | A new unauthenticated POST endpoint. | Hash verification, a replay store, a rate limit, no state written from the body, and a response that is identical for known and unknown references. |
| **Outbound network from the API** | The API now makes outbound HTTPS calls in the request path. A hung provider could exhaust the request pool. | Hard 10s timeout per call, five attempts with backoff **outside** any transaction (invariant 11), and a circuit breaker that fails fast for 60s after five consecutive failures. |
| **Secrets** | An API key that can create and destroy real contracts. | SSM `SecureString`, injected by ECS — the store this repository already uses. Terraform creates the parameter and the IAM policy, never the value, so no secret reaches the state file. |
| **Cost and rate limits** | Test mode allows 20 requests/minute. `signerAccess` on every page open is the hot path. | Requirement 16 decides the wrong-turn case from our own rows. The circuit breaker prevents a retry storm from consuming the budget. |
| **Operations** | A dropped webhook is invisible without instrumentation. | `providerSyncedAt` age is a metric; the sweep's converged/failed counts are metrics; `unknown_ref` has its own counter. |
| **A stale webhook registration** | A registration outlives the address it names. Deliveries carry live `embedded_signing_url` values, so once a development tunnel dies and its hostname is reassigned — which free tunnelling services do by design — SignWell keeps posting working signing links to whoever now answers there. That is not a metadata leak; it is the ability to sign as the recipient. | A registration is deleted the moment its callback address stops being ours, and a development registration is never left standing between sessions. Deployed environments register a hostname we own. `GET /api/v1/hooks` is checked as part of the signing-settings connection check (requirement 31), so a registration pointing somewhere unexpected is visible on the screen rather than only in someone's memory. |

## Backward Compatibility

1. **Every existing envelope keeps working, untouched.** `Envelope.providerKey` already defaults to
   `internal` on every row in the database. *Mechanism:* the column exists today with that default;
   this spec adds no backfill.
2. **Every existing organization keeps the in-house engine.** *Mechanism:*
   `Organization.signatureProviderKey String @default("internal")` — a new column with a default,
   so existing rows read as `internal` without being written.
3. **The migration is additive and safe in either deploy order.** New columns with defaults, one
   new table, two new enum values. No renames, no drops, no new `NOT NULL`. *Mechanism:* the
   repository rule that `make deploy-<env>` rolls services out **before** `prisma migrate deploy`
   is only sound for additive migrations, and this one is additive — new code tolerates the old
   schema because every added column has a default it can assume.
4. **A code rollback needs no database rollback.** The previous release ignores the new columns
   entirely. *Mechanism:* nothing in the old code reads `providerTestMode`, `providerStatus`,
   `providerSyncedAt`, or `ProviderWebhookEvent`; a SignWell envelope rolled back would stall
   rather than corrupt — see Known Gaps.
5. **Spec 02's observable behaviour is unchanged for `internal` envelopes.** *Mechanism:*
   requirement 10 — the existing suite passes unedited, which is a checkable statement rather than
   an intention.
6. **Switching an organization's provider never touches an in-flight envelope.** *Mechanism:*
   invariant 7 — `providerKey` is written once at creation and no code path updates it.
7. **Turning the SignWell provider off cannot orphan a document.** *Mechanism:* the adapter is
   registered whenever its configuration is present, independently of which provider the
   organization has selected, so envelopes already on SignWell keep reconciling after an admin
   switches back.

## Out of Scope

- **Live (non-test) mode.** This release ships `test_mode: true`. Going live is a configuration
  change plus a legal review of the counterparty-facing copy, not more code — but it is not this
  spec's claim to have done it.
- **SignWell-hosted signing.** The embedded widget is the only surface; `signing_url` is never used.
- **SignWell templates.** Our templates stay the single source of truth. `createdocumentfromtemplate`
  would put field placement in their editor, outside spec 01's version immutability.
- **Migrating an in-flight envelope between providers.** Deliberately impossible (invariant 7).
- **Bulk send, SMS delivery, passcodes, attachment requests, conditional rules, reassignment.**
- **NOM-151 (Mexico) certificates.**
- **Per-envelope provider choice.** The setting is organizational. A sender choosing per document
  would need a reason to choose, and there is none the product can express yet.
- **Replacing our SES invitation with SignWell's.** Requirement 12 explains why.

## Known Gaps

| Gap | Why it is acceptable now | What closes it |
|---|---|---|
| **The webhook hash authenticates almost nothing.** Verified to work as documented, and verified to be the only signal there is: `type@time` keyed by the webhook id, carried in the body, with no signature header. | We never write state from a body: every notification triggers a re-fetch (requirement 21), so a forged or replayed body can at worst cause an unnecessary API call. | SignWell signing the request body with a real shared secret. Until then, treat the endpoint as public. |
| **No event id, so dedupe is a composite key.** Two genuinely distinct events of the same type, for the same signer, in the same second would collapse into one. | Convergence is idempotent and state-based, so collapsing two notifications loses nothing — the second would have re-read the same state. | An event id from the provider. |
| **Text tags remain in the document.** SignWell does not strip them; we hide them by painting them the background colour. | Our templates are our own HTML with a known white page background. | Server-side tag stripping by the provider, or field placement by coordinates once we can compute them. |
| **Two evidence formats coexist in one organization.** An envelope signed before the switch has our Certificate of Completion; one after has SignWell's audit page. | Both are complete records; neither is diminished by the other existing. The envelope detail names which one it is. | Nothing, by design — history is not rewritten. |
| **A rolled-back release stalls SignWell envelopes.** The old code has no reconciler, so an in-flight SignWell envelope stops advancing until the roll-forward. | No data is lost or corrupted; the sweep converges everything on the next deploy. | Keeping the reconciler in the previous release before enabling the provider. |
| **Test-mode documents may be purged on SignWell's side.** | We download and store the completed PDF ourselves (requirement 27), so our copy is durable. | Nothing — this is the correct arrangement regardless. |
| **`documentHash` and `signedPdfHash` describe different documents.** Ours is the HTML we sent; theirs is the PDF they produced. Neither verifies the other. | Requirement 29 states it rather than implying a chain of custody that does not exist. | A provider that returns a hash of the input it signed. |
| **SignWell has no cancel endpoint**, so our void is a hard delete and the remote record of a voided envelope is destroyed with it. | A voided envelope has no executed artefact to lose, and leaving the document open would leave a counterparty holding a working signing URL for a contract we consider void. Our own chain keeps the full history of the attempt. | A cancel or void route from SignWell. Requirement 18 becomes two lines the day it exists. |
| **Whether `embedded_signing_url` ever expires** is still unknown. It was stable across calls minutes apart, but no long-horizon test was run. | We re-fetch on every page open regardless (requirement 6), so an expiry we do not know about cannot reach a signer. | A long-lived test envelope, or a statement from SignWell. |
| **How long `completed_pdf` stays retrievable** is untested — it needs a document that actually completed, which needs a signer. | Requirement 27 downloads it at completion and stores it in our bucket, so retention on their side is not load-bearing. | Driving one envelope to completion end to end. |
| **Whether a `waiting` recipient can sign out of turn** using the URL they were handed at creation is untested. | Our own row gates the page (requirement 16), so the URL is never given to a signer whose turn is closed. | Driving their page directly with the second recipient's link. |
| **No deployed environment has a public address SignWell can reach**, so the webhook is registered per developer tunnel rather than per environment. | Requirement 24 makes the webhook an accelerator, never a dependency: everything converges from the sweep and from lazy reads, so an environment with no reachable address is slower, not wrong. Registration is per `callback_url`, so a tunnel and a deployed stand can hold separate registrations without interfering. | A public address for the dev API. |
| **Only `document_created` and `document_sent` have been captured live.** The signing events — `document_viewed`, `document_signed`, `document_completed`, `document_declined` — have not, because they need a human in the widget. | Their envelope shape is fixed by the two that were captured, and convergence reads state from the API regardless of which event rang the bell, so an unexpected event type costs nothing. | Driving one envelope to completion by hand. |

## Acceptance Criteria

Observable statements, checkable without reading the implementation.

1. An organization created before this release signs exactly as it did before, with no
   administrator action and no row written to it.
2. Spec 02's integration and E2E suites pass **unedited** against the rewritten internal provider.
3. An admin can move an organization to SignWell in one screen, and is told how many documents
   stay behind before confirming.
4. A manager can see which provider the organization uses and cannot change it. A `user` cannot
   reach the screen and has no navigation entry to it.
5. A document sent under SignWell is signed without the counterparty leaving our origin, and the
   invitation they received came from our address.
6. Every document signed in test mode is marked as a test on the signing page and on the envelope
   detail, and stays marked after test mode is switched off.
7. Discarding every webhook delivery for an envelope changes its final state not at all — only how
   soon that state appears.
8. A completed SignWell envelope has its PDF, including SignWell's audit page, in our own bucket,
   and no Certificate of Completion of ours.
9. No table in the database holds a contract field value that arrived from the provider.
10. Replaying any captured webhook body any number of times leaves the database byte-identical
    after the first.
11. A verified webhook naming a document we do not hold is answered identically to one we do.
12. No provider call is made while a database transaction is open.

## Test Cases

Test levels follow the repository rule: a server rule is proved at integration even when a screen
shows it, and E2E is spent only where the assertion is out of reach of an API test.

### TC-04-UNIT-01: Text-tag translation replaces signer placeholders and nothing else

- **Level:** Unit
- **Preconditions:** frozen HTML with a sender-substituted value, a signer-owned `{{signer_note}}`, and a signature block carrying `data-signer-role="contractor"`.
- **Steps:** 1. Translate for SignWell with two signers.
- **Expected Result:** 1. `{{signer_note}}` becomes a text tag bound to the contractor's index. 2. The signature block emits a signature tag. 3. The sender-substituted text is byte-identical to the input. 4. No other `{{` remains.

### TC-04-UNIT-02: A stray placeholder aborts translation

- **Level:** Unit
- **Preconditions:** frozen HTML containing `{{unbound_key}}` that belongs to no signer and no signature block.
- **Steps:** 1. Translate.
- **Expected Result:** 1. Throws `document_tags_unresolved`. 2. The error names `unbound_key`.

### TC-04-UNIT-03: A sender value containing braces aborts translation

- **Level:** Unit
- **Preconditions:** a sender field whose value is the literal text `rate is {{tbd}}`.
- **Steps:** 1. Freeze and translate.
- **Expected Result:** 1. Throws `document_tags_unresolved` naming `tbd`. This is the case that would otherwise put an invisible extra field on a signed contract.

### TC-04-UNIT-04: Webhook hash verification, against a hash SignWell produced

- **Level:** Unit
- **Preconditions:** the three deliveries in `apps/api/test/signwell-webhook-fixtures.ts` and their `WEBHOOK_ID`.
- **Steps:** 1. Verify each fixture with `WEBHOOK_ID`. 2. Verify with a different id. 3. Verify with the right id but a mutated `event.time`.
- **Expected Result:** 1. All three accept — this is the case that proves our HMAC agrees with theirs rather than with itself. 2. Rejects. 3. Rejects. 4. Comparison is timing-safe.

### TC-04-UNIT-06: Redaction strips signing URLs and field values from a real payload

- **Level:** Unit
- **Preconditions:** the `documentSent` fixture, which carries an `embedded_signing_url` per recipient and a `value` per field.
- **Steps:** 1. Redact it for storage.
- **Expected Result:** 1. No `embedded_signing_url` survives. 2. No `fields[].value` survives; each field keeps its `api_id`. 3. `metadata.envelope_id` and `metadata.organization_id` survive — they are ours and are what correlates the row. 4. `event.hash`, `event.time` and `event.type` survive, so a stored row can still be re-verified. 5. Redacting is total: the result contains no substring of any redacted value.

### TC-04-UNIT-05: Capability record decides the branch, not the key

- **Level:** Unit
- **Preconditions:** a stub provider with `key = "stub"` and SignWell's capability record.
- **Steps:** 1. Ask the send path which mail to send and which surface to serve.
- **Expected Result:** 1. Our SES mail and the embedded surface are chosen. 2. No branch anywhere in the service compares against the literal `"signwell"`.

### TC-04-INT-01: Send creates a SignWell document and pins its reference

- **Level:** Integration
- **Preconditions:** organization on `signwell`; a published template; two named signers; the SignWell client stubbed at the HTTP boundary.
- **Steps:** 1. `POST …/envelopes/{id}/send`.
- **Expected Result:** 1. The outgoing body carries `test_mode: true`, `embedded_signing: true`, `apply_signing_order: true`, `reminders: false`, and `metadata.envelope_id`. 2. `providerKey = "signwell"`, `providerRef` is their document id, each signer's `providerRef` is their recipient id, `providerTestMode = true`. 3. Exactly one `sent` event. 4. Our SES invitation went to signer 1 with a `/sign/` link, not a SignWell link.

### TC-04-INT-02: A provider failure at send leaves the envelope in draft

- **Level:** Integration
- **Preconditions:** as above; the client returns `500` five times, and the list-by-metadata call returns empty.
- **Steps:** 1. Send.
- **Expected Result:** 1. `503` with "Signing service is unavailable. Nothing was sent — try again shortly." 2. Status is still `draft`. 3. No `sent` event. 4. `renderedHtml` and `documentHash` are unset — nothing partially applied.

### TC-04-INT-03: A create that failed without a response adopts the existing document

- **Level:** Integration
- **Preconditions:** the create times out, and the list-by-metadata call then returns one document for this envelope.
- **Steps:** 1. Send.
- **Expected Result:** 1. No second document is created. 2. The existing reference is adopted. 3. The envelope reaches `sent` exactly once.

### TC-04-INT-03a: The send verifies that text tags materialized

- **Level:** Integration
- **Preconditions:** the stub answers `201` with `status: "Created"`, `fields: []`, then on the second read returns `Sent` with a signature field per signer.
- **Steps:** 1. Send.
- **Expected Result:** 1. The service polled rather than trusting the `201`. 2. The envelope reaches `sent`. 3. No signer is left without a signature field.

### TC-04-INT-03b: A tag that failed to parse aborts and deletes

- **Level:** Integration
- **Preconditions:** the stub returns `Sent` with only one signature field for a two-signer document.
- **Steps:** 1. Send.
- **Expected Result:** 1. `DELETE /documents/{id}` was called. 2. The envelope is still `draft`. 3. The error is `document_fields_not_materialized` and names the missing recipient. 4. No `sent` event.

### TC-04-INT-03c: A document stuck in Created is not sent

- **Level:** Integration
- **Preconditions:** the stub always answers `status: "Created"`.
- **Steps:** 1. Send.
- **Expected Result:** 1. Polling stops at the bound rather than looping. 2. The document is deleted. 3. The envelope is `draft`.

### TC-04-INT-03d: Orphan recovery matches metadata in our own code

- **Level:** Integration
- **Preconditions:** the create times out; `GET /documents` returns two pages, ignoring the filter, of which exactly one row carries our `metadata.envelope_id`.
- **Steps:** 1. Send.
- **Expected Result:** 1. The matching document is adopted. 2. The non-matching rows are not. 3. With no matching row anywhere, the send fails `provider_unavailable` and adopts nothing — the case that would otherwise attach our envelope to another contract.

### TC-04-INT-04: State is taken from the API, never from the webhook body

- **Level:** Integration
- **Preconditions:** a sent SignWell envelope. The webhook body claims `status: "Completed"`; `GET /documents/{id}` returns `"Sent"`.
- **Steps:** 1. POST the webhook.
- **Expected Result:** 1. `200`. 2. The envelope is still `sent`. 3. No `completed` event. 4. The `ProviderWebhookEvent` row records the **redacted** body (requirement 35) with `outcome = converged`.

### TC-04-INT-05: Redelivery is idempotent

- **Level:** Integration
- **Preconditions:** a `document_signed` notification for signer 1.
- **Steps:** 1. POST it. 2. POST the identical body twice more.
- **Expected Result:** 1. All three answer `200`. 2. Exactly one `ProviderWebhookEvent` row. 3. Exactly one `signed` event. 4. The chain verifies.

### TC-04-INT-06: A late notification cannot revive a terminal envelope

- **Level:** Integration
- **Preconditions:** a voided SignWell envelope; a `document_signed` notification arrives afterwards.
- **Steps:** 1. POST it.
- **Expected Result:** 1. `200`. 2. Status stays `voided`. 3. `outcome = ignored_terminal`. 4. No event written.

### TC-04-INT-07: An unknown reference leaks nothing

- **Level:** Integration
- **Preconditions:** a verified notification naming a document id we do not hold.
- **Steps:** 1. POST it. 2. POST a verified notification for a document we do hold.
- **Expected Result:** 1. Both answer `200` with byte-identical bodies. 2. The unknown one records `outcome = unknown_ref` with `envelopeId = null`. 3. The response reveals nothing about which is which.

### TC-04-INT-08: A bad hash is rejected without a record

- **Level:** Integration
- **Steps:** 1. POST a payload whose `event.hash` does not verify.
- **Expected Result:** 1. `401` with an empty body. 2. No `ProviderWebhookEvent` row. 3. No envelope changed.

### TC-04-INT-09: Completion stores the provider's PDF before marking complete

- **Level:** Integration
- **Preconditions:** a partially-signed SignWell envelope; `fetchState` returns `Completed`; `completed_pdf` returns bytes.
- **Steps:** 1. POST `document_completed`.
- **Expected Result:** 1. The object exists in storage at `signed/{orgId}/{envelopeId}/{sha256}.pdf`. 2. `signedPdfHash` matches those bytes. 3. Status `completed`, `pdfStatus = ready`. 4. The request to SignWell carried `audit_page=true`. 5. No Certificate of Completion was generated.

### TC-04-INT-10: A failed PDF download does not mark the envelope complete

- **Level:** Integration
- **Preconditions:** as above; `completed_pdf` returns `500`.
- **Steps:** 1. POST `document_completed`. 2. Run the sweep with the download now succeeding.
- **Expected Result:** 1. After step 1: status is **not** `completed`, `pdfStatus = pending`, `providerError` set. 2. After step 2: completed, bytes stored, `providerError` cleared. 3. Exactly one `completed` event across both.

### TC-04-INT-10a: A 404 from completed_pdf is retried, not treated as terminal

- **Level:** Integration
- **Preconditions:** `GET /documents/{id}` says `Completed`; `completed_pdf` answers `404` with `record_not_found`, then succeeds.
- **Steps:** 1. Reconcile. 2. Run the sweep.
- **Expected Result:** 1. After step 1 the envelope is not `completed` and `pdfStatus = pending`. 2. It is never marked deleted or errored terminally. 3. After step 2 it completes.

### TC-04-INT-10b: Voiding deletes remotely and survives a 404

- **Level:** Integration
- **Preconditions:** a sent SignWell envelope.
- **Steps:** 1. Void it, the stub answering `204`. 2. Reconcile, the stub now answering `404` on read. 3. Repeat with a stub that answers `404` to the `DELETE` itself.
- **Expected Result:** 1. `DELETE` was called with the document id. 2. The `404` on the follow-up read is the settled state — no `providerError`, no further calls. 3. In the third case the envelope still voids, with `providerError` set. 4. Captured signatures remain in the trail.

### TC-04-INT-10c: Our own cancellation notification is not converged

- **Level:** Integration
- **Preconditions:** an envelope just voided by us; the `documentCanceled` fixture replayed at the webhook endpoint; the provider stub answers `404` to any read.
- **Steps:** 1. POST the fixture.
- **Expected Result:** 1. `200`. 2. `fetchState` was **not** called — the envelope is already terminal. 3. `outcome = ignored_terminal`. 4. No `providerError` is set: a `404` we caused is not a provider fault. 5. No event written.

### TC-04-INT-11: A missed webhook is converged lazily on read

- **Level:** Integration
- **Preconditions:** a sent SignWell envelope with `providerSyncedAt` two hours old; the API reports signer 1 signed; no webhook was delivered.
- **Steps:** 1. `GET …/envelopes/{id}`.
- **Expected Result:** 1. The response already says `partially_signed`. 2. A `signed` event was written. 3. `providerSyncedAt` is now.

### TC-04-INT-12: A fresh envelope is not re-fetched on every read

- **Level:** Integration
- **Preconditions:** `providerSyncedAt` five seconds ago.
- **Steps:** 1. `GET …/envelopes/{id}` three times.
- **Expected Result:** 1. Zero calls to SignWell — the 20-per-minute test budget is not spent on reads.

### TC-04-INT-13: Concurrent notifications produce one convergence

- **Level:** Integration
- **Preconditions:** two `document_completed` notifications delivered simultaneously.
- **Steps:** 1. POST both concurrently.
- **Expected Result:** 1. Exactly one `completed` event. 2. One stored object. 3. The loser leaves the stored key alone. 4. The chain verifies.

### TC-04-INT-14: The signing URL is fetched per request and never stored

- **Level:** Integration
- **Preconditions:** a sent SignWell envelope, signer 1's token.
- **Steps:** 1. `GET /api/sign/{token}` twice, the stub returning a different URL each time.
- **Expected Result:** 1. Each response carries the URL from that call. 2. No column holds it. 3. Exactly one `viewed` event across both (spec 02 requirement 17 is unaffected).

### TC-04-INT-15: A signer whose turn has not started costs no API call

- **Level:** Integration
- **Preconditions:** signer 2's token on an envelope where signer 1 has not signed.
- **Steps:** 1. `GET /api/sign/{token}`.
- **Expected Result:** 1. The "not your turn" response from spec 02. 2. Zero calls to SignWell.

### TC-04-INT-16: The provider setting is admin-only and org-scoped

- **Level:** Integration
- **Steps:** 1. `PUT …/settings/signing` as admin, manager, user, viewer. 2. As an admin of another organization.
- **Expected Result:** 1. Admin `200`; manager, user, viewer `403` with the spec message. 2. The foreign organization answers `404`, not `403`. 3. A rejected call changes nothing.

### TC-04-INT-17: Changing the provider does not touch in-flight envelopes

- **Level:** Integration
- **Preconditions:** organization on `internal` with one sent envelope and one draft.
- **Steps:** 1. `PUT` the provider to `signwell`. 2. Send the draft. 3. Read both.
- **Expected Result:** 1. The pre-existing sent envelope still has `providerKey = "internal"` and still signs through our page. 2. The newly sent one is `signwell`. 3. No column on the first envelope changed.

### TC-04-INT-18: An unconfigured provider cannot be selected

- **Level:** Integration
- **Preconditions:** `SIGNWELL_API_KEY` unset.
- **Steps:** 1. `GET …/settings/signing`. 2. `PUT` it to `signwell`.
- **Expected Result:** 1. `configured: false` with the missing items named. 2. `400` "SignWell is not configured. Missing: API key." 3. The stored provider is unchanged.

### TC-04-INT-19: A change without confirmation is refused

- **Level:** Integration
- **Steps:** 1. `PUT { "provider": "signwell" }` with no `confirmed`.
- **Expected Result:** 1. `409` "Confirm the change before saving". 2. Nothing written.

### TC-04-INT-20: Spec 02 behaviour is unchanged for internal envelopes

- **Level:** Integration
- **Preconditions:** the whole of spec 02's integration suite.
- **Steps:** 1. Run it against the rewritten internal provider, unedited.
- **Expected Result:** 1. Every case passes with no change to any assertion. This is requirement 10, expressed as a test.

### TC-04-INT-21: The rate limiter and circuit breaker protect the budget

- **Level:** Integration
- **Preconditions:** the stub returns `429` for the first three calls, then `200`.
- **Steps:** 1. Send. 2. Make the stub fail five consecutive times, then call again.
- **Expected Result:** 1. The send succeeds after backing off, and the delays grow. 2. After five consecutive failures the next call fails fast without a network attempt. 3. The breaker closes after its window.

### TC-04-INT-22: A provider call never runs inside a transaction

- **Level:** Integration
- **Preconditions:** the stub blocks for two seconds on `createSession`.
- **Steps:** 1. Send while a second request reads the same envelope.
- **Expected Result:** 1. The reader is not blocked. 2. No transaction was open for the duration of the call — invariant 11.

### TC-04-E2E-01: An admin switches the organization to SignWell

- **Level:** E2E
- **Preconditions:** admin signed in; SignWell configured; one in-flight envelope.
- **Steps:** 1. Open `/org/{orgId}/settings/signing`. 2. Confirm Built-in is the selected provider. 3. Select SignWell. 4. Press Save. 5. Read the modal, tick the checkbox, confirm.
- **Expected Result:** 1. Built-in is selected on arrival. 2. The SignWell row shows the test-mode badge. 3. The modal names one in-flight document. 4. The confirm button is disabled until the checkbox is ticked, and enabled after. 5. The saved toast appears and the SignWell row reads Active after a reload.
- **Selectors:** `signing-settings`, `signing-provider-option-internal`, `signing-provider-option-signwell`, `signing-provider-status-signwell`, `signing-test-mode-banner`, `signing-provider-save`, `signing-change-modal`, `signing-change-inflight`, `signing-change-confirm`, `signing-change-submit`, `toast-signing-provider-saved`

### TC-04-E2E-02: The signing page hosts the widget on our origin

- **Level:** E2E
- **Preconditions:** a sent SignWell envelope; signer 1's link; the provider stubbed to return a known embed URL.
- **Steps:** 1. Open `/sign/{token}`. 2. Wait for the frame.
- **Expected Result:** 1. The browser URL stays on our origin. 2. `sign-embedded-loading` appears and is replaced by `sign-embedded-frame`. 3. The frame's `src` is the URL the provider returned. 4. The test badge is visible. 5. Our own signature canvas is not rendered.
- **Selectors:** `sign-embedded-loading`, `sign-embedded-frame`, `sign-test-badge`, `sign-signature-canvas` (asserted absent)

### TC-04-E2E-03: An unreachable provider keeps the link usable

- **Level:** E2E
- **Preconditions:** as above; the provider stub returns `503`.
- **Steps:** 1. Open `/sign/{token}`. 2. Press Retry with the stub now healthy.
- **Expected Result:** 1. The error card explains the link still works. 2. After the retry the frame loads. 3. The token was not consumed.
- **Selectors:** `sign-embedded-error`, `sign-embedded-retry`, `sign-embedded-frame`

### TC-04-E2E-04: A manager sees the setting but cannot change it

- **Level:** E2E
- **Preconditions:** manager signed in.
- **Steps:** 1. Open `/org/{orgId}/settings/signing`.
- **Expected Result:** 1. The current provider is shown. 2. No save button and no radio is operable. 3. A `user` navigating to the same route gets the not-found page and has no Settings item in the sidebar.
- **Selectors:** `signing-settings`, `signing-provider-save` (asserted absent), `nav-settings` (asserted absent for `user`)

### TC-04-E2E-05: The envelope detail names the provider and marks a test document

- **Level:** E2E
- **Preconditions:** admin signed in; one completed SignWell test-mode envelope seeded through the API.
- **Steps:** 1. Open `/org/{orgId}/documents/{envelopeId}`.
- **Expected Result:** 1. The provider row reads "Signed via SignWell". 2. The test badge is visible. 3. The download control is offered. 4. No Certificate of Completion is listed.
- **Selectors:** `envelope-provider`, `envelope-test-badge`, `envelope-download-button`, `envelope-certificate-link` (asserted absent)
