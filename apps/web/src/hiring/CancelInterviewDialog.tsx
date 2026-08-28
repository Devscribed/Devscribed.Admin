'use client';

import { useEffect, useRef, useState } from 'react';
import {
  HIRING_MESSAGES,
  MANAGE_LIMITS,
  teamCancelConfirmMessage,
  validateCancelReason,
} from '@devscribed/validation';
import { Button, InfoBanner, Modal, Textarea } from '@/ds';
import type { CardApplication } from '@/hiring/types';

/**
 * The team's cancel (spec 07 §10) — the candidate's dialog, plus a reason.
 *
 * The reason is **optional**, said so in the label rather than left to be discovered,
 * and it goes three places: into Microsoft's cancellation notice, replacing the fixed
 * string the compensating rollback uses (07 §10.47); onto the scheduling event; and into
 * the board badge's tooltip. It is not a reason the candidate is asked to accept or
 * dispute, and it appears on no candidate-facing surface (07 §10.48).
 *
 * The body names the candidate **and** the interview, unlike the candidate's own dialog,
 * because a member reaching this from My interviews was looking at a list of several
 * people and the row they pressed is no longer on screen. Nobody is asked to confirm a
 * pronoun.
 *
 * Focus opens on the dismissive control. This is the one dialog in the product where
 * getting it wrong cannot be undone, so the destructive action is never what `Enter`
 * reaches on arrival.
 */
export function CancelInterviewDialog({
  open,
  orgId,
  applicationId,
  candidateName,
  startUtc,
  timeZone,
  onClose,
  onCancelled,
}: {
  open: boolean;
  orgId: string;
  applicationId: string;
  candidateName: string;
  startUtc: string;
  /** The zone the confirmation states the interview in — the viewer's own. */
  timeZone: string;
  onClose: () => void;
  onCancelled: (application: CardApplication) => void;
}) {
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  // Named so the dialog opens on it. Focus returns to whatever invoked the dialog on its
  // own, which `Modal` handles for every caller.
  const dismiss = useRef<HTMLButtonElement>(null);

  // Every opening starts clean: a reason typed and abandoned is not a reason given.
  useEffect(() => {
    if (!open) return;
    setReason('');
    setBanner(null);
  }, [open]);

  // Checked as it is typed so the member is not told at the moment they confirm, which
  // is the one moment on this dialog where a correction is expensive.
  const validation = validateCancelReason(reason);
  const reasonError = validation.valid ? undefined : validation.error;

  async function confirm(): Promise<void> {
    if (cancelling || reasonError) return;
    setCancelling(true);
    setBanner(null);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/applications/${applicationId}/cancel`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        onCancelled(body as CardApplication);
        return;
      }
      setBanner(body.message ?? HIRING_MESSAGES.manage.cancelFailed);
    } catch {
      setBanner(HIRING_MESSAGES.manage.cancelFailed);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Modal
      open={open}
      title={HIRING_MESSAGES.manage.cancelDialogTitle}
      onClose={onClose}
      initialFocusRef={dismiss}
      data-testid={`application-cancel-dialog-${applicationId}`}
      actions={
        <>
          <Button
            ref={dismiss}
            variant="ghost"
            onClick={onClose}
            data-testid={`application-cancel-dismiss-${applicationId}`}
          >
            {HIRING_MESSAGES.manage.cancelDialogDismiss}
          </Button>
          <Button
            variant="danger"
            loading={cancelling}
            disabled={Boolean(reasonError)}
            onClick={() => void confirm()}
            data-testid={`application-cancel-confirm-${applicationId}`}
          >
            {HIRING_MESSAGES.manage.cancelAction}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
        {banner && (
          <InfoBanner
            tone="error"
            role="alert"
            data-testid={`application-cancel-error-${applicationId}`}
          >
            {banner}
          </InfoBanner>
        )}

        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          {teamCancelConfirmMessage(candidateName, new Date(startUtc), timeZone)}
        </p>

        <Textarea
          label={HIRING_MESSAGES.manage.reasonLabel}
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={reasonError}
          placeholder={HIRING_MESSAGES.manage.reasonPlaceholder}
          data-testid={`application-cancel-reason-${applicationId}`}
          // The count is the answer to "how much is left", which a member writing to a
          // limit needs before they hit it rather than after.
          trailing={
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--text-faint)' }}>
              {reason.trim().length}/{MANAGE_LIMITS.reasonMax}
            </span>
          }
        />
      </div>
    </Modal>
  );
}
