namespace Devscribed.Admin.Web.Validation;

/// <summary>
/// Simplified per-country phone number format validation. Full libphonenumber metadata is out
/// of scope; this validates national significant number length for a small set of known
/// countries and falls back to a generic E.164-range digit-count check otherwise.
/// </summary>
public static class PhoneValidator
{
    private static readonly Dictionary<string, int> NationalSignificantNumberLength = new()
    {
        ["US"] = 10,
        ["CA"] = 10,
        ["GB"] = 10,
    };

    private static readonly HashSet<string> NanpCountries = new() { "US", "CA" };

    public static bool IsValid(string countryCode, string phoneNumber)
    {
        var digits = new string(phoneNumber.Where(char.IsDigit).ToArray());
        if (digits.Length == 0)
            return false;

        var normalizedCountry = countryCode.ToUpperInvariant();

        if (NationalSignificantNumberLength.TryGetValue(normalizedCountry, out var expectedLength))
        {
            if (NanpCountries.Contains(normalizedCountry) && digits.Length == expectedLength + 1 && digits[0] == '1')
                digits = digits[1..];

            return digits.Length == expectedLength;
        }

        return digits.Length is >= 7 and <= 15;
    }
}
