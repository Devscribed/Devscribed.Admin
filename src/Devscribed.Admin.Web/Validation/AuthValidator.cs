namespace Devscribed.Admin.Web.Validation;

public static class AuthValidator
{
    public static string? ValidatePasswordConfirmation(string password, string confirmation)
    {
        if (password != confirmation)
            return "Passwords do not match";
        return null;
    }
}
