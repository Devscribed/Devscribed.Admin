using System.Text.RegularExpressions;

namespace Devscribed.Admin.Domain.Validation;

/// <summary>
/// Validates a person's first or last name per spec 01, requirement 4.
/// </summary>
public static partial class PersonNameValidator
{
    public const int MaxLength = 50;

    [GeneratedRegex(@"^[A-Za-z\-' ]+$")]
    private static partial Regex AllowedCharactersRegex();

    /// <param name="value">The raw field value.</param>
    /// <param name="fieldLabel">Human label used in error messages, e.g. "First name" or "Last name".</param>
    public static FieldValidationResult Validate(string? value, string fieldLabel)
    {
        var trimmed = (value ?? string.Empty).Trim();

        if (trimmed.Length == 0)
            return FieldValidationResult.Invalid($"{fieldLabel} is required");

        if (trimmed.Length > MaxLength)
            return FieldValidationResult.Invalid($"{fieldLabel} must be at most {MaxLength} characters");

        if (!AllowedCharactersRegex().IsMatch(trimmed))
            return FieldValidationResult.Invalid($"{fieldLabel} may contain only letters, hyphens, apostrophes, and spaces");

        return FieldValidationResult.Valid(trimmed);
    }
}
