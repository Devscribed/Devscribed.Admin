namespace Devscribed.Admin.Domain.Validation;

public static class PasswordConfirmationValidator
{
    public const string MismatchMessage = "Passwords do not match";

    public static bool Validate(string? password, string? confirmation) =>
        password == confirmation;
}
