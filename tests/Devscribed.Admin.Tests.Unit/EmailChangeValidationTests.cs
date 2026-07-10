using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

/// <summary>
/// Change-email uses the same shared email validation/normalization rules as spec 01
/// (SignupValidator). These tests document the specific behaviors spec 06 test cases
/// TC-06-UNIT-01, 05, 08, and 13 rely on.
/// </summary>
public class EmailChangeValidationTests
{
    // TC-06-UNIT-01: Email-format validation
    [Fact]
    public void Bad_format_is_invalid()
    {
        Assert.Equal("Enter a valid email address", SignupValidator.ValidateEmail("bad@"));
    }

    [Fact]
    public void Good_email_is_valid_and_normalized()
    {
        Assert.Null(SignupValidator.ValidateEmail("good@acme.com"));
        Assert.Equal("good@acme.com", SignupValidator.NormalizeEmail("good@acme.com"));
    }

    [Fact]
    public void Uppercase_email_normalizes_to_lowercase()
    {
        Assert.Null(SignupValidator.ValidateEmail("GOOD@ACME.COM"));
        Assert.Equal("good@acme.com", SignupValidator.NormalizeEmail("GOOD@ACME.COM"));
    }

    // TC-06-UNIT-05: Email normalization
    [Fact]
    public void Normalizes_all_uppercase()
    {
        Assert.Equal("new@acme.com", SignupValidator.NormalizeEmail("NEW@ACME.COM"));
    }

    [Fact]
    public void Normalizes_mixed_case_with_dot()
    {
        Assert.Equal("new.email@acme.com", SignupValidator.NormalizeEmail("New.Email@Acme.Com"));
    }

    // TC-06-UNIT-08: Same-as-current email guard
    [Theory]
    [InlineData("pat@acme.com", "pat@acme.com", true)]
    [InlineData("pat@acme.com", "PAT@ACME.COM", true)]
    [InlineData("pat@acme.com", "new@acme.com", false)]
    public void Same_as_current_guard(string currentEmail, string requestedEmail, bool isSame)
    {
        var normalized = SignupValidator.NormalizeEmail(requestedEmail);
        Assert.Equal(isSame, string.Equals(currentEmail, normalized, StringComparison.OrdinalIgnoreCase));
    }

    // TC-06-UNIT-13: Email max-length boundary
    [Fact]
    public void Exactly_254_chars_is_valid()
    {
        var local = new string('a', 243);
        var email = $"{local}@test.co.uk";
        Assert.Equal(254, email.Length);
        Assert.Null(SignupValidator.ValidateEmail(email));
    }

    [Fact]
    public void Over_254_chars_is_invalid()
    {
        var local = new string('a', 244);
        var email = $"{local}@test.co.uk";
        Assert.Equal(255, email.Length);
        Assert.Equal("Email must be at most 254 characters", SignupValidator.ValidateEmail(email));
    }
}
