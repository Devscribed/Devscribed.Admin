'use client';

import { notFound } from 'next/navigation';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import {
  ENVELOPE_MESSAGES,
  SIGNING_PROVIDER_MESSAGES,
  effectiveStatus,
  hasCapability,
  isTerminal as isTerminalStatus,
} from '@devscribed/validation';
import { Badge, Button, Card, InfoBanner, Preloader, PageTabs } from '@devscribed/ds';
import { PageHeader } from '@/layout/PageHeader';
import { useSession } from '@/layout/session-context';
import { apiRequest, failureMessage } from '@/documents/api';
import { ActivityTab } from '@/documents/ActivityTab';
import { DocumentFrame } from '@/documents/DocumentFrame';
import {
  abbreviateHash,
  envelopeStatusLabel,
  envelopeStatusTone,
  envelopeUrl,
  formatLongDate,
  formatUtcTimestamp,
  type DocumentUrlResponse,
  type EnvelopeDetail,
} from '@/documents/envelopes';
import { FillForm } from '@/documents/FillForm';
import { SignersTab } from '@/documents/SignersTab';
import { useToast } from '@/toast';
import { VoidModal } from '@/documents/VoidModal';

type Tab = 'document' | 'signers' | 'activity';

export default function EnvelopeDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; envelopeId: string }>;
}) {
  const { orgId, envelopeId } = use(params);
  return <EnvelopeScreen orgId={orgId} envelopeId={envelopeId} />;
}

