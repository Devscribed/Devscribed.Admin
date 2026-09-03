'use client';

import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Button, FormActions, InfoBanner, Modal, TextInput } from '@devscribed/ds';
import { useToast } from '@/toast';
import {
  calculateWorkingDays,
  countHolidaysInRange,
  HOLIDAY_MESSAGES,
  REQUEST_MESSAGES,
  validateVacationRequestDates,
} from '@devscribed/validation';

/** One row of `GET .../holidays?scope=mine` — only the date is needed for the hint. */
interface HintHoliday {
  date: string;
}

/** Today's local date as 'YYYY-MM-DD' — the `today` boundary the date validator compares against. */
function localTodayYmd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const previewLine: CSSProperties = {
  fontSize: 'var(--font-size-s)',
  color: 'var(--text-tertiary)',
};

/**
 * Request Vacation modal (spec 09). Two native date inputs, a live working-days preview and
 * available-balance display, a client-side cross-year gate (disables submit), and a POST to
 * `.../vacation/requests`. Follows `VacationFinancialsModal`'s shell + `useToast()` contract:
 * on 201 it closes, toasts, and asks the panel to refetch — the server owns balance/status.
 *
 * Spec organization/03 requirement 13 adds a non-blocking hint when the chosen range
 * covers a paid holiday. Informational only: requirement 12 keeps the vacation math
 * exactly as it was — `calculateWorkingDays` still counts every Mon–Fri, the payload is
 * unchanged, and the hint never disables submit.
 *
 * **The two ends stay native date inputs, and `DateField` is not restored for them.** The
 * restorable one is a read-only text box over a month grid of its own, and both halves are
 * wrong here: the system already has that grid in `Calendar` (§72, §86), and the one date
 * rule the picker enforces is *no day after today*, which is the exact reverse of the only
 * rule this form has. What the fields did need was the system's field treatment, and
 * `TextInput` carries it through `type` — so the label, the ring, the error node and its
 * `aria-describedby` are the component's, and the control under them is still the platform's
 * date input a reader can type into.
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
  const [holidays, setHolidays] = useState<HintHoliday[]>([]);

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

  /**
   * Holidays for the year(s) the chosen range spans (requirement 13). `scope=mine`
   * resolves the country server-side, and the modal only ever opens on the caller's
   * own profile, so the rows are the right person's by construction. Read-only: a
   * failed fetch simply means no hint.
   */
  useEffect(() => {
    if (!open || startDate === '' || endDate === '') {
      setHolidays([]);
      return undefined;
    }
    const years = Array.from(new Set([startDate.slice(0, 4), endDate.slice(0, 4)]));
    const controller = new AbortController();
    void (async () => {
      try {
        const responses = await Promise.all(
          years.map((year) =>
            fetch(`/api/organizations/${orgId}/holidays?scope=mine&year=${year}`, {
              credentials: 'same-origin',
              signal: controller.signal,
            }),
          ),
        );
        const rows: HintHoliday[] = [];
        for (const response of responses) {
          if (!response.ok) continue;
          const data = (await response.json()) as { holidays: HintHoliday[] };
          rows.push(...data.holidays);
        }
        if (!controller.signal.aborted) setHolidays(rows);
      } catch {
        // No hint is the correct degradation — the request itself is unaffected.
      }
    })();
    return () => controller.abort();
  }, [open, orgId, startDate, endDate]);

  const bothPresent = startDate !== '' && endDate !== '';
  const dateValidation = bothPresent
    ? validateVacationRequestDates({ startDate, endDate }, today)
    : null;
  const crossYear = dateValidation?.crossYear ?? false;

  const workingDaysText =
    bothPresent && startDate <= endDate ? String(calculateWorkingDays(startDate, endDate)) : '—';

  // Counted, not subtracted — the working-days preview above is deliberately untouched.
  const holidayCount =
    bothPresent && startDate <= endDate
      ? countHolidaysInRange(holidays, startDate, endDate)
      : 0;

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
    <Modal open={open} title="Request Vacation" onClose={handleClose} data-testid="vacation-request-modal">
      <form id="vacation-request-form" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
          <TextInput
            type="date"
            label="Start date"
            value={startDate}
            min={today}
            readOnly={saving}
            data-testid="vacation-start-date-input"
            error={fieldErrors.startDate}
            errorId="field-error-startDate"
            onChange={(event) => {
              setStartDate(event.target.value);
              setFieldErrors((prev) => ({ ...prev, startDate: undefined }));
              setServerError(null);
            }}
          />

          <TextInput
            type="date"
            label="End date"
            value={endDate}
            min={startDate || today}
            readOnly={saving}
            data-testid="vacation-end-date-input"
            error={fieldErrors.endDate}
            errorId="field-error-endDate"
            onChange={(event) => {
              setEndDate(event.target.value);
              setFieldErrors((prev) => ({ ...prev, endDate: undefined }));
              setServerError(null);
            }}
          />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <div data-testid="vacation-working-days-preview" style={previewLine}>
              Working days: {workingDaysText}
            </div>
            <div data-testid="vacation-available-days-preview" style={previewLine}>
              Available balance: {availableDays} days
            </div>
            {/* Not an `InfoBanner`: §91 ruled that a holiday is not a status, and this banner
                has only the four status tones. A fifth variant for one hint would put the
                holiday hue back into the status palette the token was named to stay out of. */}
            {holidayCount > 0 && (
              <div
                data-testid="vacation-request-holiday-hint"
                style={{
                  marginTop: 'var(--space-1)',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-l)',
                  background: 'var(--surface-holiday)',
                  border: 'var(--border-width-hairline) solid var(--border-holiday)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-s)',
                }}
              >
                {HOLIDAY_MESSAGES.vacationHint(holidayCount)}
              </div>
            )}
          </div>

          {errorText && (
            <InfoBanner variant="error" role="alert" data-testid="vacation-request-error">
              {errorText}
            </InfoBanner>
          )}
        </div>

        <div style={{ marginTop: 'var(--space-9)' }}>
          <FormActions>
            <Button type="button" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              preloader={saving}
              disabled={crossYear}
              data-testid="vacation-request-submit-btn"
            >
              {saving ? 'Submitting' : 'Submit request'}
            </Button>
          </FormActions>
        </div>
      </form>
    </Modal>
  );
}
