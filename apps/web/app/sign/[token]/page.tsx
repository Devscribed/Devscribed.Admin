'use client';

import { use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ENVELOPE_LIMITS,
  ENVELOPE_MESSAGES,
  SIGNING_PROVIDER_MESSAGES,
  validateReason,
  validateSignature,
} from '@devscribed/validation';
import { Badge, Button, Card, Checkbox, Input, InfoBanner, Modal, Spinner } from '@/ds';
import { apiRequest, failureMessage, type ApiFailure } from '@/documents/api';
import { DocumentFrame } from '@/documents/DocumentFrame';
import {
  abbreviateHash,
  formatLongDate,
  formatUtcTimestamp,
  signingUrl,
  type DocumentUrlResponse,
  type SignResponse,
  type SigningPayload,
  type SigningState,
} from '@/documents/envelopes';
import { FieldInput, validateFieldValues } from '@/documents/FieldInput';
import { SignaturePad, type SignatureMode } from '@/documents/SignaturePad';
import { ToastProvider, useToast } from '@/documents/toast';
import { EmbeddedSigning } from './EmbeddedSigning';
import { SigningLayout } from './SigningLayout';

/** The documented failure bodies carry a little more than the shared shape names. */
type SigningFailure = ApiFailure & {
  expiredAt?: string;
  voidedAt?: string;
  reason?: string;
  retryAfterSeconds?: number;
};

export default function SigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (
    <ToastProvider>
      <SigningScreen token={token} />
    </ToastProvider>
  );
}

