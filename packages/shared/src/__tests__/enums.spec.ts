import { isMembershipStatus, isRole, MembershipStatus, Role, ROLES } from '../enums';

describe('Role / MembershipStatus enums (spec 03, spec 05)', () => {
  it('exposes exactly the four roles', () => {
    expect(ROLES).toEqual([Role.Admin, Role.Manager, Role.User, Role.Viewer]);
    expect(ROLES).toHaveLength(4);
  });

  it('isRole guards the closed role set', () => {
    expect(isRole('admin')).toBe(true);
    expect(isRole('manager')).toBe(true);
    expect(isRole('superuser')).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });

  it('isMembershipStatus guards the two states', () => {
    expect(isMembershipStatus(MembershipStatus.Active)).toBe(true);
    expect(isMembershipStatus('removed')).toBe(true);
    expect(isMembershipStatus('disabled')).toBe(false);
  });
});
