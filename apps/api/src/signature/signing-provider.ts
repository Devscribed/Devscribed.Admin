import type { ProviderCapabilities } from '@devscribed/validation';

/**
 * The signing transport, spec 04 requirement 3.
 *
 * **Why this replaced the previous port rather than extending it.** The old
 * `SignatureProvider` had three methods — `issueInvitation`, `applySignature`,
 * `finalize` — and all three assumed we mint the token, host the page, capture the ink,
 * and build the PDF. That is a document-*assembly* port, not a signing-transport one, and
 * a third party that does all four itself and tells us afterwards over a webhook cannot
 * be expressed in it. The unit of work here is therefore the **signing session** — the
 * whole envelope, over its whole life — and the central rule is that a remote provider's
 * state is asynchronous and is never taken from a notification body.
 *
 * **Nothing on this port touches the database, sends mail, or writes an event**
 * (requirement 4). That survives from the old port unchanged and is the reason a provider
 * swap cannot corrupt the audit trail: the envelope service owns the transaction, the
 * chain, and the mail under every provider.
 *
 * **There is deliberately no `remind`** (requirement 18). Reminders are ours under every
 * provider — one reminder policy, not two — so a `remind` method would have no caller,
 * which is exactly the shape the previous port failed in. For the record: SignWell's is
 * `POST /documents/{id}/remind`. There is no `issueInvitation` either: token minting
 * stayed ours and moved to the services, which call `signing-token.ts` directly.
 *
 * Abstract class rather than interface, because Nest uses the class as the DI token —
 * the same idiom `MailService`, `FileStorage` and `PdfRenderer` established.
 */
export abstract class SigningProvider {
  /** Written to `Envelope.providerKey`. */
  abstract readonly key: string;

  /**
   * What this provider does, so consumers branch on the capability and never on the key
   * (requirement 2). A third provider needs no new `if` in the envelope service.
   */
  abstract readonly capabilities: ProviderCapabilities;

  /**
   * Called exactly once per envelope, inside the send path, **before** the transaction
   * that flips it to `sent` (requirement 5, invariant 11). A failure here leaves the
   * envelope in `draft` with nothing partially applied.
   */
  abstract createSession(request: CreateSessionRequest): Promise<CreatedSession>;

  /**
   * Called **every time** a signer's page is opened, and its result is never persisted
   * (requirement 6). Storing a live signing URL would create a second credential for the
   * document — one our own access control does not gate and our token expiry does not
   * reach — so the provider's link is held only for the duration of a request we have
   * already authorized.
   */
  abstract signerAccess(request: SignerAccessRequest): Promise<SignerAccess>;

  /** The bytes that become the stored signed PDF, once every signer has signed. */
  abstract completedDocument(request: CompletedDocumentRequest): Promise<CompletedDocument>;

  /** Stops an in-flight session. Under SignWell this is a hard delete — requirement 18. */
  abstract cancel(request: CancelRequest): Promise<void>;
}

/**
 * Implemented only when `capabilities.signingSurface === 'ours'`, so a provider cannot be
 * asked to turn ink into an artefact when the ink never reached us.
 *
 * Like every other method here it is called **outside** any transaction (invariant 11,
 * acceptance criterion 12), which bind every adapter method without qualification and not
 * only the ones that reach the network. `SigningService.sign` computes the artefact before
 * it opens the transaction and writes the result inside — the call records nothing, so
 * hoisting it moves no check and no error ahead of the ones spec 02 orders.
 */
export interface LocallySigned {
  applySignature(request: SignatureRequest): Promise<AppliedSignature>;
}

/** Implemented only when `capabilities.notifications === 'webhook'`. */
export interface RemotelyTracked {
  /**
   * Turns a delivery into the facts worth recording — and nothing more. Returns `null`
   * when the body is not a notification we recognize. It never returns state: everything
   * about the document is re-read through `fetchState` (requirement 21).
   */
  parseNotification(raw: RawNotification): Promise<ParsedNotification | null>;

