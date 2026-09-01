'use client';

import { Button, Modal } from '@/ds';
import { HOLIDAY_MESSAGES } from '@devscribed/validation';
import type { HolidayRow } from './types';

/**
 * Delete-holiday confirmation (spec organization/03 §Error Messages, Alt Flow B).
 * The wording depends on whether the date has already passed: a past holiday warns
 * that future Amounts Owed runs will drop it, a future one asks the short question.
 * Comparison is string-wise on ISO dates against today in the viewer's own zone —
 * "past" is a calendar-day fact, so no `Date` arithmetic can shift it.
 */
export function DeleteHolidayDialog({
  open,
  holiday,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  holiday: HolidayRow | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;

  const name = holiday?.name ?? '';
  const date = holiday?.date ?? '';
  const message =
    date !== '' && date < today
      ? HOLIDAY_MESSAGES.deleteConfirmPast(name, date)
      : HOLIDAY_MESSAGES.deleteConfirmFuture(name, date);

  return (
    <Modal
      open={open}
      title="Delete holiday?"
      onClose={onClose}
      data-testid="holiday-delete-confirm"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            disabled={saving}
            data-testid="holiday-delete-cancel-btn"
            style={{ flex: 1 }}
          >
            {HOLIDAY_MESSAGES.deleteConfirmCancel}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="lg"
            loading={saving}
            onClick={onConfirm}
            data-testid="holiday-delete-confirm-btn"
            style={{ flex: 1 }}
          >
            {saving ? 'Deleting' : HOLIDAY_MESSAGES.deleteConfirmConfirm}
          </Button>
        </>
      }
    >
      <p
        data-testid="holiday-delete-confirm-message"
        style={{
          fontFamily: 'var(--font-text)',
          fontSize: 'var(--fs-15)',
          color: 'var(--text-sub)',
          margin: 0,
        }}
      >
        {message}
      </p>
    </Modal>
  );
}
