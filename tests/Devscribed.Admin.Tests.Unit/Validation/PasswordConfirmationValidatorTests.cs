using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class PasswordConfirmationValidatorTests
{
    [Fact]
    public void Matching_passwords_pass_confirmation()
    {
        Assert.True(PasswordConfirmationValidator.Validate("NewPass1", "NewPass1"));
    }

    [Fact]
    public void Mismatched_passwords_fail_confirmation()
    {
        Assert.False(PasswordConfirmationValidator.Validate("NewPass1", "NewPass2"));
    }

    [Fact]
    public void Empty_confirmation_fails()
    {
        Assert.False(PasswordConfirmationValidator.Validate("NewPass1", ""));
    }
}
