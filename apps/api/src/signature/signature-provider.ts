/**
 * The signing transport.
 *
 * The area README records the decision this port exists to protect: the signature engine
 * is built in-house because 80% of the value — templates, fields, binding to our own
 * records — is our code under any provider, and only the transport is swappable. So the
 * port is deliberately narrow: three operations, no envelope lifecycle, no persistence.
 * Everything a Dropbox Sign, Documenso, or DocuSign adapter would have to replace is
 * behind these three calls, and `Envelope.providerKey` / `providerRef` already exist in
 * the schema to carry the foreign identifiers. Adding an adapter is a class and an env
 * var — no migration, no API change, no change to the state machine.
 *
 * What is *not* here is as deliberate as what is. Nothing in this port writes to the
 * database, sends mail, or renders a PDF: the envelope service owns the transaction, the
 * events, and the mail, because those are ours under every provider.
 *
 * Abstract class rather than interface: Nest uses the class as the DI token.
 */

export type SignatureMethod = 'drawn' | 'typed';

export interface InvitationRequest {
  envelopeId: string;
  signerId: string;
  signerName: string;
  signerEmail: string;
  /** Defaults to `SIGNING_TOKEN_TTL_DAYS`. */
  ttlDays?: number;
}

export interface IssuedInvitation {
  /**
   * Stored on the envelope. For the internal provider it is our own signer id; for a
   * third party it is whatever identifies the request on their side.
   */
  providerRef: string;
  /** The raw token. The only place outside the email that ever holds it. */
  token: string;
  /** What the database stores — the raw token is never persisted. */
  tokenHash: string;
  expiresAt: Date;
  /** The link the invitation email contains. */
  signingUrl: string;
}

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

export interface FinalizeSigner {
  name: string;
  email: string;
  roleLabel: string;
  order: number;
  signatureImage: string;
  method: SignatureMethod;
  signedAt: Date;
  consentAcceptedAt: Date;
  ipAddress: string;
  userAgent: string;
}

export interface FinalizeRequest {
  envelopeId: string;
  title: string;
  /** The frozen document, exactly as signed. Never re-rendered from the template. */
  renderedHtml: string;
  documentHash: string;
  templateName: string;
  templateVersion: number;
  completedAt: Date;
  /** IANA zone, for the second timestamp column on the certificate. */
  organizationTimeZone: string;
  signers: readonly FinalizeSigner[];
}

export interface FinalizedDocument {
  /** The signed document followed by the Certificate of Completion (requirement 28). */
  html: string;
  providerRef: string;
}

export abstract class SignatureProvider {
  /** Written to `Envelope.providerKey`. `internal` today. */
  abstract readonly key: string;

  /** Starts one signer's turn. Does not send mail — the envelope service does that. */
  abstract issueInvitation(request: InvitationRequest): Promise<IssuedInvitation>;

  /** Turns a captured signature into the artefact that is stored and rendered. */
  abstract applySignature(request: SignatureRequest): Promise<AppliedSignature>;

  /** Assembles the document that becomes the signed PDF, once every signer has signed. */
  abstract finalize(request: FinalizeRequest): Promise<FinalizedDocument>;
}
