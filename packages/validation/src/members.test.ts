import { describe, expect, it } from 'vitest';
import {
  MEMBER_MESSAGES,
  ROLE_VALUES,
  can,
  matchesMemberSearch,
  visibleMembers,
  type MemberCapability,
  type SearchableMember,
} from './index';

// TC-04-UNIT-06 (debounced search) is a DOM/timer concern with no pure, DB-free
// backend logic behind it — left for the frontend agent to cover in the web app.

const alex: SearchableMember = {
  id: 'alex',
  fullName: 'Alex Kaminski',
  email: 'alex.k@acme.com',
  status: 'active',
};
const alesia: SearchableMember = {
  id: 'alesia',
  fullName: 'Alesia Varaniuk',
  email: 'alesia@acme.com',
  status: 'active',
};
const pat: SearchableMember = {
  id: 'pat',
  fullName: 'Pat Owner',
  email: 'pat@acme.com',
  status: 'active',
};

const members = [alex, alesia, pat];

// TC-04-UNIT-01: Search matching (name/email, partial, case-insensitive)
describe('TC-04-UNIT-01 search matching', () => {
  it('matches a partial substring shared by multiple names', () => {
    expect(visibleMembers(members, { search: 'ale' })).toEqual([alex, alesia]);
  });

  it('matches case-insensitively', () => {
    expect(visibleMembers(members, { search: 'ALEX' })).toEqual([alex]);
  });

  it('matches against the email', () => {
    expect(visibleMembers(members, { search: 'pat@' })).toEqual([pat]);
  });

  it('returns an empty set when nothing matches', () => {
    expect(visibleMembers(members, { search: 'zzz' })).toEqual([]);
  });

  it('does not match against role or job title', () => {
    // matchesMemberSearch only ever looks at fullName/email — there is no code path
    // that could accidentally compare against a role or jobTitle string.
    expect(matchesMemberSearch(alex, 'admin')).toBe(false);
  });
});

// TC-04-UNIT-02: Removed-filter combination logic
describe('TC-04-UNIT-02 removed-filter combination', () => {
  const active1: SearchableMember = { id: '1', fullName: 'A', email: 'a@x.com', status: 'active' };
  const active2: SearchableMember = { id: '2', fullName: 'B', email: 'b@x.com', status: 'active' };
  const removed: SearchableMember = { id: '3', fullName: 'C', email: 'c@x.com', status: 'removed' };
  const set = [active1, active2, removed];

  it('shows only active members when showRemoved is false (default)', () => {
    expect(visibleMembers(set)).toEqual([active1, active2]);
    expect(visibleMembers(set, { showRemoved: false })).toEqual([active1, active2]);
  });

  it('shows active and removed together when showRemoved is true', () => {
    expect(visibleMembers(set, { showRemoved: true })).toEqual([active1, active2, removed]);
  });
});

// TC-04-UNIT-03: Search with special characters
describe('TC-04-UNIT-03 search with special characters', () => {
  it.each(['<script>', "'; DROP TABLE", '@#$%'])(
    'returns an empty set for %s without crashing',
    (term) => {
      expect(() => visibleMembers(members, { search: term })).not.toThrow();
      expect(visibleMembers(members, { search: term })).toEqual([]);
    },
  );
});

// TC-04-UNIT-04: Search applies to removed members when showRemoved=true
describe('TC-04-UNIT-04 search + showRemoved composition', () => {
  const alexActive: SearchableMember = {
    id: 'a1',
    fullName: 'Alex Active',
    email: 'active@acme.com',
    status: 'active',
  };
  const alexRemoved: SearchableMember = {
    id: 'a2',
    fullName: 'Alex Removed',
    email: 'removed@acme.com',
    status: 'removed',
  };
  const set = [alexActive, alexRemoved];

  it('matches only the active member when showRemoved is false', () => {
    expect(visibleMembers(set, { search: 'Alex', showRemoved: false })).toEqual([alexActive]);
  });

  it('matches both when showRemoved is true', () => {
    expect(visibleMembers(set, { search: 'Alex', showRemoved: true })).toEqual([
      alexActive,
      alexRemoved,
    ]);
  });
});

// TC-04-UNIT-05: Permission-matrix lookup
describe('TC-04-UNIT-05 permission-matrix lookup', () => {
  const capabilities: MemberCapability[] = ['view-list', 'invite', 'delete-restore', 'edit-detail'];

  it('grants admin every capability', () => {
    for (const capability of capabilities) {
      expect(can('admin', capability)).toBe(true);
    }
  });

  it('grants manager delete/restore', () => {
    expect(can('manager', 'delete-restore')).toBe(true);
  });

  it('denies user delete/restore', () => {
    expect(can('user', 'delete-restore')).toBe(false);
  });

  it('grants viewer read-only list access', () => {
    expect(can('viewer', 'view-list')).toBe(true);
    expect(can('viewer', 'invite')).toBe(false);
    expect(can('viewer', 'delete-restore')).toBe(false);
  });

  it('matches the full matrix exactly for every role', () => {
    const expected: Record<string, Record<MemberCapability, boolean>> = {
      admin: { 'view-list': true, invite: true, 'delete-restore': true, 'edit-detail': true },
      manager: { 'view-list': true, invite: true, 'delete-restore': true, 'edit-detail': true },
      user: { 'view-list': true, invite: false, 'delete-restore': false, 'edit-detail': false },
      viewer: { 'view-list': true, invite: false, 'delete-restore': false, 'edit-detail': false },
    };
    for (const role of ROLE_VALUES) {
      for (const capability of capabilities) {
        expect(can(role, capability)).toBe(expected[role][capability]);
      }
    }
  });
});

describe('MEMBER_MESSAGES', () => {
  it('is verbatim from spec 04 + spec 05 Error Messages tables', () => {
    expect(MEMBER_MESSAGES).toEqual({
      cannotRemoveSelf: 'You cannot remove yourself from the organization',
      lastAdminGuard: 'Organization must retain at least one admin',
      alreadyRemoved: 'Member is already removed',
      deleteForbidden: 'You do not have permission to remove members',
      notRemoved: 'Member is not in removed status',
      restoreForbidden: 'You do not have permission to restore members',
      editForbidden: 'You do not have permission to edit members',
      memberRemoved: 'Cannot edit a removed member',
      roleAuthority: 'You do not have permission to assign this role',
      jobTitleTooLong: 'Job title must be at most 100 characters',
      memberNotFound: 'Member not found',
      viewForbidden: 'You do not have permission to view this member',
    });
  });
});
