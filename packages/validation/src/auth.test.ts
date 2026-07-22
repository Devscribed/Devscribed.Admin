import { describe, expect, it } from 'vitest';
import { AUTH_MESSAGES, MESSAGES, validateLogin, validatePasswordPresent } from './index';

// TC-02-UNIT-04: Email normalization for login is covered by validateEmail (spec 01).
// This file owns the rules that only exist because of spec 02.

describe('login password presence', () => {
  it('rejects an empty password', () => {
    expect(validatePasswordPresent('')).toEqual({
      valid: false,
      error: MESSAGES.password.required,
    });
  });

  it('accepts a password that would fail the signup policy', () => {
    // Login must never apply the policy: an account created before a policy change
    // still has to be able to sign in, and telling a stranger "your password is too
    // short" leaks that the account exists.
    expect(validatePasswordPresent('short')).toEqual({ valid: true, value: 'short' });
  });

  it('does not trim — surrounding whitespace is part of the secret', () => {
    expect(validatePasswordPresent('  pw  ')).toEqual({ valid: true, value: '  pw  ' });
  });
});

describe('validateLogin', () => {
  it('accepts a well-formed pair and normalizes the email', () => {
    const result = validateLogin({ email: '  PAT@ACME.COM ', password: 'Passw0rd' });

    expect(result.valid).toBe(true);
    expect(result.firstInvalidField).toBeNull();
    expect(result.value.email).toBe('pat@acme.com');
    expect(result.value.password).toBe('Passw0rd');
  });

  it('reports every invalid field at once and names the first', () => {
    const result = validateLogin({ email: '', password: '' });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual({
      email: MESSAGES.email.required,
      password: MESSAGES.password.required,
    });
    expect(result.firstInvalidField).toBe('email');
  });

  it('rejects a malformed email', () => {
    const result = validateLogin({ email: 'not-an-email', password: 'Passw0rd' });

    expect(result.errors).toEqual({ email: MESSAGES.email.invalid });
    expect(result.firstInvalidField).toBe('email');
  });

  it('names password as the first invalid field when only it is missing', () => {
    const result = validateLogin({ email: 'pat@acme.com', password: '' });

    expect(result.errors).toEqual({ password: MESSAGES.password.required });
    expect(result.firstInvalidField).toBe('password');
  });
});

describe('AUTH_MESSAGES', () => {
  it('uses one message for unknown email and wrong password', () => {
    // Spec 02 requirement 4 — the two cases must be indistinguishable.
    expect(AUTH_MESSAGES.invalidCredentials).toBe('Invalid email or password');
  });

  it('keeps the deactivation message distinct from the credentials error', () => {
    expect(AUTH_MESSAGES.deactivated).toBe(
      'Your account has been deactivated, contact your administrator',
    );
    expect(AUTH_MESSAGES.deactivated).not.toBe(AUTH_MESSAGES.invalidCredentials);
  });
});
