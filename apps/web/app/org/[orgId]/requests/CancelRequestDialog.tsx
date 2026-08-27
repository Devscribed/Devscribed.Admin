'use client';

import { Button, Modal } from '@/ds';
import type { OrgRequest } from './types';

/**
 * Cancel-confirm dialog for the Requests page (spec 10). Equivalent to spec 09's
 * `VacationPanel` cancel dialog but scoped to this page's own testids
 * (`requests-cancel-confirm-dialog` / `requests-cancel-confirm-btn`) so the two surfaces
 * stay independently addressable. Only approved requests are cancellable here, so the
 * body always carries the refund notice. Confirm drives spec 09's `PUT .../cancel`.
 */
export function CancelRequestDialog({
  request,
  saving,
  onClose,
  onConfirm,
}: {
  request: OrgRequest | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={request !== null}
      title="Cancel request"
      onClose={onClose}
      data-testid="requests-cancel-confirm-dialog"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={saving}
            data-testid="requests-cancel-dismiss-btn"
            style={{ flex: 1 }}
          >
            Keep it
          </Button>
          <Button
            type="button"
            variant="danger"
            size="lg"
            loading={saving}
            onClick={onConfirm}
            data-testid="requests-cancel-confirm-btn"
            style={{ flex: 1 }}
          >
            {saving ? 'Cancelling' : 'Cancel request'}
          </Button>
        </>
      }
    >
      <p style={{ fontFamily: 'var(--font-text)', fontSize: 'var(--fs-15)', color: 'var(--text-sub)' }}>
        Cancel this approved vacation? The reserve will be refunded.
      </p>
    </Modal>
  );
}
