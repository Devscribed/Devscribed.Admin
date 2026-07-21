using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Domain.Services;

namespace Devscribed.Admin.Tests.Unit.Services;

public class MemberPermissionsTests
{
    [Theory]
    [InlineData(MemberRole.Admin, true)]
    [InlineData(MemberRole.Manager, true)]
    [InlineData(MemberRole.User, true)]
    [InlineData(MemberRole.Viewer, true)]
    public void CanViewList_returns_correct_result_for_each_role(MemberRole role, bool expected)
    {
        Assert.Equal(expected, MemberPermissions.CanViewList(role));
    }

    [Theory]
    [InlineData(MemberRole.Admin, true)]
    [InlineData(MemberRole.Manager, true)]
    [InlineData(MemberRole.User, false)]
    [InlineData(MemberRole.Viewer, false)]
    public void CanInvite_returns_correct_result_for_each_role(MemberRole role, bool expected)
    {
        Assert.Equal(expected, MemberPermissions.CanInvite(role));
    }

    [Theory]
    [InlineData(MemberRole.Admin, true)]
    [InlineData(MemberRole.Manager, true)]
    [InlineData(MemberRole.User, false)]
    [InlineData(MemberRole.Viewer, false)]
    public void CanDeleteRestore_returns_correct_result_for_each_role(MemberRole role, bool expected)
    {
        Assert.Equal(expected, MemberPermissions.CanDeleteRestore(role));
    }
}
