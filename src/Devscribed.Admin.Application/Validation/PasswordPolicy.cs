namespace Devscribed.Admin.Application.Validation;

/// <summary>
/// Shared password policy referenced by spec 01 (signup), 02 (reset), and 07 (change password):
/// minimum 8 characters, at least one letter and one digit.
/// </summary>
public static class PasswordPolicy
{
    public const int MinLength = 8;

    public static (bool IsValid, string? Error) Validate(string? password)
    {
        if (string.IsNullOrEmpty(password))
        {
            return (false, "password is required");
        }

        if (password.Length < MinLength)
        {
            return (false, $"must be at least {MinLength} characters");
        }

        if (!password.Any(char.IsLetter))
        {
            return (false, "must contain at least one letter");
        }

        if (!password.Any(char.IsDigit))
        {
            return (false, "must contain at least one digit");
        }

        return (true, null);
    }
}
