'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, InfoBanner, Preloader, Select, TextInput } from '@devscribed/ds';
import { focusByTestId } from '@/field-error';
import { optionFor, valueOf } from '@/select';
import { useToast } from '@/toast';
import {
  ACCOUNT_SETTINGS_FIELD_ORDER,
  MESSAGES,
  validateAccountSettings,
  validateFirstDayOfWeek,
  validateFirstName,
  validateLastName,
  validatePhoneNumber,
  validateTimezone,
  type AccountSettingsField,
} from '@devscribed/validation';
import {
  COUNTRY_OPTIONS,
  FIRST_DAY_OPTIONS,
  buildTimezoneOptions,
  type AppSelectOption,
} from '@/account-data';
import { ChangeEmailModal } from './ChangeEmailModal';
import { ChangePasswordModal } from './ChangePasswordModal';

interface AccountSettings {
  email: string;
  firstName: string;
  lastName: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  timezone: string;
  firstDayOfWeek: string;
}

type FieldErrors = Partial<Record<AccountSettingsField, string>>;

/** The `data-testid` each field's inline error and focus target live on. */
const FIELD_TEST_ID: Record<AccountSettingsField, string> = {
  firstName: 'edit-first-name-input',
  lastName: 'edit-last-name-input',
  phoneCountryCode: 'edit-phone-country-select',
  phoneNumber: 'edit-phone-number-input',
  timezone: 'edit-timezone-select',
  firstDayOfWeek: 'edit-first-day-select',
};

