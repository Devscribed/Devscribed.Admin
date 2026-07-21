using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class OrganizationNameValidatorTests
{
    [Fact]
    public void Empty_string_is_invalid_with_required_message()
    {
        var result = OrganizationNameValidator.Validate("");

        Assert.False(result.IsValid);
        Assert.Equal("Organization name is required", result.ErrorMessage);
    }

    [Fact]
    public void Whitespace_only_is_invalid_with_required_message()
    {
        var result = OrganizationNameValidator.Validate("   ");

        Assert.False(result.IsValid);
        Assert.Equal("Organization name is required", result.ErrorMessage);
    }

    [Fact]
    public void Longer_than_100_characters_is_invalid()
    {
        var result = OrganizationNameValidator.Validate(new string('a', 101));

        Assert.False(result.IsValid);
        Assert.Equal("Organization name must be at most 100 characters", result.ErrorMessage);
    }

    [Fact]
    public void Normal_name_is_valid()
    {
        var result = OrganizationNameValidator.Validate("Acme Inc");

        Assert.True(result.IsValid);
        Assert.Equal("Acme Inc", result.NormalizedValue);
    }

    [Fact]
    public void Padded_name_is_valid_and_trimmed()
    {
        var result = OrganizationNameValidator.Validate("  Acme Inc  ");

        Assert.True(result.IsValid);
        Assert.Equal("Acme Inc", result.NormalizedValue);
    }

    [Fact]
    public void Exactly_100_characters_is_valid_boundary()
    {
        var result = OrganizationNameValidator.Validate(new string('a', 100));

        Assert.True(result.IsValid);
    }
}
