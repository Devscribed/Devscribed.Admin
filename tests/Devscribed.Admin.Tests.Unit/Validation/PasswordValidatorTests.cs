using Devscribed.Admin.Domain.Validation;

namespace Devscribed.Admin.Tests.Unit.Validation;

public class PasswordValidatorTests
{
    [Fact]
    public void Empty_password_is_invalid_with_required_message()
    {
        var result = PasswordValidator.Validate("");

        Assert.False(result.IsValid);
        Assert.Equal("Password is required", result.ErrorMessage);
    }

    [Fact]
    public void Too_short_password_is_invalid()
    {
        var result = PasswordValidator.Validate("Pass1");

        Assert.False(result.IsValid);
        Assert.Equal("Password must be at least 8 characters", result.ErrorMessage);
    }

    [Fact]
    public void Exactly_8_characters_with_letter_and_digit_is_valid_boundary()
    {
        var result = PasswordValidator.Validate("Passwor1");

        Assert.True(result.IsValid);
        Assert.Equal("Passwor1", result.NormalizedValue);
    }

    [Fact]
    public void Letters_only_is_invalid_missing_digit()
    {
        var result = PasswordValidator.Validate("abcdefgh");

        Assert.False(result.IsValid);
        Assert.Equal("Password must contain at least one digit", result.ErrorMessage);
    }

    [Fact]
    public void Digits_only_is_invalid_missing_letter()
    {
        var result = PasswordValidator.Validate("12345678");

        Assert.False(result.IsValid);
        Assert.Equal("Password must contain at least one letter", result.ErrorMessage);
    }

    [Fact]
    public void Exactly_128_characters_is_valid_boundary()
    {
        var password = "a1" + new string('a', 126);
        Assert.Equal(128, password.Length);

        var result = PasswordValidator.Validate(password);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Longer_than_128_characters_is_invalid()
    {
        var password = "a1" + new string('a', 127);
        Assert.Equal(129, password.Length);

        var result = PasswordValidator.Validate(password);

        Assert.False(result.IsValid);
        Assert.Equal("Password must be at most 128 characters", result.ErrorMessage);
    }

    [Fact]
    public void Six_character_password_error_message_is_exact()
    {
        var result = PasswordValidator.Validate("short1");

        Assert.Equal("Password must be at least 8 characters", result.ErrorMessage);
    }
}
