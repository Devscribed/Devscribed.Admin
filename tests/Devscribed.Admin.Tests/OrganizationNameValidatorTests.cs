using Devscribed.Admin.Application.Validation;
using Xunit;

namespace Devscribed.Admin.Tests;

/// <summary>TC-01-UNIT-01: Organization-name validation.</summary>
public class OrganizationNameValidatorTests
{
    [Fact]
    public void Empty_string_is_invalid()
    {
        var (isValid, _, error) = OrganizationNameValidator.Validate("");

        Assert.False(isValid);
        Assert.Equal("organization name is required", error);
    }

    [Fact]
    public void Whitespace_only_is_invalid()
    {
        var (isValid, _, error) = OrganizationNameValidator.Validate("   ");

        Assert.False(isValid);
        Assert.Equal("organization name is required", error);
    }

    [Fact]
    public void Too_long_name_is_invalid()
    {
        var name = new string('a', 101);

        var (isValid, _, error) = OrganizationNameValidator.Validate(name);

        Assert.False(isValid);
        Assert.Equal("must be at most 100 characters", error);
    }

    [Fact]
    public void Normal_name_is_valid()
    {
        var (isValid, normalized, error) = OrganizationNameValidator.Validate("Acme Inc");

        Assert.True(isValid);
        Assert.Equal("Acme Inc", normalized);
        Assert.Null(error);
    }

    [Fact]
    public void Padded_name_is_valid_and_normalized()
    {
        var (isValid, normalized, error) = OrganizationNameValidator.Validate("  Acme Inc  ");

        Assert.True(isValid);
        Assert.Equal("Acme Inc", normalized);
        Assert.Null(error);
    }
}
