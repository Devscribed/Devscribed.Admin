using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class PersonNameValidatorTests
{
    [Fact]
    public void Empty_first_name_is_invalid_with_required_message()
    {
        var result = PersonNameValidator.Validate("", "First name");

        Assert.False(result.IsValid);
        Assert.Equal("First name is required", result.ErrorMessage);
    }

    [Fact]
    public void Empty_last_name_is_invalid_with_required_message()
    {
        var result = PersonNameValidator.Validate("", "Last name");

        Assert.False(result.IsValid);
        Assert.Equal("Last name is required", result.ErrorMessage);
    }

    [Fact]
    public void Whitespace_only_is_invalid_with_required_message()
    {
        var result = PersonNameValidator.Validate("   ", "First name");

        Assert.False(result.IsValid);
        Assert.Equal("First name is required", result.ErrorMessage);
    }

    [Fact]
    public void Longer_than_50_characters_is_invalid()
    {
        var result = PersonNameValidator.Validate(new string('a', 51), "First name");

        Assert.False(result.IsValid);
        Assert.Equal("First name must be at most 50 characters", result.ErrorMessage);
    }

    [Fact]
    public void Name_with_digits_is_invalid()
    {
        var result = PersonNameValidator.Validate("John2", "First name");

        Assert.False(result.IsValid);
        Assert.Equal("First name may contain only letters, hyphens, apostrophes, and spaces", result.ErrorMessage);
    }

    [Fact]
    public void Name_with_special_characters_is_invalid()
    {
        var result = PersonNameValidator.Validate("John@Doe", "First name");

        Assert.False(result.IsValid);
        Assert.Equal("First name may contain only letters, hyphens, apostrophes, and spaces", result.ErrorMessage);
    }

    [Theory]
    [InlineData("Pat")]
    [InlineData("Mary-Jane")]
    [InlineData("O'Brien")]
    [InlineData("Mary Jane")]
    [InlineData("X")]
    public void Valid_names_are_accepted(string name)
    {
        var result = PersonNameValidator.Validate(name, "First name");

        Assert.True(result.IsValid);
        Assert.Equal(name, result.NormalizedValue);
    }

    [Fact]
    public void Padded_name_is_valid_and_trimmed()
    {
        var result = PersonNameValidator.Validate("  Pat  ", "First name");

        Assert.True(result.IsValid);
        Assert.Equal("Pat", result.NormalizedValue);
    }

    [Fact]
    public void Exactly_50_characters_is_valid_boundary()
    {
        var result = PersonNameValidator.Validate(new string('a', 50), "First name");

        Assert.True(result.IsValid);
    }
}
