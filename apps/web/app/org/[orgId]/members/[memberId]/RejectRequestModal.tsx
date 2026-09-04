'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, FormActions, Modal, TextArea } from '@devscribed/ds';
import { useToast } from '@/toast';
import { REQUEST_MESSAGES, REVIEWER_COMMENT_MAX, validateReviewerComment } from '@devscribed/validation';
import type { VacationRequest } from './VacationPanel';
import { formatDateRange, formatWorkingDays } from './vacation-format';

const summaryLine: CSSProperties = {
  fontSize: 'var(--font-size-base)',
  color: 'var(--text-primary)',
};

const requesterLine: CSSProperties = {
  fontSize: 'var(--font-size-s)',
  color: 'var(--text-tertiary)',
};

/**
 * Reject Request modal (spec 09). Shows the request summary + requester, an optional comment,
 * and PUTs `.../review` with `{ decision: 'rejected', comment }`. On 200 it closes, toasts, and
 * asks the panel to refetch. Mirrors `VacationFinancialsModal`'s shell + `useToast()` contract.
 *
 * The comment was a hand-built `<textarea>` carrying its own label, focus ring, error node and
 * `aria-describedby`, under a note saying the system had no multi-line field. It has `TextArea`
 * (§25, §33), and it had it before this was written — so all four of those are the component's
 * now, and the `focus` state they needed goes with them.
 */
export function RejectRequestModal({
  orgId,
  memberId,
  request,
  requesterName,
  onClose,
  onRejected,
}: {
  orgId: string;
  memberId: string;
  /** The request being rejected; `null` closes the modal. */
  request: VacationRequest | null;
  requesterName: string | null;
  onClose: () => void;
  /** Fired after a successful reject. Receives the saved comment (empty string when none)
   * so a caller can update its row in place; callers that just refetch can ignore it. */
  onRejected: (comment: string) => void;
}) {
  const { showToast } = useToast();
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const open = request !== null;

  // Re-seed clean whenever a new request opens the modal.
  useEffect(() => {
    if (!open) return;
    setComment('');
    setCommentError(null);
    setSaving(false);
  }, [open, request?.id]);

  function handleClose() {
    if (saving) return;
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !request) return;

    const result = validateReviewerComment(comment);
    if (!result.valid) {
      setCommentError(result.error);
      return;
    }

    setCommentError(null);
    setSaving(true);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/members/${memberId}/vacation/requests/${request.id}/review`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ decision: 'rejected', comment: result.value }),
        },
      );

      if (response.ok) {
        setSaving(false);
        onClose();
        showToast('toast-request-rejected', REQUEST_MESSAGES.toastRejected);
        onRejected(result.value ?? '');
        return;
      }

      const body = await response.json().catch(() => null);
      if (body?.errors?.reviewerComment) {
        setCommentError(String(body.errors.reviewerComment));
      } else {
        onClose();
        showToast('toast-request-rejected', body?.message ?? REQUEST_MESSAGES.genericError, 'error');
      }
    } catch {
      onClose();
      showToast('toast-request-rejected', REQUEST_MESSAGES.genericError, 'error');
    }
    setSaving(false);
  }

  return (
    <Modal open={open} title="Reject Request" onClose={handleClose} data-testid="vacation-reject-modal">
      <form id="vacation-reject-form" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {request && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <div style={summaryLine}>
                Rejecting: {formatDateRange(request.startDate, request.endDate)} ·{' '}
                {formatWorkingDays(request.workingDays)}
              </div>
              {requesterName && <div style={requesterLine}>Requested by: {requesterName}</div>}
            </div>
          )}

          <TextArea
            label="Comment (optional)"
            value={comment}
            maxLength={REVIEWER_COMMENT_MAX}
            rows={3}
            readOnly={saving}
            onChange={(event) => {
              setComment(event.target.value);
              setCommentError(null);
            }}
            id="vacation-reject-comment-input"
            data-testid="vacation-reject-comment-input"
            error={commentError ?? undefined}
            errorId="field-error-reviewerComment"
          />
        </div>

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button type="button" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="delete"
              preloader={saving}
              data-testid="vacation-reject-confirm-btn"
            >
              {saving ? 'Rejecting' : 'Reject'}
            </Button>
          </FormActions>
        </div>
      </form>
    </Modal>
  );
}
