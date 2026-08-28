'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  CV_ACCEPT,
  HIRING_MESSAGES,
  formatLongDate,
  formatSlotTime,
  managePath,
  retainSelection,
  validateBooking,
  validateBookingNote,
  validateCandidateFirstName,
  validateCandidateLastName,
  validateCv,
  validateEmail,
  type BookingField,
} from '@devscribed/validation';
import {
  BookingLayout,
  Button,
  Card,
  FileInput,
  InfoBanner,
  Input,
  SectionLabel,
  Spinner,
  Textarea,
} from '@/ds';
import { errorNode, focusByTestId, hintNode } from '@/field-error';
import { detectTimeZone, formatDuration, formatWhen } from '@/hiring/format';
import { SlotPicker, readTimeFormat, writeTimeFormat } from '@/hiring/SlotPicker';
import { useAvailability } from '@/hiring/useAvailability';
import type { BookingConfirmation, PublicVacancy } from '@/hiring/types';

type Values = Record<'firstName' | 'lastName' | 'email' | 'note', string>;
type Errors = Partial<Record<BookingField, string>>;

const EMPTY: Values = { firstName: '', lastName: '', email: '', note: '' };

const TEST_IDS: Record<BookingField, string> = {
  firstName: 'booking-first-name-input',
  lastName: 'booking-last-name-input',
  email: 'booking-email-input',
  cv: 'booking-cv-input',
  note: 'booking-note-input',
};

const FIELD_VALIDATORS = {
  firstName: validateCandidateFirstName,
  lastName: validateCandidateLastName,
  email: validateEmail,
  note: validateBookingNote,
};

type Page =
  | { state: 'loading' }
  | { state: 'notFound' }
  | { state: 'ready'; vacancy: PublicVacancy }
  | { state: 'failed' };

/**
 * The public booking page: the vacancy, the interviewer's real availability as a month
 * grid and a list of times, the candidate's details, and the confirmation.
 *
 * Two rules shape almost everything here. Times are absolute instants and the zone is
 * only ever a lens on them, so changing the zone re-renders and never refetches a
 * different set of facts. And an availability failure is its own state — never an empty
 * month, never a disabled Book with no explanation.
 */