function SigningScreen({ token }: { token: string }) {
  const toast = useToast();

  const [payload, setPayload] = useState<SigningPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [rateLimited, setRateLimited] = useState(false);
  /**
   * Spec 04. Distinct from every other failure on purpose: the signer's link is still
   * good and the token was not consumed, so the page says so and offers a retry instead
   * of the "not valid" panel, which would be both unhelpful and untrue.
   */
  const [providerDown, setProviderDown] = useState(false);
  const [embeddedDone, setEmbeddedDone] = useState(false);

  const [values, setValues] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<SignatureMode>('drawn');
  const [typedName, setTypedName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [consentError, setConsentError] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);

  const [requestingLink, setRequestingLink] = useState(false);
  const [linkRequested, setLinkRequested] = useState(false);

  // Owned here rather than by `SignaturePad` so a failed submit cannot cost the signer
  // their signature — the element never unmounts and the pixels are read at submit time.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setProviderDown(false);
    const result = await apiRequest<SigningPayload>(signingUrl(token));
    setLoading(false);

    if (result.ok) {
      setPayload(result.data);
      setValues(Object.fromEntries((result.data.fields ?? []).map((field) => [field.key, ''])));
      return;
    }

    const failure = result.failure as SigningFailure;
    if (failure.status === 429) {
      setRateLimited(true);
      return;
    }
    if (failure.status === 503 || failure.error === 'provider_unavailable') {
      // Nothing has been lost: the link still works and nothing was consumed.
      setProviderDown(true);
      return;
    }
    // Every other failure becomes a panel. Note what is *not* branched on: a 404 carries
    // no distinction between "no such token" and "a token you may not use", and this
    // client does not invent one — requirement 15 and TC-02-INT-24.
    setPayload(mapFailureToPayload(failure));
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Requirement 17 — opening a valid link records a `viewed` event. Idempotent on the
   * server, so a re-render or a refresh costs nothing and the result is never awaited:
   * the audit trail must not be able to delay the document appearing.
   */
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current || payload?.state !== 'ready_to_sign') return;
    viewed.current = true;
    void apiRequest(`${signingUrl(token)}/view`, { method: 'POST', body: JSON.stringify({}) });
  }, [payload?.state, token]);

  if (loading) {
    return (
      <SigningLayout>
        <div
          data-testid="signing-loading"
          style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}
        >
          <Spinner size={28} />
        </div>
      </SigningLayout>
    );
  }

  // Spec 04 — the provider could not be reached. The shell, the retry card, and nothing
  // else: we do not know which envelope this is, so the page names no organization.
  if (providerDown) {
    return (
      <SigningLayout>
        <EmbeddedSigning
          url={null}
          error
          loading={false}
          onRetry={() => {
            setLoading(true);
            void load();
          }}
          onCompleted={() => undefined}
        />
      </SigningLayout>
    );
  }

  if (rateLimited) {
    return (
      <SigningLayout>
        <Card title="Please slow down">
          <p style={{ margin: 0, fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
            {ENVELOPE_MESSAGES.signing.rateLimited}
          </p>
        </Card>
      </SigningLayout>
    );
  }

  const state: SigningState = payload?.state ?? 'invalid';
  const envelope = payload?.envelope ?? null;
  // The sign response carries these at the top level; a *reopened* link gets them from
  // the signer block of `GET /api/sign/{token}`. Reading only the former is what made a
  // returning signer see "You have signed this document." with no date at all, where the
  // spec's terminal panel names the moment (requirement 25).
  const signedAt = payload?.signedAt ?? payload?.signer?.signedAt ?? null;
  const declinedAt = payload?.declinedAt ?? payload?.signer?.declinedAt ?? null;
  // Terminal panels name no organization: the copy a stranger sees for an unknown token
  // must be identical whether or not the envelope behind it exists.
  const branding = state === 'ready_to_sign' ? envelope?.senderOrganizationName : null;

  /* ---------------- signing ---------------- */

  function readSignature(): { type: SignatureMode; value: string } {
    if (mode === 'typed') return { type: 'typed', value: typedName };
    const canvas = canvasRef.current;
    return { type: 'drawn', value: canvas ? canvas.toDataURL('image/png') : '' };
  }

  async function sign(): Promise<void> {
    if (submitting || !payload) return;

    const fields = payload.fields ?? [];
    const nextFieldErrors = validateFieldValues(fields, values);
    const signature = readSignature();
    const signatureResult = validateSignature(signature);
    const nextConsentError = consent ? null : ENVELOPE_MESSAGES.signing.consentRequired;
    const nextSignatureError = signatureResult.valid ? null : signatureResult.error;

    setFieldErrors(nextFieldErrors);
    setConsentError(nextConsentError);
    setSignatureError(nextSignatureError);
    setFormError(null);

    if (
      Object.keys(nextFieldErrors).length > 0 ||
      nextConsentError !== null ||
      nextSignatureError !== null
    ) {
      return;
    }

    setSubmitting(true);
    const result = await apiRequest<SignResponse>(`${signingUrl(token)}/sign`, {
      method: 'POST',
      body: JSON.stringify({
        fieldValues: Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? ''])),
        signature,
        consentAccepted: consent,
      }),
    });

    if (result.ok) {
      // Requirement 25 — the link is now a read-only view of the same document.
      //
      // The document has *changed* by signing: the values just submitted (and, once the
      // server draws them, the signature itself) belong in the rendered body. The payload
      // in state was fetched before the submit, so re-rendering from it showed the signer
      // a document without their own answers. The server composes that HTML — patching it
      // here would drift from the PDF — so the fresh copy is read back from the server.
      // The button stays in its loading state across the re-read: the submit is not
      // finished, from the signer's point of view, until the signed document is on screen.
      const refreshed = await apiRequest<SigningPayload>(signingUrl(token));
      setSubmitting(false);

      setPayload((current) => {
        // Whichever source is more current wins per field: the sign response is
        // authoritative for the outcome, the re-read for the document. Read defensively —
        // an API that grows `envelope` on the sign response, or one that returns nothing
        // useful from the re-read, must both leave the panel renderable.
        const base = refreshed.ok ? { ...current, ...refreshed.data } : { ...current };
        const signedEnvelope =
          (result.data as Partial<SigningPayload>).envelope ??
          (refreshed.ok ? refreshed.data.envelope : null) ??
          current?.envelope ??
          null;
        return {
          ...base,
          envelope: signedEnvelope,
          state: 'already_signed',
          signedAt: result.data.signedAt,
          envelopeStatus: result.data.envelopeStatus,
          downloadAvailable: result.data.downloadAvailable,
        };
      });
      toast.show({
        testId: 'toast-signing-signed',
        message: ENVELOPE_MESSAGES.toast.signed,
        tone: 'success',
      });
      return;
    }

    setSubmitting(false);
    const failure = result.failure as SigningFailure;

    if (failure.errors) {
      setFieldErrors(failure.errors);
      return;
    }

    switch (failure.error) {
      case 'consent_required':
        setConsentError(ENVELOPE_MESSAGES.signing.consentRequired);
        return;
      case 'empty_signature':
        setSignatureError(ENVELOPE_MESSAGES.signing.emptySignature);
        return;
      case 'invalid_typed_signature':
        setSignatureError(ENVELOPE_MESSAGES.signing.typedSignatureEmpty);
        return;
      case 'signature_too_large':
        setSignatureError(ENVELOPE_MESSAGES.signing.signatureTooLarge);
        return;
      case 'document_integrity_failure':
        setFormError(ENVELOPE_MESSAGES.signing.integrityFailure);
        return;
      case 'not_your_turn':
      case 'voided':
      case 'declined':
      case 'expired':
        // The envelope moved under the signer's feet; the page becomes that state.
        setPayload(mapFailureToPayload(failure));
        return;
      default:
        // Network and 5xx: the message is generic and, crucially, nothing is reset.
        setFormError(failureMessage(failure));
    }
  }

  async function decline(): Promise<void> {
    if (declining) return;
    const result = validateReason(declineReason, false);
    if (!result.valid) {
      setDeclineError(result.error);
      return;
    }

    setDeclining(true);
    const response = await apiRequest<{ state: SigningState; declinedAt: string }>(
      `${signingUrl(token)}/decline`,
      { method: 'POST', body: JSON.stringify({ reason: result.value }) },
    );
    setDeclining(false);

    if (!response.ok) {
      setDeclineError(failureMessage(response.failure));
      return;
    }

    setDeclineOpen(false);
    setPayload((current) =>
      current ? { ...current, state: 'declined', declinedAt: response.data.declinedAt } : current,
    );
    toast.show({
      testId: 'toast-signing-declined',
      message: ENVELOPE_MESSAGES.toast.declined,
      tone: 'success',
    });
  }

  async function requestNewLink(): Promise<void> {
    if (requestingLink) return;
    setRequestingLink(true);
    // Requirement 35 — this notifies the sender and issues nothing. A page that could mint
    // its own token would make expiry advisory.
    await apiRequest(`${signingUrl(token)}/request-new-link`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setRequestingLink(false);
    setLinkRequested(true);
  }

  async function download(): Promise<void> {
    const result = await apiRequest<DocumentUrlResponse>(`${signingUrl(token)}/document`);
    if (!result.ok) {
      setFormError(failureMessage(result.failure));
      return;
    }
    window.location.assign(result.data.url);
  }

  /* ---------------- terminal panels ---------------- */

  if (state !== 'ready_to_sign') {
    return (
      <SigningLayout organizationName={branding}>
        <div data-testid="signing-page">
          {state === 'invalid' && (
            <Panel testId="signing-state-invalid" title="This signing link is not valid.">
              <p style={PARAGRAPH}>
                If you believe this is a mistake, contact the sender.
              </p>
            </Panel>
          )}

          {state === 'expired' && (
            <Panel
              testId="signing-state-expired"
              title={ENVELOPE_MESSAGES.signing.expired(formatLongDate(payload?.expiredAt))}
            >
              {linkRequested ? (
                <p style={PARAGRAPH}>We have let the sender know. They can send you a new link.</p>
              ) : (
                <Button
                  variant="primary"
                  loading={requestingLink}
                  data-testid="signing-request-new-link-btn"
                  onClick={() => void requestNewLink()}
                >
                  Request a new link
                </Button>
              )}
            </Panel>
          )}

          {state === 'voided' && (
            <Panel
              testId="signing-state-voided"
              title={ENVELOPE_MESSAGES.signing.voided(formatLongDate(payload?.voidedAt))}
            >
              {payload?.reason && <p style={PARAGRAPH}>Reason: {payload.reason}</p>}
            </Panel>
          )}

          {state === 'declined' && (
            <Panel testId="signing-state-declined" title={ENVELOPE_MESSAGES.signing.declined}>
              {declinedAt && (
                <p style={PARAGRAPH}>Declined on {formatUtcTimestamp(declinedAt)}.</p>
              )}
            </Panel>
          )}

          {state === 'not_your_turn' && (
            <Panel
              testId="signing-state-not-your-turn"
              title={ENVELOPE_MESSAGES.signing.notYourTurn}
            />
          )}

          {(state === 'already_signed' || state === 'completed') && (
            <>
              {envelope?.renderedHtml && (
                <div style={{ marginBottom: 'var(--sp-8)' }}>
                  <DocumentFrame
                    html={envelope.renderedHtml}
                    testId="signing-document-frame"
                    title={envelope.title}
                    height="55vh"
                  />
                </div>
              )}
              <Panel
                testId="signing-state-signed"
                title={
                  signedAt
                    ? `You signed this document on ${formatUtcTimestamp(signedAt)}.`
                    : 'You have signed this document.'
                }
              >
                {payload?.downloadAvailable ? (
                  <Button
                    variant="primary"
                    data-testid="signing-download-btn"
                    onClick={() => void download()}
                  >
                    Download signed PDF
                  </Button>
                ) : (
                  <p style={PARAGRAPH}>
                    A copy will be emailed to you once every signer has signed.
                  </p>
                )}
                {formError && (
                  <p style={{ ...PARAGRAPH, color: 'var(--error-500)' }}>{formError}</p>
                )}
              </Panel>
            </>
          )}
        </div>
      </SigningLayout>
    );
  }

  /* ---------------- the embedded surface ---------------- */

  /**
   * Requirement 15 — our shell, our token, our access rules; SignWell owns only the
   * widget. The signer never leaves our origin, so the invitation, the link's lifetime,
   * and every access decision stay ours.
   *
   * The branch is on the **surface the server decided**, not on a provider key: the
   * client is told which body to render and never works it out for itself.
   */
  if (payload?.surface === 'embedded') {
    return (
      <SigningLayout organizationName={envelope?.senderOrganizationName} wide>
        {/* Tighter than our own surface: the widget repeats the document's name in its own
            header, so the band between our title and its is spent twice. */}
        <div data-testid="signing-page" style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--sp-6)',
              flexWrap: 'wrap',
            }}
          >
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-27)',
                letterSpacing: '-.6px',
                margin: 0,
                color: 'var(--text)',
              }}
            >
              {envelope?.title}
            </h1>
            {/* A test-mode document has no legal weight and must never be mistaken for
                one that does, so the badge carries its own words rather than a colour. */}
            {payload?.testMode && (
              <Badge tone="warning" data-testid="sign-test-badge">
                {SIGNING_PROVIDER_MESSAGES.signing.testModeBanner}
              </Badge>
            )}
          </div>

          {embeddedDone ? (
            // Edge case 19 — our own confirmation, shown because a frame said so. The
            // message is never written anywhere; the envelope converges on the next read
            // or sweep whether or not it ever arrived.
            <Panel testId="signing-state-signed" title="Thank you — your signature has been sent.">
              <p style={PARAGRAPH}>
                A copy will be emailed to you once every signer has signed.
              </p>
            </Panel>
          ) : (
            <EmbeddedSigning
              url={payload?.embeddedSigningUrl ?? null}
              error={false}
              loading={!payload?.embeddedSigningUrl}
              onRetry={() => {
                setLoading(true);
                void load();
              }}
              onCompleted={() => setEmbeddedDone(true)}
            />
          )}

          <footer
            style={{
              display: 'flex',
              gap: 'var(--sp-8)',
              flexWrap: 'wrap',
              fontSize: 'var(--fs-13)',
              color: 'var(--text-muted)',
            }}
          >
            <span data-testid="sign-provider-attribution">
              {SIGNING_PROVIDER_MESSAGES.signing.attribution(
                payload?.providerName ?? '',
                envelope?.senderOrganizationName ?? '',
              )}
            </span>
            <span>Link expires {formatLongDate(envelope?.expiresAt)}</span>
          </footer>
        </div>
      </SigningLayout>
    );
  }

  /* ---------------- the signing form ---------------- */

  const fields = payload?.fields ?? [];

  return (
    <SigningLayout organizationName={envelope?.senderOrganizationName}>
      <div data-testid="signing-page" style={{ display: 'grid', gap: 'var(--sp-10)' }}>
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-27)',
              letterSpacing: '-.6px',
              margin: '0 0 6px',
              color: 'var(--text)',
            }}
          >
            {envelope?.title}
          </h1>
          <p style={{ margin: 0, fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
            {envelope?.senderOrganizationName} has sent you this document to sign
            {payload?.signer ? ` as ${payload.signer.roleLabel}` : ''}.
          </p>
        </div>

        {envelope?.renderedHtml && (
          <DocumentFrame
            html={envelope.renderedHtml}
            testId="signing-document-frame"
            title={envelope.title}
            height="55vh"
          />
        )}

        {fields.length > 0 && (
          <Card title="Your details">
            <div data-testid="signing-fields-form" style={{ display: 'grid', gap: 'var(--sp-7)' }}>
              {fields.map((field) => (
                <FieldInput
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ''}
                  disabled={submitting}
                  testId={`signing-field-${field.key}`}
                  error={fieldErrors[field.key]}
                  onChange={(next) => setValues((prev) => ({ ...prev, [field.key]: next }))}
                />
              ))}
            </div>
          </Card>
        )}

        <SignaturePad
          mode={mode}
          onModeChange={setMode}
          typedName={typedName}
          onTypedNameChange={setTypedName}
          canvasRef={canvasRef}
          disabled={submitting}
          error={signatureError ?? undefined}
        />

        <div>
          <Checkbox
            checked={consent}
            disabled={submitting}
            onChange={setConsent}
            data-testid="signing-consent-checkbox"
            label={payload?.consentText ?? ENVELOPE_MESSAGES.signing.consentText}
          />
          {consentError && (
            <p
              data-testid="signing-consent-error"
              style={{ margin: '6px 0 0', fontSize: 'var(--fs-13)', color: 'var(--error-500)' }}
            >
              {consentError}
            </p>
          )}
        </div>

        {formError && <InfoBanner tone="error">{formError}</InfoBanner>}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 'var(--sp-6)',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="secondary"
            disabled={submitting}
            data-testid="signing-decline-btn"
            onClick={() => setDeclineOpen(true)}
          >
            Decline to sign
          </Button>
          {/* Disabled only while a request is in flight — never for consent or for an
              empty field. Clicking is how the signer learns what is missing. */}
          <Button
            variant="primary"
            loading={submitting}
            data-testid="signing-submit-btn"
            onClick={() => void sign()}
          >
            Sign document
          </Button>
        </div>

        <footer
          style={{
            display: 'flex',
            gap: 'var(--sp-8)',
            flexWrap: 'wrap',
            fontSize: 'var(--fs-13)',
            color: 'var(--text-muted)',
          }}
        >
          <span data-testid="signing-document-hash" title={envelope?.documentHash ?? undefined}>
            Document hash {abbreviateHash(envelope?.documentHash)}
          </span>
          <span>Link expires {formatLongDate(envelope?.expiresAt)}</span>
        </footer>
      </div>

      <Modal
        open={declineOpen}
        title="Decline to sign"
        onClose={() => setDeclineOpen(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setDeclineOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={declining}
              data-testid="signing-decline-confirm-btn"
              onClick={() => void decline()}
            >
              Decline
            </Button>
          </>
        }
      >
        <div data-testid="signing-decline-modal">
          <p style={{ margin: '0 0 var(--sp-8)', fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
            Declining ends the signing process for everyone. The sender is notified. You can add a
            reason, but you do not have to.
          </p>
          <Input
            label="Reason (optional)"
            value={declineReason}
            maxLength={ENVELOPE_LIMITS.reasonMax}
            data-testid="signing-decline-reason-input"
            onChange={(event) => setDeclineReason(event.target.value)}
            error={declineError ?? undefined}
            wrapperStyle={{ gap: 0 }}
          />
        </div>
      </Modal>
    </SigningLayout>
  );
}

const PARAGRAPH = {
  margin: 'var(--sp-5) 0 0',
  fontSize: 'var(--fs-15)',
  color: 'var(--text-sub)',
} as const;

/** Every terminal state is the same card: one sentence, and at most one action. */
function Panel({
  testId,
  title,
  children,
}: {
  testId: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <Card>
      <div data-testid={testId}>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-21)',
            color: 'var(--text)',
          }}
        >
          {title}
        </p>
        {children}
      </div>
    </Card>
  );
}

/**
 * The documented error bodies of the public surface, turned into the state the page
 * renders. Anything unrecognized — including the 404 that covers both an unknown token
 * and one the caller may not use — becomes `invalid`, which is the panel that says the
 * least.
 */
function mapFailureToPayload(failure: SigningFailure): SigningPayload {
  switch (failure.error) {
    case 'expired':
      return { state: 'expired', expiredAt: failure.expiredAt ?? null };
    case 'voided':
      return {
        state: 'voided',
        voidedAt: failure.voidedAt ?? null,
        reason: failure.reason ?? null,
      };
    case 'declined':
      return { state: 'declined' };
    case 'not_your_turn':
      return { state: 'not_your_turn' };
    default:
      return { state: 'invalid' };
  }
}
