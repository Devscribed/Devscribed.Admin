using Devscribed.Admin.Web.Validation;

namespace Devscribed.Admin.Tests.Unit;

public class PasswordValidationTests
{
    [Fact]
    public void Empty_returns_required()
    {
        Assert.Equal("Password is required", SignupValidator.ValidatePassword(""));
    }

    [Fact]
    public void Too_short()
    {
        Assert.Equal("Password must be at least 8 characters", SignupValidator.ValidatePassword("short1"));
    }

    [Fact]
    public void Exactly_8_chars_with_letter_and_digit_is_valid()
    {
        Assert.Null(SignupValidator.ValidatePassword("Passwor1"));
    }

    [Fact]
    public void No_digit()
    {
        Assert.Equal("Password must contain at least one digit", SignupValidator.ValidatePassword("abcdefgh"));
    }

    [Fact]
    public void No_letter()
    {
        Assert.Equal("Password must contain at least one letter", SignupValidator.ValidatePassword("12345678"));
    }

    [Fact]
    public void Exactly_128_chars_is_valid()
    {
        var pw = new string('a', 127) + "1";
        Assert.Equal(128, pw.Length);
        Assert.Null(SignupValidator.ValidatePassword(pw));
    }

    [Fact]
    public void Over_128_chars()
    {
        var pw = new string('a', 128) + "1";
        Assert.Equal("Password must be at most 128 characters", SignupValidator.ValidatePassword(pw));
    }

    [Fact]
    public void Error_messages_are_rule_specific()
    {
        Assert.Equal("Password is required", SignupValidator.ValidatePassword(""));
        Assert.Equal("Password must be at least 8 characters", SignupValidator.ValidatePassword("short1"));
        Assert.Equal("Password must contain at least one digit", SignupValidator.ValidatePassword("abcdefgh"));
        Assert.Equal("Password must contain at least one letter", SignupValidator.ValidatePassword("12345678"));
        Assert.Equal("Password must be at most 128 characters",
            SignupValidator.ValidatePassword(new string('a', 128) + "1"));
    }
}
