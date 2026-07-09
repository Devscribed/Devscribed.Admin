using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class EmailValidationTests
{
    [Fact]
    public void Empty_returns_required()
    {
        Assert.Equal("Email is required", SignupValidator.ValidateEmail(""));
    }

    [Theory]
    [InlineData("not-an-email")]
    [InlineData("missing@")]
    [InlineData("@nodomain.com")]
    [InlineData("user@example")]
    public void Invalid_format(string value)
    {
        Assert.Equal("Enter a valid email address", SignupValidator.ValidateEmail(value));
    }

    [Fact]
    public void Valid_email()
    {
        Assert.Null(SignupValidator.ValidateEmail("user@example.com"));
    }

    [Fact]
    public void Exactly_254_chars_is_valid()
    {
        var local = new string('a', 243);
        var email = $"{local}@test.co.uk";
        Assert.True(email.Length == 254);
        Assert.Null(SignupValidator.ValidateEmail(email));
    }

    [Fact]
    public void Over_254_chars_returns_max_error()
    {
        var local = new string('a', 244);
        var email = $"{local}@test.co.uk";
        Assert.True(email.Length == 255);
        Assert.Equal("Email must be at most 254 characters", SignupValidator.ValidateEmail(email));
    }

    [Fact]
    public void Normalization_lowercases()
    {
        Assert.Equal("pat@acme.com", SignupValidator.NormalizeEmail("PAT@ACME.COM"));
        Assert.Equal("pat.owner@acme.com", SignupValidator.NormalizeEmail("Pat.Owner@Acme.Com"));
        Assert.Equal("pat@acme.com", SignupValidator.NormalizeEmail("pat@acme.com"));
    }
}
