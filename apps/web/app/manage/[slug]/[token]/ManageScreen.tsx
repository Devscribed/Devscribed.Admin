'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  CV_ACCEPT,
  HIRING_MESSAGES,
  MANAGE_BOOKED_PARAM,
  cancelConfirmMessage,
  currentTimeMessage,
  formatLongDate,
  formatSlotTime,
  isoDateInZone,
  movedMessage,
  retainSelection,
  validateCv,
  zoneLabel,
} from '@devscribed/validation';
import {
  Badge,
  BookingLayout,
  Button,
  Card,
  FileInput,
  FormActions,
  InfoBanner,
  Modal,
  Preloader,
} from '@devscribed/ds';
import { formatDuration, formatWhen } from '@/hiring/format';
import { SlotPicker, readTimeFormat, writeTimeFormat } from '@/hiring/SlotPicker';
import { useAvailability } from '@/hiring/useAvailability';
import type { ManageView } from '@/hiring/types';

type Page =
  | { state: 'loading' }
  | { state: 'ready'; view: ManageView }
  /** The slug itself does not resolve — the one bare 404 on this route (07 §04.20). */
  | { state: 'unknownLink' }
  | { state: 'failed' };

/**
 * The candidate's own page for the booking they already made (spec 07).
 *
 * It has exactly three renderings, and the third is the interesting one. **Live** shows
 * the interview and the actions. **Just cancelled** is a receipt for what was just done.
 * **Everything else** — a revisited cancellation, an interview that has started, a token
 * that never existed and a token that is not a token — is one screen, because the link
 * travels in a calendar event both parties hold and can forward onward, and a stale link
 * must not confirm that a particular person booked a particular interview and later
 * cancelled it (07 §04.17). The blur is enforced by the API, which answers
 * `booking: null` for all four; this page could not tell them apart if it tried.
 *
 * The just-cancelled confirmation is deliberately client-side state. Reloading the same
 * URL yields the blurred screen, which is correct: it is a receipt for an action, not a
 * state of the record (07 §04.19).
 *
 * It is also where a **completed booking** lands, which is why `/book/{slug}` has no
 * confirmation view of its own: this page is one the candidate can reload, bookmark and
 * come back to, where a confirmation rendered from component state was thrown away by
 * the first refresh. The record already states everything that confirmation did, and can
 * act on all of it. The one fact it cannot state for itself — that an invite is coming —
 * arrives as a notice, which is a **modifier on the live state and not a fourth
 * rendering**: it is drawn only where there is a live record to draw it over, so the
 * blur is untouched by it (07 §04.16a).
 *
 * A completed move leaves the same kind of notice behind (07 §05.27): the card states
 * the new time, and the notice states the only part of it the card cannot — that the
 * update is on its way.
 *
 * Rescheduling replaces the booking Card in place rather than navigating: the URL does
 * not change, and **Keep current time** puts the record back with nothing altered.
 * Choosing a slot *is* the confirmation — there is no second dialog, because a candidate
 * who chose Thursday 14:00 does not need to be asked whether they meant Thursday 14:00,
 * and the action is reversible at will (07 §05.26).
 */