const FIELD_GAP = { display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' } as const;

export function AccountSettingsScreen() {
  const { showToast } = useToast();

  const [loaded, setLoaded] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Information field state.
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [timezone, setTimezone] = useState('');
  const [firstDayOfWeek, setFirstDayOfWeek] = useState('Monday');
  const [timezoneOptions, setTimezoneOptions] = useState<AppSelectOption[]>(() =>
    buildTimezoneOptions(),
  );

  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch('/api/account/settings', { credentials: 'same-origin' });
        if (!response.ok) {
          if (!cancelled) {
            setServerError(MESSAGES.generic);
            setLoading(false);
          }
          return;
        }
        const data = (await response.json()) as AccountSettings;
        if (cancelled) return;
        setLoaded(data);
        setEmail(data.email);
        setFirstName(data.firstName ?? '');
        setLastName(data.lastName ?? '');
        setPhoneCountryCode(data.phoneCountryCode ?? '');
        setPhoneNumber(data.phoneNumber ?? '');
        setTimezone(data.timezone ?? '');
        setFirstDayOfWeek(data.firstDayOfWeek ?? 'Monday');
        // Inject the saved zone if it falls outside the curated list, so it can render.
        setTimezoneOptions(buildTimezoneOptions(data.timezone));
        setLoading(false);
      } catch {
        if (!cancelled) {
          setServerError(MESSAGES.generic);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setFieldError = useCallback((field: AccountSettingsField, message: string | null) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }, []);

  /** A server error stops applying the moment the visitor edits any field (requirement 10). */
  const clearServerError = useCallback(() => setServerError(null), []);

  const blurFirstName = () => {
    const result = validateFirstName(firstName);
    setFieldError('firstName', result.valid ? null : result.error);
  };

  const blurLastName = () => {
    const result = validateLastName(lastName);
    setFieldError('lastName', result.valid ? null : result.error);
  };

  const blurPhone = () => {
    const result = validatePhoneNumber(phoneNumber, phoneCountryCode);
    if (result.valid) {
      setFieldError('phoneNumber', null);
      setFieldError('phoneCountryCode', null);
    } else if (result.error === MESSAGES.phone.countryCodeRequired) {
      setFieldError('phoneCountryCode', result.error);
      setFieldError('phoneNumber', null);
    } else {
      setFieldError('phoneNumber', result.error);
      setFieldError('phoneCountryCode', null);
    }
  };

  const changeCountry = (value: string) => {
    setPhoneCountryCode(value);
    clearServerError();
    // Re-validate the number against the newly selected country (design — Interactions).
    const result = validatePhoneNumber(phoneNumber, value);
    if (result.valid) {
      setFieldError('phoneNumber', null);
      setFieldError('phoneCountryCode', null);
    } else if (result.error === MESSAGES.phone.countryCodeRequired) {
      setFieldError('phoneCountryCode', result.error);
      setFieldError('phoneNumber', null);
    } else {
      setFieldError('phoneNumber', result.error);
      setFieldError('phoneCountryCode', null);
    }
  };

  const blurTimezone = () => {
    const result = validateTimezone(timezone);
    setFieldError('timezone', result.valid ? null : result.error);
  };

  const blurFirstDay = () => {
    const result = validateFirstDayOfWeek(firstDayOfWeek);
    setFieldError('firstDayOfWeek', result.valid ? null : result.error);
  };

  // Save is gated on the required fields only (business spec — first name, last name,
  // timezone). Any phone error is caught at submit instead, so the button can be live
  // while a purely-optional field is being corrected.
  const requiredInvalid =
    !validateFirstName(firstName).valid ||
    !validateLastName(lastName).valid ||
    !validateTimezone(timezone).valid;

  async function handleSave() {
    if (saving) return;

    const result = validateAccountSettings({
      firstName,
      lastName,
      phoneCountryCode,
      phoneNumber,
      timezone,
      firstDayOfWeek,
    });

    if (!result.valid) {
      setErrors(result.errors);
      if (result.firstInvalidField) focusByTestId(FIELD_TEST_ID[result.firstInvalidField]);
      return;
    }

    setErrors({});
    setServerError(null);
    setSaving(true);

    const body = {
      firstName: result.value.firstName,
      lastName: result.value.lastName,
      phoneCountryCode: result.value.phoneCountryCode || null,
      phoneNumber: result.value.phoneNumber || null,
      timezone: result.value.timezone,
      firstDayOfWeek: result.value.firstDayOfWeek,
    };

    try {
      const response = await fetch('/api/account/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setSaving(false);
        showToast('toast-account-saved', 'Settings saved');
        return;
      }

      if (response.status >= 400 && response.status < 500) {
        const payload = await response.json().catch(() => null);
        const fieldErrors = payload?.errors as FieldErrors | undefined;
        if (fieldErrors && Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          const firstInvalid = ACCOUNT_SETTINGS_FIELD_ORDER.find((f) => fieldErrors[f]);
          if (firstInvalid) focusByTestId(FIELD_TEST_ID[firstInvalid]);
        } else {
          setServerError(MESSAGES.generic);
        }
      } else {
        setServerError(MESSAGES.generic);
      }
    } catch {
      setServerError(MESSAGES.generic);
    }
    setSaving(false);
  }

  return (
    <div data-testid="account-settings" style={{ maxWidth: 600, margin: '0 auto' }}>
      {loading ? (
        <LoadingSkeleton />
      ) : (
        <>
          <Card>
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
              <Button
                type="button"
                onClick={() => setEmailOpen(true)}
                data-testid="change-email-open-button"
              >
                Change email
              </Button>
              <Button
                type="button"
                onClick={() => setPasswordOpen(true)}
                data-testid="change-password-open-button"
              >
                Change password
              </Button>
            </div>
          </Card>

          {/* `EDIT INFORMATION` was a `SectionLabel`, and `SectionLabel` is gone (D4). It
              captioned the whole form rather than a block inside a titled panel, which is
              the case the first migration's Phase 3 settled: the caption becomes that
              surface's own `Card` title at `<h2>` (§27). So the actions and the form become
              the two cards they always were, and the page's outline is `PageTitle`'s `<h1>`
              → this. `clip={false}` because the card hosts three `Select`s, and a card that
              clips cuts their menus off at its edge. */}
          <Card title="Edit information" clip={false} style={{ marginTop: 'var(--space-7)' }}>
          {serverError && (
            <div style={{ marginBottom: 'var(--space-7)' }}>
              <InfoBanner
                variant="error"
                role="alert"
                aria-live="polite"
                data-testid="account-error-message"
              >
                {serverError}
              </InfoBanner>
            </div>
          )}

          <div style={FIELD_GAP}>
            <TextInput
              label="First name"
              value={firstName}
              onChange={(event) => {
                setFirstName(event.target.value);
                clearServerError();
                if (errors.firstName) setFieldError('firstName', null);
              }}
              onBlur={blurFirstName}
              readOnly={saving}
              data-testid="edit-first-name-input"
              aria-invalid={errors.firstName ? true : undefined}
              aria-describedby={errors.firstName ? 'field-error-firstName' : undefined}
              error={errors.firstName}
              errorId="field-error-firstName"
            />

            <TextInput
              label="Last name"
              value={lastName}
              onChange={(event) => {
                setLastName(event.target.value);
                clearServerError();
                if (errors.lastName) setFieldError('lastName', null);
              }}
              onBlur={blurLastName}
              readOnly={saving}
              data-testid="edit-last-name-input"
              aria-invalid={errors.lastName ? true : undefined}
              aria-describedby={errors.lastName ? 'field-error-lastName' : undefined}
              error={errors.lastName}
              errorId="field-error-lastName"
            />

            {/* The system's `Select` deals in options rather than the values behind them, so
                each of the three crosses that boundary with `optionFor` / `valueOf` (`@/select`).
                `variant="formik"` is the in-a-form control, which is what matches the
                `TextInput`s above and below it. */}
            <Select
              label="Country"
              value={optionFor(COUNTRY_OPTIONS, phoneCountryCode)}
              onChange={(option) => changeCountry(valueOf(option))}
              options={COUNTRY_OPTIONS}
              placeholder="Select a country"
              isDisabled={saving}
              variant="formik"
              data-testid="edit-phone-country-select"
              error={errors.phoneCountryCode ? true : undefined}
              errorMessage={errors.phoneCountryCode}
              errorId="field-error-phoneCountryCode"
            />

            <TextInput
              label="Phone number"
              type="tel"
              value={phoneNumber}
              onChange={(event) => {
                setPhoneNumber(event.target.value);
                clearServerError();
                if (errors.phoneNumber) setFieldError('phoneNumber', null);
              }}
              onBlur={blurPhone}
              readOnly={saving}
              data-testid="edit-phone-number-input"
              aria-invalid={errors.phoneNumber ? true : undefined}
              aria-describedby={errors.phoneNumber ? 'field-error-phoneNumber' : undefined}
              error={errors.phoneNumber}
              errorId="field-error-phoneNumber"
            />

            <Select
              label="Timezone"
              value={optionFor(timezoneOptions, timezone)}
              onChange={(option) => {
                const value = valueOf(option);
                setTimezone(value);
                clearServerError();
                const result = validateTimezone(value);
                setFieldError('timezone', result.valid ? null : result.error);
              }}
              options={timezoneOptions}
              placeholder="Select a timezone"
              isDisabled={saving}
              variant="formik"
              data-testid="edit-timezone-select"
              error={errors.timezone ? true : undefined}
              errorMessage={errors.timezone}
              errorId="field-error-timezone"
            />

            <Select
              label="First day of week"
              value={optionFor(FIRST_DAY_OPTIONS, firstDayOfWeek)}
              onChange={(option) => {
                const value = valueOf(option);
                setFirstDayOfWeek(value);
                clearServerError();
                const result = validateFirstDayOfWeek(value);
                setFieldError('firstDayOfWeek', result.valid ? null : result.error);
              }}
              options={FIRST_DAY_OPTIONS}
              isDisabled={saving}
              variant="formik"
              data-testid="edit-first-day-select"
              error={errors.firstDayOfWeek ? true : undefined}
              errorMessage={errors.firstDayOfWeek}
              errorId="field-error-firstDayOfWeek"
            />
          </div>

            <div style={{ marginTop: 'var(--space-7)' }}>
              <Button
                type="button"
                variant="primary"
                onClick={handleSave}
                preloader={saving}
                disabled={saving || requiredInvalid}
                data-testid="account-save-button"
                style={{ width: '100%' }}
              >
                {saving ? 'Saving' : 'Save'}
              </Button>
            </div>
          </Card>
        </>
      )}

      <ChangeEmailModal
        open={emailOpen}
        currentEmail={loaded?.email ?? email}
        onClose={() => setEmailOpen(false)}
      />
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

/**
 * Covers the `GET /api/account/settings` fetch inside an already-rendered shell.
 *
 * It was ten grey blocks standing in for the form, on the "the app has no `Skeleton`
 * primitive" gap specs 04/05 recorded. The system's answer for waiting is `Preloader`
 * (§23, §69), and the one place the design system's record leaves an outline standing is a
 * *list* that already knows its own shape — where the outline says more than dots do. Six
 * identical field bars are not that: they say "a form is coming", which is what the card
 * around them already said. So the blocks go and the dots stay, and the state keeps the
 * test id spec 06 named for it.
 */
function LoadingSkeleton() {
  return (
    <Card>
      <div
        role="status"
        data-testid="account-settings-loading-skeleton"
        aria-label="Loading your account settings"
        style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-9) 0' }}
      >
        <Preloader />
      </div>
    </Card>
  );
}
