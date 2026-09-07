'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, FormActions, Modal, TextArea } from '@devscribed/ds';
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
    >
      <form
        id="request-decline-form"
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}
      >
        {/* The system ships the field now: its own label, border, focus ring, error
            treatment and message slot replace the hand-drawn box this screen carried
            while there was no textarea to reach for. */}
        <TextArea
          id="request-detail-decline-reason"
          label="Reason"
          value={reason}
          disabled={saving}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
          data-testid="request-detail-decline-reason"
          aria-invalid={error ? true : undefined}
          error={error ?? undefined}
          errorId="request-detail-decline-error"
        />

        <FormActions>
          <Button type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="delete"
            preloader={saving}
            disabled={saving}
            data-testid="request-detail-decline-confirm"
          >
            {saving ? 'Declining' : 'Decline'}
          </Button>
        </FormActions>
      </form>
    </Modal>
  );
}
