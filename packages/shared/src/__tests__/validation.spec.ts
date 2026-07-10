import {
  isValidEmail,
  normalizeEmail,
  passwordsMatch,
  validateEmail,
  validateJobTitle,
  validateName,
  validateOrgName,
  validatePassword,
} from '../validation';

describe('validateOrgName — TC-01-UNIT-01: Organization-name validation', () => {
  it('rejects an empty string as required', () => {
    expect(validateOrgName('')).toEqual({ valid: false, error: 'Organization name is required' });
  });

  it('rejects a whitespace-only string (trimmed to empty)', () => {
    expect(validateOrgName('   ')).toEqual({
      valid: false,
      error: 'Organization name is required',
    });
  });

  it('rejects a 101-character string as too long', () => {
    expect(validateOrgName('a'.repeat(101))).toEqual({
      valid: false,
      error: 'Organization name must be at most 100 characters',
    });
  });

  it('accepts a normal name', () => {
    expect(validateOrgName('Acme Inc')).toEqual({ valid: true, value: 'Acme Inc' });
  });

  it('accepts a padded name and normalizes it by trimming', () => {
    expect(validateOrgName('  Acme Inc  ')).toEqual({ valid: true, value: 'Acme Inc' });
  });

  it('accepts a name exactly 100 characters long (boundary)', () => {
    const name = 'a'.repeat(100);
    expect(validateOrgName(name)).toEqual({ valid: true, value: name });
  });
});

describe('validateName — TC-01-UNIT-03: First and last name validation', () => {
  it('rejects empty and whitespace-only as required', () => {
    expect(validateName('', 'First name')).toEqual({
      valid: false,
      error: 'First name is required',
    });
    expect(validateName('   ', 'Last name')).toEqual({
      valid: false,
      error: 'Last name is required',
    });
  });

  it('rejects a 51-character name', () => {
    expect(validateName('a'.repeat(51), 'First name')).toEqual({
      valid: false,
      error: 'First name must be at most 50 characters',
    });
  });

  it('rejects names with digits or special characters', () => {
    const message = 'First name may contain only letters, hyphens, apostrophes, and spaces';
    expect(validateName('John2', 'First name')).toEqual({ valid: false, error: message });
    expect(validateName('John@Doe', 'First name')).toEqual({ valid: false, error: message });
  });

  it('accepts letters, hyphens, apostrophes, and spaces', () => {
    expect(validateName('Pat', 'First name')).toEqual({ valid: true, value: 'Pat' });
    expect(validateName('Mary-Jane', 'First name')).toEqual({ valid: true, value: 'Mary-Jane' });
    expect(validateName("O'Brien", 'Last name')).toEqual({ valid: true, value: "O'Brien" });
    expect(validateName('Mary Jane', 'First name')).toEqual({ valid: true, value: 'Mary Jane' });
    expect(validateName('X', 'First name')).toEqual({ valid: true, value: 'X' });
  });

  it('trims a padded name and accepts the 50-char boundary', () => {
    expect(validateName('  Pat  ', 'First name')).toEqual({ valid: true, value: 'Pat' });
    const name = 'a'.repeat(50);
    expect(validateName(name, 'First name')).toEqual({ valid: true, value: name });
  });
});

describe('normalizeEmail — TC-01-UNIT-04: Email normalization', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('PAT@ACME.COM')).toBe('pat@acme.com');
    expect(normalizeEmail('Pat.Owner@Acme.Com')).toBe('pat.owner@acme.com');
    expect(normalizeEmail('pat@acme.com')).toBe('pat@acme.com');
  });
});

describe('validatePassword — TC-01-UNIT-05/07: Password policy & exact messages', () => {
  it('rejects an empty password', () => {
    expect(validatePassword('')).toEqual({ valid: false, error: 'Password is required' });
  });

  it('rejects a too-short password', () => {
    expect(validatePassword('Pass1')).toEqual({
      valid: false,
      error: 'Password must be at least 8 characters',
    });
    expect(validatePassword('short1')).toEqual({
      valid: false,
      error: 'Password must be at least 8 characters',
    });
  });

  it('accepts an 8-character password with a letter and a digit', () => {
    expect(validatePassword('Passwor1')).toEqual({ valid: true });
  });

  it('requires a digit', () => {
    expect(validatePassword('abcdefgh')).toEqual({
      valid: false,
      error: 'Password must contain at least one digit',
    });
  });

  it('requires a letter', () => {
    expect(validatePassword('12345678')).toEqual({
      valid: false,
      error: 'Password must contain at least one letter',
    });
  });

  it('accepts the 128-char boundary and rejects 129 chars', () => {
    const at128 = 'a'.repeat(127) + '1';
    expect(validatePassword(at128)).toEqual({ valid: true });
    const at129 = 'a'.repeat(128) + '1';
    expect(validatePassword(at129)).toEqual({
      valid: false,
      error: 'Password must be at most 128 characters',
    });
  });
});

describe('validateEmail — TC-01-UNIT-06: Email format and length validation', () => {
  it('rejects empty as required', () => {
    expect(validateEmail('')).toEqual({ valid: false, error: 'Email is required' });
  });

  it('rejects malformed addresses', () => {
    const message = 'Enter a valid email address';
    expect(validateEmail('not-an-email')).toEqual({ valid: false, error: message });
    expect(validateEmail('missing@')).toEqual({ valid: false, error: message });
    expect(validateEmail('@nodomain.com')).toEqual({ valid: false, error: message });
    expect(validateEmail('user@example')).toEqual({ valid: false, error: message });
  });

  it('accepts a well-formed address', () => {
    expect(validateEmail('user@example.com')).toEqual({ valid: true, value: 'user@example.com' });
  });

  it('accepts the 254-char boundary and rejects 255 chars', () => {
    const at254 = 'a'.repeat(242) + '@example.com'; // 242 + 12 = 254
    expect(at254).toHaveLength(254);
    expect(validateEmail(at254)).toEqual({ valid: true, value: at254 });

    const at255 = 'a'.repeat(243) + '@example.com'; // 255
    expect(at255).toHaveLength(255);
    expect(validateEmail(at255)).toEqual({
      valid: false,
      error: 'Email must be at most 254 characters',
    });
  });

  it('isValidEmail remains a boolean helper', () => {
    expect(isValidEmail('good@acme.com')).toBe(true);
    expect(isValidEmail('bad@')).toBe(false);
  });
});

describe('passwordsMatch — TC-02-UNIT-05: Password confirmation mismatch', () => {
  it('passes when password and confirmation are equal', () => {
    expect(passwordsMatch('NewPass1', 'NewPass1')).toBe(true);
  });

  it('fails when they differ', () => {
    expect(passwordsMatch('NewPass1', 'NewPass2')).toBe(false);
    expect(passwordsMatch('NewPass1', '')).toBe(false);
  });
});

describe('validateJobTitle (spec 06, requirement 4)', () => {
  it('accepts empty and the 100-char boundary, rejects 101', () => {
    expect(validateJobTitle('')).toEqual({ valid: true, value: '' });
    const title = 'a'.repeat(100);
    expect(validateJobTitle(title)).toEqual({ valid: true, value: title });
    expect(validateJobTitle('a'.repeat(101))).toEqual({
      valid: false,
      error: 'must be at most 100 characters',
    });
  });
});