export function ManageScreen({ slug, token }: { slug: string; token: string }) {
  const [page, setPage] = useState<Page>({ state: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  /** Set only by a cancellation this visit made, never read back from the record. */
  const [justCancelled, setJustCancelled] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  /*
   * The zone the interview was booked in, not the browser's. The live state states the
   * time in it, and a picker that silently re-expressed the same interview in a
   * different zone would read as the page having moved it. The Select is right there
   * for a candidate who has since travelled.
   */
  const [timeZone, setTimeZone] = useState('UTC');
  const [hour12, setHour12] = useState(false);
  /** Arrived here straight from booking, rather than from an invite opened later. */
  const [justBooked, setJustBooked] = useState(false);
  /** Set only by a move this visit made — the same species of receipt (07 §05.27). */
  const [justMoved, setJustMoved] = useState(false);
  /** The inline chooser, open only once Replace has been pressed (07 design, States). */
  const [replacingCv, setReplacingCv] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [uploadingCv, setUploadingCv] = useState(false);
  // Named so the dialog opens on it. Focus returns to whatever invoked the dialog on
  // its own, which `Modal` handles for every caller.
  const dismiss = useRef<HTMLButtonElement>(null);

  const booking = page.state === 'ready' ? page.view.booking : null;

  // A browser fact, read after mount: rendering it on the server would hand every
  // visitor the same format and then correct it under them.
  useEffect(() => {
    setHour12(readTimeFormat());
  }, []);

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has(MANAGE_BOOKED_PARAM)) return;
    setJustBooked(true);
    /*
     * The flag comes off the address bar immediately, so what the candidate is left
     * holding is byte-identical to the link in their calendar invite — one URL for this
     * booking, not a variant of it in their history. A reload therefore shows the record
     * without the notice, which is the posture this page already takes for the
     * cancellation receipt: a receipt for an action, not a state of the record
     * (07 §04.19).
     */
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (booking) setTimeZone(booking.timeZone);
  }, [booking?.timeZone]);

  // The notice is also the announcement 02 §12.48 asks for: a navigation on its own
  // tells a screen-reader user nothing, and this page's own heading is the same one the
  // booking page had.
  useEffect(() => {
    if (justBooked && booking) setAnnouncement(HIRING_MESSAGES.manage.justBooked);
  }, [justBooked, booking]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const response = await fetch(`/api/manage/${slug}/${token}`);
        if (cancelled) return;
        if (response.status === 404) {
          setPage({ state: 'unknownLink' });
          return;
        }
        if (!response.ok) {
          setPage({ state: 'failed' });
          return;
        }
        setPage({ state: 'ready', view: await response.json() });
      } catch {
        if (!cancelled) setPage({ state: 'failed' });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

  const onSlotResolved = useCallback((slot: string | null) => {
    setSelectedSlot(slot);
    if (!slot) setAnnouncement('Your selected time is no longer available. Please choose another.');
  }, []);

  const availability = useAvailability(`/api/manage/${slug}/${token}/availability`, timeZone, {
    enabled: rescheduling,
    keepSlot: selectedSlot,
    // The month holding the interview, as browsing position only — no slot is pressed,
    // because pre-selecting the time they came to change would make the first click a
    // deselection (07 design).
    openOn: booking ? isoDateInZone(new Date(booking.startUtc), timeZone) : null,
    onSlotResolved,
  });

  function startRescheduling(): void {
    setBanner(null);
    setSelectedSlot(null);
    // A receipt for the last move is not a receipt for this one.
    setJustMoved(false);
    setRescheduling(true);
  }

  function keepCurrentTime(): void {
    setRescheduling(false);
    setSelectedSlot(null);
    setBanner(null);
  }

  async function moveInterview(): Promise<void> {
    if (moving || !selectedSlot) return;
    setMoving(true);
    setBanner(null);

    try {
      const response = await fetch(`/api/manage/${slug}/${token}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startUtc: selectedSlot, timeZone }),
      });
      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        setPage({ state: 'ready', view: body });
        setRescheduling(false);
        setSelectedSlot(null);
        /*
         * The move supersedes the arrival: "an invite is on its way" was answered by an
         * invite that has since been superseded itself, and two notices stacked over one
         * card would read as two things having happened.
         */
        setJustBooked(false);
        setJustMoved(true);
        setAnnouncement(movedMessage(new Date(body.booking.startUtc), body.booking.timeZone));
        return;
      }
      /*
       * A 404 means the booking stopped being live between opening the picker and
       * submitting — it started, or it was cancelled from the team's side. The blurred
       * screen is the honest answer, and it is the same one a reload would give.
       */
      if (response.status === 404) {
        setRescheduling(false);
        setPage((current) =>
          current.state === 'ready'
            ? { state: 'ready', view: { ...current.view, booking: null } }
            : current,
        );
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

  /**
   * Choosing a file uploads it, immediately: a chosen file with an unpressed Save button
   * is a change the candidate believes they have made (07 design, Interactions).
   *
   * Never a precondition of anything, and never gated behind a reschedule. A candidate
   * who spotted a typo in their CV must not have to move their interview to fix it
   * (07 §07.32).
   */
  async function replaceCv(file: File | null): Promise<void> {
    if (!file || uploadingCv) return;

    // 02's rules, run here so an unsupported type is refused without a round trip. The
    // server re-runs all of them, which is the gate.
    const check = validateCv({ fileName: file.name, sizeBytes: file.size });
    if (!check.valid) {
      setCvError(check.error);
      return;
    }

    setCvError(null);
    setUploadingCv(true);
    setBanner(null);

    try {
      const form = new FormData();
      form.append('cv', file);
      const response = await fetch(`/api/manage/${slug}/${token}/cv`, {
        method: 'POST',
        body: form,
      });
      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        setPage({ state: 'ready', view: body });
        setReplacingCv(false);
        // The record cannot show this happened — the page names no file — so the polite
        // region is the whole acknowledgement (07 §16.72).
        setAnnouncement(HIRING_MESSAGES.manage.cvReplaced);
        return;
      }
      // The booking stopped being live while the chooser was open. Same answer as a
      // reload, and the same one every other action gives.
      if (response.status === 404) {
        setReplacingCv(false);
        setPage((current) =>
          current.state === 'ready'
            ? { state: 'ready', view: { ...current.view, booking: null } }
            : current,
        );
        return;
      }
      // A field error belongs on the field; anything else is the page's banner.
      if (body.error === 'validation' && body.fields?.cv) {
        setCvError(body.fields.cv);
        return;
      }
      setBanner(body.message ?? HIRING_MESSAGES.manage.cvReplaceFailed);
    } catch {
      setBanner(HIRING_MESSAGES.manage.cvReplaceFailed);
    } finally {
      setUploadingCv(false);
    }
  }

  async function cancelInterview(): Promise<void> {
    if (cancelling) return;
    setCancelling(true);
    setBanner(null);

    try {
      const response = await fetch(`/api/manage/${slug}/${token}/cancel`, { method: 'POST' });
      const body = await response.json().catch(() => ({}));

      if (response.ok) {
        setConfirming(false);
        setJustCancelled(true);
        setAnnouncement(HIRING_MESSAGES.manage.cancelled);
        return;
      }
      /*
       * A 404 here means the booking stopped being live between opening the dialog and
       * confirming — it started, or it was cancelled from the team's side. The blurred
       * screen is the honest answer, and it is the same one a reload would give.
       */
      if (response.status === 404) {
        setConfirming(false);
        setPage((current) =>
          current.state === 'ready'
            ? { state: 'ready', view: { ...current.view, booking: null } }
            : current,
        );
        return;
      }
      setBanner(body.message ?? HIRING_MESSAGES.manage.cancelFailed);
    } catch {
      setBanner(HIRING_MESSAGES.manage.cancelFailed);
    } finally {
      setCancelling(false);
    }
  }

  if (page.state === 'loading') {
    return (
      <BookingLayout data-testid="manage-page">
        <div style={COLUMN}>
          {/* The skeleton is gone (D4). It stood in for a card whose shape it could not
              actually predict — one line or four, a CV row or none — and blue answers a wait
              with a loader rather than a guess at what is coming. */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {/* The dots carry no text, so the announcement is made beside them. */}
            <Preloader data-testid="manage-loading" aria-hidden />
            <span aria-live="polite" style={SR_ONLY}>
              Loading your interview
            </span>
          </div>
        </div>
      </BookingLayout>
    );
  }

  // The slug resolved to nothing at all, so there is no organization to render and no
  // vacancy for "New booking" to lead to — the same dead end `/book/{slug}` renders.
  if (page.state === 'unknownLink' || page.state === 'failed') {
    return (
      <BookingLayout data-testid="manage-page">
        <div style={COLUMN}>
          <Card variant="panel">
            <p data-testid="manage-unknown-link" style={{ margin: 0, textAlign: 'center' }}>
              {HIRING_MESSAGES.booking.notFound}
            </p>
          </Card>
        </div>
      </BookingLayout>
    );
  }

  const { organizationName, vacancy } = page.view;
  const picking = rescheduling && booking !== null;

  /*
   * Built once and rendered by whichever branch is on screen, which is what "present in
   * the live state and carried into the reschedule flow, never a precondition of
   * anything" means in practice (07 §07.32): a candidate correcting a typo in their CV
   * does not have to move their interview, and one who only wants a different Tuesday is
   * not interrogated about their CV. One instance at a time, so the test ids stay unique.
   *
   * It states that a CV is on file and never which one. A candidate replacing a document
   * knows what they submitted, and the filename would hand a forwarded link a name the
   * rest of this page is at pains to withhold (07 §04.21, §07.31).
   */
  const cvRow = booking?.hasCv ? (
    <div className="manage-cv">
      <div className="manage-cv-row">
        <p
          data-testid="manage-cv-present"
          style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}
        >
          {HIRING_MESSAGES.manage.cvAttached}
        </p>
        {/* Hidden while the chooser is open — the chooser is the control now. Blue's neutral
            outlined button is the only quiet one it has; `ghost` and `secondary` were two
            names for the same intent in Meridian and arrive here as one. */}
        {!replacingCv && (
          <Button
            onClick={() => {
              setCvError(null);
              setReplacingCv(true);
            }}
            data-testid="manage-cv-replace-button"
          >
            {HIRING_MESSAGES.manage.cvReplaceAction}
          </Button>
        )}
      </div>
      {replacingCv && (
        <FileInput
          // No micro-label: the row above already says what this replaces, and the
          // control still needs a name of its own for anyone who never sees that row.
          aria-label={`${HIRING_MESSAGES.manage.cvReplaceAction} CV`}
          accept={CV_ACCEPT}
          hint={HIRING_MESSAGES.booking.cv.hint}
          hintId="manage-cv-hint"
          error={cvError ?? undefined}
          errorId="manage-cv-error"
          aria-invalid={cvError ? true : undefined}
          aria-describedby={cvError ? 'manage-cv-error' : 'manage-cv-hint'}
          disabled={uploadingCv}
          // No second Save: a chosen file with an unpressed button is a change the
          // candidate believes they have already made (07 design, Interactions).
          onSelect={(file) => void replaceCv(file)}
          data-testid="manage-cv-replace-input"
        />
      )}
    </div>
  ) : null;

  return (
    <BookingLayout
      data-testid="manage-page"
      wordmark={organizationName}
      wordmarkTestId="manage-org-wordmark"
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-5)',
          textAlign: 'center',
          marginBottom: 'var(--space-8)',
        }}
      >
        {/* The same heading the booking page uses, for the same reason: this is the page
            they booked on, and a candidate arriving from their invite must recognise it. */}
        <h1
          data-testid="manage-vacancy-title"
          style={{
            margin: 0,
            fontSize: 'var(--headline-4-size)',
            lineHeight: 'var(--headline-4-line)',
            letterSpacing: 'var(--headline-4-tracking)',
            fontWeight: 'var(--headline-4-weight)',
            color: 'var(--text-primary)',
          }}
        >
          {vacancy.title}
        </h1>
        <Badge status="neutral" data-testid="manage-duration">
          {/* The booking's own length when there is one, which a later edit to the
              vacancy never moved (07 §13.61). */}
          {formatDuration(booking?.durationMinutes ?? vacancy.durationMinutes)}
        </Badge>
        {picking && (
          // Stated, never rendered as a selected date or slot.
          <p
            data-testid="manage-current-time"
            style={{
              margin: 'var(--space-5) 0 0',
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-secondary)',
            }}
          >
            {currentTimeMessage(new Date(booking!.startUtc), timeZone)}
          </p>
        )}
      </header>

      <div aria-live="polite" style={SR_ONLY}>
        {announcement}
      </div>

      {/* The pickers take the full column the booking page uses; the record itself is
          the narrow one, because it has four lines to state. */}
      <div style={picking ? WIDE_COLUMN : COLUMN}>
        {banner && (
          <InfoBanner variant="error" role="alert" data-testid="manage-error-banner">
            {banner}
          </InfoBanner>
        )}

        {justCancelled ? (
          <DeadEnd
            slug={slug}
            tone="info"
            testId="manage-cancelled"
            message={HIRING_MESSAGES.manage.cancelled}
          />
        ) : !booking ? (
          <DeadEnd
            slug={slug}
            tone="warning"
            testId="manage-not-found"
            message={HIRING_MESSAGES.manage.notFound}
          />
        ) : picking ? (
          <div className="manage-reschedule">
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
                // Choosing a date always reloads the times, and a time from another date
                // is not in that list — so the selection clears.
                setSelectedSlot((current) => retainSelection(current, availability.slotsOn(date)));
                setAnnouncement(`${formatLongDate(date)} selected.`);
              }}
              testIds={{
                timeZoneSelect: 'manage-timezone-select',
                timeFormatToggle: 'manage-timeformat-toggle',
              }}
            />

            {cvRow}

            <div className="manage-reschedule-actions">
              <Button onClick={keepCurrentTime} data-testid="manage-reschedule-cancel">
                {HIRING_MESSAGES.manage.rescheduleDismiss}
              </Button>
              {/* The one primary action in this spec, and disabled until a slot is
                  chosen: choosing the time *is* the confirmation. */}
              <Button
                variant="primary"
                preloader={moving}
                disabled={!selectedSlot}
                onClick={() => void moveInterview()}
                data-testid="manage-reschedule-submit"
              >
                {moving
                  ? HIRING_MESSAGES.manage.rescheduleSubmitting
                  : HIRING_MESSAGES.manage.rescheduleSubmit}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/*
              Both notices are modifiers on the live state, never renderings of their
              own: they are inside this branch, so there is no path on which either
              draws over the blurred screen and confirms that a dead token was once real
              (07 §04.16a).

              Each states the one fact the record beneath cannot. Everything else the old
              confirmation said — the title, the length, the time, the zone, the name,
              the email, the CV — is already on the card, and repeating it would read as
              a bug. Neither survives a reload, which is the posture this page takes for
              the cancellation receipt too (07 §04.19).
            */}
            {justBooked && (
              <InfoBanner data-testid="manage-booked">
                {HIRING_MESSAGES.manage.justBooked}
              </InfoBanner>
            )}
            {justMoved && (
              <InfoBanner data-testid="manage-moved">
                {HIRING_MESSAGES.manage.justMoved}
              </InfoBanner>
            )}

            {/* The panel's caption is the Card's own title (D4), so "Your interview" is the
                `<h2>` under the vacancy title rather than an uppercase caption above a box. */}
            <Card variant="panel" title={HIRING_MESSAGES.manage.panelLabel}>
              <p
                data-testid="manage-booking-when"
                style={{
                  margin: 0,
                  fontWeight: 'var(--headline-5-weight)',
                  fontSize: 'var(--headline-5-size)',
                  lineHeight: 'var(--headline-5-line)',
                  letterSpacing: 'var(--headline-5-tracking)',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--text-primary)',
                }}
              >
                {formatWhen(booking.startUtc, booking.timeZone)}
              </p>
              <span
                data-testid="manage-booking-zone"
                style={{ fontSize: 'var(--font-size-s)', color: 'var(--text-secondary)' }}
              >
                {zoneLabel(booking.timeZone, new Date(booking.startUtc))}
              </span>

              {/*
                No name, no address, no filename. The link rides in a calendar event both
                parties hold and can forward onward, and §04.17 is at pains to stop a
                *dead* link confirming that a particular person booked an interview — a
                live one that named them outright would have given away more, to more
                people (07 §04.21). What is left says an interview exists and when, which
                is all its holder needs in order to move it, replace the CV on it, or call
                it off.
              */}
              {cvRow && (
                <>
                  <hr
                    style={{
                      margin: 'var(--space-6) 0',
                      border: 0,
                      borderTop: '1px solid var(--border-subtle)',
                    }}
                  />
                  {cvRow}
                </>
              )}

              {/*
                No primary action anywhere in the live state: the page's default posture is
                that nothing needs to change, and a violet CTA would contradict it. Cancel
                is pushed to the trailing end, away from anything benign.
              */}
              <div className="manage-actions">
                <Button onClick={startRescheduling} data-testid="manage-reschedule-button">
                  {HIRING_MESSAGES.manage.rescheduleAction}
                </Button>
                <Button
                  variant="delete"
                  onClick={() => setConfirming(true)}
                  data-testid="manage-cancel-button"
                >
                  {HIRING_MESSAGES.manage.cancelAction}
                </Button>
              </div>
            </Card>
          </>
        )}
      </div>

      {/*
        Blue's `Modal` has no `actions` slot: prod's dialogs put their button row in the body,
        and `FormActions` is the row. The team's cancel dialog already composes it this way,
        which is the point — one confirmation pattern, not a second one for the public page.
        `ConfirmDialog` is deliberately not used here: its accept button is blue's primary blue
        even on a destructive confirmation (§40), and this is the one dialog in the product
        where the irreversible action must not look like the safe one.
      */}
      <Modal
        open={confirming}
        title={HIRING_MESSAGES.manage.cancelDialogTitle}
        onClose={() => setConfirming(false)}
        // The destructive action is never what `Enter` reaches on arrival, and this is
        // the one dialog in the product where getting it wrong cannot be undone.
        initialFocusRef={dismiss}
        data-testid="manage-cancel-dialog"
        style={{ width: 420 }}
      >
        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
          {/* The interview is named rather than gestured at, so a screen-reader user is
              never asked to confirm a pronoun. */}
          <p style={{ margin: 0, fontSize: 'var(--font-size-s)', color: 'var(--text-tertiary)' }}>
            {booking && cancelConfirmMessage(new Date(booking.startUtc), booking.timeZone)}
          </p>

          <FormActions align="full">
            <Button
              ref={dismiss}
              onClick={() => setConfirming(false)}
              data-testid="manage-cancel-dismiss"
            >
              {HIRING_MESSAGES.manage.cancelDialogDismiss}
            </Button>
            <Button
              variant="delete"
              preloader={cancelling}
              onClick={() => void cancelInterview()}
              data-testid="manage-cancel-confirm"
            >
              {HIRING_MESSAGES.manage.cancelAction}
            </Button>
          </FormActions>
        </div>
      </Modal>
    </BookingLayout>
  );
}

/**
 * Both dead ends are one composition, differing only in tone and wording: a banner, and
 * a card that exists to give "New booking" a surface rather than leaving it floating on
 * the paper field.
 *
 * On a closed vacancy that button lands on the closed-vacancy page — the correct dead
 * end, and an honest one (07 §13.60).
 */
function DeadEnd({
  slug,
  tone,
  testId,
  message,
}: {
  slug: string;
  tone: 'info' | 'warning';
  testId: string;
  message: string;
}) {
  return (
    <>
      <InfoBanner variant={tone} data-testid={testId}>
        {message}
      </InfoBanner>
      <Card variant="panel" style={{ textAlign: 'center' }}>
        {/* A real link, not a button with an onClick (§38): it is a navigation, and this
            keeps middle-click and copy-address working. */}
        <Button
          as="a"
          variant="primary"
          href={`/book/${slug}`}
          data-testid="manage-new-booking-button"
        >
          {HIRING_MESSAGES.manage.newBooking}
        </Button>
      </Card>
    </>
  );
}

/**
 * Narrower than the booking page's full column: this screen has one short record to
 * state, and an 880px card holding four lines reads as a form with its fields missing.
 */
const COLUMN: CSSProperties = {
  maxWidth: 560,
  margin: '0 auto',
  display: 'grid',
  gap: 'var(--space-6)',
};

/** The pickers are the booking page's, at the booking page's width. */
const WIDE_COLUMN: CSSProperties = {
  display: 'grid',
  gap: 'var(--space-6)',
};

const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
