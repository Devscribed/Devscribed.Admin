namespace Devscribed.Admin.Domain.Validation;

public static class PasswordValidator
{
    public const int MinLength = 8;
    public const int MaxLength = 128;

    /// <summary>
    /// Validates a password per spec 01, requirement 3. Passwords are not trimmed or
    /// otherwise normalized — whitespace is significant in a password.
    /// </summary>
    public static FieldValidationResult Validate(string? value)
    {
        var password = value ?? string.Empty;

        if (password.Length == 0)
            return FieldValidationResult.Invalid("Password is required");

        if (password.Length < MinLength)
            return FieldValidationResult.Invalid($"Password must be at least {MinLength} characters");

        if (password.Length > MaxLength)
            return FieldValidationResult.Invalid($"Password must be at most {MaxLength} characters");

        if (!password.Any(char.IsLetter))
            return FieldValidationResult.Invalid("Password must contain at least one letter");

        if (!password.Any(char.IsDigit))
            return FieldValidationResult.Invalid("Password must contain at least one digit");

        return FieldValidationResult.Valid(password);
    }
}
