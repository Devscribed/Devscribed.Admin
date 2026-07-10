using Devscribed.Admin.Web.Models;

namespace Devscribed.Admin.Web.Validation;

public static class ChangePasswordValidator
{
    /// <summary>
    /// Validates request field formats/policy only (not the current-password's correctness,
    /// which requires a database lookup and is checked by the service).
    /// </summary>
    public static string? ValidateFields(ChangePasswordRequest request)
    {
        if (string.IsNullOrEmpty(request.CurrentPassword))
            return "Current password is required";

        var passwordError = SignupValidator.ValidatePassword(request.NewPassword);
        if (passwordError != null)
            return passwordError;

        if (string.IsNullOrEmpty(request.PasswordConfirmation))
            return "Please confirm your new password";

        if (request.NewPassword != request.PasswordConfirmation)
            return "Passwords do not match";

        return null;
    }
}
