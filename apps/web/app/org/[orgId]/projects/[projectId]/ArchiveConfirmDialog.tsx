'use client';

import { Button, Modal } from '@/ds';
import { PROJECT_MESSAGES } from '@devscribed/validation';

/**
 * Archive-confirm dialog (spec 11 §Archive-confirm dialog). Composed from `Modal`
 * following `members/DeleteConfirmDialog.tsx` — the DS ships no `ConfirmDialog`. Body is
 * the business spec's archive-confirmation string; the confirm button is `danger` +
 * `loading`. Restore has no confirm (it fires directly on the detail page).
 */
export function ArchiveConfirmDialog({
  open,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title="Archive project"
      onClose={onClose}
      data-testid="project-archive-confirm-dialog"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={saving}
            data-testid="project-archive-cancel-btn"
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
            data-testid="project-archive-confirm-btn"
            style={{ flex: 1 }}
          >
            {saving ? 'Archiving' : 'Archive'}
          </Button>
        </>
      }
    >
      <p style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
        {PROJECT_MESSAGES.archiveConfirm}
      </p>
    </Modal>
  );
}
