using Devscribed.Admin.Domain;

namespace Devscribed.Admin.Tests;

/// <summary>TC-03-UNIT-01: Permission-matrix lookup for every cell.</summary>
public class PermissionsTests
{
    [Theory]
    [InlineData(MembershipRole.Admin, Capability.ViewMembers, true)]
    [InlineData(MembershipRole.Admin, Capability.ViewMemberDetail, true)]
    [InlineData(MembershipRole.Admin, Capability.EditOwnSettings, true)]
    [InlineData(MembershipRole.Admin, Capability.InviteMembers, true)]
    [InlineData(MembershipRole.Admin, Capability.DeleteRestoreMembers, true)]
    [InlineData(MembershipRole.Admin, Capability.ChangeRoles, true)]
    [InlineData(MembershipRole.Manager, Capability.ViewMembers, true)]
    [InlineData(MembershipRole.Manager, Capability.ViewMemberDetail, true)]
    [InlineData(MembershipRole.Manager, Capability.EditOwnSettings, true)]
    [InlineData(MembershipRole.Manager, Capability.InviteMembers, true)]
    [InlineData(MembershipRole.Manager, Capability.DeleteRestoreMembers, true)]
    [InlineData(MembershipRole.Manager, Capability.ChangeRoles, false)]
    [InlineData(MembershipRole.User, Capability.ViewMembers, true)]
    [InlineData(MembershipRole.User, Capability.ViewMemberDetail, true)]
    [InlineData(MembershipRole.User, Capability.EditOwnSettings, true)]
    [InlineData(MembershipRole.User, Capability.InviteMembers, false)]
    [InlineData(MembershipRole.User, Capability.DeleteRestoreMembers, false)]
    [InlineData(MembershipRole.User, Capability.ChangeRoles, false)]
    [InlineData(MembershipRole.Viewer, Capability.ViewMembers, true)]
    [InlineData(MembershipRole.Viewer, Capability.ViewMemberDetail, true)]
    [InlineData(MembershipRole.Viewer, Capability.EditOwnSettings, true)]
    [InlineData(MembershipRole.Viewer, Capability.InviteMembers, false)]
    [InlineData(MembershipRole.Viewer, Capability.DeleteRestoreMembers, false)]
    [InlineData(MembershipRole.Viewer, Capability.ChangeRoles, false)]
    public void Permission_matrix_matches_spec(MembershipRole role, Capability capability, bool expected)
    {
        Assert.Equal(expected, Permissions.Can(role, capability));
    }
}
