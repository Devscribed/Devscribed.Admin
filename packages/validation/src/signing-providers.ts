/**
 * Signature providers — the shared vocabulary of documents spec 04.
 *
 * Every string a person can read about a signature provider lives here, verbatim from
 * the spec's Error Messages table, because the settings screen validates for immediacy
 * and the API re-validates on every request: two copies of a sentence are two sentences
 * that can disagree. Nothing in `apps/web` or `apps/api` may inline one of these.
 *
 * What is deliberately *not* here: any knowledge of how a particular provider works. The
 * `ProviderCapabilities` *shape* is below, and so are the questions asked of it, because
 * both surfaces ask them; the *value* of the record is declared by each adapter in
 * `apps/api/src/signature/`, which is requirement 2. Nothing in this file knows what
 * SignWell does, and nothing in it may come to.
 */

/** The provider keys `Organization.signatureProviderKey` and `Envelope.providerKey` hold. */
export type SigningProviderKey = 'internal' | 'signwell';

export const SIGNING_PROVIDER_KEYS: readonly SigningProviderKey[] = ['internal', 'signwell'];

/**
 * `internal` first, and it is the default for every organization that predates the
 * setting — backward compatibility item 2.
 */
export const DEFAULT_SIGNING_PROVIDER_KEY: SigningProviderKey = 'internal';

/** The display name beside each radio, and the `{provider}` of the saved toast. */
export const SIGNING_PROVIDER_NAMES: Record<SigningProviderKey, string> = {
  internal: 'Built-in',
  signwell: 'SignWell',
};

/** The description under each name on the settings screen. */
export const SIGNING_PROVIDER_DESCRIPTIONS: Record<SigningProviderKey, string> = {
  internal:
    'Signed in Teammerly. We issue the link, capture the signature, and produce the certificate.',
  signwell:
    "Signed in Teammerly through SignWell's embedded widget. SignWell produces the signed PDF and its audit page.",
};

export function signingProviderName(key: string): string {
  return SIGNING_PROVIDER_NAMES[key as SigningProviderKey] ?? key;
}

export function isSigningProviderKey(key: unknown): key is SigningProviderKey {
  return typeof key === 'string' && (SIGNING_PROVIDER_KEYS as readonly string[]).includes(key);
}

/**
 * The names of the configuration items a provider needs, as the "Missing: …" line spells
 * them. Sentence-shaped rather than variable-shaped on purpose — the admin reading the
 * screen is being told what is absent, and `SIGNWELL_API_KEY` is a word for a deploy
 * pipeline, not for a person.
 */
export const SIGNING_PROVIDER_CONFIG_LABELS = {
  apiKey: 'API key',
  apiApplicationId: 'API application id',
  webhookSecret: 'webhook secret',
} as const;

/**
 * Every message from the spec's Error Messages table, verbatim.
 *
 * The ones taking an argument are functions rather than templates so a caller cannot
 * forget the substitution and ship `{n}` to a screen.
 */
export const SIGNING_PROVIDER_MESSAGES = {
  provider: {
    unknown: 'Unknown signature provider',
    /** "SignWell is not configured. Missing: API key." */
    notConfigured: (provider: string, missing: readonly string[]): string =>
      `${provider} is not configured. Missing: ${missing.join(', ')}.`,
    notConfirmed: 'Confirm the change before saving',
  },
  settings: {
    /** "New documents will be signed through SignWell." */
    saved: (provider: string): string => `New documents will be signed through ${provider}.`,
    saveFailed: 'Something went wrong. Your change was not saved.',
    /** The banner under the provider list whenever the selected provider is in test mode. */
    testModeNotice:
      'Test mode is on. Documents signed through SignWell in test mode carry no legal weight ' +
      'and are marked as tests everywhere they appear.',
    /** The confirmation modal's count line. */
    inFlight: (count: number): string =>
      `${count} documents are currently in flight. They stay with the built-in provider until ` +
      'they complete, decline, or expire. Nothing about them changes.',
    heading: 'Signature provider',
    subheading:
      'How documents from this organization are signed. Changing this affects new documents only.',
  },
  send: {
    /** Validation rule 4 — the abort that keeps an invisible field off a signed contract. */
    unresolvedPlaceholders: (keys: readonly string[]): string =>
      'This document still contains unresolved placeholders and cannot be sent: ' +
      `${keys.join(', ')}`,
    /** Validation rule 5, restated because SignWell rejects a blank recipient outright. */
    signerIncomplete: 'Every signer needs a name and an email address',
    providerUnavailable: 'Signing service is unavailable. Nothing was sent — try again shortly.',
  },
  signing: {
    /** The retry card on `/sign/{token}`. */
    providerUnavailable:
      "We can't open this document right now. Nothing has been lost — your link still works. " +
      'Try again in a few minutes.',
    /** The API's 503 body, deliberately distinct from an invalid token. */
    providerUnavailableApi: 'Signing service is unavailable',
    testModeBanner: 'TEST DOCUMENT — this signature has no legal effect.',
    loading: 'Preparing your document…',
    /** "Signed through SignWell on behalf of Acme Inc." */
    attribution: (provider: string, organization: string): string =>
      `Signed through ${provider} on behalf of ${organization}.`,
  },
  envelope: {
    testDocument: 'Test document — no legal effect',
    /** "Signed via SignWell" on the envelope detail. */
    signedVia: (provider: string): string => `Signed via ${provider}`,
    /**
     * The Screens section's Document row — which evidence format the stored PDF carries.
     *
     * The Known Gaps table is what makes this load-bearing rather than decorative: two
     * evidence formats coexist in one organization once an admin switches, and what keeps
     * that acceptable is stated there as "the envelope detail names which one it is". A
     * document signed before the switch carries our Certificate of Completion bound into
     * the PDF; one signed after carries the provider's audit page (requirement 28).
     */
    documentIncludes: (provider: string, certificateIssued: boolean): string =>
      certificateIssued
        ? 'Includes our Certificate of Completion'
        : `Includes the ${provider} audit page`,
    unconfiguredInFlight:
      'This document is waiting on a signing provider that is no longer configured.',
  },
} as const;

