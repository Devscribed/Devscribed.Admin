import { describe, expect, it } from 'vitest';
import { canChangeRole, getAvailableRoles, getAvatarInitials, validateJobTitle } from './index';

// TC-05-UNIT-01: Job title validation (max length)
describe('TC-05-UNIT-01 job title validation (max length)', () => {
  it('accepts exactly 100 characters', () => {
    const result = validateJobTitle('a'.repeat(100));
    expect(result).toEqual({ valid: true, value: 'a'.repeat(100) });
  });

  it('rejects 101 characters', () => {
    const result = validateJobTitle('a'.repeat(101));
    expect(result).toEqual({
      valid: false,
      error: 'Job title must be at most 100 characters',
    });
  });

  it('accepts an empty string', () => {
    const result = validateJobTitle('');
    expect(result).toEqual({ valid: true, value: '' });
  });
});

// TC-05-UNIT-02: Job title allows empty (clearing)
describe('TC-05-UNIT-02 job title allows empty (clearing)', () => {
  it('validates a cleared job title as valid', () => {
    // A member previously had "Engineer"; the field under validation is only the new
    // (now empty) value — validateJobTitle has no notion of "previous" value.
    const result = validateJobTitle('');
    expect(result.valid).toBe(true);
  });
});

// TC-05-UNIT-03: Manager role-change authority on detail page
describe('TC-05-UNIT-03 manager role-change authority', () => {
  it('allows manager to change user -> manager', () => {
    expect(canChangeRole('manager', 'user', 'manager')).toBe(true);
  });

  it('allows manager to change user -> viewer', () => {
    expect(canChangeRole('manager', 'user', 'viewer')).toBe(true);
  });

  it('allows manager to change viewer -> user', () => {
    expect(canChangeRole('manager', 'viewer', 'user')).toBe(true);
  });

  it('rejects manager promoting user -> admin', () => {
    expect(canChangeRole('manager', 'user', 'admin')).toBe(false);
  });

  it('rejects manager changing a manager target at all', () => {
    expect(canChangeRole('manager', 'manager', 'user')).toBe(false);
  });

  it('rejects manager changing an admin target at all', () => {
    expect(canChangeRole('manager', 'admin', 'user')).toBe(false);
  });

  it('grants admin authority over any transition', () => {
    expect(canChangeRole('admin', 'admin', 'manager')).toBe(true);
    expect(canChangeRole('admin', 'user', 'viewer')).toBe(true);
    expect(getAvailableRoles('admin', 'manager')).toEqual(['admin', 'manager', 'user', 'viewer']);
  });

  it('never grants user/viewer any authority', () => {
    expect(canChangeRole('user', 'user', 'viewer')).toBe(false);
    expect(canChangeRole('viewer', 'user', 'viewer')).toBe(false);
  });
});

// TC-05-UNIT-04: Avatar initials generation
describe('TC-05-UNIT-04 avatar initials generation', () => {
  it('generates initials for "Alex" "Kaminski"', () => {
    expect(getAvatarInitials('Alex', 'Kaminski')).toBe('AK');
  });

  it('uppercases lowercase names', () => {
    expect(getAvatarInitials('pat', 'owner')).toBe('PO');
  });

  it('supports Unicode letters', () => {
    expect(getAvatarInitials('María', 'García')).toBe('MG');
  });
});
