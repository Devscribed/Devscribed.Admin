'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, Input, Modal, Select } from '@/ds';
import { useToast } from '@/toast';
import {
  HOLIDAY_MESSAGES,
  HOLIDAY_PAID_HOURS_DEFAULT,
  validateHolidayCountryCode,
  validateHolidayDate,
  validateHolidayName,
  validatePaidHours,
} from '@devscribed/validation';
import { HOLIDAY_COUNTRY_OPTIONS } from './country-options';
import type { HolidayRow } from './types';

/**
 * Create-vs-edit as a discriminated union rather than two booleans, so a stale row
 * cannot survive a mode flip (the `ClientModal` pattern).
 */
export type HolidayModalMode = { kind: 'create' } | { kind: 'edit'; holiday: HolidayRow };

type Field = 'date' | 'name' | 'paidHours' | 'countryCode';

const microLabel: CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--fs-11)',
  letterSpacing: 'var(--ls-wider)',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 'var(--sp-4)',
};

/** Inline error carrying the spec's `field-error-{field}` id — a native input cannot
 * use the DS `Input`'s error slot, so the node is drawn by hand (the spec-09 pattern). */
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

/** Native `<input type="date">` styled to the DS `Input` (the DS has no date field). */
function DateInput({
  label,
  testId,
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  label: string;
  testId: string;
  field: string;
  value: string;
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
          boxShadow: focus
            ? error
              ? 'var(--shadow-glow-error)'
              : 'var(--shadow-glow-accent)'
            : 'none',
          transition: 'border-color .15s, box-shadow .15s',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.55 : 1,
        }}
      />
      {error && <FieldError field={field} message={error} />}
    </div>
  );
}

