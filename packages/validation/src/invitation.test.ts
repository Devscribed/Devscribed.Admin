import { describe, expect, it } from 'vitest';
import {
  INVITE_MESSAGES,
  MESSAGES,
  ROLE_VALUES,
  canAssignRole,
  isSelfInvitation,
  isValidRole,
  validateInviteAcceptNewAccount,
  validateInviteCreate,
} from './index';

const repeat = (n: number, ch = 'a') => ch.repeat(n);

/** Builds an email of exactly `total` characters that is otherwise well-formed. */
const emailOfLength = (total: number) => {
  const domain = '@example.com';
  return repeat(total - domain.length) + domain;
};

// TC-03-UNIT-01: Invite payload validation
describe('TC-03-UNIT-01 invite payload validation', () => {
  it('rejects an invalid email format', () => {
    const result = validateInviteCreate({ email: 'not-an-email', role: 'user' });
    expect(result.valid).toBe(false);
    expect(result.errors.email).toBe(MESSAGES.email.invalid);
  });

  it('rejects a role not in the enum', () => {
    const result = validateInviteCreate({ email: 'new@acme.com', role: 'superuser' });
    expect(result.valid).toBe(false);
    expect(result.errors.role).toBe(MESSAGES.role.invalid);
  });

  it('accepts a well-formed email and a valid role', () => {
    const result = validateInviteCreate({ email: 'new@acme.com', role: 'manager' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.value).toEqual({ email: 'new@acme.com', role: 'manager' });
  });
});

// TC-03-UNIT-02: Token expiry is issued time + 7 days is covered in
// apps/api/src/invitations/invitation-token.test.ts, alongside generateInvitationToken.

// TC-03-UNIT-03: Self-invitation rejected
describe('TC-03-UNIT-03 self-invitation', () => {
  const inviterEmail = 'admin@acme.com';

  it('flags an exact match', () => {
    expect(isSelfInvitation(inviterEmail, 'admin@acme.com')).toBe(true);
  });

  it('flags a case variant as the same email after normalization', () => {
    expect(isSelfInvitation(inviterEmail, 'ADMIN@ACME.COM')).toBe(true);
  });

  it('does not flag a different email', () => {
    expect(isSelfInvitation(inviterEmail, 'new@acme.com')).toBe(false);
  });

  it('has the exact spec message', () => {
    expect(INVITE_MESSAGES.selfInvitation).toBe('You cannot invite yourself');
  });
});

// TC-03-UNIT-04: Email normalization for invitations
describe('TC-03-UNIT-04 email normalization for invitations', () => {
  it('normalizes an uppercase address', () => {
    expect(validateInviteCreate({ email: 'NEW@ACME.COM', role: 'user' }).value.email).toBe(
      'new@acme.com',
    );
  });

  it('normalizes a mixed-case address', () => {
    expect(
      validateInviteCreate({ email: 'New.User@Acme.Com', role: 'user' }).value.email,
    ).toBe('new.user@acme.com');
  });
});

// TC-03-UNIT-05: Invite email and role validation edge cases
describe('TC-03-UNIT-05 invite email and role validation edge cases', () => {
  it('rejects an empty email', () => {
    expect(validateInviteCreate({ email: '', role: 'user' }).errors.email).toBe(
      MESSAGES.email.required,
    );
  });

  it('rejects a whitespace-only email', () => {
    expect(validateInviteCreate({ email: '   ', role: 'user' }).errors.email).toBe(
      MESSAGES.email.required,
    );
  });

  it('rejects an empty role', () => {
    expect(validateInviteCreate({ email: 'new@acme.com', role: '' }).errors.role).toBe(
      MESSAGES.role.required,
    );
  });

  it('rejects a whitespace-only role', () => {
    expect(validateInviteCreate({ email: 'new@acme.com', role: '   ' }).errors.role).toBe(
      MESSAGES.role.required,
    );
  });

  it('rejects a 255-character email', () => {
    const email = emailOfLength(255);
    expect(validateInviteCreate({ email, role: 'user' }).errors.email).toBe(
      MESSAGES.email.tooLong,
    );
  });

  it('accepts a 254-character email (boundary)', () => {
    const email = emailOfLength(254);
    const result = validateInviteCreate({ email, role: 'user' });
    expect(result.valid).toBe(true);
    expect(result.value.email).toBe(email);
  });
});

// TC-03-UNIT-06: New-account accept name and password validation
describe('TC-03-UNIT-06 new-account accept validation', () => {
  it('rejects an empty first name', () => {
    const result = validateInviteAcceptNewAccount({
      firstName: '',
      lastName: 'Hire',
      password: 'Passw0rd',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.firstName).toBe(MESSAGES.firstName.required);
  });

  it('rejects an empty last name', () => {
    const result = validateInviteAcceptNewAccount({
      firstName: 'New',
      lastName: '',
      password: 'Passw0rd',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.lastName).toBe(MESSAGES.lastName.required);
  });

  it('rejects an empty password', () => {
    const result = validateInviteAcceptNewAccount({
      firstName: 'New',
      lastName: 'Hire',
      password: '',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.password).toBe(MESSAGES.password.required);
  });

  it('rejects a first name with invalid characters', () => {
    const result = validateInviteAcceptNewAccount({
      firstName: 'New2',
      lastName: 'Hire',
      password: 'Passw0rd',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.firstName).toBe(MESSAGES.firstName.invalidChars);
  });

  it('rejects a too-short password', () => {
    const result = validateInviteAcceptNewAccount({
      firstName: 'New',
      lastName: 'Hire',
      password: 'short1',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.password).toBe(MESSAGES.password.tooShort);
  });

  it('rejects a password with no digit', () => {
    const result = validateInviteAcceptNewAccount({
      firstName: 'New',
      lastName: 'Hire',
      password: 'abcdefgh',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.password).toBe(MESSAGES.password.noDigit);
  });

  it('accepts a valid payload', () => {
    const result = validateInviteAcceptNewAccount({
      firstName: 'New',
      lastName: 'Hire',
      password: 'Passw0rd',
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });
});

describe('role enum', () => {
  it('lists all four roles', () => {
    expect(ROLE_VALUES).toEqual(['admin', 'manager', 'user', 'viewer']);
  });

  it.each(ROLE_VALUES)('accepts %s as valid', (role) => {
    expect(isValidRole(role)).toBe(true);
  });

  it('rejects an unknown role', () => {
    expect(isValidRole('superuser')).toBe(false);
  });
});

// Spec 03 requirement 4: role selection authority.
describe('canAssignRole', () => {
  it.each(ROLE_VALUES)('lets an admin assign %s', (role) => {
    expect(canAssignRole('admin', role)).toBe(true);
  });

  it('lets a manager assign manager, user, or viewer', () => {
    expect(canAssignRole('manager', 'manager')).toBe(true);
    expect(canAssignRole('manager', 'user')).toBe(true);
    expect(canAssignRole('manager', 'viewer')).toBe(true);
  });

  it('refuses a manager assigning admin', () => {
    expect(canAssignRole('manager', 'admin')).toBe(false);
  });

  it('refuses a user or viewer assigning anything', () => {
    for (const role of ROLE_VALUES) {
      expect(canAssignRole('user', role)).toBe(false);
      expect(canAssignRole('viewer', role)).toBe(false);
    }
  });
});

describe('INVITE_MESSAGES', () => {
  it('has the exact spec messages', () => {
    expect(INVITE_MESSAGES.alreadyMember).toBe(
      'This person is already a member of your organization',
    );
    expect(INVITE_MESSAGES.roleAuthority).toBe(
      'You do not have permission to assign the admin role',
    );
    expect(INVITE_MESSAGES.permissionDenied).toBe(
      'You do not have permission to invite members',
    );
    expect(INVITE_MESSAGES.tokenExpired).toBe('This invitation has expired');
    expect(INVITE_MESSAGES.tokenInvalid).toBe('This invitation is no longer valid');
    expect(INVITE_MESSAGES.incorrectPassword).toBe('Incorrect password');
  });
});
