import { Role } from '../enums';
import { assignableRoles, canAssignRole, canInvite } from '../permissions';
import {
  isSameEmail,
  validateInvite,
  validateName,
  validatePassword,
  validateRole,
} from '../validation';

describe('validateInvite — TC-03-UNIT-01 / TC-03-UNIT-05: Invite payload validation', () => {
  it('rejects an invalid email format', () => {
    const result = validateInvite('not-an-email', 'user');
    expect(result.errors).toEqual({ email: 'Enter a valid email address' });
  });

  it('rejects a role not in the enum', () => {
    const result = validateInvite('new@acme.com', 'superuser');
    expect(result.errors).toEqual({ role: 'Invalid role' });
  });

  it('accepts a valid email + role and normalizes the email', () => {
    const result = validateInvite('New@Acme.com', 'manager');
    expect(result.errors).toBeNull();
    if (result.errors === null) {
      expect(result.data).toEqual({ email: 'new@acme.com', role: Role.Manager });
    }
  });

  it('requires email and role, and enforces the 254-char email limit (edge cases)', () => {
    expect(validateInvite('', 'user').errors).toEqual({ email: 'Email is required' });
    expect(validateInvite('   ', 'user').errors).toEqual({ email: 'Email is required' });
    expect(validateInvite('new@acme.com', '').errors).toEqual({ role: 'Role is required' });
    expect(validateInvite('new@acme.com', '   ').errors).toEqual({ role: 'Role is required' });

    const at255 = 'a'.repeat(243) + '@example.com';
    expect(validateInvite(at255, 'user').errors).toEqual({
      email: 'Email must be at most 254 characters',
    });
    const at254 = 'a'.repeat(242) + '@example.com';
    expect(validateInvite(at254, 'user').errors).toBeNull();
  });
});

describe('validateRole', () => {
  it('accepts each enum role and rejects unknown/empty', () => {
    for (const role of ['admin', 'manager', 'user', 'viewer']) {
      expect(validateRole(role)).toEqual({ valid: true, value: role });
    }
    expect(validateRole('')).toEqual({ valid: false, error: 'Role is required' });
    expect(validateRole('superuser')).toEqual({ valid: false, error: 'Invalid role' });
  });
});

describe('isSameEmail — TC-03-UNIT-03: Self-invitation detection', () => {
  it('matches the same email regardless of case/whitespace', () => {
    expect(isSameEmail('admin@acme.com', 'admin@acme.com')).toBe(true);
    expect(isSameEmail('admin@acme.com', 'ADMIN@ACME.COM')).toBe(true);
    expect(isSameEmail('admin@acme.com', '  Admin@Acme.Com ')).toBe(true);
  });

  it('does not match different emails or empty input', () => {
    expect(isSameEmail('admin@acme.com', 'other@acme.com')).toBe(false);
    expect(isSameEmail('', '')).toBe(false);
  });
});

describe('permission helpers (spec 03, requirement 4)', () => {
  it('canInvite is true only for admin and manager', () => {
    expect(canInvite(Role.Admin)).toBe(true);
    expect(canInvite(Role.Manager)).toBe(true);
    expect(canInvite(Role.User)).toBe(false);
    expect(canInvite(Role.Viewer)).toBe(false);
  });

  it('assignableRoles: admin -> all four; manager -> non-admin', () => {
    expect(assignableRoles(Role.Admin)).toEqual([Role.Admin, Role.Manager, Role.User, Role.Viewer]);
    expect(assignableRoles(Role.Manager)).toEqual([Role.Manager, Role.User, Role.Viewer]);
    expect(assignableRoles(Role.User)).toEqual([]);
  });

  it('canAssignRole: manager cannot assign admin', () => {
    expect(canAssignRole(Role.Admin, Role.Admin)).toBe(true);
    expect(canAssignRole(Role.Manager, Role.User)).toBe(true);
    expect(canAssignRole(Role.Manager, Role.Admin)).toBe(false);
  });
});

describe('TC-03-UNIT-06: new-account accept name and password validation', () => {
  it('applies the spec-01 name and password rules', () => {
    expect(validateName('', 'First name')).toEqual({
      valid: false,
      error: 'First name is required',
    });
    expect(validateName('New2', 'First name')).toEqual({
      valid: false,
      error: 'First name may contain only letters, hyphens, apostrophes, and spaces',
    });
    expect(validatePassword('short1')).toEqual({
      valid: false,
      error: 'Password must be at least 8 characters',
    });
    expect(validatePassword('abcdefgh')).toEqual({
      valid: false,
      error: 'Password must contain at least one digit',
    });
    expect(validateName('New', 'First name').valid).toBe(true);
    expect(validatePassword('Passw0rd')).toEqual({ valid: true });
  });
});
