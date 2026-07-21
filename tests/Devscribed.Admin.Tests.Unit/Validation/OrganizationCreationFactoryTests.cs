using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Domain.Factories;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class OrganizationCreationFactoryTests
{
    [Fact]
    public void Creator_membership_has_admin_role_and_active_status()
    {
        var accountId = Guid.NewGuid();
        var organizationId = Guid.NewGuid();

        var membership = OrganizationCreationFactory.CreateAdminMembership(accountId, organizationId);

        Assert.Equal(MemberRole.Admin, membership.Role);
        Assert.Equal(MembershipStatus.Active, membership.Status);
        Assert.Equal(accountId, membership.AccountId);
        Assert.Equal(organizationId, membership.OrganizationId);
    }
}
