import { createAdminMembershipInput } from '../membership';
import { MembershipStatus, Role } from '../enums';

describe('createAdminMembershipInput — TC-01-UNIT-02: Creator is assigned the admin role', () => {
  it('produces a membership with role `admin` and status `active`', () => {
    const membership = createAdminMembershipInput();
    expect(membership.role).toBe(Role.Admin);
    expect(membership.status).toBe(MembershipStatus.Active);
  });

  it('records the supplied joined date', () => {
    const joinedAt = new Date('2026-07-08T12:00:00.000Z');
    const membership = createAdminMembershipInput(joinedAt);
    expect(membership.joinedAt).toBe(joinedAt);
  });
});
