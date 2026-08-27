import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_MESSAGES,
  AUTH_MESSAGES,
  MESSAGES,
  isEmailChangeTokenExpired,
  isSameAsCurrentEmail,
  validateAccountSettings,
  validateChangePassword,
  validateCurrentPassword,
  validateEmail,
  validateFirstDayOfWeek,
  validateFirstName,
  validatePassword,
  validatePasswordConfirmation,
  validatePhoneNumber,
  validateTimezone,
} from './index';

const repeat = (n: number, ch = 'a') => ch.repeat(n);

/** Builds an email of exactly `total` characters that is otherwise well-formed. */
const emailOfLength = (total: number) => {
  const domain = '@example.com';
  return repeat(total - domain.length) + domain;
};

// TC-06-UNIT-01: Email-format validation
describe('TC-06-UNIT-01 email-format validation', () => {
  it('rejects "bad@"', () => {
    expect(validateEmail('bad@')).toEqual({ valid: false, error: MESSAGES.email.invalid });
  });

  it('accepts "good@acme.com" and stores it as-is', () => {
    expect(validateEmail('good@acme.com')).toEqual({ valid: true, value: 'good@acme.com' });
  });

  it('accepts "GOOD@ACME.COM" and normalizes to lowercase', () => {
    expect(validateEmail('GOOD@ACME.COM')).toEqual({ valid: true, value: 'good@acme.com' });
  });
});

// TC-06-UNIT-02: Password confirmation & policy
describe('TC-06-UNIT-02 password confirmation & policy', () => {
  it('rejects a new password that fails the length policy', () => {
    expect(validatePassword('short')).toEqual({
      valid: false,
      error: MESSAGES.password.tooShort,
    });
  });

  it('rejects a confirmation that does not match the new password', () => {
    expect(validatePasswordConfirmation('NewPass1', 'NewPass2')).toEqual({
      valid: false,
      error: AUTH_MESSAGES.passwordMismatch,
    });
  });

  it('accepts a policy-compliant new password with a matching confirmation', () => {
    expect(validatePassword('NewPass1')).toEqual({ valid: true, value: 'NewPass1' });
    expect(validatePasswordConfirmation('NewPass1', 'NewPass1')).toEqual({
      valid: true,
      value: 'NewPass1',
    });
  });

  it('rejects a 129-character new password as exceeding the maximum', () => {
    const long = 'Aa1' + repeat(126); // 129 chars, has a letter + a digit, only the length is wrong
    expect(long).toHaveLength(129);
    expect(validatePassword(long)).toEqual({ valid: false, error: MESSAGES.password.tooLong });
  });
});

// TC-06-UNIT-03: Phone format per country code
describe('TC-06-UNIT-03 phone format per country code', () => {
  it('accepts "+1 (555) 123-4567" for US', () => {
    expect(validatePhoneNumber('+1 (555) 123-4567', 'US')).toEqual({
      valid: true,
      value: '+1 (555) 123-4567',
    });
  });

  it('rejects "12345" for US', () => {
    expect(validatePhoneNumber('12345', 'US')).toEqual({
      valid: false,
      error: MESSAGES.phone.invalid,
    });
  });

  it('accepts an empty phone number (phone is optional)', () => {
    expect(validatePhoneNumber('', '')).toEqual({ valid: true, value: '' });
  });
});

// TC-06-UNIT-04: First and last name validation
describe('TC-06-UNIT-04 first and last name validation', () => {
  it('rejects an empty name', () => {
    expect(validateFirstName('')).toEqual({ valid: false, error: MESSAGES.firstName.required });
  });

  it('rejects a 51-character name', () => {
    expect(validateFirstName(repeat(51))).toEqual({
      valid: false,
      error: MESSAGES.firstName.tooLong,
    });
  });

  it('rejects a name containing a digit', () => {
    expect(validateFirstName('John2')).toEqual({
      valid: false,
      error: MESSAGES.firstName.invalidChars,
    });
  });

  it('rejects a name containing a special character', () => {
    expect(validateFirstName('John@')).toEqual({
      valid: false,
      error: MESSAGES.firstName.invalidChars,
    });
  });

  it('accepts a hyphenated name', () => {
    expect(validateFirstName('Mary-Jane')).toEqual({ valid: true, value: 'Mary-Jane' });
  });

  it('accepts an apostrophe name', () => {
    expect(validateFirstName("O'Brien")).toEqual({ valid: true, value: "O'Brien" });
  });

  it('trims surrounding whitespace', () => {
    expect(validateFirstName('  Pat  ')).toEqual({ valid: true, value: 'Pat' });
  });
});

