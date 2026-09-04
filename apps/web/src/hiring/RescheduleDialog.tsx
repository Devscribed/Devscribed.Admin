'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  HIRING_MESSAGES,
  currentTimeMessage,
  formatLongDate,
  formatSlotTime,
  isoDateInZone,
  retainSelection,
} from '@devscribed/validation';
import { Button, FormActions, InfoBanner, Modal } from '@devscribed/ds';
import { SlotPicker, readTimeFormat, writeTimeFormat } from '@/hiring/SlotPicker';
import { useAvailability } from '@/hiring/useAvailability';
import type { CardApplication } from '@/hiring/types';

/**
 * The team's reschedule (spec 07 §09) — the candidate's picker, in a dialog.
 *
 * It holds **the same `Calendar` and slot list** the public manage page uses, over the
 * same availability rules: the application's own duration, the mailbox it was booked
 * with, its own event excluded, and the same booking window. One picker, one behaviour,
 * two hosts — the team does not get a second date control with different rules
 * (07 design, *Component map — team surfaces*).
 *
 * That the window binds internal callers too is a deliberate simplification, not an
 * oversight: an interview that must move further out than a month is a conversation the
 * team is already having, and they can cancel and re-share the booking link (07 §09.44).
 *
 * Rescheduling on the candidate's behalf is safe **precisely because the candidate holds
 * a manage link**. It sets a default, not a decree: if Thursday 16:00 does not work, they
 * open their own link and move it again (07 §09.45).
 *
 * Shared by the candidate card and My interviews, which is why it owns its own fetching
 * and answers with the updated application rather than a signal to reload — a member
 * doing this mid-interview must not have the notes they are typing reloaded from under
 * them.
 */
export function RescheduleDialog({
  open,
  orgId,
  applicationId,
  candidateName,
  currentStartUtc,
  viewerTimeZone,
  onClose,
  onMoved,
}: {
  open: boolean;
  orgId: string;
  applicationId: string;
  /** Named in the title, because a member may have reached this from a list of rows. */
  candidateName: string;
  currentStartUtc: string;
  viewerTimeZone: string;
  onClose: () => void;
  onMoved: (application: CardApplication) => void;
}) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [timeZone, setTimeZone] = useState(viewerTimeZone);
  const [hour12, setHour12] = useState(false);
  const [moving, setMoving] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');

  // A browser fact, read after mount, and the same key the booking page writes: a
  // member's clock preference follows them between the screens that show times.
  useEffect(() => {
    setHour12(readTimeFormat());
  }, []);

  // Every opening starts clean. A slot chosen and abandoned last time is not a choice
  // this time, and a stale error banner over a fresh picker reads as a new failure.
  useEffect(() => {
    if (!open) return;
    setSelectedSlot(null);
    setBanner(null);
    setTimeZone(viewerTimeZone);
  }, [open, viewerTimeZone]);

  const onSlotResolved = useCallback((slot: string | null) => {
    setSelectedSlot(slot);
    if (!slot) setAnnouncement('Your selected time is no longer available. Please choose another.');
  }, []);

  const availability = useAvailability(
    `/api/organizations/${orgId}/hiring/applications/${applicationId}/availability`,
    timeZone,
    {
      enabled: open,
      keepSlot: selectedSlot,
      // Browsing position only — no slot is pressed, because pre-selecting the time
      // they came to change would make the first click a deselection (07 design).
      openOn: isoDateInZone(new Date(currentStartUtc), timeZone),
      onSlotResolved,
    },
  );

  async function move(): Promise<void> {
    if (moving || !selectedSlot) return;
    setMoving(true);
    setBanner(null);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/hiring/applications/${applicationId}/reschedule`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startUtc: selectedSlot, timeZone }),
        },
      );
      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        onMoved(body as CardApplication);
        return;
      }
      if (body.error === 'slot_taken') {
        // The offer is stale, so it is withdrawn rather than left to be retried. The
        // booking on file is untouched — nothing was cancelled to attempt the move.
        setSelectedSlot(null);
        availability.reload();
      }
      setBanner(body.message ?? HIRING_MESSAGES.manage.rescheduleFailed);
    } catch {
      setBanner(HIRING_MESSAGES.manage.rescheduleFailed);
    } finally {
      setMoving(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Reschedule ${candidateName}'s interview`}
      onClose={onClose}
      data-testid={`application-reschedule-dialog-${applicationId}`}
      style={{ width: 720 }}
    >
      <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
        <div aria-live="polite" style={SR_ONLY}>
          {announcement}
        </div>

        {banner && (
          <InfoBanner
            variant="error"
            role="alert"
            data-testid={`application-reschedule-error-${applicationId}`}
          >
            {banner}
          </InfoBanner>
        )}

        {/* Stated, never rendered as a selected date or slot. */}
        <p
          data-testid={`application-current-time-${applicationId}`}
          style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
        >
          {currentTimeMessage(new Date(currentStartUtc), timeZone)}
        </p>

        <SlotPicker
          availability={availability}
          selected={selectedSlot}
          onSelect={(slot) => {
            setSelectedSlot(slot);
            setAnnouncement(`${formatSlotTime(new Date(slot), timeZone, hour12)} selected.`);
          }}
          timeZone={timeZone}
          onTimeZoneChange={setTimeZone}
          hour12={hour12}
          onFormatChange={(twelve) => {
            setHour12(twelve);
            writeTimeFormat(twelve);
          }}
          onDateChange={(date) => {
            // Choosing a date always reloads the times, and a time from another date is
            // not in that list — so the selection clears.
            setSelectedSlot((current) => retainSelection(current, availability.slotsOn(date)));
            setAnnouncement(`${formatLongDate(date)} selected.`);
          }}
          testIds={{
            timeZoneSelect: `application-timezone-select-${applicationId}`,
            timeFormatToggle: `application-timeformat-toggle-${applicationId}`,
          }}
        />

        {/*
          `FormActions`, not `Modal`'s own actions slot — the system's Modal has none, and this is
          the row a form is closed with. Not `ConfirmDialog` either: it fires `onClose` in
          the same breath as `onAccept`, so a confirmation whose action is a request with a
          busy state cannot use it (03 design §The two dialogs).
        */}
        <FormActions align="full">
          <Button
            onClick={onClose}
            data-testid={`application-reschedule-dismiss-${applicationId}`}
          >
            {HIRING_MESSAGES.manage.rescheduleDismiss}
          </Button>
          {/* Disabled until a slot is chosen: choosing the time *is* the confirmation,
              and there is no second dialog behind it (07 §05.26). */}
          <Button
            variant="primary"
            preloader={moving}
            disabled={!selectedSlot}
            aria-busy={moving || undefined}
            onClick={() => void move()}
            data-testid={`application-reschedule-submit-${applicationId}`}
          >
            {moving
              ? HIRING_MESSAGES.manage.rescheduleSubmitting
              : HIRING_MESSAGES.manage.rescheduleSubmit}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}

const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
