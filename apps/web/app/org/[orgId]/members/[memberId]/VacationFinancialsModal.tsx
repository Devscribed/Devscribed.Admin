'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, FormActions, Modal, Select, TextInput, ToggleButton } from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
import { useToast } from '@/toast';
import {
  calculateReservePercent,
  ISO_4217_CURRENCIES,
  MESSAGES,
  validateClientHourlyRate,
  validateCurrency,
  validateMemberFinancials,
  validateMonthlySalary,
  validateVacationDaysPerYear,
  validateVacationReservePercent,
  type MemberFinancialsField,
} from '@devscribed/validation';
import type { VacationFinancials } from './VacationPanel';

/** The `field-error-{field}` test id each field focuses on submit-blocked (spec 05 pattern). */
const FIELD_TESTIDS: Record<MemberFinancialsField, string> = {
  monthlySalary: 'vacation-salary-input',
  clientHourlyRate: 'vacation-rate-input',
  vacationDaysPerYear: 'vacation-days-input',
  currency: 'vacation-currency-select',
  vacationReservePercent: 'vacation-reserve-percent-input',
};

type Errors = Partial<Record<MemberFinancialsField, string>>;

/**
 * Edit Financial Settings modal (spec 07). Reuses the exact `Modal`/`TextInput`/`Select`
 * shell and the `useToast()` pattern `InviteModal` established. All
 * inputs are controlled strings; the validators (which accept strings or numbers)
 * decide validity, and only `calculateReservePercent` needs the parsed numbers for the
 * live auto-calc preview.
 */
