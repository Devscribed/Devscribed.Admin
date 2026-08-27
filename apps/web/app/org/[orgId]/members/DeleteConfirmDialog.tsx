'use client';

import { Button, Modal } from '@/ds';
import type { Member } from './types';

/**
 * The name-specific confirmation dialog in front of a delete (spec 04 requirement 6 /
 * the Screens section's "Delete Confirmation Dialog"). Restore has no equivalent —
 * it fires immediately from the row menu.
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
    <Modal
      open={!!member}
      title="Remove member"
      onClose={onCancel}
      data-testid="confirm-delete-dialog"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onCancel}
            disabled={submitting}
            data-testid="cancel-delete-button"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="lg"
            loading={submitting}
            onClick={onConfirm}
            data-testid="confirm-delete-button"
            style={{ flex: 1 }}
          >
            {submitting ? 'Removing' : 'Remove'}
          </Button>
        </>
      }
    >
      <p style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
        Are you sure you want to remove {member?.fullName}? They will lose access immediately.
      </p>
    </Modal>
  );
}