  /**
   * The provider's authoritative view, normalized to our vocabulary. It is the **only**
   * source of remote state.
   */
  fetchState(providerRef: string): Promise<ProviderState>;
}

/**
 * Implemented by a provider that can be asked, live, whether we can still reach it and
 * whether the notification it would ring us on is registered.
 *
 * Optional on purpose, and the reason is requirement 32: both answers are **displayed
 * beside an option and are never a gate on it**, so a provider that cannot answer is not
 * thereby unselectable. The in-house engine implements nothing here — it is the product
 * itself, always reachable, with no webhook to register.
 *
 * It exists so the settings screen can ask *the provider* rather than reaching for one
 * vendor's client and pointing it at whatever provider it happens to be describing. A
 * second webhook-based provider would otherwise be reported reachable on the strength of
 * SignWell's `/me` answering, which is requirement 2's rule broken at one remove: the
 * branch was on the capability, but the call was on the key.
 */
export interface ConnectionChecked {
  checkConnection(): Promise<ProviderConnection>;
}

export interface ProviderConnection {
  /** Whether the provider answered at all. Displayed; never a gate. */
  reachable: boolean;
  /** Whether a notification callback is registered with them. Displayed; never a gate. */
  webhookRegistered: boolean;
  /**
   * Whether a document sent through this provider *now* would be a test. It rides with
   * the two above because it is the same question — what would a new envelope through
   * this provider be — and because it is the provider that knows. An envelope's own
   * badge never comes from here: that reads the column written at its send, so switching
   * test mode off cannot relabel history (edge case 17).
   */
  testMode: boolean;
}

export function isConnectionChecked(
  provider: SigningProvider,
): provider is SigningProvider & ConnectionChecked {
  return typeof (provider as Partial<ConnectionChecked>).checkConnection === 'function';
}
export function isLocallySigned(provider: SigningProvider): provider is SigningProvider &
  LocallySigned {
  return typeof (provider as Partial<LocallySigned>).applySignature === 'function';
}

export function isRemotelyTrackedProvider(
  provider: SigningProvider,
): provider is SigningProvider & RemotelyTracked {
  return (
    typeof (provider as Partial<RemotelyTracked>).fetchState === 'function' &&
    typeof (provider as Partial<RemotelyTracked>).parseNotification === 'function'
  );
}

/* ------------------------------------------------------------------ *
 * createSession
 * ------------------------------------------------------------------ */

export interface SessionSigner {
  /** Our `EnvelopeSigner.id`. The key of `CreatedSession.signerRefs`. */
  id: string;
  name: string;
  email: string;
  /** 1-based, and it is what `apply_signing_order` mirrors. */
  order: number;
  roleKey: string;
}

/**
 * One field the provider is expected to have materialized from our tags, so the send can
 * verify what came back rather than trusting the `201` (requirement 38).
 */
export interface ExpectedProviderField {
  type: 'signature' | 'text';
  /** The signer whose recipient this field belongs to. */
  signerId: string;
  required: boolean;
  /** The template field key, for a text field. Absent for a signature block. */
  fieldKey?: string;
}

export interface CreateSessionRequest {
  envelopeId: string;
  organizationId: string;
  title: string;
  /**
   * The document to be signed. For a provider that hosts the signing surface this is the
   * translated copy of the frozen HTML — a copy, so `Envelope.renderedHtml` and
   * `documentHash` keep describing exactly the bytes spec 02 froze.
   */
  documentHtml: string;
  signers: readonly SessionSigner[];
  /** Days remaining until our own expiry, kept consistent with theirs. */
  expiresInDays: number;
  /** What our translation emitted, and therefore what the parse must produce. */
  expectedFields: readonly ExpectedProviderField[];
  /**
   * Edge case 4 — a previous send of this envelope created a session it could neither pin
   * nor remove, so one may already exist on the provider's side.
   *
   * The send path sets this only when it has that evidence, and a provider that can
   * recognize its own leftovers (requirement 26 — SignWell matches
   * `metadata.envelope_id`) must then adopt rather than create. It is a flag rather than
   * an unconditional search because the search is a paged scan of the whole account: run
   * on every send it would cost up to twenty calls each time and, on an account with more
   * than twenty pages, would reach the cap and fail sends that had nothing to adopt.
   */
  adoptExisting?: boolean;
}

