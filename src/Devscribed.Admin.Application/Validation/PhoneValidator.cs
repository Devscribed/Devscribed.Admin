using System.Text.RegularExpressions;

namespace Devscribed.Admin.Application.Validation;

public static partial class PhoneValidator
{
    private static readonly Dictionary<string, Regex> CountryPatterns = new()
    {
        ["US"] = UsPhoneRegex(),
        ["GB"] = GbPhoneRegex(),
        ["DE"] = DePhoneRegex(),
        ["FR"] = FrPhoneRegex(),
    };

    public static (bool IsValid, string? Error) Validate(string? countryCode, string? phoneNumber)
    {
        if (string.IsNullOrWhiteSpace(phoneNumber))
            return (true, null);

        if (string.IsNullOrWhiteSpace(countryCode))
            return (false, "country code is required when phone number is provided");

        var digits = DigitsOnly().Replace(phoneNumber, "");

        if (!CountryPatterns.TryGetValue(countryCode.ToUpperInvariant(), out var pattern))
            return digits.Length is >= 7 and <= 15 ? (true, null) : (false, "invalid phone number");

        return pattern.IsMatch(digits)
            ? (true, null)
            : (false, $"invalid phone number for {countryCode.ToUpperInvariant()}");
    }

    [GeneratedRegex(@"[^\d]")]
    private static partial Regex DigitsOnly();

    [GeneratedRegex(@"^1?\d{10}$")]
    private static partial Regex UsPhoneRegex();

    [GeneratedRegex(@"^44?\d{10,11}$")]
    private static partial Regex GbPhoneRegex();

    [GeneratedRegex(@"^49?\d{10,12}$")]
    private static partial Regex DePhoneRegex();

    [GeneratedRegex(@"^33?\d{9,10}$")]
    private static partial Regex FrPhoneRegex();
}
