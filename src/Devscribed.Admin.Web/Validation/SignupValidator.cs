using System.Text.RegularExpressions;

namespace Devscribed.Admin.Web.Validation;

public static partial class SignupValidator
{
    public static string? ValidateOrgName(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
            return "Organization name is required";
        if (trimmed.Length > 100)
            return "Organization name must be at most 100 characters";
        return null;
    }

    public static string? ValidateFirstName(string? value)
    {
        return ValidateName(value, "First name");
    }

    public static string? ValidateLastName(string? value)
    {
        return ValidateName(value, "Last name");
    }

    private static string? ValidateName(string? value, string fieldLabel)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
            return $"{fieldLabel} is required";
        if (trimmed.Length > 50)
            return $"{fieldLabel} must be at most 50 characters";
        if (!NamePattern().IsMatch(trimmed))
            return $"{fieldLabel} may contain only letters, hyphens, apostrophes, and spaces";
        return null;
    }

    public static string? ValidateEmail(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return "Email is required";
        if (value.Length > 254)
            return "Email must be at most 254 characters";
        if (!EmailPattern().IsMatch(value))
            return "Enter a valid email address";
        return null;
    }

    public static string? ValidatePassword(string? value)
    {
        if (string.IsNullOrEmpty(value))
            return "Password is required";
        if (value.Length < 8)
            return "Password must be at least 8 characters";
        if (value.Length > 128)
            return "Password must be at most 128 characters";
        if (!value.Any(char.IsLetter))
            return "Password must contain at least one letter";
        if (!value.Any(char.IsDigit))
            return "Password must contain at least one digit";
        return null;
    }

    public static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    public static Dictionary<string, string> ValidateAll(Models.SignupRequest request)
    {
        var errors = new Dictionary<string, string>();

        var orgErr = ValidateOrgName(request.OrgName);
        if (orgErr != null) errors["orgName"] = orgErr;

        var fnErr = ValidateFirstName(request.FirstName);
        if (fnErr != null) errors["firstName"] = fnErr;

        var lnErr = ValidateLastName(request.LastName);
        if (lnErr != null) errors["lastName"] = lnErr;

        var emErr = ValidateEmail(request.Email);
        if (emErr != null) errors["email"] = emErr;

        var pwErr = ValidatePassword(request.Password);
        if (pwErr != null) errors["password"] = pwErr;

        return errors;
    }

    [GeneratedRegex(@"^[\p{L}\s'\-]+$")]
    private static partial Regex NamePattern();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    private static partial Regex EmailPattern();
}
