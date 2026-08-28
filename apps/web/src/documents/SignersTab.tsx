'use client';

import { useState } from 'react';
import { ENVELOPE_MESSAGES } from '@devscribed/validation';
import { Badge, Button, Card, InfoBanner } from '@/ds';
import { apiRequest, failureMessage } from './api';
import {
  envelopeUrl,
  formatUtcTimestamp,
  signerStatusLabel,
  signerStatusTone,
  type EnvelopeDetail,
  type EnvelopeSignerDto,
} from './envelopes';
import { useToast } from './toast';

/**
 * The Signers tab. Each row is one `EnvelopeSigner`: who they are, where they got to,
 * and — when the invitation bounced — the one action that can fix it.
 *
 * A captured signature survives a void or a decline (requirement 33), so the timestamps
 * here are rendered from whatever the envelope carries rather than from its status.
 */
export function SignersTab({
  orgId,
  detail,
  canManage,
  onChanged,
}: {
  orgId: string;
  detail: EnvelopeDetail;
  canManage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [resending, setResending] = useState<string | null>(null);

  const signers = [...detail.signers].sort((a, b) => a.order - b.order);

  /** Requirement 13 — a resend re-issues the *current* signer's token, nothing else. */
  async function resend(signer: EnvelopeSignerDto): Promise<void> {
    if (resending) return;
    setResending(signer.id);
    const result = await apiRequest(
      `${envelopeUrl(orgId, detail.id)}/signers/${signer.id}/resend`,
      { method: 'POST', body: JSON.stringify({}) },
    );
    setResending(null);

    if (!result.ok) {
      toast.show({
        testId: 'toast-envelope-error',
        message:
          result.failure.error === 'rate_limited'
            ? ENVELOPE_MESSAGES.resend.tooSoon
            : result.failure.error === 'not_current_signer'
              ? ENVELOPE_MESSAGES.resend.wrongSigner
              : failureMessage(result.failure),
        tone: 'error',
      });
      return;
    }

    toast.show({
      testId: 'toast-envelope-resent',
      message: ENVELOPE_MESSAGES.toast.resent,
      tone: 'success',
    });
    onChanged();
  }

  return (
    <Card padded={false}>
      {signers.map((signer) => {
        const bounced = signer.lastEmailStatus === 'bounced';
        // A resend only makes sense while the envelope is still in flight and this signer
        // has not finished; anything else would be a control that always 409s.
        const resendable =
          canManage &&
          (detail.status === 'sent' || detail.status === 'partially_signed') &&
          signer.status !== 'signed' &&
          signer.status !== 'declined';

        return (
          <div
            key={signer.id}
            data-testid={`envelope-signer-row-${signer.order}`}
            style={{
              display: 'flex',
              gap: 'var(--sp-8)',
              alignItems: 'flex-start',
              padding: 'var(--sp-8) var(--sp-10)',
              borderTop: '1px solid var(--divider)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-15)',
                color: 'var(--text-muted)',
                width: 24,
              }}
            >
              {signer.order}.
            </span>

            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}>
                {signer.label || signer.roleKey}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--fs-15)', color: 'var(--text)' }}>
                {signer.name || '—'}
              </span>
              <span style={{ display: 'block', fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}>
                {signer.email || '—'}
              </span>

              {bounced && (
                <span style={{ display: 'block', marginTop: 'var(--sp-4)' }}>
                  <InfoBanner tone="warning" data-testid={`envelope-signer-bounce-${signer.order}`}>
                    {ENVELOPE_MESSAGES.bounce(signer.email)}
                  </InfoBanner>
                </span>
              )}

              {signer.declineReason && (
                <span
                  style={{
                    display: 'block',
                    marginTop: 'var(--sp-4)',
                    fontSize: 'var(--fs-14)',
                    color: 'var(--text-sub)',
                  }}
                >
                  Reason: {signer.declineReason}
                </span>
              )}
            </span>

            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 'var(--sp-4)',
              }}
            >
              <Badge
                tone={signerStatusTone(signer.status)}
                data-testid={`envelope-signer-status-${signer.order}`}
              >
                {signerStatusLabel(signer.status)}
              </Badge>

              <span
                data-testid={`envelope-signer-signed-at-${signer.order}`}
                style={{ fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}
              >
                {signer.signedAt
                  ? formatUtcTimestamp(signer.signedAt)
                  : signer.declinedAt
                    ? formatUtcTimestamp(signer.declinedAt)
                    : '—'}
              </span>

              {resendable && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={resending === signer.id}
                  data-testid={`envelope-resend-btn-${signer.order}`}
                  onClick={() => void resend(signer)}
                >
                  Resend link
                </Button>
              )}
            </span>
          </div>
        );
      })}
    </Card>
  );
}