/** Today as `YYYY-MM-DD` in the viewer's own zone — the Add modal's pre-filled date. */
function localTodayYmd(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Add / Edit Holiday modal (spec organization/03 §Screens). Every rule is the shared
 * one from `packages/validation`; the copy here is a convenience and the server re-runs
 * all of it. Submit is never disabled for validation — an invalid form shows every
 * error and focuses the first invalid field — and a 409 keeps the modal open with the
 * duplicate message inline under Date.
 *
 * `Delete holiday` is rendered only when the caller holds `delete-holidays`; a manager
 * must not see a control they cannot use (TC-03-E2E-02).
 */
export function HolidayModal({
  open,
  mode,
  orgId,
  canDelete,
  onClose,
  onSaved,
  onRequestDelete,
}: {
  open: boolean;
  mode: HolidayModalMode;
  orgId: string;
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
  onRequestDelete: (holiday: HolidayRow) => void;
}) {
  const { showToast } = useToast();
  const isEdit = mode.kind === 'edit';

  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [paidHours, setPaidHours] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (mode.kind === 'edit') {
      setDate(mode.holiday.date);
      setName(mode.holiday.name);
      setPaidHours(String(mode.holiday.paidHours));
      setCountryCode(mode.holiday.countryCode ?? '');
    } else {
      setDate(localTodayYmd());
      setName('');
      setPaidHours(String(HOLIDAY_PAID_HOURS_DEFAULT));
      setCountryCode('');
    }
    setErrors({});
    setSubmitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  function clearError(field: Field) {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  /** Runs every shared rule and returns the field map plus the normalized payload. */
  function validateAll(): {
    fields: Partial<Record<Field, string>>;
    payload: { date: string; name: string; paidHours: number; countryCode: string | null };
  } {
    const fields: Partial<Record<Field, string>> = {};
    const dateResult = validateHolidayDate(date);
    if (!dateResult.valid) fields.date = dateResult.error;
    const nameResult = validateHolidayName(name);
    if (!nameResult.valid) fields.name = nameResult.error;
    const hoursResult = validatePaidHours(paidHours);
    if (!hoursResult.valid) fields.paidHours = hoursResult.error;
    const countryResult = validateHolidayCountryCode(countryCode);
    if (!countryResult.valid) fields.countryCode = countryResult.error;

    return {
      fields,
      payload: {
        date: dateResult.valid ? dateResult.value : date,
        name: nameResult.valid ? nameResult.value : name,
        paidHours: hoursResult.valid ? hoursResult.value : 0,
        countryCode: countryResult.valid ? countryResult.value : null,
      },
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const { fields, payload } = validateAll();
    if (Object.keys(fields).length > 0) {
      setErrors(fields);
      const first = (['date', 'name', 'paidHours', 'countryCode'] as Field[]).find(
        (f) => fields[f],
      );
      const testId =
        first === 'date'
          ? 'holiday-date-input'
          : first === 'name'
            ? 'holiday-name-input'
            : first === 'paidHours'
              ? 'holiday-hours-input'
              : 'holiday-country-select';
      document.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)?.focus();
      return;
    }

    setErrors({});
    setSubmitting(true);

    const url = isEdit
      ? `/api/organizations/${orgId}/holidays/${(mode as { holiday: HolidayRow }).holiday.id}`
      : `/api/organizations/${orgId}/holidays`;

    try {
      const response = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setSubmitting(false);
        onClose();
        showToast(
          isEdit ? 'toast-holiday-updated' : 'toast-holiday-added',
          isEdit ? HOLIDAY_MESSAGES.toastUpdated : HOLIDAY_MESSAGES.toastCreated,
        );
        onSaved();
        return;
      }

      const body = await response.json().catch(() => null);
      if (response.status === 409 && body?.error === 'holiday_duplicate') {
        // Alt Flow A — the modal stays open, the message goes under Date, and the
        // save button is NOT disabled.
        setErrors({ date: body?.message ?? HOLIDAY_MESSAGES.duplicate });
      } else if (response.status === 422 && body?.error === 'validation_error') {
        setErrors(body?.fields ?? {});
      } else {
        showToast('toast-server-error', HOLIDAY_MESSAGES.toastServerError, 'error');
      }
    } catch {
      showToast('toast-server-error', HOLIDAY_MESSAGES.toastServerError, 'error');
    }
    setSubmitting(false);
  }

  const title = isEdit ? 'Edit holiday' : 'Add holiday';

  return (
    <Modal
      open={open}
      title={title}
      onClose={handleClose}
      width={520}
      data-testid="holiday-modal"
      actions={
        <>
          {isEdit && canDelete && (
            <Button
              type="button"
              variant="danger"
              size="lg"
              onClick={() => onRequestDelete((mode as { holiday: HolidayRow }).holiday)}
              disabled={submitting}
              data-testid="holiday-delete-btn"
              style={{ marginRight: 'auto' }}
            >
              Delete holiday
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={handleClose}
            disabled={submitting}
            data-testid="holiday-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="holiday-form"
            variant="primary"
            size="lg"
            loading={submitting}
            data-testid="holiday-save-btn"
          >
            {isEdit ? (submitting ? 'Saving' : 'Save') : submitting ? 'Adding' : 'Add holiday'}
          </Button>
        </>
      }
    >
      {/* The DS Modal draws its own header, so the title's test id rides a hidden marker. */}
      <span
        data-testid="holiday-modal-title"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {title}
      </span>
      <form
        id="holiday-form"
        onSubmit={submit}
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}
      >
        <div style={{ display: 'flex', gap: 'var(--sp-5)', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <DateInput
              label="Date"
              testId="holiday-date-input"
              field="date"
              value={date}
              error={errors.date}
              disabled={submitting}
              onChange={(value) => {
                setDate(value);
                clearError('date');
              }}
            />
          </div>
          <div style={{ width: 150 }}>
            <Input
              label="Paid hours"
              type="number"
              step="0.25"
              min="0"
              max="24"
              value={paidHours}
              onChange={(event: { target: { value: string } }) => {
                setPaidHours(event.target.value);
                clearError('paidHours');
              }}
              readOnly={submitting}
              data-testid="holiday-hours-input"
              aria-invalid={errors.paidHours ? true : undefined}
              aria-describedby={errors.paidHours ? 'field-error-paidHours' : undefined}
              error={
                errors.paidHours
                  ? ((
                      <FieldError field="paidHours" message={errors.paidHours} />
                    ) as unknown as string)
                  : undefined
              }
              wrapperStyle={{ gap: 0 }}
            />
          </div>
        </div>

        <Input
          label="Holiday name"
          placeholder="e.g. New Year's Day"
          value={name}
          onChange={(event: { target: { value: string } }) => {
            setName(event.target.value);
            clearError('name');
          }}
          readOnly={submitting}
          autoFocus
          data-testid="holiday-name-input"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'field-error-name' : undefined}
          error={
            errors.name
              ? ((<FieldError field="name" message={errors.name} />) as unknown as string)
              : undefined
          }
          wrapperStyle={{ gap: 0 }}
        />

        <div>
          <Select
            label="Country"
            value={countryCode}
            options={HOLIDAY_COUNTRY_OPTIONS}
            onChange={(value: string) => {
              setCountryCode(value);
              clearError('countryCode');
            }}
            disabled={submitting}
            data-testid="holiday-country-select"
          />
          {errors.countryCode && (
            <FieldError field="countryCode" message={errors.countryCode} />
          )}
        </div>
      </form>
    </Modal>
  );
}
