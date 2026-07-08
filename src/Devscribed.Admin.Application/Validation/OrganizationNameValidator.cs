namespace Devscribed.Admin.Application.Validation;

public static class OrganizationNameValidator
{
    public const int MaxLength = 100;

    public static (bool IsValid, string Normalized, string? Error) Validate(string? input)
    {
        var trimmed = (input ?? string.Empty).Trim();

        if (trimmed.Length == 0)
        {
            return (false, trimmed, "organization name is required");
        }

        if (trimmed.Length > MaxLength)
        {
            return (false, trimmed, $"must be at most {MaxLength} characters");
        }

        return (true, trimmed, null);
    }
}