// TC-06-UNIT-05: Email normalization
describe('TC-06-UNIT-05 email normalization', () => {
  it('normalizes "NEW@ACME.COM" to "new@acme.com"', () => {
    expect(validateEmail('NEW@ACME.COM')).toEqual({ valid: true, value: 'new@acme.com' });
  });

  it('normalizes "New.Email@Acme.Com" to "new.email@acme.com"', () => {
    expect(validateEmail('New.Email@Acme.Com')).toEqual({
      valid: true,
      value: 'new.email@acme.com',
    });
  });
});

// TC-06-UNIT-06: First day of week validation
describe('TC-06-UNIT-06 first day of week validation', () => {
  it('accepts "Monday"', () => {
    expect(validateFirstDayOfWeek('Monday')).toEqual({ valid: true, value: 'Monday' });
  });

  it('accepts "Sunday"', () => {
    expect(validateFirstDayOfWeek('Sunday')).toEqual({ valid: true, value: 'Sunday' });
  });

  it('rejects "Saturday"', () => {
    expect(validateFirstDayOfWeek('Saturday')).toEqual({
      valid: false,
      error: MESSAGES.firstDayOfWeek.invalid,
    });
  });

  it('rejects "Wednesday"', () => {
    expect(validateFirstDayOfWeek('Wednesday')).toEqual({
      valid: false,
      error: MESSAGES.firstDayOfWeek.invalid,
    });
  });
});

// TC-06-UNIT-07: Password confirmation mismatch variations
describe('TC-06-UNIT-07 password confirmation mismatch variations', () => {
  it('rejects an empty confirmation', () => {
    expect(validatePasswordConfirmation('NewPass1', '')).toEqual({
      valid: false,
      error: ACCOUNT_MESSAGES.confirmPasswordRequired,
    });
  });

  it('rejects a case-differing confirmation', () => {
    expect(validatePasswordConfirmation('NewPass1', 'newpass1')).toEqual({
      valid: false,
      error: AUTH_MESSAGES.passwordMismatch,
    });
  });

  it('accepts an exact match', () => {
    expect(validatePasswordConfirmation('NewPass1', 'NewPass1')).toEqual({
      valid: true,
      value: 'NewPass1',
    });
  });
});

// TC-06-UNIT-08: Same-as-current email guard
describe('TC-06-UNIT-08 same-as-current email guard', () => {
  const current = 'pat@acme.com';

  it('rejects the exact current email', () => {
    expect(isSameAsCurrentEmail(current, 'pat@acme.com')).toBe(true);
  });

  it('rejects a case-differing current email after normalization', () => {
    expect(isSameAsCurrentEmail(current, 'PAT@ACME.COM')).toBe(true);
  });

  it('accepts a different email', () => {
    expect(isSameAsCurrentEmail(current, 'new@acme.com')).toBe(false);
  });
});

// TC-06-UNIT-09: Email change token expiry calculation
describe('TC-06-UNIT-09 email change token expiry calculation', () => {
  const issuedAt = new Date('2026-08-27T00:00:00.000Z');
  const expiresAt = new Date(issuedAt.getTime() + 24 * 60 * 60 * 1000);
  const at = (hours: number) => new Date(issuedAt.getTime() + hours * 60 * 60 * 1000);

  it('is still valid at +23 hours', () => {
    expect(isEmailChangeTokenExpired(at(23), expiresAt)).toBe(false);
  });

  it('is expired at exactly +24 hours (exclusive boundary)', () => {
    expect(isEmailChangeTokenExpired(at(24), expiresAt)).toBe(true);
  });

  it('is expired at +25 hours', () => {
    expect(isEmailChangeTokenExpired(at(25), expiresAt)).toBe(true);
  });
});

// TC-06-UNIT-10: Phone number with missing country code
describe('TC-06-UNIT-10 phone number with missing country code', () => {
  it('rejects a number with no country code selected', () => {
    expect(validatePhoneNumber('(555) 123-4567', '')).toEqual({
      valid: false,
      error: MESSAGES.phone.countryCodeRequired,
    });
  });

  it('accepts both empty (phone is optional)', () => {
    expect(validatePhoneNumber('', '')).toEqual({ valid: true, value: '' });
  });

  it('accepts a number with country code "US"', () => {
    expect(validatePhoneNumber('(555) 123-4567', 'US')).toEqual({
      valid: true,
      value: '(555) 123-4567',
    });
  });
});

