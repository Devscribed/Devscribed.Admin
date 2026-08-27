'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, Modal } from '@/ds';
import { useToast } from '@/toast';
import { REQUEST_MESSAGES, REVIEWER_COMMENT_MAX, validateReviewerComment } from '@devscribed/validation';
import type { VacationRequest } from './VacationPanel';
import { formatDateRange, formatWorkingDays } from './vacation-format';

const summaryLine: CSSProperties = {
  fontSize: 'var(--fs-15)',
  color: 'var(--text)',
};

const requesterLine: CSSProperties = {
  fontSize: 'var(--fs-13)',
  color: 'var(--text-sub)',
};

/**
 * Reject Request modal (spec 09). Shows the request summary + requester, an optional comment
 * (native `<textarea>` — the DS has no multi-line field, see the design doc's DS-gaps), and
 * PUTs `.../review` with `{ decision: 'rejected', comment }`. On 200 it closes, toasts, and
 * asks the panel to refetch. Mirrors `VacationFinancialsModal`'s shell + `useToast()` contract.
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
  const [focus, setFocus] = useState(false);

  const open = request !== null;

  // Re-seed clean whenever a new request opens the modal.
  useEffect(() => {
    if (!open) return;
    setComment('');
    setCommentError(null);
    setSaving(false);
    setFocus(false);
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

  const borderColor = commentError
    ? 'var(--error-500)'
    : focus
      ? 'var(--accent)'
      : 'var(--border-strong)';

  return (
    <Modal
      open={open}
      title="Reject Request"
      onClose={handleClose}
      width={440}
      data-testid="vacation-reject-modal"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleClose}
            disabled={saving}
            data-testid="vacation-reject-cancel-btn"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="vacation-reject-form"
            variant="danger"
            size="lg"
            loading={saving}
            data-testid="vacation-reject-confirm-btn"
            style={{ flex: 1 }}
          >
            {saving ? 'Rejecting' : 'Reject'}
          </Button>
        </>
      }
    >
      <form id="vacation-reject-form" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          {request && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <div style={summaryLine}>
                Rejecting: {formatDateRange(request.startDate, request.endDate)} ·{' '}
                {formatWorkingDays(request.workingDays)}
              </div>
              {requesterName && <div style={requesterLine}>Requested by: {requesterName}</div>}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label
              htmlFor="vacation-reject-comment-input"
              style={{
                display: 'block',
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-11)',
                letterSpacing: 'var(--ls-wider)',
                textTransform: 'uppercase',
                color: commentError ? 'var(--error-500)' : 'var(--text-muted)',
                marginBottom: 'var(--sp-4)',
              }}
            >
              Comment (optional)
            </label>
            <textarea
              id="vacation-reject-comment-input"
              value={comment}
              maxLength={REVIEWER_COMMENT_MAX}
              rows={3}
              disabled={saving}
              onChange={(event) => {
                setComment(event.target.value);
                setCommentError(null);
              }}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
              data-testid="vacation-reject-comment-input"
              aria-invalid={commentError ? true : undefined}
              aria-describedby={commentError ? 'field-error-reviewerComment' : undefined}
              style={{
                width: '100%',
                border: `1.5px solid ${borderColor}`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--sp-4) 12px',
                fontFamily: 'var(--font-text)',
                fontSize: 'var(--fs-15)',
                color: 'var(--text)',
                background: 'var(--bg-field)',
                outline: 'none',
                boxShadow: focus
                  ? commentError
                    ? 'var(--shadow-glow-error)'
                    : 'var(--shadow-glow-accent)'
                  : 'none',
                transition: 'border-color .15s, box-shadow .15s',
                resize: 'vertical',
                opacity: saving ? 0.55 : 1,
              }}
            />
            {commentError && (
              <div
                id="field-error-reviewerComment"
                data-testid="field-error-reviewerComment"
                style={{
                  fontFamily: 'var(--font-text)',
                  fontSize: 'var(--fs-12)',
                  color: 'var(--error-500)',
                  marginTop: 'var(--sp-2)',
                }}
              >
                {commentError}
              </div>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