export interface CreatedSession {
  /** `Envelope.providerRef`. */
  providerRef: string;
  /** `Envelope.providerTestMode`, written at send and never re-read from configuration. */
  testMode: boolean;
  /** The provider's own status string at creation, verbatim. */
  providerStatus: string | null;
  /** Our `EnvelopeSigner.id` → their recipient id. */
  signerRefs: Record<string, string>;
}

/* ------------------------------------------------------------------ *
 * signerAccess
 * ------------------------------------------------------------------ */

export interface SignerAccessRequest {
  providerRef: string;
  /** `EnvelopeSigner.providerRef` — their recipient id. Empty under `internal`. */
  signerProviderRef: string;
  signerEmail: string;
  signerOrder: number;
}

export interface SignerAccess {
  /**
   * The URL the widget is loaded from, or `null` when the surface is ours. Never
   * persisted, never cached, never logged (requirement 6).
   */
  embeddedSigningUrl: string | null;
  providerStatus: string | null;
}

/* ------------------------------------------------------------------ *
 * completedDocument
 * ------------------------------------------------------------------ */

export type SignatureMethod = 'drawn' | 'typed';

export interface AssemblySigner {
  name: string;
  email: string;
  /**
   * The template's role key. It is what ties this signer to their signature block in the
   * frozen document — the block carries `data-signer-role`, so the assembly can draw the
   * signature on the right line without parsing the prose around it.
   */
  roleKey: string;
  roleLabel: string;
  order: number;
  signatureImage: string;
  method: SignatureMethod;
  signedAt: Date;
  consentAcceptedAt: Date;
  ipAddress: string;
  userAgent: string;
}

/**
 * One value a signer typed on the signing page rather than the sender before the send.
 * The certificate lists these so the record says which parts of the document were added
 * after the freeze instead of leaving them indistinguishable from the sender's.
 */
export interface AssemblySignerField {
  key: string;
  label: string;
  signerName: string;
  roleLabel: string;
}

/**
 * Everything a provider that assembles the completed document itself needs. Built only
 * when `capabilities.completedDocument === 'ours'`; a provider that downloads its own
 * PDF is never handed the certificate's inputs, because it has no use for them and
 * computing them would be work for nothing.
 */
export interface DocumentAssembly {
  /** Printed on the certificate, which names the envelope it is the record of. */
  envelopeId: string;
  title: string;
  /** The frozen document, exactly as signed. Never re-rendered from the template. */
  renderedHtml: string;
  /**
   * Every value the envelope holds at completion, sender-entered and signer-entered
   * alike. The frozen HTML still carries the signer-owned placeholders literally (they
   * had no value at send), so they are substituted — never re-rendered — and what the
   * PDF shows is the signed document plus exactly the values the signers agreed to.
   */
  fieldValues: Record<string, string>;
  /** Of those values, the ones entered during signing. For the certificate. */
  signerEnteredFields: readonly AssemblySignerField[];
  documentHash: string;
  templateName: string;
  templateVersion: number;
  completedAt: Date;
  /** IANA zone, for the second timestamp column on the certificate. */
  organizationTimeZone: string;
  signers: readonly AssemblySigner[];
}

export interface CompletedDocumentRequest {
  envelopeId: string;
  providerRef: string;
  assembly?: DocumentAssembly;
}

export interface CompletedDocument {
  /** The PDF bytes. Always begins with `%PDF`; the caller re-checks (edge cases 11, 12). */
  bytes: Buffer;
  providerRef: string;
}

