'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, Modal } from '@/ds';
import { useToast } from '@/toast';
import { calculateWorkingDays, REQUEST_MESSAGES, validateVacationRequestDates } from '@devscribed/validation';

/** Today's local date as 'YYYY-MM-DD' — the `today` boundary the date validator compares against. */
function localTodayYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const microLabel: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-11)',
  letterSpacing: 'var(--ls-wider)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 'var(--sp-4)',
};

const previewLine: CSSProperties = {
  fontSize: 'var(--fs-13)',
  color: 'var(--text-sub)',
};

/** Inline field error carrying the spec's `field-error-{field}` id + test id (native inputs
 * cannot use the DS `Input`'s `error` slot, so the error node is rendered by hand). */
function FieldError({ field, message }: { field: string; message: string }) {
  return (
    <div
      id={`field-error-${field}`}
      data-testid={`field-error-${field}`}
      style={{
        fontFamily: 'var(--font-text)',
        fontSize: 'var(--fs-12)',
        color: 'var(--error-500)',
        marginTop: 'var(--sp-2)',
      }}
    >
      {message}
    </div>
  );
}

/** Native `<input type="date">` styled to the DS `Input` shape (the DS has no date field —
 * see the spec-09 design doc's DS-gaps). Manages its own focus ring like `Input`. */
function DateInput({
  label,
  testId,
  field,
  value,
  min,
  error,
  disabled,
  onChange,
}: {
  label: string;
  testId: string;
  field: string;
  value: string;
  min?: string;
  error?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [focus, setFocus] = useState(false);
  const borderColor = error
    ? 'var(--error-500)'
    : focus
      ? 'var(--accent)'
      : 'var(--border-strong)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={{ ...microLabel, color: error ? 'var(--error-500)' : 'var(--text-muted)' }}>
        {label}
      </label>
      <input
        type="date"
        value={value}
        min={min}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `field-error-${field}` : undefined}
        style={{
          height: 'var(--field-h-lg)',
          width: '100%',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 'var(--radius-lg)',
          padding: '0 12px',
          fontFamily: 'var(--font-text)',
          fontSize: 'var(--fs-15)',
          color: 'var(--text)',
          background: 'var(--bg-field)',
          outline: 'none',
          boxShadow: focus ? (error ? 'var(--shadow-glow-error)' : 'var(--shadow-glow-accent)') : 'none',
          transition: 'border-color .15s, box-shadow .15s',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.55 : 1,
        }}
      />
      {error && <FieldError field={field} message={error} />}
    </div>
  );
}

/**
 * Request Vacation modal (spec 09). Two native date inputs, a live working-days preview and
 * available-balance display, a client-side cross-year gate (disables submit), and a POST to
 * `.../vacation/requests`. Follows `VacationFinancialsModal`'s shell + `useToast()` contract:
 * on 201 it closes, toasts, and asks the panel to refetch — the server owns balance/status.
 */
export function RequestVacationModal({
  orgId,
  memberId,
  open,
  availableDays,
  onClose,
  onSubmitted,
}: {
  orgId: string;
  memberId: string;
  open: boolean;
  availableDays: number;
  onClose: () => void;
  /** Fired after a successful submit so the panel refetches `GET .../vacation`. */
  onSubmitted: () => void;
}) {
  const { showToast } = useToast();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ startDate?: string; endDate?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const today = localTodayYmd();

  // Re-seed clean whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    setStartDate('');
    setEndDate('');
    setFieldErrors({});
    setServerError(null);
    setSaving(false);
  }, [open]);

  const bothPresent = startDate !== '' && endDate !== '';
  const dateValidation = bothPresent
    ? validateVacationRequestDates({ startDate, endDate }, today)
    : null;
  const crossYear = dateValidation?.crossYear ?? false;

  const workingDaysText =
    bothPresent && startDate <= endDate ? String(calculateWorkingDays(startDate, endDate)) : '—';

  // The shared inline error node shows the client-side cross-year message first, then any
  // server-side 400 business error (insufficient balance / overlap / past date / no financials).
  const errorText = crossYear ? REQUEST_MESSAGES.crossYear : serverError;

  function handleClose() {
    if (saving) return;
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || crossYear) return;

    const result = validateVacationRequestDates({ startDate, endDate }, today);
    if (!result.valid) {
      setFieldErrors(result.fieldErrors);
      return;
    }

    setFieldErrors({});
    setServerError(null);
    setSaving(true);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/members/${memberId}/vacation/requests`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ startDate, endDate }),
        },
      );

      if (response.ok) {
        setSaving(false);
        onClose();
        showToast('toast-request-submitted', REQUEST_MESSAGES.toastSubmitted);
        onSubmitted();
        return;
      }

      const body = await response.json().catch(() => null);
      // A validation 400 carries `{ errors: { field: message } }`; a business 400 carries
      // `{ error, message }` (cross_year / insufficient_balance / overlap / financials_not_configured).
      if (body?.errors && typeof body.errors === 'object') {
        setFieldErrors(body.errors as { startDate?: string; endDate?: string });
      } else {
        setServerError(body?.message ?? REQUEST_MESSAGES.genericError);
      }
    } catch {
      setServerError(REQUEST_MESSAGES.genericError);
    }
    setSaving(false);
  }

  return (
    <Modal
      open={open}
      title="Request Vacation"
      onClose={handleClose}
      width={440}
      data-testid="vacation-request-modal"
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleClose}
            disabled={saving}
            data-testid="vacation-request-cancel-btn"
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="vacation-request-form"
            variant="primary"
            size="lg"
            loading={saving}
            disabled={crossYear}
            data-testid="vacation-request-submit-btn"
            style={{ flex: 1 }}
          >
            {saving ? 'Submitting' : 'Submit request'}
          </Button>
        </>
      }
    >
      <form id="vacation-request-form" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}>
          <DateInput
            label="Start date"
            testId="vacation-start-date-input"
            field="startDate"
            value={startDate}
            min={today}
            error={fieldErrors.startDate}
            disabled={saving}
            onChange={(value) => {
              setStartDate(value);
              setFieldErrors((prev) => ({ ...prev, startDate: undefined }));
              setServerError(null);
            }}
          />

          <DateInput
            label="End date"
            testId="vacation-end-date-input"
            field="endDate"
            value={endDate}
            min={startDate || today}
            error={fieldErrors.endDate}
            disabled={saving}
            onChange={(value) => {
              setEndDate(value);
              setFieldErrors((prev) => ({ ...prev, endDate: undefined }));
              setServerError(null);
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
            <div data-testid="vacation-working-days-preview" style={previewLine}>
              Working days: {workingDaysText}
            </div>
            <div data-testid="vacation-available-days-preview" style={previewLine}>
              Available balance: {availableDays} days
            </div>
          </div>

          {errorText && (
            <div
              data-testid="vacation-request-error"
              role="alert"
              style={{ fontSize: 'var(--fs-13)', color: 'var(--error-500)' }}
            >
              {errorText}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