export function BookingScreen({ slug }: { slug: string }) {
  const [page, setPage] = useState<Page>({ state: 'loading' });
  const [timeZone, setTimeZone] = useState('UTC');
  const [hour12, setHour12] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [values, setValues] = useState<Values>(EMPTY);
  const [cv, setCv] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  // Read after mount: both are browser facts, and rendering them on the server would
  // hand every visitor the same zone and then correct it under them.
  useEffect(() => {
    setTimeZone(detectTimeZone());
    setHour12(readTimeFormat());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const response = await fetch(`/api/book/${slug}`);
        if (cancelled) return;
        if (response.status === 404) {
          setPage({ state: 'notFound' });
          return;
        }
        if (!response.ok) {
          setPage({ state: 'failed' });
          return;
        }
        setPage({ state: 'ready', vacancy: await response.json() });
      } catch {
        if (!cancelled) setPage({ state: 'failed' });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const open = page.state === 'ready' && page.vacancy.vacancy.status === 'open';

  const onSlotResolved = useCallback((slot: string | null) => {
    setSelectedSlot(slot);
    if (!slot) setAnnouncement('Your selected time is no longer available. Please choose another.');
  }, []);

  const availability = useAvailability(`/api/book/${slug}/availability`, timeZone, {
    enabled: open,
    keepSlot: selectedSlot,
    onSlotResolved,
  });

  const change = (field: keyof Values) => (value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setBanner(null);
  };

  const blur = (field: keyof Values) => () => {
    const result = FIELD_VALIDATORS[field](values[field]);
    setErrors((previous) => {
      const next = { ...previous };
      if (result.valid) delete next[field];
      else next[field] = result.error;
      return next;
    });
  };

  /** Validated on selection, not on submit — the constraints were stated up front. */
  const selectCv = (file: File | null): void => {
    setCv(file);
    setBanner(null);
    const result = validateCv(file ? { fileName: file.name, sizeBytes: file.size } : null);
    setErrors((previous) => {
      const next = { ...previous };
      if (result.valid) delete next.cv;
      else next.cv = result.error;
      return next;
    });
    // A rejected file is not held on to, so a stale name can never be submitted.
    if (!result.valid) setCv(null);
  };

  const chooseDate = (date: string): void => {
    // Choosing a date always reloads the times, and a time from another date is not in
    // that list — so the selection clears (time-slot-picker §04.20).
    setSelectedSlot((current) => retainSelection(current, availability.slotsOn(date)));
    setAnnouncement(`${formatLongDate(date)} selected.`);
  };

  const chooseFormat = (twelve: boolean): void => {
    setHour12(twelve);
    writeTimeFormat(twelve);
  };

  const ready = useMemo(() => {
    if (!selectedSlot || !cv) return false;
    return validateBooking({ ...values, cv: { fileName: cv.name, sizeBytes: cv.size } }).valid;
  }, [selectedSlot, cv, values]);

  async function submit(): Promise<void> {
    if (submitting) return;

    const validation = validateBooking({
      ...values,
      cv: cv ? { fileName: cv.name, sizeBytes: cv.size } : null,
    });
    if (!validation.valid) {
      setErrors(validation.errors);
      focusByTestId(TEST_IDS[validation.firstInvalidField!]);
      return;
    }
    if (!selectedSlot) {
      setBanner(HIRING_MESSAGES.booking.slotRequired);
      return;
    }

    setErrors({});
    setBanner(null);
    setSubmitting(true);

    const form = new FormData();
    form.set('firstName', validation.value.firstName);
    form.set('lastName', validation.value.lastName);
    form.set('email', validation.value.email);
    form.set('note', validation.value.note);
    form.set('startUtc', selectedSlot);
    form.set('timeZone', timeZone);
    form.set('cv', cv!);

    try {
      const response = await fetch(`/api/book/${slug}`, { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));

      if (response.status === 201) {
        setConfirmation(body);
        return;
      }
      if (body.error === 'validation' && body.fields) {
        setErrors(body.fields);
        return;
      }
      if (body.error === 'slot_taken') {
        // The offer is stale, so it is withdrawn rather than left to be retried.
        setSelectedSlot(null);
        availability.reload();
      }
      setBanner(body.message ?? HIRING_MESSAGES.booking.failed);
    } catch {
      setBanner(HIRING_MESSAGES.booking.failed);
    } finally {
      setSubmitting(false);
    }
  }

  if (page.state === 'loading') {
    return (
      <BookingLayout data-testid="booking-page">
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--accent)' }}>
          <Spinner size={28} />
        </div>
      </BookingLayout>
    );
  }

  if (page.state === 'notFound' || page.state === 'failed') {
    return (
      <BookingLayout data-testid="booking-page">
        <Card>
          <p data-testid="booking-not-found" style={{ margin: 0, textAlign: 'center' }}>
            {HIRING_MESSAGES.booking.notFound}
          </p>
        </Card>
      </BookingLayout>
    );
  }

  const { organizationName, vacancy } = page.vacancy;

  return (
    <BookingLayout data-testid="booking-page" wordmark={<Wordmark name={organizationName} />}>
      <header style={{ textAlign: 'center', marginBottom: 'var(--sp-12)' }}>
        <h1
          data-testid="booking-vacancy-title"
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
          data-testid="booking-duration"
          style={{
            marginTop: 'var(--sp-2)',
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-15)',
            color: 'var(--text-muted)',
          }}
        >
          {formatDuration(vacancy.durationMinutes)}
        </div>
        {vacancy.description && (
          <p
            data-testid="booking-description"
            style={{
              margin: 'var(--sp-6) auto 0',
              maxWidth: '66ch',
              whiteSpace: 'pre-wrap',
              fontSize: 'var(--fs-15)',
              lineHeight: 'var(--lh-normal)',
              color: 'var(--text-sub)',
            }}
          >
            {vacancy.description}
          </p>
        )}
      </header>

      {/* Availability and selection changes go here; a rejected booking goes to the
          error banner, so nothing is announced twice. */}
      <div aria-live="polite" style={SR_ONLY}>
        {announcement}
      </div>

      {vacancy.status === 'closed' ? (
        <Card>
          <p data-testid="booking-closed-message" style={{ margin: 0, textAlign: 'center' }}>
            {HIRING_MESSAGES.booking.vacancyClosed}.
          </p>
        </Card>
      ) : confirmation ? (
        <Confirmation confirmation={confirmation} slug={slug} />
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-12)' }}>
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
            onFormatChange={chooseFormat}
            onDateChange={chooseDate}
            testIds={{
              timeZoneSelect: 'booking-timezone-select',
              timeFormatToggle: 'booking-timeformat-toggle',
            }}
          />

          <Card>
            <SectionLabel>Your details</SectionLabel>
            {banner && (
              <div style={{ marginTop: 'var(--sp-6)' }}>
                <InfoBanner tone="error" role="alert" data-testid="booking-error-banner">
                  {banner}
                </InfoBanner>
              </div>
            )}

            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              style={{ display: 'grid', gap: 'var(--sp-10)', marginTop: 'var(--sp-10)' }}
            >
              <div className="booking-names">
                <Input
                  label="First name"
                  placeholder="Jane"
                  value={values.firstName}
                  onChange={(event) => change('firstName')(event.target.value)}
                  onBlur={blur('firstName')}
                  error={errors.firstName ? errorNode('firstName', errors.firstName) : undefined}
                  aria-invalid={errors.firstName ? true : undefined}
                  aria-describedby={errors.firstName ? 'field-error-firstName' : undefined}
                  data-testid="booking-first-name-input"
                />
                <Input
                  label="Last name"
                  placeholder="Doe"
                  value={values.lastName}
                  onChange={(event) => change('lastName')(event.target.value)}
                  onBlur={blur('lastName')}
                  error={errors.lastName ? errorNode('lastName', errors.lastName) : undefined}
                  aria-invalid={errors.lastName ? true : undefined}
                  aria-describedby={errors.lastName ? 'field-error-lastName' : undefined}
                  data-testid="booking-last-name-input"
                />
              </div>

              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={values.email}
                onChange={(event) => change('email')(event.target.value)}
                onBlur={blur('email')}
                error={errors.email ? errorNode('email', errors.email) : undefined}
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'field-error-email' : undefined}
                data-testid="booking-email-input"
              />

              <FileInput
                label="CV"
                accept={CV_ACCEPT}
                fileName={cv?.name ?? null}
                fileNameTestId="booking-cv-filename"
                onSelect={selectCv}
                error={errors.cv ? errorNode('cv', errors.cv) : undefined}
                // Announced before a file is chosen, not after one is rejected.
                hint={hintNode('booking-cv-hint', 'PDF, DOC, DOCX, RTF or TXT. Up to 10 MB.')}
                aria-describedby={errors.cv ? 'field-error-cv' : 'booking-cv-hint'}
                data-testid="booking-cv-input"
              />

              <Textarea
                label="Anything we should know?"
                placeholder="Optional"
                rows={4}
                value={values.note}
                onChange={(event) => change('note')(event.target.value)}
                onBlur={blur('note')}
                error={errors.note ? errorNode('note', errors.note) : undefined}
                data-testid="booking-note-input"
              />

              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="booking-submit"
                  loading={submitting}
                  disabled={!ready}
                  aria-busy={submitting || undefined}
                  data-testid="booking-submit-button"
                >
                  {submitting ? 'Booking' : 'Book'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </BookingLayout>
  );
}

const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};

