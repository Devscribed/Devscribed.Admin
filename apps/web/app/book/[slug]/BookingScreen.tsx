'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  CV_ACCEPT,
  HIRING_MESSAGES,
  formatLongDate,
  formatSlotTime,
  justBookedPath,
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
  Badge,
  BookingLayout,
  Button,
  Card,
  FileInput,
  InfoBanner,
  Preloader,
  TextArea,
  TextInput,
} from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
import { detectTimeZone, formatDuration, formatFileSize } from '@/hiring/format';
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
 * grid and a list of times, and the candidate's details.
 *
 * Two rules shape almost everything here. Times are absolute instants and the zone is
 * only ever a lens on them, so changing the zone re-renders and never refetches a
 * different set of facts. And an availability failure is its own state — never an empty
 * month, never a disabled Book with no explanation.
 *
 * **There is no confirmation view.** A successful booking navigates to the manage page,
 * which is a URL the candidate can reload, bookmark and come back to — where a
 * confirmation rendered from component state was thrown away by the first refresh,
 * putting an empty booking form in front of somebody who had already booked (02 §10.41).
 * The record that page shows is the confirmation: it already states the title, the
 * length, the time, the zone, the name, the email and the CV, and it can act on all of
 * them.
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
  const router = useRouter();

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

    // Set only by the success path, which is the one outcome that must *not* release
    // the button: it holds its loading state until the navigation unmounts this screen.
    // Releasing it would put an enabled **Book** on screen for the length of a page
    // transition, inviting a second press against a booking that already exists.
    let booked = false;

    try {
      const response = await fetch(`/api/book/${slug}`, { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));

      if (response.status === 201) {
        booked = true;
        router.push(justBookedPath(slug, (body as BookingConfirmation).manageToken));
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
      if (!booked) setSubmitting(false);
    }
  }

  if (page.state === 'loading') {
    return (
      <BookingLayout data-testid="booking-page">
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          {/* The dots carry no text, so the announcement is made beside them. */}
          <Preloader data-testid="booking-loading" aria-hidden />
          <span aria-live="polite" style={SR_ONLY}>
            Loading this position
          </span>
        </div>
      </BookingLayout>
    );
  }

  if (page.state === 'notFound' || page.state === 'failed') {
    return (
      <BookingLayout data-testid="booking-page">
        <Card variant="panel">
          <p data-testid="booking-not-found" style={{ margin: 0, textAlign: 'center' }}>
            {HIRING_MESSAGES.booking.notFound}
          </p>
        </Card>
      </BookingLayout>
    );
  }

  const { organizationName, vacancy } = page.vacancy;

  return (
    <BookingLayout
      data-testid="booking-page"
      wordmark={organizationName}
      wordmarkTestId="booking-org-wordmark"
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
        {/* `PageTitle` is the *app page's* heading — 16px on a phone, 24px on a desktop,
            sized to sit under a navbar in a 290px-railed shell. This page has no shell and
            one thing on it, and its title is the largest type in the product: the system's
            headline-4, held at one size because there is nothing here for it to step
            with. */}
        <h1
          data-testid="booking-vacancy-title"
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
        {/* The length is a fact about the interview, not a caption under the title — the
            same neutral label a vacancy's categories take (decisions §59), which is how the
            rest of the product states a property of the thing above it. */}
        <Badge status="neutral" data-testid="booking-duration">
          {formatDuration(vacancy.durationMinutes)}
        </Badge>
        {vacancy.description && (
          <p
            data-testid="booking-description"
            style={{
              margin: 'var(--space-5) auto 0',
              maxWidth: '66ch',
              whiteSpace: 'pre-wrap',
              fontSize: 'var(--font-size-base)',
              lineHeight: 'var(--line-height-base)',
              color: 'var(--text-tertiary)',
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
        <Card variant="panel">
          <p data-testid="booking-closed-message" style={{ margin: 0, textAlign: 'center' }}>
            {HIRING_MESSAGES.booking.vacancyClosed}.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-8)' }}>
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

          {/* The caption that led this panel was a `SectionLabel`; it is the Card's own
              title now (D4), which makes it a real `<h2>` in the outline under the vacancy
              title's `<h1>` rather than an uppercase decoration above a box. */}
          <Card variant="panel" title="Your details">
            {banner && (
              <div style={{ marginBottom: 'var(--space-7)' }}>
                <InfoBanner variant="error" role="alert" data-testid="booking-error-banner">
                  {banner}
                </InfoBanner>
              </div>
            )}

            <form
              id={FORM_ID}
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              // 20px is the system's form rhythm, and the room the fields' message slot needs:
              // it is pinned below the field rather than pushing it (token map, `--sp-7`).
              style={{ display: 'grid', gap: 'var(--space-7)' }}
            >
              <div className="booking-names">
                <TextInput
                  label="First name"
                  required
                  id={TEST_IDS.firstName}
                  placeholder="Jane"
                  value={values.firstName}
                  onChange={(event) => change('firstName')(event.target.value)}
                  onBlur={blur('firstName')}
                  error={errors.firstName}
                  errorId="field-error-firstName"
                  aria-invalid={errors.firstName ? true : undefined}
                  aria-describedby={errors.firstName ? 'field-error-firstName' : undefined}
                  data-testid={TEST_IDS.firstName}
                />
                <TextInput
                  label="Last name"
                  required
                  id={TEST_IDS.lastName}
                  placeholder="Doe"
                  value={values.lastName}
                  onChange={(event) => change('lastName')(event.target.value)}
                  onBlur={blur('lastName')}
                  error={errors.lastName}
                  errorId="field-error-lastName"
                  aria-invalid={errors.lastName ? true : undefined}
                  aria-describedby={errors.lastName ? 'field-error-lastName' : undefined}
                  data-testid={TEST_IDS.lastName}
                />
              </div>

              <TextInput
                label="Email"
                required
                id={TEST_IDS.email}
                type="email"
                placeholder="you@example.com"
                value={values.email}
                onChange={(event) => change('email')(event.target.value)}
                onBlur={blur('email')}
                error={errors.email}
                errorId="field-error-email"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'field-error-email' : undefined}
                data-testid={TEST_IDS.email}
              />

              <FileInput
                label="CV"
                required
                id={TEST_IDS.cv}
                accept={CV_ACCEPT}
                fileName={cv?.name ?? null}
                fileNameTestId="booking-cv-filename"
                fileSize={cv ? formatFileSize(cv.size) : undefined}
                onClear={cv ? () => selectCv(null) : undefined}
                clearTestId="booking-cv-clear"
                onSelect={selectCv}
                error={errors.cv}
                errorId="field-error-cv"
                // Announced before a file is chosen, not after one is rejected. It shares
                // the error's slot, so only one of the two ever exists to be described by.
                hint={HIRING_MESSAGES.booking.cv.hint}
                hintId="booking-cv-hint"
                aria-invalid={errors.cv ? true : undefined}
                aria-describedby={errors.cv ? 'field-error-cv' : 'booking-cv-hint'}
                data-testid={TEST_IDS.cv}
              />

              <TextArea
                label="Anything we should know?"
                id={TEST_IDS.note}
                placeholder="Optional"
                rows={4}
                value={values.note}
                onChange={(event) => change('note')(event.target.value)}
                onBlur={blur('note')}
                error={errors.note}
                errorId="field-error-note"
                aria-invalid={errors.note ? true : undefined}
                aria-describedby={errors.note ? 'field-error-note' : undefined}
                data-testid={TEST_IDS.note}
              />

            </form>
          </Card>

          {/*
            **Outside the panel.** `Book` is not one of the form's fields — it is what the whole
            page has been building toward, and inside the card it read as the last row of
            `Your details`, level with a textarea, as though it submitted only the part it sat
            in. On the page's own ground, centred at 320px under everything it acts on, it is
            the one thing left to do.
          */}
          <div className="booking-submit">
            <Button
              type="submit"
              form={FORM_ID}
              variant="primary"
              preloader={submitting}
              disabled={!ready}
              data-testid="booking-submit-button"
            >
              {submitting ? 'Booking' : 'Book'}
            </Button>
          </div>
        </div>
      )}
    </BookingLayout>
  );
}

/** The form the `Book` button submits from outside it. */
const FORM_ID = 'booking-details-form';

const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
};
