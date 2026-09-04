'use client';

import { ConfirmDialog } from '@devscribed/ds';
import { CLIENT_MESSAGES } from '@devscribed/validation';

/**
 * Archive-client confirmation (spec organization/01 §Archive confirmation). Message text is
 * picked by `activeProjectCount`: with active projects the caller sees the "N active
 * project(s) will keep this client on their records…" copy; with zero, the short
 * "Archive {name}?" prompt. Restore has no confirm — it fires directly from the detail page.
 *
 * `ConfirmDialog` with §41's pair, for the same reason the project's archive uses it: the
 * request is one the reader waits on, so `busy` blocks both controls and `closeOnAccept={false}`
 * leaves the dialog standing until the screen has the answer.
 *
 * The hidden `client-archive-confirm-title` span is gone. It existed because the previous
 * dialog shell drew its heading with no way to tag it, so the screen wrote the title a second
 * time off-screen; `ConfirmDialog` names the dialog with that heading through `aria-labelledby`,
 * and a second copy is the same words announced twice. The spec's roster records the removal.
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
    <ConfirmDialog
      open={open}
      title="Archive client?"
      description={<span data-testid="client-archive-confirm-message">{message}</span>}
      acceptBtnText={saving ? 'Archiving' : 'Archive client'}
      declineBtnText="Cancel"
      busy={saving}
      closeOnAccept={false}
      onClose={onClose}
      onAccept={onConfirm}
      data-testid="client-archive-confirm"
      acceptTestId="client-archive-confirm-btn"
      declineTestId="client-archive-cancel-btn"
    />
  );
}
