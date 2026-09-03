'use client';

import { useState, type FormEvent } from 'react';
import { Button, FieldLabel, FormActions, Modal, Select, TextInput } from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
import { optionFor, valueOf } from '@/select';
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

/** Reading order of the form — "the first invalid field" means the first of these. */
const FOCUS_ORDER: readonly Field[] = ['date', 'name', 'paidHours', 'countryCode'];

/**
 * The focusable input behind each field. `countryCode` is deliberately absent: the
 * rule is "focus the field the caller must fix", and the question the picker can
 * answer is "which of the offered options is selected" — every one of which is valid,
 * so a client-side `countryCode` error cannot arise here. The only source of one is a
 * server 422, which sets the errors without running this focus path.
 */
const FIELD_INPUT_TESTID: Partial<Record<Field, string>> = {
  date: 'holiday-date-input',
  name: 'holiday-name-input',
  paidHours: 'holiday-hours-input',
};

/**
 * Inline error carrying the spec's `field-error-{field}` id.
 *
 * Every field here that *can* use the system's own message slot does — `TextInput` has
 * `error` + `errorId` (§4) and `Select` has `errorMessage` + `errorId` (§21). This is left
 * for the one control neither covers: the native `<input type="date">` below.
 */
function FieldError({ field, message }: { field: string; message: string }) {
  return (
    <div
      id={`field-error-${field}`}
      data-testid={`field-error-${field}`}
      style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--status-error)',
        marginTop: 'var(--space-1)',
      }}
    >
      {message}
    </div>
  );
}

/**
 * Native `<input type="date">`, painted as one of the system's fields.
 *
 * The system's restorable `DateField` was read before this was kept, and refused: it is a
 * *measurement* of a date picker rather than a working one — a `readOnly` input with a
 * hard-coded default date, no `onChange`, no value contract and a popup that selects
 * nothing. Swapping a field an admin can type into for one they cannot would be a repaint
 * that removes the feature. So the native control stays and takes the system's own field
 * geometry instead: `FieldLabel` (§64) above it, `--control-height`, the control-weight
 * border, and the focus and error glows every other field on this screen draws.
 */
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
    ? 'var(--status-error)'
    : focus
      ? 'var(--action-primary)'
      : 'var(--border-default)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <FieldLabel htmlFor={testId}>{label}</FieldLabel>
      <input
        type="date"
        id={testId}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        data-testid={testId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `field-error-${field}` : undefined}
        style={{
          height: 'var(--control-height)',
          width: '100%',
          // The control weight, not a heavier ink: the system tells a field's edge from a
          // divider by width rather than by colour, which is how `--border-strong` closed.
          border: `var(--border-width-control) solid ${borderColor}`,
          borderRadius: 'var(--radius-l)',
          padding: '0 var(--space-5)',
          fontFamily: 'var(--font-family-base)',
          fontSize: 'var(--font-size-base)',
          color: 'var(--text-primary)',
          background: 'var(--surface-card)',
          outline: 'none',
          boxShadow: focus
            ? error
              ? 'var(--shadow-error-glow)'
              : 'var(--shadow-focus-input)'
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

  /**
   * Seeded once, at mount. The page mounts this component when the modal opens and
   * unmounts it when it closes, so "reset the form for a new target" is React's own
   * mount, not an effect that has to guess when to re-seed. That is what removes the
   * dependency the exhaustive-deps rule was being silenced about: `mode` is rebuilt on
   * every parent render, so an effect keyed on it would clobber what the admin is
   * typing, and an effect keyed on `open` alone is lying about what it reads.
   */
  const [date, setDate] = useState(() =>
    mode.kind === 'edit' ? mode.holiday.date : localTodayYmd(),
  );
  const [name, setName] = useState(() => (mode.kind === 'edit' ? mode.holiday.name : ''));
  const [paidHours, setPaidHours] = useState(() =>
    String(mode.kind === 'edit' ? mode.holiday.paidHours : HOLIDAY_PAID_HOURS_DEFAULT),
  );
  const [countryCode, setCountryCode] = useState(() =>
    mode.kind === 'edit' ? (mode.holiday.countryCode ?? '') : '',
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);

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
      // Show every error and focus the first invalid field — the submit button is
      // never disabled for validation. `focusByTestId` is the app's one focus helper
      // (`apps/web/src/field-error.tsx`); the ids it is handed are the spec's.
      setErrors(fields);
      const first = FOCUS_ORDER.find((f) => fields[f]);
      const target = first ? FIELD_INPUT_TESTID[first] : undefined;
      if (target) focusByTestId(target);
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
    <Modal open={open} title={title} onClose={handleClose} data-testid="holiday-modal">
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
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}
      >
        <div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start' }}>
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
            {/* §4 — the field tags its own message, so the `as unknown as string` cast that
                smuggled a node through the previous system's `Input` is gone with it. */}
            <TextInput
              label="Paid hours"
              type="number"
              step="0.25"
              min="0"
              max="24"
              value={paidHours}
              onChange={(event) => {
                setPaidHours(event.target.value);
                clearError('paidHours');
              }}
              readOnly={submitting}
              data-testid="holiday-hours-input"
              aria-invalid={errors.paidHours ? true : undefined}
              aria-describedby={errors.paidHours ? 'field-error-paidHours' : undefined}
              error={errors.paidHours}
              errorId="field-error-paidHours"
            />
          </div>
        </div>

        <TextInput
          label="Holiday name"
          placeholder="e.g. New Year's Day"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            clearError('name');
          }}
          readOnly={submitting}
          autoFocus
          data-testid="holiday-name-input"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'field-error-name' : undefined}
          error={errors.name}
          errorId="field-error-name"
        />

        <Select
          label="Country"
          value={optionFor(HOLIDAY_COUNTRY_OPTIONS, countryCode)}
          options={HOLIDAY_COUNTRY_OPTIONS}
          onChange={(option) => {
            setCountryCode(valueOf(option));
            clearError('countryCode');
          }}
          isDisabled={submitting}
          variant="formik"
          data-testid="holiday-country-select"
          error={errors.countryCode ? true : undefined}
          errorMessage={errors.countryCode}
          errorId="field-error-countryCode"
        />

        {/* §63 — `leading` is the destructive slot: it widens the row and pushes Delete to
            the far left of the pair, which only reads as "pushed left" because everything
            beside it is otherwise right. `Delete holiday` is drawn only for a caller holding
            `delete-holidays` — a manager must not see a control they cannot use
            (TC-03-E2E-02). */}
        <div style={{ marginTop: 'var(--space-5)' }}>
          <FormActions
            leading={
              isEdit && canDelete ? (
                <Button
                  type="button"
                  variant="delete"
                  onClick={() => onRequestDelete((mode as { holiday: HolidayRow }).holiday)}
                  disabled={submitting}
                  data-testid="holiday-delete-btn"
                >
                  Delete holiday
                </Button>
              ) : undefined
            }
          >
            <Button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              data-testid="holiday-cancel-btn"
            >
              Cancel
            </Button>
            {/* Never disabled for validation — an invalid form shows every error and focuses
                the first invalid field, and a 409 leaves this live (TC-03-E2E-03). */}
            <Button
              type="submit"
              variant="primary"
              preloader={submitting}
              data-testid="holiday-save-btn"
            >
              {isEdit ? (submitting ? 'Saving' : 'Save') : submitting ? 'Adding' : 'Add holiday'}
            </Button>
          </FormActions>
        </div>
      </form>
    </Modal>
  );
}