/* ------------------------------------------------------------------ *
 * cancel
 * ------------------------------------------------------------------ */

export interface CancelRequest {
  envelopeId: string;
  providerRef: string;
  reason?: string | null;
}

/* ------------------------------------------------------------------ *
 * LocallySigned
 * ------------------------------------------------------------------ */

export interface SignatureRequest {
  envelopeId: string;
  signerId: string;
  signerName: string;
  method: SignatureMethod;
  /** Drawn: a PNG data URI captured from the canvas. */
  drawnImage?: string;
  /** Typed: the name the signer entered. */
  typedName?: string;
  signedAt: Date;
  consentAcceptedAt: Date;
  ipAddress: string;
  userAgent: string;
}

export interface AppliedSignature {
  /** A data URI, ready to store on `EnvelopeSigner.signatureImage` and to render. */
  signatureImage: string;
  method: SignatureMethod;
  signedAt: Date;
  providerRef: string;
}

/* ------------------------------------------------------------------ *
 * RemotelyTracked
 * ------------------------------------------------------------------ */

export interface RawNotification {
  /** The parsed body, exactly as it arrived. */
  body: unknown;
  headers?: Record<string, string | undefined>;
}

export interface ParsedNotification {
  providerKey: string;
  /** The document id the notification named. */
  providerRef: string;
  eventType: string;
  eventTime: Date;
  /** Lowercased; empty when the event names no signer, which is the common case. */
  relatedSignerEmail: string;
  hashVerified: boolean;
  /**
   * The body with the signing URLs, every field value and every foreign metadata key
   * replaced by `"[redacted]"` — done here, before the first write, and never on read
   * (requirement 35).
   */
  redactedPayload: unknown;
}

/** Our vocabulary, normalized from whatever the provider calls it (requirement 39). */
export type ProviderSignerStatus = 'pending' | 'notified' | 'viewed' | 'signed' | 'declined';

export type ProviderEnvelopeStatus =
  | 'created'
  | 'sent'
  | 'partially_signed'
  | 'completed'
  | 'declined'
  | 'canceled';

export interface ProviderSignerState {
  /** Their recipient id, matched against `EnvelopeSigner.providerRef`. */
  providerRef: string;
  email: string;
  status: ProviderSignerStatus;
  signedAt: Date | null;
  declinedAt: Date | null;
  declineReason: string | null;
}

export interface ProviderState {
  /**
   * `false` when the document is gone. Whether that is a settled void or a provider
   * fault is **our** decision from our own rows, never theirs — requirement 42 and edge
   * cases 27, 28.
   */
  exists: boolean;
  status: ProviderEnvelopeStatus;
  /** The provider's own string, kept verbatim for support. Never used for logic. */
  providerStatus: string;
  signers: readonly ProviderSignerState[];
  declineReason: string | null;
  completedAt: Date | null;
}

/** Raised by an adapter when the provider could not be reached or refused us. */
export class ProviderUnavailableError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/**
 * Raised by `cancel` when the document was already gone on the provider's side — someone
 * deleted it in their UI, or it never committed. Our void must not be blocked by their
 * state (edge case 26), so the caller voids locally and sets `providerError`.
 */
export class ProviderDocumentGoneError extends Error {
  constructor(readonly providerRef: string) {
    super(`The provider no longer holds document ${providerRef}`);
    this.name = 'ProviderDocumentGoneError';
  }
}

/**
 * Raised when a created document's parsed fields are not the ones our translation
 * emitted (requirement 38). It is not a warning: a text tag that failed to parse produces
 * a contract with a missing signature line that nobody notices until a counterparty
 * cannot sign it.
 */
export class ProviderFieldsNotMaterializedError extends Error {
  constructor(
    message: string,
    readonly expected: readonly string[],
    readonly received: readonly string[],
  ) {
    super(message);
    this.name = 'ProviderFieldsNotMaterializedError';
  }
}
