'use client';

import { Button, Modal } from '@/ds';
import { CLIENT_MESSAGES } from '@devscribed/validation';

/**
 * Archive-client confirmation modal (spec organization/01 §Archive confirmation).
 * Message text is picked by `activeProjectCount`: with active projects the caller
 * sees the "N active project(s) will keep this client on their records…" copy;
 * with zero, the short "Archive {name}?" prompt. Confirm is `danger`. Restore has
 * no confirm (fires directly from the detail page).
 */
export function ArchiveClientDialog({
  open,
  saving,
  name,
  activeProjectCount,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  name: string;
  activeProjectCount: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const message =
    activeProjectCount > 0
      ? CLIENT_MESSAGES.archiveConfirmActive(name, activeProjectCount)
      : CLIENT_MESSAGES.archiveConfirmNoActive(name);

  return (
    <Modal
      open={open}
      title="Archive client?"
      onClose={onClose}
      data-testid="client-archive-confirm"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={saving}
            data-testid="client-archive-cancel-btn"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="lg"
            loading={saving}
            onClick={onConfirm}
            data-testid="client-archive-confirm-btn"
            style={{ flex: 1 }}
          >
            {saving ? 'Archiving' : 'Archive client'}
          </Button>
        </>
      }
    >
      <span
        data-testid="client-archive-confirm-title"
        style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}
      >
        Archive client?
      </span>
      <p
        data-testid="client-archive-confirm-message"
        style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)', margin: 0 }}
      >
        {message}
      </p>
    </Modal>
  );
}
