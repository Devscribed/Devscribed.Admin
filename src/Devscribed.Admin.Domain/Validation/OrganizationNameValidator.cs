namespace Devscribed.Admin.Domain.Validation;

public static class OrganizationNameValidator
{
    public const int MaxLength = 100;

    public static FieldValidationResult Validate(string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();

        if (trimmed.Length == 0)
            return FieldValidationResult.Invalid("Organization name is required");

        if (trimmed.Length > MaxLength)
            return FieldValidationResult.Invalid($"Organization name must be at most {MaxLength} characters");

        return FieldValidationResult.Valid(trimmed);
    }
}
