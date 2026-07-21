namespace Devscribed.Admin.Domain.Validation;

public static class FirstDayOfWeekValidator
{
    private static readonly HashSet<string> ValidValues = new(StringComparer.Ordinal) { "Monday", "Sunday" };

    public static FieldValidationResult Validate(string? value)
    {
        var trimmed = (value ?? string.Empty).Trim();

        if (!ValidValues.Contains(trimmed))
            return FieldValidationResult.Invalid("Invalid first day of week");

        return FieldValidationResult.Valid(trimmed);
    }
}