function EnvelopeScreen({ orgId, envelopeId }: { orgId: string; envelopeId: string }) {
  const { showToast } = useToast();
  const { role } = useSession();

  const [detail, setDetail] = useState<EnvelopeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [tab, setTab] = useState<Tab>('document');
  const [voidOpen, setVoidOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const result = await apiRequest<EnvelopeDetail>(envelopeUrl(orgId, envelopeId));
    if (!result.ok) {
      if (result.failure.status === 403 || result.failure.status === 404) setGone(true);
      setLoading(false);
      return;
    }
    setDetail(result.data);
    setLoading(false);
  }, [orgId, envelopeId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The send that happened on `/documents/new` finished on another screen, so the toast
   * it earned is raised here. Fired once — a reload with the flag still in the address
   * bar should not congratulate the caller a second time.
   *
   * Read from `location` rather than `useSearchParams` on purpose: the hook forces the
   * whole screen behind a Suspense boundary at build time, and this is a one-shot read of
   * a flag that only ever exists on the first paint after a redirect.
   */
  const sentAnnounced = useRef(false);
  useEffect(() => {
    if (sentAnnounced.current) return;
    if (new URLSearchParams(window.location.search).get('sent') !== '1') return;
    sentAnnounced.current = true;
    showToast('toast-envelope-sent', ENVELOPE_MESSAGES.toast.sent);
  }, [showToast]);

  if (gone || !hasCapability(role, 'ViewEnvelopes')) notFound();

  if (loading || !detail) {
    return (
      <div
        data-testid="envelope-loading"
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--space-12)',
          color: 'var(--action-primary)',
        }}
      >
        <Preloader size={28} />
      </div>
    );
  }

  // Requirement 34 — expiry is lazy and authoritative, so a stored `sent` whose date has
  // passed reads as expired here even if the sweep has not run yet. The screen must never
  // be more optimistic than the token check the signer will hit.
  const status = effectiveStatus(
    detail.status,
    detail.expiresAt ? new Date(detail.expiresAt) : null,
  );
  const draft = status === 'draft';
  const canManage = hasCapability(role, 'ManageEnvelopes');
  const canVoid = detail.canVoid && hasCapability(role, 'VoidEnvelope');
  const canDownload = detail.canDownload && hasCapability(role, 'DownloadSignedDocument');
  const canAudit = hasCapability(role, 'ViewEnvelopeAudit');
  const pdfFailed = detail.pdfStatus === 'failed';
  const pdfPending = detail.pdfStatus === 'pending';

  async function voidEnvelope(reason: string): Promise<void> {
    if (!detail) return;
    setVoiding(true);
    const result = await apiRequest(`${envelopeUrl(orgId, detail.id)}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    setVoiding(false);

    if (!result.ok) {
      showToast(
        'toast-envelope-error',
        result.failure.error === 'invalid_status'
          ? ENVELOPE_MESSAGES.void.wrongStatus
          : failureMessage(result.failure),
        'error',
      );
      return;
    }

    setVoidOpen(false);
    showToast('toast-envelope-voided', ENVELOPE_MESSAGES.toast.voided);
    await load();
  }

  async function download(): Promise<void> {
    if (!detail || downloading) return;
    setDownloading(true);
    const result = await apiRequest<DocumentUrlResponse>(
      `${envelopeUrl(orgId, detail.id)}/document`,
    );
    setDownloading(false);

    if (!result.ok) {
      showToast(
        'toast-envelope-error',
        result.failure.error === 'pdf_not_ready'
          ? ENVELOPE_MESSAGES.pdf.notReady
          : result.failure.error === 'pdf_failed'
            ? ENVELOPE_MESSAGES.pdf.failed
            : failureMessage(result.failure),
        'error',
      );
      return;
    }
    // A presigned URL with a 15-minute TTL — handed to the browser, never proxied.
    window.location.assign(result.data.url);
  }

  async function retryPdf(): Promise<void> {
    if (!detail || retrying) return;
    setRetrying(true);
    const result = await apiRequest(`${envelopeUrl(orgId, detail.id)}/pdf/retry`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setRetrying(false);
    if (!result.ok) {
      showToast('toast-envelope-error', failureMessage(result.failure), 'error');
      return;
    }
    await load();
  }

  const terminalNote =
    status === 'voided' && detail.voidedAt
      ? `Voided on ${formatLongDate(detail.voidedAt)}${
          detail.voidReason ? ` — ${detail.voidReason}` : ''
        }`
      : status === 'declined'
        ? detail.signers.find((signer) => signer.status === 'declined')?.declineReason
          ? `Declined — ${detail.signers.find((signer) => signer.status === 'declined')?.declineReason}`
          : 'Declined'
        : status === 'expired'
          ? `Expired on ${formatLongDate(detail.expiresAt)}`
          : undefined;

  return (
    <div data-testid="envelope-detail">
      <PageHeader
        title={detail.title}
        subtitle={`From: ${detail.template.name} v${detail.template.versionNumber}${
          terminalNote ? ` · ${terminalNote}` : ''
        }`}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Badge status={envelopeStatusTone(status)} data-testid="envelope-status">
              {envelopeStatusLabel(status)}
            </Badge>
            {/* Spec 04 requirement 34 — which provider executed this document, and, in
                test mode, an unmissable badge. Both read the envelope's **own** columns,
                written at send: a configuration change must not relabel history, so a
                test-mode document stays marked as a test forever (edge case 17). A
                test-mode document has no legal weight and must never be mistaken for one
                that does, which is why the badge carries its own words. */}
            {detail.provider && (
              <span
                data-testid="envelope-provider"
                style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
              >
                {SIGNING_PROVIDER_MESSAGES.envelope.signedVia(detail.provider.name)}
              </span>
            )}
            {detail.provider?.testMode && (
              <Badge status="warning" data-testid="envelope-test-badge">
                {SIGNING_PROVIDER_MESSAGES.envelope.testDocument}
              </Badge>
            )}
            {/* Which evidence format the stored PDF carries — our own Certificate of
                Completion, bound into the document, or the provider's audit page
                (requirement 28). Two formats coexist in an organization that has
                switched, and the Known Gaps table accepts that only because the detail
                screen says which one this document has.

                `envelope-certificate-link` is the spec's own id and it is spelled its
                way. It goes on this element, and only when our certificate is the one
                issued, because that is what makes TC-04-E2E-05's "no Certificate of
                Completion is listed" a real assertion rather than one that passes
                because nothing anywhere carries the id.

                It is text and not an anchor, and that is not a shortcut: the
                certificate is bound into the signed PDF by `assembleCompletedDocument`
                rather than stored beside it, so there is one file under either
                provider and nothing separate to link to. Rendering a second download
                would put two documents in the record for one act — the thing
                requirement 28 refuses. `envelope-download-btn` is what fetches it. */}
            {detail.provider && canDownload && (
              <span
                data-testid={
                  detail.provider.certificateIssued ? 'envelope-certificate-link' : undefined
                }
                style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
              >
                {SIGNING_PROVIDER_MESSAGES.envelope.documentIncludes(
                  detail.provider.name,
                  detail.provider.certificateIssued,
                )}
              </span>
            )}
            {canVoid && (
              <Button variant="delete" data-testid="envelope-void-btn" onClick={() => setVoidOpen(true)}>
                Void
              </Button>
            )}
            {canDownload && (
              <Button
                preloader={downloading || pdfPending}
                title={pdfPending ? 'Preparing the signed PDF' : undefined}
                disabled={pdfFailed}
                data-testid="envelope-download-btn"
                onClick={() => void download()}
              >
                Download PDF
              </Button>
            )}
          </div>
        }
      />

      {/* Edge case 16 — the provider this document is waiting on is no longer configured.
          Said plainly rather than left as an envelope that silently stops advancing. */}
      {detail.provider?.unconfigured && !isTerminalStatus(status) && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <InfoBanner variant="warning" data-testid="envelope-provider-unconfigured">
            {SIGNING_PROVIDER_MESSAGES.envelope.unconfiguredInFlight}
          </InfoBanner>
        </div>
      )}

      {pdfFailed && (
        <div style={{ marginBottom: 'var(--space-6)' }}>
          <InfoBanner variant="error" data-testid="envelope-pdf-failed-banner">
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-5)',
                flexWrap: 'wrap',
              }}
            >
              {/* The signatures are captured and legally valid — only the rendering failed
                  (requirement 31), so this is a retry, never a re-signing. */}
              {ENVELOPE_MESSAGES.pdf.failed}
              {canManage && (
                <Button
                  preloader={retrying}
                  data-testid="envelope-pdf-retry-btn"
                  onClick={() => void retryPdf()}
                >
                  Retry
                </Button>
              )}
            </span>
          </InfoBanner>
        </div>
      )}

      <div data-testid="envelope-tabs">
        <PageTabs
          tabs={[
            { value: 'document', label: 'Document', testId: 'envelope-tab-document' },
            { value: 'signers', label: 'Signers', testId: 'envelope-tab-signers' },
            ...(canAudit
              ? [
                  {
                    value: 'activity',
                    label: 'Activity',
                    testId: 'envelope-tab-activity',
                  },
                ]
              : []),
          ]}
          active={tab}
          onChange={(next) => setTab(next as Tab)}
          style={{ marginBottom: 'var(--space-7)' }}
        />
      </div>

      {tab === 'document' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {detail.renderedHtml && (
            <Card padded={false} style={{ padding: 'var(--space-5)' }}>
              <DocumentFrame
                html={detail.renderedHtml}
                testId="envelope-document-frame"
                title={detail.title}
              />
            </Card>
          )}

          {/* The same form in both modes. For anything past draft it is a read-only record
              of what was frozen — the spec asserts the form is present and uneditable
              after send, not that it disappears. */}
          <FillForm
            orgId={orgId}
            detail={detail}
            templates={[
              {
                id: detail.template.id,
                name: detail.template.name,
                currentVersionNumber: detail.template.versionNumber,
              },
            ]}
            /* Exactly one member: the subject this envelope already has, named by the API.
               This screen never changes the subject (it is fixed at creation), so it needs
               the one name the Select has to resolve — not the roster the new-document
               screen loads to *choose* from. Fetching that roster here would put every
               member's name on a read-only screen that needs one of them. */
            members={detail.subject ? [detail.subject] : []}
            templateId={detail.template.id}
            subjectId={detail.subject?.id ?? detail.subjectMembershipId ?? ''}
            onTemplateChange={() => undefined}
            onSubjectChange={() => undefined}
            creating={false}
            readOnly={!draft || !detail.canEdit || !canManage}
            onSaved={setDetail}
            onSent={() => {
              // Sent from this screen, so the toast is raised here directly — the URL
              // flag exists only for the send that happened on `/documents/new`.
              showToast('toast-envelope-sent', ENVELOPE_MESSAGES.toast.sent);
              void load();
            }}
          />

          <div
            style={{
              display: 'flex',
              gap: 'var(--space-7)',
              flexWrap: 'wrap',
              fontSize: 'var(--font-size-s)',
              color: 'var(--text-secondary)',
            }}
          >
            <span data-testid="envelope-document-hash" title={detail.documentHash ?? undefined}>
              Document hash {abbreviateHash(detail.documentHash)}
            </span>
            <span data-testid="envelope-expires-at">
              {status === 'expired' ? 'Expired' : 'Expires'} {formatLongDate(detail.expiresAt)}
            </span>
            {detail.sentAt && <span>Sent {formatUtcTimestamp(detail.sentAt)}</span>}
          </div>
        </div>
      )}

      {tab === 'signers' && (
        <SignersTab
          orgId={orgId}
          detail={detail}
          canManage={canManage}
          onChanged={() => void load()}
        />
      )}

      {tab === 'activity' && canAudit && <ActivityTab orgId={orgId} envelopeId={detail.id} />}

      <VoidModal
        open={voidOpen}
        submitting={voiding}
        onCancel={() => setVoidOpen(false)}
        onConfirm={(reason) => void voidEnvelope(reason)}
      />
    </div>
  );
}