function Confirmation({
  confirmation,
  slug,
}: {
  confirmation: BookingConfirmation;
  slug: string;
}) {
  return (
    <Card data-testid="booking-confirmation">
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-22)',
          color: 'var(--text)',
        }}
      >
        You&rsquo;re booked
      </h2>
      <dl style={{ margin: 'var(--sp-10) 0 0', display: 'grid', gap: 'var(--sp-4)' }}>
        <div style={{ fontSize: 'var(--fs-15)' }}>
          {confirmation.vacancyTitle} · {formatDuration(confirmation.durationMinutes)}
        </div>
        <div data-testid="booking-confirmation-when" style={{ fontSize: 'var(--fs-15)' }}>
          {formatWhen(confirmation.startUtc, confirmation.timeZone)}
        </div>
        <div
          data-testid="booking-confirmation-zone"
          style={{ fontSize: 'var(--fs-14)', color: 'var(--text-muted)' }}
        >
          {confirmation.timeZone}
        </div>
        <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          {confirmation.firstName} {confirmation.lastName} · {confirmation.email}
        </div>
        <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          CV: {confirmation.cvFileName}
        </div>
      </dl>
      <p
        data-testid="booking-confirmation-email"
        style={{ marginTop: 'var(--sp-10)', marginBottom: 0, fontSize: 'var(--fs-14)' }}
      >
        A calendar invite is on its way to {confirmation.email}.
      </p>
      {/*
        The manage link, so a candidate who mistyped their choice can fix it before
        closing the tab (02 §10.43). This copy is lost on refresh by design — the
        durable one is in the calendar invite, which is where 07 §03.14 puts it.
      */}
      <p style={{ marginTop: 'var(--sp-6)', marginBottom: 0, fontSize: 'var(--fs-14)' }}>
        Need to change it?{' '}
        <a
          href={managePath(slug, confirmation.manageToken)}
          data-testid="booking-confirmation-manage-link"
        >
          Reschedule or cancel your interview
        </a>
        .
      </p>
    </Card>
  );
}

/** A text wordmark, never an image: this release uploads and renders no logo. */
function Wordmark({ name }: { name: string }) {
  return (
    <div
      data-testid="booking-org-wordmark"
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
