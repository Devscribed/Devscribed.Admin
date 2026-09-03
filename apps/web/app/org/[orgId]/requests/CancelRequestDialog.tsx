'use client';

import { ConfirmDialog } from '@devscribed/ds';
import type { OrgRequest } from './types';

/**
 * Cancel-confirm dialog for the Requests page (spec 10). The same dialog spec 09's
 * `VacationPanel` draws, scoped to this page's own test ids (`requests-cancel-confirm-dialog`
 * / `requests-cancel-confirm-btn`) so the two surfaces stay independently addressable. Only
 * approved requests are cancellable here, so the body always carries the refund notice.
 * Confirm drives spec 09's `PUT .../cancel`.
 *
 * `ConfirmDialog` rather than a `Modal` with two hand-placed buttons, and §41 is why: the
 * press starts work whose answer the reader has to see, so `busy` spins the accept button and
 * blocks both controls, and `closeOnAccept={false}` leaves the closing to the page.
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
    <ConfirmDialog
      open={request !== null}
      title="Cancel request"
      description="Cancel this approved vacation? The reserve will be refunded."
      acceptBtnText={saving ? 'Cancelling' : 'Cancel request'}
      declineBtnText="Keep it"
      busy={saving}
      closeOnAccept={false}
      onClose={onClose}
      onAccept={onConfirm}
      data-testid="requests-cancel-confirm-dialog"
      acceptTestId="requests-cancel-confirm-btn"
      declineTestId="requests-cancel-dismiss-btn"
    />
  );
}
