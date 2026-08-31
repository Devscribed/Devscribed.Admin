import { describe, expect, it } from 'vitest';
import {
  MESSAGES,
  createAdminMembership,
  normalizeEmail,
  validateEmail,
  validateFirstName,
  validateLastName,
  validateOrgName,
  validatePassword,
  validateSignup,
} from './index';

const repeat = (n: number, ch = 'a') => ch.repeat(n);

/** Builds an email of exactly `total` characters that is otherwise well-formed. */
const emailOfLength = (total: number) => {
  const domain = '@example.com';
  return repeat(total - domain.length) + domain;
};

// TC-01-UNIT-01: Organization-name validation
describe('TC-01-UNIT-01 organization name', () => {
  it('rejects an empty string', () => {
    expect(validateOrgName('')).toEqual({ valid: false, error: MESSAGES.orgName.required });
  });

  it('rejects a whitespace-only string', () => {
    expect(validateOrgName('   ')).toEqual({ valid: false, error: MESSAGES.orgName.required });
  });

  it('rejects 101 characters', () => {
    expect(validateOrgName(repeat(101))).toEqual({ valid: false, error: MESSAGES.orgName.tooLong });
  });

  it('accepts a normal name', () => {
    expect(validateOrgName('Acme Inc')).toEqual({ valid: true, value: 'Acme Inc' });
  });

  it('trims surrounding whitespace', () => {
    expect(validateOrgName('  Acme Inc  ')).toEqual({ valid: true, value: 'Acme Inc' });
  });

  it('accepts 100 characters (boundary)', () => {
    expect(validateOrgName(repeat(100))).toEqual({ valid: true, value: repeat(100) });
  });

  it('has the exact spec messages', () => {
    expect(MESSAGES.orgName.required).toBe('Organization name is required');
    expect(MESSAGES.orgName.tooLong).toBe('Organization name must be at most 100 characters');
  });
});

// TC-01-UNIT-02: Creator is assigned the admin role
describe('TC-01-UNIT-02 creator membership', () => {
  it('produces an active admin membership', () => {
    const membership = createAdminMembership({ accountId: 'acc-1', organizationId: 'org-1' });
    expect(membership.role).toBe('admin');
    expect(membership.status).toBe('active');
    expect(membership.accountId).toBe('acc-1');
    expect(membership.organizationId).toBe('org-1');
  });
});

// TC-01-UNIT-03: First and last name validation
describe('TC-01-UNIT-03 person names', () => {
  const cases: Array<[string, string | null]> = [
    ['', 'required'],
    ['   ', 'required'],
    [repeat(51), 'tooLong'],
    ['John2', 'invalidChars'],
    ['John@Doe', 'invalidChars'],
    ['Pat', null],
    ['Mary-Jane', null],
    ["O'Brien", null],
    ['Mary Jane', null],
    ['  Pat  ', null],
    [repeat(50), null],
    ['X', null],
  ];

  for (const [input, rule] of cases) {
    it(`first name ${JSON.stringify(input)} → ${rule ?? 'valid'}`, () => {
      const result = validateFirstName(input);
      if (rule) {
        expect(result).toEqual({ valid: false, error: MESSAGES.firstName[rule as 'required'] });
      } else {
        expect(result).toEqual({ valid: true, value: input.trim() });
      }
    });

    it(`last name ${JSON.stringify(input)} → ${rule ?? 'valid'}`, () => {
      const result = validateLastName(input);
      if (rule) {
        expect(result).toEqual({ valid: false, error: MESSAGES.lastName[rule as 'required'] });
      } else {
        expect(result).toEqual({ valid: true, value: input.trim() });
      }
    });
  }

  it('has field-specific messages', () => {
    expect(MESSAGES.firstName.required).toBe('First name is required');
    expect(MESSAGES.firstName.tooLong).toBe('First name must be at most 50 characters');
    expect(MESSAGES.firstName.invalidChars).toBe(
      'First name may contain only letters, hyphens, apostrophes, and spaces',
    );
    expect(MESSAGES.lastName.required).toBe('Last name is required');
    expect(MESSAGES.lastName.tooLong).toBe('Last name must be at most 50 characters');
    expect(MESSAGES.lastName.invalidChars).toBe(
      'Last name may contain only letters, hyphens, apostrophes, and spaces',
    );
  });
});

