using System.Text.RegularExpressions;

namespace Devscribed.Admin.Domain.Validation;

/// <summary>
/// Validates phone number and country code together.
/// Phone is optional — both empty is fine.
/// If a phone number is provided, a country code must also be selected.
/// </summary>
public static partial class PhoneValidator
{
    // Basic phone patterns per country code.
    // Accepts digits, spaces, parentheses, hyphens, plus sign, and dots.
    // Validates minimum digit count for the country.
    [GeneratedRegex(@"^[\d\s\(\)\-\+\.]+$")]
    private static partial Regex PhoneFormatRegex();

    private static int CountDigits(string value) =>
        value.Count(char.IsDigit);

    /// <summary>
    /// Returns validation errors as a dictionary of field -> error message.
    /// Empty dictionary means valid.
    /// </summary>
    public static Dictionary<string, string> Validate(string? countryCode, string? phoneNumber)
    {
        var errors = new Dictionary<string, string>();
        var code = (countryCode ?? string.Empty).Trim();
        var number = (phoneNumber ?? string.Empty).Trim();

        // Both empty is fine — phone is optional
        if (code.Length == 0 && number.Length == 0)
            return errors;

        // Number provided without country code
        if (code.Length == 0 && number.Length > 0)
        {
            errors["phoneCountryCode"] = "Select a country code";
            return errors;
        }

        // Country code provided without number — clear both (treat as clearing phone)
        if (code.Length > 0 && number.Length == 0)
        {
            return errors;
        }

        // Both provided — validate format
        if (!PhoneFormatRegex().IsMatch(number))
        {
            errors["phoneNumber"] = "Enter a valid phone number";
            return errors;
        }

        var digitCount = CountDigits(number);

        // Basic validation: most countries have at least 7 digits
        if (digitCount < 7)
        {
            errors["phoneNumber"] = "Enter a valid phone number";
            return errors;
        }

        return errors;
    }
}
