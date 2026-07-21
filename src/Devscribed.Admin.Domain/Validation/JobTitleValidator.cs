namespace Devscribed.Admin.Domain.Validation;

public static class JobTitleValidator
{
    public const int MaxLength = 100;

    public static FieldValidationResult Validate(string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();

        if (trimmed.Length > MaxLength)
            return FieldValidationResult.Invalid($"Job title must be at most {MaxLength} characters");

        return FieldValidationResult.Valid(trimmed);
    }
}
