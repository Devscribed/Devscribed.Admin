'use client';

import { ConfirmDialog } from '@devscribed/ds';
import { PROJECT_MESSAGES } from '@devscribed/validation';

/**
 * Archive-confirm dialog (spec 11 §Archive-confirm dialog). Body is the business spec's
 * archive-confirmation string. Restore has no confirm — it fires directly on the detail page.
 *
 * `ConfirmDialog` (§40) rather than a `Modal` with two hand-placed buttons, and §41 is the
 * part that matters: the archive awaits a result the reader has to see, so this passes `busy`
 * — which spins the accept button and blocks both controls — and `closeOnAccept={false}`, so
 * the screen closes it on the answer rather than the dialog closing itself on the press. That
 * is the members list's `DeleteConfirmDialog`, on a project.
 *
 * The accept button is **not** painted red, though the old one was. §40 rules that a dialog
 * whose whole job is to ask does not also shout the answer.
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
    <ConfirmDialog
      open={open}
      title="Archive project"
      description={PROJECT_MESSAGES.archiveConfirm}
      acceptBtnText={saving ? 'Archiving' : 'Archive'}
      declineBtnText="Cancel"
      busy={saving}
      closeOnAccept={false}
      onClose={onClose}
      onAccept={onConfirm}
      data-testid="project-archive-confirm-dialog"
      acceptTestId="project-archive-confirm-btn"
      declineTestId="project-archive-cancel-btn"
    />
  );
}
