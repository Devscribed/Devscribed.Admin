using Devscribed.Admin.Domain;
using Xunit;

namespace Devscribed.Admin.Tests;

/// <summary>TC-01-UNIT-02: Creator is assigned the admin role.</summary>
public class AdminMembershipFactoryTests
{
    [Fact]
    public void CreateAdmin_produces_active_admin_membership()
    {
        var accountId = Guid.NewGuid();
        var organizationId = Guid.NewGuid();

        var membership = Membership.CreateAdmin(accountId, organizationId);

        Assert.Equal(MembershipRole.Admin, membership.Role);
        Assert.Equal(MembershipStatus.Active, membership.Status);
        Assert.Equal(accountId, membership.AccountId);
        Assert.Equal(organizationId, membership.OrganizationId);
    }
}