/* ------------------------------------------------------------------ *
 * Capabilities — requirement 2
 *
 * The record lives here, with the keys and the messages, because both surfaces read it:
 * the API branches the send path and the signing page on it, and the web app decides
 * which body `/sign/{token}` renders from the `surface` the API derived from it. What
 * lives *with each adapter* is the record's value — every provider declares its own,
 * which is requirement 2 — while the shape and the questions asked of it are shared.
 *
 * The rule the whole spec turns on: consumers branch on the capability, NEVER on the
 * provider key. A third provider must need no new `if` in the envelope service, and
 * `TC-04-UNIT-05` makes that a test rather than an intention.
 * ------------------------------------------------------------------ */

export interface ProviderCapabilities {
  /** Whether the send path dispatches our own SES invitation, or the provider mails. */
  invitationMail: 'ours' | 'provider';
  /** `/sign/{token}`: our document plus canvas, or the provider's widget in an iframe. */
  signingSurface: 'ours' | 'embedded';
  /** Completion: render from the frozen HTML, or download what the provider produced. */
  completedDocument: 'ours' | 'provider';
  /** Whether reconciliation exists at all for this provider. */
  notifications: 'none' | 'webhook';
  /** Whether we issue turn *n+1* or the provider has already opened it. */
  signingOrder: 'ours' | 'provider';
}

/** The send path's question: do we mail the invitation ourselves? */
export function sendsOurOwnInvitation(capabilities: ProviderCapabilities): boolean {
  return capabilities.invitationMail === 'ours';
}

/**
 * The `surface` field of `GET /api/sign/{token}`. `ours` returns spec 02's payload
 * unchanged, which is what keeps an internal envelope untouched by this spec.
 */
export function signingSurfaceOf(capabilities: ProviderCapabilities): 'ours' | 'embedded' {
  return capabilities.signingSurface;
}

/** Completion: our renderer and our Certificate of Completion, or their PDF and audit page. */
export function assemblesCompletedDocument(capabilities: ProviderCapabilities): boolean {
  return capabilities.completedDocument === 'ours';
}

/**
 * Requirement 28 — under a provider that produces the completed document, our own
 * Certificate of Completion is not issued. Their audit page is the certificate, and two
 * documents claiming to be the evidence is worse than one.
 */
export function issuesCertificateOfCompletion(capabilities: ProviderCapabilities): boolean {
  return capabilities.completedDocument === 'ours';
}

/** Whether a notification can ever arrive for this provider, and so whether it reconciles. */
export function isRemotelyTracked(capabilities: ProviderCapabilities): boolean {
  return capabilities.notifications === 'webhook';
}

/**
 * Whether the provider has already opened the next signer's turn. Our SES invitation
 * still goes out either way — `invitationMail` is a separate question, and requirement 12
 * is why: the counterparty must never receive mail from a vendor they have no
 * relationship with.
 */
export function providerDrivesSigningOrder(capabilities: ProviderCapabilities): boolean {
  return capabilities.signingOrder === 'provider';
}

/**
 * The error codes the API answers with. They are a closed set so a screen can branch on
 * the code and print the message from this module rather than the one on the wire.
 */
export type SigningProviderErrorCode =
  | 'unknown_provider'
  | 'provider_not_configured'
  | 'not_confirmed'
  | 'document_tags_unresolved'
  | 'document_fields_not_materialized'
  | 'provider_unavailable'
  | 'provider_unconfigured';

export type SigningProviderResult =
  | { valid: true; value: SigningProviderKey }
  | { valid: false; error: string };

/**
 * Validation rule 1 — `provider` must be a known key.
 *
 * The unknown case is a *refusal*, never a fallback: silently signing with the in-house
 * engine when someone asked for SignWell would be the worst possible way to discover a
 * typo.
 */
export function validateSigningProvider(provider: unknown): SigningProviderResult {
  const value = typeof provider === 'string' ? provider.trim() : '';
  if (!isSigningProviderKey(value)) {
    return { valid: false, error: SIGNING_PROVIDER_MESSAGES.provider.unknown };
  }
  return { valid: true, value };
}

/** Validation rule 3 — the confirmation checkbox, which the modal gates its button on. */
export function validateProviderChangeConfirmed(
  confirmed: unknown,
): { valid: true } | { valid: false; error: string } {
  if (confirmed !== true) {
    return { valid: false, error: SIGNING_PROVIDER_MESSAGES.provider.notConfirmed };
  }
  return { valid: true };
}

/**
 * Validation rule 2 — a provider is selectable when its configuration is **present**.
 *
 * That is the whole gate, and it was narrowed to this deliberately: `reachable` and
 * `webhookRegistered` are live checks displayed beside the option and never gates on it,
 * because no deployed environment has a public address SignWell can reach, and making a
 * live registration a precondition would make the provider unselectable everywhere while
 * those same environments run correctly on convergence alone (requirement 32).
 */
export function providerNotConfiguredMessage(
  key: string,
  missing: readonly string[],
): string {
  return SIGNING_PROVIDER_MESSAGES.provider.notConfigured(signingProviderName(key), missing);
}
