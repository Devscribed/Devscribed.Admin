import { describe, expect, it } from 'vitest';
import {
  can,
  validateProjectName,
  PROJECT_MESSAGES,
  parseProjectStatusFilter,
  validateMembershipIds,
} from './index';

// Spec 11 capabilities — manage-projects (admin/manager) & list-assigned-projects (admin/manager/user)
describe('spec 11 project capabilities', () => {
  it('admin and manager can manage projects', () => {
    expect(can('admin', 'manage-projects')).toBe(true);
    expect(can('manager', 'manage-projects')).toBe(true);
  });

  it('user and viewer cannot manage projects', () => {
    expect(can('user', 'manage-projects')).toBe(false);
    expect(can('viewer', 'manage-projects')).toBe(false);
  });

  it('admin, manager and user can list assigned projects', () => {
    expect(can('admin', 'list-assigned-projects')).toBe(true);
    expect(can('manager', 'list-assigned-projects')).toBe(true);
    expect(can('user', 'list-assigned-projects')).toBe(true);
  });

  it('viewer cannot list assigned projects', () => {
    expect(can('viewer', 'list-assigned-projects')).toBe(false);
  });
});

// Project name validation — mirrors TC-11-UNIT-01 plus the XSS char-class case
describe('validateProjectName', () => {
  it('rejects an empty string as required', () => {
    const result = validateProjectName('');
    expect(result).toEqual({ valid: false, error: PROJECT_MESSAGES.nameRequired });
  });

  it('rejects a whitespace-only string as required', () => {
    const result = validateProjectName('   ');
    expect(result).toEqual({ valid: false, error: PROJECT_MESSAGES.nameRequired });
  });

  it('rejects a 101-character name as too long', () => {
    const result = validateProjectName('a'.repeat(101));
    expect(result).toEqual({ valid: false, error: PROJECT_MESSAGES.nameTooLong });
  });

  it('accepts an exactly-100-character name', () => {
    const name = 'a'.repeat(100);
    expect(validateProjectName(name)).toEqual({ valid: true, value: name });
  });

  it('trims leading/trailing whitespace and accepts', () => {
    expect(validateProjectName('  Project Alpha  ')).toEqual({
      valid: true,
      value: 'Project Alpha',
    });
  });

  it('accepts a name with parentheses', () => {
    expect(validateProjectName('My Project (v2)')).toEqual({
      valid: true,
      value: 'My Project (v2)',
    });
  });

  it('accepts a name with an ampersand', () => {
    expect(validateProjectName('Client & Partners')).toEqual({
      valid: true,
      value: 'Client & Partners',
    });
  });

  it('accepts any-script letters (Cyrillic)', () => {
    expect(validateProjectName('Проект Альфа')).toEqual({
      valid: true,
      value: 'Проект Альфа',
    });
  });

  it('rejects an XSS payload via the invalid-character rule (TC-11-INT-17)', () => {
    const result = validateProjectName("<script>alert('x')</script>");
    expect(result).toEqual({ valid: false, error: PROJECT_MESSAGES.nameInvalidChars });
  });
});

// Status filter parsing (GET .../projects?status=...) — default 'active'
describe('parseProjectStatusFilter', () => {
  it('passes through each valid filter unchanged', () => {
    expect(parseProjectStatusFilter('active')).toBe('active');
    expect(parseProjectStatusFilter('archived')).toBe('archived');
    expect(parseProjectStatusFilter('all')).toBe('all');
  });

  it('defaults to "active" for undefined', () => {
    expect(parseProjectStatusFilter(undefined)).toBe('active');
  });

  it('defaults to "active" for an unknown value', () => {
    expect(parseProjectStatusFilter('garbage')).toBe('active');
  });
});

// Bulk add-members empty-array guard (POST .../members)
describe('validateMembershipIds', () => {
  it('rejects an empty array as required', () => {
    expect(validateMembershipIds([])).toEqual({
      valid: false,
      error: PROJECT_MESSAGES.membersEmpty,
    });
  });

  it('rejects a non-array value as required', () => {
    expect(validateMembershipIds(undefined)).toEqual({
      valid: false,
      error: PROJECT_MESSAGES.membersEmpty,
    });
    expect(validateMembershipIds('a')).toEqual({
      valid: false,
      error: PROJECT_MESSAGES.membersEmpty,
    });
  });

  it('accepts a non-empty array of ids', () => {
    expect(validateMembershipIds(['a', 'b'])).toEqual({ valid: true, value: ['a', 'b'] });
  });
});