export function VacationFinancialsModal({
  orgId,
  memberId,
  open,
  financials,
  onClose,
  onSaved,
}: {
  orgId: string;
  memberId: string;
  open: boolean;
  /** Current financials in edit mode; `null` for first-time setup (create mode). */
  financials: VacationFinancials | null;
  onClose: () => void;
  /** Fired after a successful save so the panel refetches — the server owns the
   * effective percent and the snapshot side-effect, so we never hand-patch. */
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [salary, setSalary] = useState('');
  const [rate, setRate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [days, setDays] = useState('20');
  const [manual, setManual] = useState(false);
  const [reservePercent, setReservePercent] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // Re-seed whenever the modal opens: pre-fill from `financials` in edit mode, or the
  // empty/auto/days=20 defaults in create mode. Keyed on `open` so re-opening after a
  // cancel starts clean.
  useEffect(() => {
    if (!open) return;
    if (financials) {
      setSalary(financials.monthlySalary.toFixed(2));
      setRate(financials.clientHourlyRate.toFixed(2));
      setCurrency(financials.currency);
      setDays(String(financials.vacationDaysPerYear));
      setManual(financials.isReservePercentManual);
      setReservePercent(financials.isReservePercentManual ? financials.vacationReservePercent.toFixed(2) : '');
    } else {
      setSalary('');
      setRate('');
      setCurrency('USD');
      setDays('20');
      setManual(false);
      setReservePercent('');
    }
    setErrors({});
    setSaving(false);
  }, [open, financials]);

  function clearError(field: MemberFinancialsField) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function setError(field: MemberFinancialsField, message: string) {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }

  function blurSalary() {
    const result = validateMonthlySalary(salary);
    if (result.valid) clearError('monthlySalary');
    else setError('monthlySalary', result.error);
  }

  function blurRate() {
    const result = validateClientHourlyRate(rate);
    if (result.valid) clearError('clientHourlyRate');
    else setError('clientHourlyRate', result.error);
  }

  function blurDays() {
    const result = validateVacationDaysPerYear(days);
    if (result.valid) clearError('vacationDaysPerYear');
    else setError('vacationDaysPerYear', result.error);
  }

  function blurCurrency() {
    const result = validateCurrency(currency);
    if (result.valid) clearError('currency');
    else setError('currency', result.error);
  }

  function blurReservePercent() {
    if (!manual) return;
    const result = validateVacationReservePercent(reservePercent);
    if (result.valid) clearError('vacationReservePercent');
    else setError('vacationReservePercent', result.error);
  }

  // Live auto-calc preview — only meaningful in auto mode and only when the three
  // driving inputs each parse to a valid number. The formula itself lives in the
  // validation package (`calculateReservePercent`); an invalid/empty input shows a
  // neutral placeholder rather than a wrong number.
  function previewText(): string {
    const s = validateMonthlySalary(salary);
    const r = validateClientHourlyRate(rate);
    const d = validateVacationDaysPerYear(days);
    if (!s.valid || !r.valid || !d.valid) return 'Auto-calculated: —';
    const pct = calculateReservePercent({
      monthlySalary: s.value,
      clientHourlyRate: r.value,
      vacationDaysPerYear: d.value,
    });
    return `Auto-calculated: ${pct.toFixed(2)}%`;
  }

  function handleClose() {
    if (saving) return;
    onClose();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;

    const validation = validateMemberFinancials({
      monthlySalary: salary,
      clientHourlyRate: rate,
      vacationDaysPerYear: days,
      currency,
      isReservePercentManual: manual,
      vacationReservePercent: manual ? reservePercent : null,
    });

    if (!validation.valid) {
      setErrors(validation.errors);
      if (validation.firstInvalidField) {
        focusByTestId(FIELD_TESTIDS[validation.firstInvalidField]);
      }
      return;
    }

    setErrors({});
    setSaving(true);

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/members/${memberId}/vacation/financials`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            monthlySalary: validation.value.monthlySalary,
            clientHourlyRate: validation.value.clientHourlyRate,
            vacationDaysPerYear: validation.value.vacationDaysPerYear,
            currency: validation.value.currency,
            isReservePercentManual: validation.value.isReservePercentManual,
            // Meaningful only in manual mode; null (ignored server-side) in auto.
            vacationReservePercent: validation.value.vacationReservePercent,
          }),
        },
      );

      if (response.ok) {
        setSaving(false);
        onClose();
        onSaved();
        showToast('toast-financials-saved', 'Financial settings saved');
        return;
      }

      const body = await response.json().catch(() => null);
      // A validation 400 carries `{ errors: { field: message } }`; route each to its
      // inline field. Everything else (removed-member 400, 5xx, malformed) is an
      // error toast with the API message (falling back to the generic string).
      if (body?.errors && typeof body.errors === 'object') {
        setErrors(body.errors as Errors);
      } else {
        showToast('toast-financials-error', body?.message ?? MESSAGES.generic, 'error');
      }
    } catch {
      showToast('toast-financials-error', MESSAGES.generic, 'error');
    }
    setSaving(false);
  }

  return (
    <Modal
      open={open}
      title="Edit Financial Settings"
      onClose={handleClose}
      data-testid="vacation-financials-modal"
    >
      <form id="vacation-financials-form" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
          <TextInput
            label="Monthly salary"
            type="text"
            inputMode="decimal"
            placeholder="3000.00"
            value={salary}
            onChange={(event) => {
              setSalary(event.target.value);
              clearError('monthlySalary');
            }}
            onBlur={blurSalary}
            readOnly={saving}
            data-testid="vacation-salary-input"
            error={errors.monthlySalary}
            errorId="field-error-monthlySalary"
            wrapperStyle={{ gap: 0 }}
          />

          <TextInput
            label="Client hourly rate"
            type="text"
            inputMode="decimal"
            placeholder="40.00"
            value={rate}
            onChange={(event) => {
              setRate(event.target.value);
              clearError('clientHourlyRate');
            }}
            onBlur={blurRate}
            readOnly={saving}
            data-testid="vacation-rate-input"
            error={errors.clientHourlyRate}
            errorId="field-error-clientHourlyRate"
            wrapperStyle={{ gap: 0 }}
          />

          <Select
            label="Currency"
            value={currency}
            onChange={(option) => {
              setCurrency(typeof option === 'string' ? option : (option as { value: string }).value);
              clearError('currency');
            }}
            options={[...ISO_4217_CURRENCIES]}
            isDisabled={saving}
            variant="formik"

            data-testid="vacation-currency-select"
            error={!!errors.currency}
            errorMessage={errors.currency}
            errorId="field-error-currency"
          />

          <TextInput
            label="Vacation days per year"
            type="text"
            inputMode="numeric"
            placeholder="20"
            value={days}
            onChange={(event) => {
              setDays(event.target.value);
              clearError('vacationDaysPerYear');
            }}
            onBlur={blurDays}
            readOnly={saving}
            data-testid="vacation-days-input"
            error={errors.vacationDaysPerYear}
            errorId="field-error-vacationDaysPerYear"
            wrapperStyle={{ gap: 0 }}
          />

          <div>
            {/* §87 — the reserve mode is two answers that both stay on screen and where
                unchecking one means checking the other, which is `ToggleButton`'s shape and
                not `Switch`'s (§88). The pair used to be two bare radios under a note saying
                the system could not tag its options; §31 has given every segment a test id
                of its own since before that note was written. */}
            <ToggleButton
              label="Reserve percentage"
              options={[
                { value: 'auto', label: 'Auto-calculate', testId: 'vacation-reserve-mode-auto' },
                { value: 'manual', label: 'Set manually', testId: 'vacation-reserve-mode-manual' },
              ]}
              selectedValue={manual ? 'manual' : 'auto'}
              onChange={(value) => {
                setManual(value === 'manual');
                if (value === 'auto') clearError('vacationReservePercent');
              }}
              style={{ marginBottom: 'var(--space-5)' }}
            />

            <TextInput
              label="Reserve percentage (manual)"
              type="text"
              inputMode="decimal"
              placeholder="3.33"
              value={reservePercent}
              onChange={(event) => {
                setReservePercent(event.target.value);
                clearError('vacationReservePercent');
              }}
              onBlur={blurReservePercent}
              disabled={!manual}
              readOnly={saving}
              trailing={<span style={{ color: 'var(--text-secondary)' }}>%</span>}
              data-testid="vacation-reserve-percent-input"
              error={errors.vacationReservePercent}
              errorId="field-error-vacationReservePercent"
              wrapperStyle={{ gap: 0 }}
            />

            {!manual && (
              <div
                data-testid="vacation-reserve-preview"
                style={{
                  marginTop: 'var(--space-3)',
                  fontSize: 'var(--font-size-s)',
                  color: 'var(--text-tertiary)',
                }}
              >
                {previewText()}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button
              type="button"
              onClick={handleClose}
              disabled={saving}
              data-testid="vacation-financials-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              preloader={saving}
              data-testid="vacation-financials-save-btn"
            >
              {saving ? 'Saving' : 'Save changes'}
            </Button>
          </FormActions>
        </div>
      </form>
    </Modal>
  );
}
