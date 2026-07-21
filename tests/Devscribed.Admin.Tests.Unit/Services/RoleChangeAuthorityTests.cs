using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Domain.Services;

namespace Devscribed.Admin.Tests.Unit.Services;

public class RoleChangeAuthorityTests
{
    // CanEditMembers
    [Theory]
    [InlineData(MemberRole.Admin, true)]
    [InlineData(MemberRole.Manager, true)]
    [InlineData(MemberRole.User, false)]
    [InlineData(MemberRole.Viewer, false)]
    public void CanEditMembers_returns_correct_result(MemberRole role, bool expected)
    {
        Assert.Equal(expected, MemberPermissions.CanEditMembers(role));
    }

    // Manager CAN change user->manager, user->viewer, viewer->user
    [Theory]
    [InlineData(MemberRole.User, MemberRole.Manager)]
    [InlineData(MemberRole.User, MemberRole.Viewer)]
    [InlineData(MemberRole.Viewer, MemberRole.User)]
    [InlineData(MemberRole.Viewer, MemberRole.Manager)]
    public void Manager_can_change_lower_roles(MemberRole targetCurrent, MemberRole newRole)
    {
        Assert.True(MemberPermissions.CanChangeRole(MemberRole.Manager, targetCurrent, newRole));
    }

    // Manager CANNOT change user->admin, manager->user, admin->user
    [Theory]
    [InlineData(MemberRole.User, MemberRole.Admin)]
    [InlineData(MemberRole.Manager, MemberRole.User)]
    [InlineData(MemberRole.Admin, MemberRole.User)]
    [InlineData(MemberRole.Admin, MemberRole.Manager)]
    [InlineData(MemberRole.Manager, MemberRole.Admin)]
    public void Manager_cannot_change_to_or_from_admin_or_manager_targets(MemberRole targetCurrent, MemberRole newRole)
    {
        Assert.False(MemberPermissions.CanChangeRole(MemberRole.Manager, targetCurrent, newRole));
    }

    // Admin can change any active member to any role
    [Theory]
    [InlineData(MemberRole.User, MemberRole.Admin)]
    [InlineData(MemberRole.User, MemberRole.Manager)]
    [InlineData(MemberRole.User, MemberRole.Viewer)]
    [InlineData(MemberRole.Admin, MemberRole.Manager)]
    [InlineData(MemberRole.Manager, MemberRole.Admin)]
    [InlineData(MemberRole.Viewer, MemberRole.Admin)]
    public void Admin_can_change_any_role(MemberRole targetCurrent, MemberRole newRole)
    {
        Assert.True(MemberPermissions.CanChangeRole(MemberRole.Admin, targetCurrent, newRole));
    }

    // user/viewer cannot change anyone's role
    [Theory]
    [InlineData(MemberRole.User)]
    [InlineData(MemberRole.Viewer)]
    public void User_and_viewer_cannot_change_roles(MemberRole callerRole)
    {
        Assert.False(MemberPermissions.CanChangeRole(callerRole, MemberRole.User, MemberRole.Manager));
    }

    // Same role is not a change -- should return false (no-op)
    [Theory]
    [InlineData(MemberRole.Admin, MemberRole.User, MemberRole.User)]
    [InlineData(MemberRole.Manager, MemberRole.User, MemberRole.User)]
    public void Same_role_is_not_a_change(MemberRole caller, MemberRole targetCurrent, MemberRole newRole)
    {
        Assert.False(MemberPermissions.CanChangeRole(caller, targetCurrent, newRole));
    }

    // GetAvailableRoles
    [Fact]
    public void GetAvailableRoles_admin_viewing_user_returns_all_four()
    {
        var roles = MemberPermissions.GetAvailableRoles(MemberRole.Admin, MemberRole.User);

        Assert.Equal(new[] { MemberRole.Admin, MemberRole.Manager, MemberRole.User, MemberRole.Viewer }, roles);
    }

    [Fact]
    public void GetAvailableRoles_manager_viewing_user_returns_manager_user_viewer()
    {
        var roles = MemberPermissions.GetAvailableRoles(MemberRole.Manager, MemberRole.User);

        Assert.Equal(new[] { MemberRole.Manager, MemberRole.User, MemberRole.Viewer }, roles);
    }

    [Fact]
    public void GetAvailableRoles_manager_viewing_admin_returns_empty()
    {
        var roles = MemberPermissions.GetAvailableRoles(MemberRole.Manager, MemberRole.Admin);

        Assert.Empty(roles);
    }

    [Fact]
    public void GetAvailableRoles_user_viewing_anyone_returns_empty()
    {
        var roles = MemberPermissions.GetAvailableRoles(MemberRole.User, MemberRole.User);

        Assert.Empty(roles);
    }

    [Fact]
    public void GetAvailableRoles_viewer_viewing_anyone_returns_empty()
    {
        var roles = MemberPermissions.GetAvailableRoles(MemberRole.Viewer, MemberRole.User);

        Assert.Empty(roles);
    }
}
