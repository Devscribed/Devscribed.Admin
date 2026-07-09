import {
  isValidEmail,
  normalizeEmail,
  validateJobTitle,
  validateOrgName,
  validatePassword,
} from '../validation';

describe('validateOrgName — TC-01-UNIT-01: Organization-name validation', () => {
  it('rejects an empty string as required', () => {
    const result = validateOrgName('');
    expect(result.valid).toBe(false);
    expect(result).toEqual({ valid: false, error: 'organization name is required' });
  });

  it('rejects a whitespace-only string (trimmed to empty)', () => {
    const result = validateOrgName('   ');
    expect(result.valid).toBe(false);
    expect(result).toEqual({ valid: false, error: 'organization name is required' });
  });

  it('rejects a 101-character string as too long', () => {
    const result = validateOrgName('a'.repeat(101));
    expect(result.valid).toBe(false);
    expect(result).toEqual({ valid: false, error: 'must be at most 100 characters' });
  });

  it('accepts a normal name', () => {
    const result = validateOrgName('Acme Inc');
    expect(result).toEqual({ valid: true, value: 'Acme Inc' });
  });

  it('accepts a padded name and normalizes it by trimming', () => {
    const result = validateOrgName('  Acme Inc  ');
    expect(result).toEqual({ valid: true, value: 'Acme Inc' });
  });

  it('accepts a name exactly 100 characters long (boundary)', () => {
    const name = 'a'.repeat(100);
    expect(validateOrgName(name)).toEqual({ valid: true, value: name });
  });
});

describe('validatePassword — shared password policy (spec 02, requirement 3)', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validatePassword('Pass1').valid).toBe(false);
  });

  it('rejects passwords with no digit', () => {
    expect(validatePassword('Password').valid).toBe(false);
  });

  it('rejects passwords with no letter', () => {
    expect(validatePassword('12345678').valid).toBe(false);
  });

  it('accepts a policy-compliant password', () => {
    expect(validatePassword('Passw0rd')).toEqual({ valid: true });
  });
});

describe('isValidEmail / normalizeEmail (specs 01, 04, 07)', () => {
  it('rejects malformed addresses', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('bad@')).toBe(false);
    expect(isValidEmail('bad@domain')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('accepts a well-formed address', () => {
    expect(isValidEmail('good@acme.com')).toBe(true);
    expect(isValidEmail('  owner@acme.com  ')).toBe(true);
  });

  it('normalizes by trimming and lowercasing', () => {
    expect(normalizeEmail('  Owner@Acme.COM ')).toBe('owner@acme.com');
  });
});

describe('validateJobTitle (spec 06, requirement 4)', () => {
  it('accepts an empty job title (may be cleared)', () => {
    expect(validateJobTitle('')).toEqual({ valid: true, value: '' });
  });

  it('accepts a 100-character job title (boundary)', () => {
    const title = 'a'.repeat(100);
    expect(validateJobTitle(title)).toEqual({ valid: true, value: title });
  });

  it('rejects a 101-character job title', () => {
    const result = validateJobTitle('a'.repeat(101));
    expect(result).toEqual({ valid: false, error: 'must be at most 100 characters' });
  });
});
