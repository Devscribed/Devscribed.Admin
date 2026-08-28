'use client';

import { Button, Modal } from '@/ds';

/**
 * A one-line confirm dialog composed from the DS `Modal` (the app ships no `ConfirmDialog`
 * primitive — carried gap from 09). Used for both the delete-entry and discard-timer
 * confirmations (spec 12); the confirm button is `danger` and shows `loading` in flight.
 * The verbatim body/title strings come from `TIME_TRACKING_MESSAGES`, supplied by the caller.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  testId,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  testId?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
      width={420}
      data-testid={testId}
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={busy}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="lg"
            loading={busy}
            onClick={onConfirm}
            style={{ flex: 1 }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
        {message}
      </div>
    </Modal>
  );
}
