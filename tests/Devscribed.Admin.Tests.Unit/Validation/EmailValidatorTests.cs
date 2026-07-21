using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class EmailValidatorTests
{
    [Fact]
    public void Empty_email_is_invalid_with_required_message()
    {
        var result = EmailValidator.Validate("");

        Assert.False(result.IsValid);
        Assert.Equal("Email is required", result.ErrorMessage);
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("missing@")]
    [InlineData("@nodomain.com")]
    [InlineData("user@example")]
    public void Invalid_format_is_rejected(string email)
    {
        var result = EmailValidator.Validate(email);

        Assert.False(result.IsValid);
        Assert.Equal("Enter a valid email address", result.ErrorMessage);
    }

    [Fact]
    public void Valid_email_is_accepted()
    {
        var result = EmailValidator.Validate("user@example.com");

        Assert.True(result.IsValid);
        Assert.Equal("user@example.com", result.NormalizedValue);
    }

    [Fact]
    public void Exactly_254_characters_is_valid_boundary()
    {
        var local = new string('a', 254 - "@example.com".Length);
        var email = local + "@example.com";
        Assert.Equal(254, email.Length);

        var result = EmailValidator.Validate(email);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Longer_than_254_characters_is_invalid()
    {
        var local = new string('a', 255 - "@example.com".Length);
        var email = local + "@example.com";
        Assert.Equal(255, email.Length);

        var result = EmailValidator.Validate(email);

        Assert.False(result.IsValid);
        Assert.Equal("Email must be at most 254 characters", result.ErrorMessage);
    }

    [Theory]
    [InlineData("PAT@ACME.COM", "pat@acme.com")]
    [InlineData("Pat.Owner@Acme.Com", "pat.owner@acme.com")]
    [InlineData("pat@acme.com", "pat@acme.com")]
    public void Email_is_normalized_to_lowercase(string input, string expected)
    {
        var result = EmailValidator.Validate(input);

        Assert.True(result.IsValid);
        Assert.Equal(expected, result.NormalizedValue);
    }
}
