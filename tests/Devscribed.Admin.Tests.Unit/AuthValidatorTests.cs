using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class AuthValidatorTests
{
    [Fact]
    public void Matching_confirmation_passes()
    {
        Assert.Null(AuthValidator.ValidatePasswordConfirmation("NewPass1", "NewPass1"));
    }

    [Fact]
    public void Mismatched_confirmation_fails()
    {
        Assert.Equal("Passwords do not match",
            AuthValidator.ValidatePasswordConfirmation("NewPass1", "NewPass2"));
    }

    [Fact]
    public void Empty_confirmation_fails()
    {
        Assert.Equal("Passwords do not match",
            AuthValidator.ValidatePasswordConfirmation("NewPass1", ""));
    }
}

public class LoginEmailNormalizationTests
{
    [Fact]
    public void Uppercase_email_normalizes_to_lowercase()
    {
        Assert.Equal("pat@acme.com", SignupValidator.NormalizeEmail("PAT@ACME.COM"));
    }

    [Fact]
    public void Mixed_case_email_normalizes_to_lowercase()
    {
        Assert.Equal("pat.owner@acme.com", SignupValidator.NormalizeEmail("Pat.Owner@Acme.Com"));
    }
}
