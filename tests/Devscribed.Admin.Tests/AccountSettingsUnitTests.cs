using Devscribed.Admin.Application.Validation;

namespace Devscribed.Admin.Tests;

/// <summary>TC-07-UNIT-01: Email-format validation.</summary>
public class EmailValidatorTests
{
    [Fact]
    public void Rejects_invalid_email()
    {
        Assert.False(EmailValidator.IsSyntacticallyValid("bad@"));
    }

    [Fact]
    public void Accepts_valid_email()
    {
        Assert.True(EmailValidator.IsSyntacticallyValid("good@acme.com"));
    }
}

/// <summary>TC-07-UNIT-02: Password confirmation and policy.</summary>
public class PasswordPolicyTests
{
    [Fact]
    public void Rejects_short_password()
    {
        var (isValid, _) = PasswordPolicy.Validate("short");
        Assert.False(isValid);
    }

    [Fact]
    public void Accepts_valid_password()
    {
        var (isValid, _) = PasswordPolicy.Validate("NewPass1");
        Assert.True(isValid);
    }
}

/// <summary>TC-07-UNIT-03: Phone format per country code.</summary>
public class PhoneValidatorTests
{
    [Fact]
    public void Accepts_valid_US_number()
    {
        var (isValid, _) = PhoneValidator.Validate("US", "+1 (555) 123-4567");
        Assert.True(isValid);
    }

    [Fact]
    public void Rejects_invalid_US_number()
    {
        var (isValid, error) = PhoneValidator.Validate("US", "12345");
        Assert.False(isValid);
        Assert.Contains("US", error!);
    }

    [Fact]
    public void Accepts_empty_phone()
    {
        var (isValid, _) = PhoneValidator.Validate(null, null);
        Assert.True(isValid);
    }

    [Fact]
    public void Accepts_empty_phone_string()
    {
        var (isValid, _) = PhoneValidator.Validate("", "");
        Assert.True(isValid);
    }
}
