using Devscribed.Admin.Web.Models;

namespace Devscribed.Admin.Web.Validation;

public static class AccountSettingsValidator
{
    public static string? ValidateTimezone(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "Timezone is required";
        return null;
    }

    public static string? ValidateFirstDayOfWeek(string? value)
    {
        if (value != "Monday" && value != "Sunday")
            return "Invalid first day of week";
        return null;
    }

    public static string? ValidatePhoneCountryCode(string? phoneNumber, string? countryCode)
    {
        if (!string.IsNullOrWhiteSpace(phoneNumber) && string.IsNullOrWhiteSpace(countryCode))
            return "Select a country code";
        return null;
    }

    public static string? ValidatePhoneNumber(string? phoneNumber, string? countryCode)
    {
        if (string.IsNullOrWhiteSpace(phoneNumber))
            return null;
        if (string.IsNullOrWhiteSpace(countryCode))
            return null; // reported via the country-code field instead

        return PhoneValidator.IsValid(countryCode, phoneNumber) ? null : "Enter a valid phone number";
    }

    public static Dictionary<string, string> ValidateAll(UpdateAccountSettingsRequest request)
    {
        var errors = new Dictionary<string, string>();

        var fnErr = SignupValidator.ValidateFirstName(request.FirstName);
        if (fnErr != null) errors["firstName"] = fnErr;

        var lnErr = SignupValidator.ValidateLastName(request.LastName);
        if (lnErr != null) errors["lastName"] = lnErr;

        var countryCodeErr = ValidatePhoneCountryCode(request.PhoneNumber, request.PhoneCountryCode);
        if (countryCodeErr != null)
        {
            errors["phoneCountryCode"] = countryCodeErr;
        }
        else
        {
            var phoneErr = ValidatePhoneNumber(request.PhoneNumber, request.PhoneCountryCode);
            if (phoneErr != null) errors["phoneNumber"] = phoneErr;
        }

        var tzErr = ValidateTimezone(request.Timezone);
        if (tzErr != null) errors["timezone"] = tzErr;

        var fdowErr = ValidateFirstDayOfWeek(request.FirstDayOfWeek);
        if (fdowErr != null) errors["firstDayOfWeek"] = fdowErr;

        return errors;
    }
}
