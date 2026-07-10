using Devscribed.Admin.Web.Services;

namespace Devscribed.Admin.Tests.Unit;

public class MemberPermissionsDetailTests
{
    // TC-05-UNIT-03: Manager role-change authority on detail page
    [Theory]
    [InlineData("user", "manager", true)]
    [InlineData("user", "viewer", true)]
    [InlineData("viewer", "user", true)]
    [InlineData("user", "admin", false)]
    [InlineData("manager", "user", false)]
    [InlineData("admin", "user", false)]
    public void Manager_role_change_authority_matches_spec(string targetRole, string newRole, bool expectedAllowed)
    {
        var canEditRole = MemberPermissions.CanEditRole("manager", targetRole, "active");
        var canAssignRole = MemberPermissions.CanAssignRole("manager", newRole);

        Assert.Equal(expectedAllowed, canEditRole && canAssignRole);
    }

    // TC-07: Vacation tab visibility per role
    [Theory]
    [InlineData("admin", false, true)]
    [InlineData("admin", true, true)]
    [InlineData("manager", false, true)]
    [InlineData("manager", true, true)]
    [InlineData("user", true, true)]
    [InlineData("user", false, false)]
    [InlineData("viewer", true, false)]
    [InlineData("viewer", false, false)]
    public void Can_view_vacation_matches_spec(string callerRole, bool isOwnMembership, bool expected)
    {
        Assert.Equal(expected, MemberPermissions.CanViewVacation(callerRole, isOwnMembership));
    }
}
