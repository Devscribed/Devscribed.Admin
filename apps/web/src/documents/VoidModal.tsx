'use client';

import { useState } from 'react';
import { ENVELOPE_LIMITS, validateReason } from '@devscribed/validation';
import { Button, FormActions, TextInput, Modal } from '@devscribed/ds';
import { focusByTestId } from '@/field-error';

/**
 * The void confirmation. The copy is the spec's, verbatim, because the three consequences
 * it names — links stop working, both parties are notified, and it cannot be undone — are
 * the whole reason this action is behind a dialog instead of a button.
 *
 * The reason is required by validation rule 10 and the confirm button is still never
 * disabled for it: pressing it with an empty box is how the caller learns the rule.
 */
export function VoidModal({
  open,
  submitting,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function confirm(): void {
    const result = validateReason(reason, true);
    if (!result.valid) {
      setError(result.error);
      focusByTestId('envelope-void-reason-input');
      return;
    }
    setError(null);
    onConfirm(result.value);
  }

  return (
    <Modal open={open} title="Void document" onClose={onCancel}>
      <div data-testid="envelope-void-modal">
        <p style={{ margin: '0 0 var(--space-6)', fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}>
          Voiding stops the signing process. Signing links stop working immediately and both
          parties are notified. This cannot be undone.
        </p>
        <TextInput
          label="Reason *"
          value={reason}
          maxLength={ENVELOPE_LIMITS.reasonMax}
          data-testid="envelope-void-reason-input"
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => {
            const result = validateReason(reason, true);
            setError(result.valid ? null : result.error);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'field-error-reason' : undefined}
          error={error ?? undefined}
          errorId="field-error-reason"
          wrapperStyle={{ gap: 0 }}
        />

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button type="button" data-testid="envelope-void-cancel-btn" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="delete"
              preloader={submitting}
              data-testid="envelope-void-confirm-btn"
              onClick={confirm}
            >
              Void document
            </Button>
          </FormActions>
        </div>
      </div>
    </Modal>
  );
}
