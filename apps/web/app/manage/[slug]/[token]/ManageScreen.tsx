'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  HIRING_MESSAGES,
  MANAGE_BOOKED_PARAM,
  cancelConfirmMessage,
  currentTimeMessage,
  formatLongDate,
  formatSlotTime,
  isoDateInZone,
  movedMessage,
  retainSelection,
  zoneLabel,
} from '@devscribed/validation';
import { BookingLayout, Button, Card, InfoBanner, Modal, SectionLabel, Skeleton } from '@/ds';
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
          <Card>
            <Skeleton rows={3} data-testid="manage-loading-skeleton" />
          </Card>
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
          <Card>
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

  return (
    <BookingLayout data-testid="manage-page" wordmark={<Wordmark name={organizationName} />}>
      <header style={{ textAlign: 'center', marginBottom: 'var(--sp-12)' }}>
        <h1
          data-testid="manage-vacancy-title"
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-34)',
            letterSpacing: '-.6px',
            color: 'var(--text)',
          }}
        >
          {vacancy.title}
        </h1>
        <div
          data-testid="manage-duration"
          style={{
            marginTop: 'var(--sp-2)',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-15)',
            color: 'var(--text-muted)',
          }}
        >
          {/* The booking's own length when there is one, which a later edit to the
              vacancy never moved (07 §13.61). */}
          {formatDuration(booking?.durationMinutes ?? vacancy.durationMinutes)}
        </div>
        {picking && (
          // Stated, never rendered as a selected date or slot.
          <p
            data-testid="manage-current-time"
            style={{
              margin: 'var(--sp-6) 0 0',
              fontSize: 'var(--fs-15)',
              color: 'var(--text-muted)',
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
          <InfoBanner tone="error" role="alert" data-testid="manage-error-banner">
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

            <div className="manage-reschedule-actions">
              <Button
                variant="ghost"
                onClick={keepCurrentTime}
                data-testid="manage-reschedule-cancel"
              >
                {HIRING_MESSAGES.manage.rescheduleDismiss}
              </Button>
              {/* The one primary action in this spec, and disabled until a slot is
                  chosen: choosing the time *is* the confirmation. */}
              <Button
                variant="primary"
                loading={moving}
                disabled={!selectedSlot}
                aria-busy={moving || undefined}
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
              <InfoBanner tone="info" data-testid="manage-booked">
                {HIRING_MESSAGES.manage.justBooked}
              </InfoBanner>
            )}
            {justMoved && (
              <InfoBanner tone="info" data-testid="manage-moved">
                {HIRING_MESSAGES.manage.justMoved}
              </InfoBanner>
            )}

            <Card>
              <SectionLabel>{HIRING_MESSAGES.manage.panelLabel}</SectionLabel>

              <p
                data-testid="manage-booking-when"
                style={{
                  margin: 'var(--sp-8) 0 0',
                  fontFamily: 'var(--font-display)',
                  fontSize: 'var(--fs-22)',
                  fontVariantNumeric: 'tabular-nums',
                  color: 'var(--text)',
                }}
              >
                {formatWhen(booking.startUtc, booking.timeZone)}
              </p>
              <span
                data-testid="manage-booking-zone"
                style={{ fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}
              >
                {zoneLabel(booking.timeZone, new Date(booking.startUtc))}
              </span>

              {/*
                No name, no address, no filename. The link rides in a calendar event both
                parties hold and can forward onward, and §04.17 is at pains to stop a
                *dead* link confirming that a particular person booked an interview — a
                live one that named them outright would have given away more, to more
                people (07 §04.21). What is left says an interview exists and when, which
                is all its holder needs in order to move or call it off.
              */}
              {booking.hasCv && (
                <>
                  <hr
                    style={{
                      margin: 'var(--sp-8) 0',
                      border: 0,
                      borderTop: '1px solid var(--divider)',
                    }}
                  />
                  <p
                    data-testid="manage-cv-present"
                    style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}
                  >
                    CV attached
                  </p>
                </>
              )}

              {/*
                No primary action anywhere in the live state: the page's default posture is
                that nothing needs to change, and a violet CTA would contradict it. Cancel
                is pushed to the trailing end, away from anything benign.
              */}
              <div className="manage-actions">
                <Button
                  variant="secondary"
                  onClick={startRescheduling}
                  data-testid="manage-reschedule-button"
                >
                  {HIRING_MESSAGES.manage.rescheduleAction}
                </Button>
                <Button
                  variant="danger"
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

      <Modal
        open={confirming}
        title={HIRING_MESSAGES.manage.cancelDialogTitle}
        onClose={() => setConfirming(false)}
        // The destructive action is never what `Enter` reaches on arrival, and this is
        // the one dialog in the product where getting it wrong cannot be undone.
        initialFocusRef={dismiss}
        data-testid="manage-cancel-dialog"
        actions={
          <>
            <Button
              ref={dismiss}
              variant="ghost"
              onClick={() => setConfirming(false)}
              data-testid="manage-cancel-dismiss"
            >
              {HIRING_MESSAGES.manage.cancelDialogDismiss}
            </Button>
            <Button
              variant="danger"
              loading={cancelling}
              onClick={() => void cancelInterview()}
              data-testid="manage-cancel-confirm"
            >
              {HIRING_MESSAGES.manage.cancelAction}
            </Button>
          </>
        }
      >
        {/* The interview is named rather than gestured at, so a screen-reader user is
            never asked to confirm a pronoun. */}
        <p style={{ margin: 0, fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          {booking && cancelConfirmMessage(new Date(booking.startUtc), booking.timeZone)}
        </p>
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
      <InfoBanner tone={tone} data-testid={testId}>
        {message}
      </InfoBanner>
      <Card style={{ textAlign: 'center' }}>
        {/* A real link, not a button with an onClick: it is a navigation, and this keeps
            middle-click and copy-address working. */}
        <Button
          as="a"
          variant="primary"
          size="lg"
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
  gap: 'var(--sp-8)',
};

/** The pickers are the booking page's, at the booking page's width. */
const WIDE_COLUMN: CSSProperties = {
  display: 'grid',
  gap: 'var(--sp-8)',
};

const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

/** A text wordmark, never an image: this release uploads and renders no logo. */
function Wordmark({ name }: { name: string }) {
  return (
    <div
      data-testid="manage-org-wordmark"
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 'var(--fs-24)',
        letterSpacing: '-.5px',
        color: 'var(--text)',
      }}
    >
      {name}
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: 7,
          height: 7,
          borderRadius: 2,
          background: 'var(--amber-500)',
          marginLeft: 3,
          verticalAlign: 'middle',
        }}
      />
    </div>
  );
}
