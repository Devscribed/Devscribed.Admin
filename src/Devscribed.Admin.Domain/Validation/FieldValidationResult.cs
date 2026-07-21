namespace Devscribed.Admin.Domain.Validation;

/// <summary>
/// Result of validating a single field. On success, <see cref="NormalizedValue"/>
/// carries the trimmed/normalized value to persist.
/// </summary>
public readonly struct FieldValidationResult
{
    public bool IsValid { get; }
    public string? ErrorMessage { get; }
    public string? NormalizedValue { get; }

    private FieldValidationResult(bool isValid, string? errorMessage, string? normalizedValue)
    {
        IsValid = isValid;
        ErrorMessage = errorMessage;
        NormalizedValue = normalizedValue;
    }

    public static FieldValidationResult Valid(string normalizedValue) =>
        new(true, null, normalizedValue);

    public static FieldValidationResult Invalid(string errorMessage) =>
        new(false, errorMessage, null);
}
