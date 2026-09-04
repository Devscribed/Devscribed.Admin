'use client';

import { ConfirmDialog } from '@devscribed/ds';
import type { Member } from './types';

/**
 * The name-specific confirmation in front of a delete (spec 04 requirement 6). Restore has
 * no equivalent — it fires immediately from the row menu.
 *
 * `ConfirmDialog` rather than a `Modal` with two hand-placed buttons, and §41 is why it can
 * be: this dialog awaits a result the reader has to see, so it passes `busy` — which spins
 * the accept button and blocks both controls — and `closeOnAccept={false}`, so the page
 * closes it on the answer rather than the dialog closing itself on the press.
 */
export function DeleteConfirmDialog({
  member,
  submitting,
  onCancel,
  onConfirm,
}: {
  member: Member | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={!!member}
      title="Remove member"
      description={`Are you sure you want to remove ${member?.fullName ?? ''}? They will lose access immediately.`}
      acceptBtnText={submitting ? 'Removing' : 'Remove'}
      declineBtnText="Cancel"
      busy={submitting}
      closeOnAccept={false}
      onClose={onCancel}
      onAccept={onConfirm}
      data-testid="confirm-delete-dialog"
      acceptTestId="confirm-delete-button"
      declineTestId="cancel-delete-button"
    />
  );
}
