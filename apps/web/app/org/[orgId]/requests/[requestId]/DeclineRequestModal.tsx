'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Modal } from '@/ds';
import { REQUEST_MESSAGES, validateDeclineReason } from '@devscribed/validation';

/**
 * Declining a request requires a reason of 1–1000 characters, which is stored as the
 * body of a message in the same transaction as the status: a refusal is always visible
 * in the conversation and never only in a status (requirement 25).
 *
 * The confirm control is disabled only while the request is in flight. Submitting with an
 * empty reason shows the field error and changes nothing.
 */
export function DeclineRequestModal({
  orgId,
  requestId,
  open,
  onClose,
  onDeclined,
}: {
  orgId: string;
  requestId: string;
  open: boolean;
  onClose: () => void;
  onDeclined: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError(null);
    setSaving(false);
  }, [open]);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (saving) return;

    const parsed = validateDeclineReason(reason);
    if (!parsed.valid) {
      setError(parsed.error);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/requests/${requestId}/decline`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ reason }),
        },
      );
      if (response.ok) {
        setSaving(false);
        onDeclined();
        onClose();
        return;
      }
      const body = await response.json().catch(() => null);
      setError(body?.fields?.reason ?? body?.message ?? REQUEST_MESSAGES.genericError);
    } catch {
      setError(REQUEST_MESSAGES.genericError);
    }
    setSaving(false);
  }

  return (
    <Modal
      open={open}
      title="Decline this request"
      onClose={() => {
        if (!saving) onClose();
      }}
      width={440}
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={saving}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="request-decline-form"
            variant="danger"
            size="lg"
            loading={saving}
            data-testid="request-detail-decline-confirm"
            style={{ flex: 1 }}
          >
            {saving ? 'Declining' : 'Decline'}
          </Button>
        </>
      }
    >
      <form id="request-decline-form" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <label
            htmlFor="request-detail-decline-reason"
            style={{
              display: 'block',
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-11)',
              letterSpacing: 'var(--ls-wider)',
              textTransform: 'uppercase',
              color: error ? 'var(--error-500)' : 'var(--text-muted)',
              marginBottom: 'var(--sp-4)',
            }}
          >
            Reason
          </label>
          {/* @ds ships no textarea; the token-carrying native element, as elsewhere. */}
          <textarea
            id="request-detail-decline-reason"
            value={reason}
            rows={4}
            disabled={saving}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            data-testid="request-detail-decline-reason"
            aria-invalid={error ? true : undefined}
            style={{
              width: '100%',
              border: `var(--border-crisp) solid ${
                error ? 'var(--error-500)' : focus ? 'var(--accent)' : 'var(--border-strong)'
              }`,
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--sp-4) var(--sp-6)',
              fontFamily: 'var(--font-text)',
              fontSize: 'var(--fs-15)',
              color: 'var(--text)',
              background: 'var(--bg-field)',
              outline: 'none',
              boxShadow: focus
                ? error
                  ? 'var(--shadow-glow-error)'
                  : 'var(--shadow-glow-accent)'
                : 'none',
              transition: 'border-color .15s, box-shadow .15s',
              resize: 'vertical',
              opacity: saving ? 0.55 : 1,
            }}
          />
          {error && (
            <div
              data-testid="request-detail-decline-error"
              style={{
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-12)',
                color: 'var(--error-500)',
                marginTop: 'var(--sp-2)',
              }}
            >
              {error}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