// TC-01-UNIT-04: Email normalization
describe('TC-01-UNIT-04 email normalization', () => {
  it('lowercases an uppercase address', () => {
    expect(normalizeEmail('PAT@ACME.COM')).toBe('pat@acme.com');
  });

  it('lowercases a mixed-case address', () => {
    expect(normalizeEmail('Pat.Owner@Acme.Com')).toBe('pat.owner@acme.com');
  });

  it('leaves an already-lowercase address unchanged', () => {
    expect(normalizeEmail('pat@acme.com')).toBe('pat@acme.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeEmail('  Pat@Acme.com  ')).toBe('pat@acme.com');
  });
});

// TC-01-UNIT-05 / TC-01-UNIT-07: Password policy and rule-specific messages
describe('TC-01-UNIT-05 / TC-01-UNIT-07 password policy', () => {
  it('rejects an empty password', () => {
    expect(validatePassword('')).toEqual({ valid: false, error: 'Password is required' });
  });

  it('rejects a 5-character password', () => {
    expect(validatePassword('Pass1')).toEqual({
      valid: false,
      error: 'Password must be at least 8 characters',
    });
  });

  it('rejects a 6-character password that otherwise passes', () => {
    expect(validatePassword('short1')).toEqual({
      valid: false,
      error: 'Password must be at least 8 characters',
    });
  });

  it('accepts exactly 8 characters with a letter and a digit', () => {
    expect(validatePassword('Passwor1')).toEqual({ valid: true, value: 'Passwor1' });
  });

  it('rejects letters only', () => {
    expect(validatePassword('abcdefgh')).toEqual({
      valid: false,
      error: 'Password must contain at least one digit',
    });
  });

  it('rejects digits only', () => {
    expect(validatePassword('12345678')).toEqual({
      valid: false,
      error: 'Password must contain at least one letter',
    });
  });

  it('accepts 128 characters (boundary)', () => {
    const pwd = repeat(127) + '1';
    expect(validatePassword(pwd)).toEqual({ valid: true, value: pwd });
  });

  it('rejects 129 characters', () => {
    expect(validatePassword(repeat(128) + '1')).toEqual({
      valid: false,
      error: 'Password must be at most 128 characters',
    });
  });

  it('never trims the password', () => {
    expect(validatePassword(' passw0rd ')).toEqual({ valid: true, value: ' passw0rd ' });
  });
});

// TC-01-UNIT-06: Email format and length validation
describe('TC-01-UNIT-06 email format and length', () => {
  it('rejects an empty email', () => {
    expect(validateEmail('')).toEqual({ valid: false, error: 'Email is required' });
  });

  it.each(['not-an-email', 'missing@', '@nodomain.com', 'user@example'])(
    'rejects %s as malformed',
    (input) => {
      expect(validateEmail(input)).toEqual({ valid: false, error: 'Enter a valid email address' });
    },
  );

  it('accepts a well-formed email and normalizes it', () => {
    expect(validateEmail('User@Example.com')).toEqual({ valid: true, value: 'user@example.com' });
  });

  it('accepts 254 characters (boundary)', () => {
    const email = emailOfLength(254);
    expect(email).toHaveLength(254);
    expect(validateEmail(email)).toEqual({ valid: true, value: email });
  });

  it('rejects 255 characters', () => {
    const email = emailOfLength(255);
    expect(email).toHaveLength(255);
    expect(validateEmail(email)).toEqual({
      valid: false,
      error: 'Email must be at most 254 characters',
    });
  });

  /*
   * BUG-002 — the local part is the ASCII set RFC 5322 permits unquoted. The domain half
   * already demanded Latin letters in the TLD; the local part demanded nothing, so an
   * address the signature provider refuses passed here and failed two screens later as
   * "the provider is unavailable".
   */
  it.each([
    'фывфывфыв@gmail.com',
    'ｕｓｅｒ@example.com',
    'user name@example.com',
    'josé@example.com',
  ])('rejects %s - the local part is not ASCII', (input) => {
    expect(validateEmail(input)).toEqual({ valid: false, error: MESSAGES.email.invalid });
  });

  it('refuses a quoted local part, deliberately', () => {
    expect(validateEmail('"john doe"@example.com')).toEqual({
      valid: false,
      error: MESSAGES.email.invalid,
    });
  });

  it.each(['.user@example.com', 'user.@example.com', 'us..er@example.com'])(
    'rejects %s — a dot separates atoms, it does not lead, trail or repeat',
    (input) => {
      expect(validateEmail(input)).toEqual({ valid: false, error: MESSAGES.email.invalid });
    },
  );

  it('accepts plus-addressing', () => {
    expect(validateEmail('User+Contracts@Gmail.com')).toEqual({
      valid: true,
      value: 'user+contracts@gmail.com',
    });
  });

  it('accepts the rest of the permitted punctuation', () => {
    const email = "a!#$%&'*+/=?^_`{|}~-b@example.com";
    expect(validateEmail(email)).toEqual({ valid: true, value: email });
  });

  it('accepts dotted and hyphenated real addresses', () => {
    expect(validateEmail('ivan.demchenko.dev@gmail.com')).toEqual({
      valid: true,
      value: 'ivan.demchenko.dev@gmail.com',
    });
    expect(validateEmail('first_last-1@sub.example.co.uk')).toEqual({
      valid: true,
      value: 'first_last-1@sub.example.co.uk',
    });
  });
});

// FR-15: whole-form validation, ordered top-to-bottom
describe('validateSignup', () => {
  const valid = {
    orgName: '  Acme Inc  ',
    firstName: ' Pat ',
    lastName: 'Owner',
    email: 'Owner@Acme.com',
    password: 'Passw0rd',
  };

  it('normalizes every field on success', () => {
    const result = validateSignup(valid);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.value).toEqual({
      orgName: 'Acme Inc',
      firstName: 'Pat',
      lastName: 'Owner',
      email: 'owner@acme.com',
      password: 'Passw0rd',
    });
  });

  it('reports every error at once for an empty form', () => {
    const result = validateSignup({
      orgName: '',
      firstName: '',
      lastName: '',
      email: '',
      password: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual({
      orgName: 'Organization name is required',
      firstName: 'First name is required',
      lastName: 'Last name is required',
      email: 'Email is required',
      password: 'Password is required',
    });
    expect(result.firstInvalidField).toBe('orgName');
  });

  it('reports the first invalid field in top-to-bottom order', () => {
    const result = validateSignup({ ...valid, email: '' });
    expect(result.firstInvalidField).toBe('email');
    expect(Object.keys(result.errors)).toEqual(['email']);
  });
});
