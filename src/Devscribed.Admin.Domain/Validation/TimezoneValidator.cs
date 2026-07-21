namespace Devscribed.Admin.Domain.Validation;

public static class TimezoneValidator
{
    public static FieldValidationResult Validate(string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();

        if (trimmed.Length == 0)
            return FieldValidationResult.Invalid("Timezone is required");

        return FieldValidationResult.Valid(trimmed);
    }
}
