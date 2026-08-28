import { escapeHtml } from '@devscribed/validation';
import type { ProviderCapabilities } from '@devscribed/validation';
import { Injectable } from '@nestjs/common';
import { assembleCompletedDocument } from '../documents/certificate-of-completion';
// The anchor contract (what the slot looks like, and what may be drawn into it) lives
// with the renderer that writes it, so writer and reader cannot drift apart.
import { signatureImageSrc } from '../documents/envelope-renderer';
import { PdfRenderer } from '../pdf/pdf-renderer';
import {
  AppliedSignature,
  CancelRequest,
  CompletedDocument,
  CompletedDocumentRequest,
  CreateSessionRequest,
  CreatedSession,
  LocallySigned,
  SignatureRequest,
  SignerAccess,
  SignerAccessRequest,
  SigningProvider,
} from './signing-provider';

/**
 * The in-house Simple Electronic Signature implementation, re-expressed on the new port.
 *
 * Its identity class is stated in the area README: possession of the email is the
 * identity proof, and the audit trail is the evidence. That is why every field the
 * Certificate of Completion needs — IP, user agent, consent timestamp — is a required
 * input here rather than something the provider is trusted to have recorded somewhere.
 *
 * **This spec changes no observable behaviour of an `internal` envelope** (requirement 9),
 * and the rewrite is verified by spec 02's suite passing unedited (requirement 10). Three
 * things moved and nothing else did:
 *
 *   1. `issueInvitation` left the port. Token minting was always ours, so the three call
 *      sites now call `signing-token.ts` directly and build the `/sign/{token}` URL from
 *      `APP_PUBLIC_URL`, which is all `issueInvitation` ever did.
 *   2. `finalize` became `completedDocument`. The certificate assembly moved to
 *      `documents/certificate-of-completion.ts` verbatim and is rendered here, so the
 *      method returns bytes like every other provider's.
 *   3. `applySignature` moved onto `LocallySigned`, unchanged, and still runs inside the
 *      signing transaction — see the note on that interface for why that is deliberate.
 */
@Injectable()
export class InternalSigningProvider extends SigningProvider implements LocallySigned {
  readonly key = 'internal';

  /** Requirement 8, exactly. Everything about an internal envelope is ours. */
  readonly capabilities: ProviderCapabilities = {
    invitationMail: 'ours',
    signingSurface: 'ours',
    completedDocument: 'ours',
    notifications: 'none',
    signingOrder: 'ours',
  };

  constructor(private readonly renderer: PdfRenderer) {
    super();
  }

  /**
   * There is nothing to create: the session *is* the envelope, and the token that opens
   * it is minted by the send path itself. `providerRef` is the envelope id, which is what
   * the column has always held for this provider.
   *
   * It is not a throw, and that matters — a port method with no implementation is the
   * shape the previous port failed in. Every method here has a caller.
   */
  async createSession(request: CreateSessionRequest): Promise<CreatedSession> {
    return {
      providerRef: request.envelopeId,
      testMode: false,
      providerStatus: null,
      // Our own signer ids: under a third party these are their recipient ids, which is
      // the whole reason the column is a free-form string.
      signerRefs: Object.fromEntries(request.signers.map((signer) => [signer.id, ''])),
    };
  }

  /**
   * Our own page renders the document, so there is no foreign URL to hand out. Returning
   * `null` rather than throwing keeps the signing service's one code path honest: it asks
   * every provider, and a provider whose surface is ours answers "nothing to embed".
   */
  async signerAccess(_request: SignerAccessRequest): Promise<SignerAccess> {
    return { embeddedSigningUrl: null, providerStatus: null };
  }

  async applySignature(request: SignatureRequest): Promise<AppliedSignature> {
    const signatureImage =
      request.method === 'drawn'
        ? requireDrawnImage(request.drawnImage)
        : typedSignatureImage(requireTypedName(request.typedName));

    return {
      signatureImage,
      method: request.method,
      signedAt: request.signedAt,
      providerRef: request.signerId,
    };
  }

  /**
   * The frozen document, its signer-owned placeholders filled, its signature lines drawn,
   * and the Certificate of Completion after it — rendered to PDF.
   */
  async completedDocument(request: CompletedDocumentRequest): Promise<CompletedDocument> {
    if (!request.assembly) {
      throw new Error('The internal provider assembles the completed document and needs its inputs');
    }

    const html = assembleCompletedDocument(request.assembly);
    const bytes = await this.renderer.render(html);
    return { bytes, providerRef: request.envelopeId };
  }

  /**
   * Voiding an internal envelope is entirely our own bookkeeping — the tokens die and the
   * status changes, both inside the envelope service's transaction. There is nothing
   * remote to stop.
   */
  async cancel(_request: CancelRequest): Promise<void> {
    return;
  }
}

function requireDrawnImage(image: string | undefined): string {
  // Structural check only. "A drawn signature with no ink" is a validation rule and lives
  // in `packages/validation`; what the provider guarantees is that it never stores
  // something that is not an image.
  //
  // The check is `signatureImageSrc`'s and not a looser one of its own: a `startsWith`
  // test would admit strings the renderer will later refuse to draw, and a column whose
  // contents cannot be rendered is worse than a rejected signature — the signer is still
  // in front of us and can sign again, while the envelope is not. So the writer and the
  // reader agree on what a signature is, in exactly one place. The normalized form is
  // stored, so what the column holds is what the document will carry.
  const src = signatureImageSrc(image);
  if (!src) {
    throw new Error('A drawn signature must be an image data URI');
  }
  return src;
}

function requireTypedName(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('A typed signature must have a name');
  return trimmed;
}

/**
 * Requirement 22 asks for a typed name "rendered into an image". The image is an SVG data
 * URI rather than a PNG: rasterizing text in the API process would mean shipping a font
 * and a rasterizer alongside the Chromium the renderer already owns.
 * The column stores a data URI either way, and both the signing page and the PDF
 * renderer draw an SVG and a PNG identically — while the SVG additionally keeps the
 * typed name readable as text inside the artefact, which is a small evidentiary win.
 */
export function typedSignatureImage(name: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="90" viewBox="0 0 420 90">` +
    `<text x="12" y="58" font-family="Georgia,'Times New Roman',serif" font-size="40" ` +
    `font-style="italic" fill="#111827">${escapeHtml(name)}</text>` +
    `<line x1="8" y1="72" x2="412" y2="72" stroke="#9ca3af" stroke-width="1"/></svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}
