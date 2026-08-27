'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, InfoBanner, Input, SectionLabel, Select } from '@/ds';
import { errorNode, focusByTestId } from '@/field-error';
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

const FIELD_GAP = { display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' } as const;

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
        <Card>
          <div style={{ display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEmailOpen(true)}
              data-testid="change-email-open-button"
            >
              Change email
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPasswordOpen(true)}
              data-testid="change-password-open-button"
            >
              Change password
            </Button>
          </div>

          <div style={{ marginTop: 'var(--sp-10)' }}>
            <SectionLabel>EDIT INFORMATION</SectionLabel>
          </div>

          {serverError && (
            <div style={{ marginTop: 'var(--sp-7)' }}>
              <InfoBanner
                tone="error"
                role="alert"
                aria-live="polite"
                data-testid="account-error-message"
              >
                {serverError}
              </InfoBanner>
            </div>
          )}

          <div style={{ ...FIELD_GAP, marginTop: 'var(--sp-7)' }}>
            <Input
              label="First name"
              value={firstName}
              onChange={(event: { target: { value: string } }) => {
                setFirstName(event.target.value);
                clearServerError();
                if (errors.firstName) setFieldError('firstName', null);
              }}
              onBlur={blurFirstName}
              readOnly={saving}
              data-testid="edit-first-name-input"
              aria-invalid={errors.firstName ? true : undefined}
              aria-describedby={errors.firstName ? 'field-error-firstName' : undefined}
              error={errors.firstName ? errorNode('firstName', errors.firstName) : undefined}
              wrapperStyle={{ gap: 0 }}
            />

            <Input
              label="Last name"
              value={lastName}
              onChange={(event: { target: { value: string } }) => {
                setLastName(event.target.value);
                clearServerError();
                if (errors.lastName) setFieldError('lastName', null);
              }}
              onBlur={blurLastName}
              readOnly={saving}
              data-testid="edit-last-name-input"
              aria-invalid={errors.lastName ? true : undefined}
              aria-describedby={errors.lastName ? 'field-error-lastName' : undefined}
              error={errors.lastName ? errorNode('lastName', errors.lastName) : undefined}
              wrapperStyle={{ gap: 0 }}
            />

            <Select
              label="Country"
              value={phoneCountryCode}
              onChange={changeCountry}
              options={COUNTRY_OPTIONS}
              placeholder="Select a country"
              disabled={saving}
              data-testid="edit-phone-country-select"
              error={
                errors.phoneCountryCode
                  ? errorNode('phoneCountryCode', errors.phoneCountryCode)
                  : undefined
              }
            />

            <Input
              label="Phone number"
              type="tel"
              value={phoneNumber}
              onChange={(event: { target: { value: string } }) => {
                setPhoneNumber(event.target.value);
                clearServerError();
                if (errors.phoneNumber) setFieldError('phoneNumber', null);
              }}
              onBlur={blurPhone}
              readOnly={saving}
              data-testid="edit-phone-number-input"
              aria-invalid={errors.phoneNumber ? true : undefined}
              aria-describedby={errors.phoneNumber ? 'field-error-phoneNumber' : undefined}
              error={errors.phoneNumber ? errorNode('phoneNumber', errors.phoneNumber) : undefined}
              wrapperStyle={{ gap: 0 }}
            />

            <Select
              label="Timezone"
              value={timezone}
              onChange={(value: string) => {
                setTimezone(value);
                clearServerError();
                const result = validateTimezone(value);
                setFieldError('timezone', result.valid ? null : result.error);
              }}
              options={timezoneOptions}
              placeholder="Select a timezone"
              disabled={saving}
              data-testid="edit-timezone-select"
              error={errors.timezone ? errorNode('timezone', errors.timezone) : undefined}
            />

            <Select
              label="First day of week"
              value={firstDayOfWeek}
              onChange={(value: string) => {
                setFirstDayOfWeek(value);
                clearServerError();
                const result = validateFirstDayOfWeek(value);
                setFieldError('firstDayOfWeek', result.valid ? null : result.error);
              }}
              options={FIRST_DAY_OPTIONS}
              disabled={saving}
              data-testid="edit-first-day-select"
              error={
                errors.firstDayOfWeek
                  ? errorNode('firstDayOfWeek', errors.firstDayOfWeek)
                  : undefined
              }
            />
          </div>

          <div style={{ marginTop: 'var(--sp-10)' }}>
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleSave}
              loading={saving}
              disabled={saving || requiredInvalid}
              data-testid="account-save-button"
              style={{ width: '100%' }}
            >
              {saving ? 'Saving' : 'Save'}
            </Button>
          </div>
        </Card>
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
 * Static token-colored blocks (no shimmer — the app has no `Skeleton` primitive, the same
 * gap specs 04/05 recorded). Covers the `GET /api/account/settings` fetch inside the shell.
 */
function LoadingSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <Card>
      <div
        data-testid="account-settings-loading-skeleton"
        aria-label="Loading your account settings"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-7)' }}
      >
        <div style={{ display: 'flex', gap: 'var(--sp-5)' }}>
          <div style={block(140, 40)} />
          <div style={block(160, 40)} />
        </div>
        <div style={{ width: '100%', height: 1, background: 'var(--divider)', margin: 'var(--sp-4) 0' }} />
        <div style={block(120, 14)} />
        <div style={block('100%', 46)} />
        <div style={block('100%', 46)} />
        <div style={block('100%', 46)} />
        <div style={block('100%', 46)} />
        <div style={block('100%', 46)} />
        <div style={block('100%', 48)} />
      </div>
    </Card>
  );
}
