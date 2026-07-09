using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class NameValidationTests
{
    [Theory]
    [InlineData("First name")]
    [InlineData("Last name")]
    public void Empty_returns_required(string label)
    {
        var validate = label == "First name"
            ? SignupValidator.ValidateFirstName
            : (Func<string?, string?>)SignupValidator.ValidateLastName;

        Assert.Equal($"{label} is required", validate(""));
    }

    [Theory]
    [InlineData("First name")]
    [InlineData("Last name")]
    public void Whitespace_only_returns_required(string label)
    {
        var validate = label == "First name"
            ? SignupValidator.ValidateFirstName
            : (Func<string?, string?>)SignupValidator.ValidateLastName;

        Assert.Equal($"{label} is required", validate("   "));
    }

    [Theory]
    [InlineData("First name")]
    [InlineData("Last name")]
    public void Over_50_chars_returns_max_error(string label)
    {
        var validate = label == "First name"
            ? SignupValidator.ValidateFirstName
            : (Func<string?, string?>)SignupValidator.ValidateLastName;

        Assert.Equal($"{label} must be at most 50 characters", validate(new string('A', 51)));
    }

    [Theory]
    [InlineData("John2")]
    [InlineData("John@Doe")]
    public void Invalid_characters_rejected(string value)
    {
        Assert.Equal("First name may contain only letters, hyphens, apostrophes, and spaces",
            SignupValidator.ValidateFirstName(value));
    }

    [Theory]
    [InlineData("Pat")]
    [InlineData("Mary-Jane")]
    [InlineData("O'Brien")]
    [InlineData("Mary Jane")]
    [InlineData("X")]
    public void Valid_names(string value)
    {
        Assert.Null(SignupValidator.ValidateFirstName(value));
        Assert.Null(SignupValidator.ValidateLastName(value));
    }

    [Fact]
    public void Padded_name_is_valid()
    {
        Assert.Null(SignupValidator.ValidateFirstName("  Pat  "));
    }

    [Fact]
    public void Exactly_50_chars_is_valid()
    {
        Assert.Null(SignupValidator.ValidateFirstName(new string('A', 50)));
    }
}
