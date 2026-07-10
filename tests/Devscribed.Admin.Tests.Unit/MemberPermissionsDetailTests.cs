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
}
