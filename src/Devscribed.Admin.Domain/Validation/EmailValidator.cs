using System.Text.RegularExpressions;

namespace Devscribed.Admin.Domain.Validation;

public static partial class EmailValidator
{
    public const int MaxLength = 254;

    [GeneratedRegex(@"^[^\s@]+@[^\s@]+\.[^\s@]+$")]
    private static partial Regex EmailFormatRegex();

    /// <summary>
    /// Validates and normalizes an email address per spec 01, requirements 2 and 13.
    /// The normalized value is lowercased.
    /// </summary>
    public static FieldValidationResult Validate(string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();

        if (trimmed.Length == 0)
            return FieldValidationResult.Invalid("Email is required");

        if (!EmailFormatRegex().IsMatch(trimmed))
            return FieldValidationResult.Invalid("Enter a valid email address");

        if (trimmed.Length > MaxLength)
            return FieldValidationResult.Invalid($"Email must be at most {MaxLength} characters");

        return FieldValidationResult.Valid(trimmed.ToLowerInvariant());
    }

    /// <summary>
    /// Normalizes an already-valid email to lowercase, matching the storage/uniqueness rule.
    /// </summary>
    public static string Normalize(string value) => value.Trim().ToLowerInvariant();
}
