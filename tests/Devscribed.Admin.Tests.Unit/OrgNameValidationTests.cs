using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class OrgNameValidationTests
{
    [Fact]
    public void Empty_returns_required()
    {
        Assert.Equal("Organization name is required", SignupValidator.ValidateOrgName(""));
    }

    [Fact]
    public void Whitespace_only_returns_required()
    {
        Assert.Equal("Organization name is required", SignupValidator.ValidateOrgName("   "));
    }

    [Fact]
    public void Over_100_chars_returns_max_error()
    {
        var name = new string('A', 101);
        Assert.Equal("Organization name must be at most 100 characters", SignupValidator.ValidateOrgName(name));
    }

    [Fact]
    public void Normal_name_is_valid()
    {
        Assert.Null(SignupValidator.ValidateOrgName("Acme Inc"));
    }

    [Fact]
    public void Padded_name_is_valid()
    {
        Assert.Null(SignupValidator.ValidateOrgName("  Acme Inc  "));
    }

    [Fact]
    public void Exactly_100_chars_is_valid()
    {
        var name = new string('A', 100);
        Assert.Null(SignupValidator.ValidateOrgName(name));
    }
}
