'use client';

import { SIGNING_PROVIDER_MESSAGES } from '@devscribed/validation';
import { Button, Checkbox, FormActions, Modal } from '@devscribed/ds';

/**
 * The confirmation requirement 33 asks for.
 *
 * This is **one of the two cases `CLAUDE.md` permits a disabled submit**, and it is the
 * deliberate-confirmation one: the checkbox gates the button, and validation never does.
 * The distinction matters — the Save button on the page behind this modal is never
 * disabled for validation, because clicking it is how an admin learns what is wrong.
 *
 * The count it names is the point of the whole modal: envelopes already in flight stay
 * with the old provider until they complete, decline or expire, and nothing about them
 * changes (invariant 7).
 */
export function ChangeProviderModal({
  open,
  providerName,
  inFlightCount,
  confirmed,
  saving,
  onConfirmedChange,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  providerName: string;
  inFlightCount: number;
  confirmed: boolean;
  saving: boolean;
  onConfirmedChange: (next: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal open={open} title="Change signature provider" onClose={onCancel}>
      <div data-testid="signing-change-modal">
        <p style={{ margin: '0 0 var(--space-7)', fontSize: 'var(--font-size-base)', color: 'var(--text-tertiary)' }}>
          New documents will be signed through {providerName}.
        </p>
        <p
          data-testid="signing-change-inflight"
          style={{ margin: '0 0 var(--space-6)', fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}
        >
          {SIGNING_PROVIDER_MESSAGES.settings.inFlight(inFlightCount)}
        </p>
        {/* The system's `Checkbox` is a native input and hands back the event (§79). */}
        <Checkbox
          checked={confirmed}
          onChange={(event) => onConfirmedChange(event.target.checked)}
          data-testid="signing-change-confirm"
          label="I understand"
        />

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button type="button" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              // Disabled until the checkbox is ticked — a deliberate confirmation — and
              // while the request is in flight, which is the other permitted case.
              disabled={!confirmed}
              preloader={saving}
              data-testid="signing-change-submit"
              onClick={onConfirm}
            >
              Change provider
            </Button>
          </FormActions>
        </div>
      </div>
    </Modal>
  );
}
