'use client';

import { SIGNING_PROVIDER_MESSAGES } from '@devscribed/validation';
import { Button, Checkbox, Modal } from '@/ds';

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
    <Modal
      open={open}
      title="Change signature provider"
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            // Disabled until the checkbox is ticked — a deliberate confirmation — and
            // while the request is in flight, which is the other permitted case.
            disabled={!confirmed}
            loading={saving}
            data-testid="signing-change-submit"
            onClick={onConfirm}
          >
            Change provider
          </Button>
        </>
      }
    >
      <div data-testid="signing-change-modal">
        <p style={{ margin: '0 0 var(--sp-7)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
          New documents will be signed through {providerName}.
        </p>
        <p
          data-testid="signing-change-inflight"
          style={{ margin: '0 0 var(--sp-8)', fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}
        >
          {SIGNING_PROVIDER_MESSAGES.settings.inFlight(inFlightCount)}
        </p>
        <Checkbox
          checked={confirmed}
          onChange={onConfirmedChange}
          data-testid="signing-change-confirm"
          label="I understand"
        />
      </div>
    </Modal>
  );
}