// TC-06-UNIT-11: Empty password fields
describe('TC-06-UNIT-11 empty password fields', () => {
  it('rejects an empty current password', () => {
    expect(validateCurrentPassword('')).toEqual({
      valid: false,
      error: ACCOUNT_MESSAGES.currentPasswordRequired,
    });
  });

  it('rejects an empty new password', () => {
    const result = validateChangePassword({
      currentPassword: 'Passw0rd',
      newPassword: '',
      passwordConfirmation: '',
    });
    expect(result.valid).toBe(false);
    expect(result.firstInvalidField).toBe('newPassword');
    expect(result.errors.newPassword).toBe(MESSAGES.password.required);
  });

  it('accepts a fully valid change-password request', () => {
    const result = validateChangePassword({
      currentPassword: 'Passw0rd',
      newPassword: 'NewPass1',
      passwordConfirmation: 'NewPass1',
    });
    expect(result).toEqual({
      valid: true,
      errors: {},
      firstInvalidField: null,
      value: {
        currentPassword: 'Passw0rd',
        newPassword: 'NewPass1',
        passwordConfirmation: 'NewPass1',
      },
    });
  });
});

// TC-06-UNIT-12: Timezone validation
describe('TC-06-UNIT-12 timezone validation', () => {
  it('rejects an empty timezone', () => {
    expect(validateTimezone('')).toEqual({ valid: false, error: MESSAGES.timezone.required });
  });

  it('accepts "America/New_York"', () => {
    expect(validateTimezone('America/New_York')).toEqual({
      valid: true,
      value: 'America/New_York',
    });
  });

  it('accepts "Europe/London"', () => {
    expect(validateTimezone('Europe/London')).toEqual({ valid: true, value: 'Europe/London' });
  });
});

// TC-06-UNIT-13: Email max-length boundary
describe('TC-06-UNIT-13 email max-length boundary', () => {
  it('accepts a 254-character email', () => {
    const email = emailOfLength(254);
    expect(email).toHaveLength(254);
    expect(validateEmail(email)).toEqual({ valid: true, value: email });
  });

  it('rejects a 255-character email', () => {
    const email = emailOfLength(255);
    expect(email).toHaveLength(255);
    expect(validateEmail(email)).toEqual({ valid: false, error: MESSAGES.email.tooLong });
  });
});

// Composite Edit-Information validation (exercised server-side by TC-06-INT-12/13/17).
describe('validateAccountSettings composite (TC-06-INT-12/13/17 shape)', () => {
  const validBase = {
    firstName: 'Pat',
    lastName: 'Owner',
    phoneCountryCode: '',
    phoneNumber: '',
    timezone: 'America/New_York',
    firstDayOfWeek: 'Monday',
  };

  it('accepts a valid US phone number (INT-12 step 1)', () => {
    const result = validateAccountSettings({
      ...validBase,
      phoneCountryCode: 'US',
      phoneNumber: '(555) 123-4567',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('keys an invalid US number to phoneNumber (INT-12 step 2)', () => {
    const result = validateAccountSettings({
      ...validBase,
      phoneCountryCode: 'US',
      phoneNumber: '12345',
    });
    expect(result.valid).toBe(false);
    expect(result.firstInvalidField).toBe('phoneNumber');
    expect(result.errors).toEqual({ phoneNumber: MESSAGES.phone.invalid });
  });

  it('accepts cleared phone (INT-12 step 3)', () => {
    const result = validateAccountSettings({ ...validBase, phoneCountryCode: '', phoneNumber: '' });
    expect(result.valid).toBe(true);
  });

  it('keys a missing country code to phoneCountryCode', () => {
    const result = validateAccountSettings({
      ...validBase,
      phoneCountryCode: '',
      phoneNumber: '(555) 123-4567',
    });
    expect(result.valid).toBe(false);
    expect(result.firstInvalidField).toBe('phoneCountryCode');
    expect(result.errors).toEqual({ phoneCountryCode: MESSAGES.phone.countryCodeRequired });
  });

  it('reports required first name (INT-13 step 1)', () => {
    const result = validateAccountSettings({ ...validBase, firstName: '' });
    expect(result.errors).toEqual({ firstName: MESSAGES.firstName.required });
  });

  it('reports invalid-char first name (INT-13 step 2)', () => {
    const result = validateAccountSettings({ ...validBase, firstName: 'Pat2' });
    expect(result.errors).toEqual({ firstName: MESSAGES.firstName.invalidChars });
  });

  it('reports required last name (INT-13 step 3)', () => {
    const result = validateAccountSettings({ ...validBase, lastName: '' });
    expect(result.errors).toEqual({ lastName: MESSAGES.lastName.required });
  });

  it('reports required timezone (INT-17 step 1)', () => {
    const result = validateAccountSettings({ ...validBase, timezone: '' });
    expect(result.errors).toEqual({ timezone: MESSAGES.timezone.required });
  });

  it('reports invalid first day of week (INT-17 step 2)', () => {
    const result = validateAccountSettings({ ...validBase, firstDayOfWeek: 'Saturday' });
    expect(result.errors).toEqual({ firstDayOfWeek: MESSAGES.firstDayOfWeek.invalid });
  });
});
