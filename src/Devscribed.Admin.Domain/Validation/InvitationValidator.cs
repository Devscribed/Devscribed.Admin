using Devscribed.Admin.Domain.Enums;

namespace Devscribed.Admin.Domain.Validation;

public static class InvitationValidator
{
    public static InviteValidationResult ValidateInvitePayload(string? email, string? role, string inviterEmail)
    {
        // Validate email
        var emailResult = EmailValidator.Validate(email);
        if (!emailResult.IsValid)
            return InviteValidationResult.Invalid(emailResult.ErrorMessage!);

        var normalizedEmail = emailResult.NormalizedValue!;

        // Validate role
        var trimmedRole = (role ?? string.Empty).Trim();
        if (trimmedRole.Length == 0)
            return InviteValidationResult.Invalid("Role is required");

        if (!Enum.TryParse<MemberRole>(trimmedRole, ignoreCase: true, out var parsedRole))
            return InviteValidationResult.Invalid("Invalid role");

        // Self-invitation check (case-insensitive)
        if (normalizedEmail == inviterEmail.Trim().ToLowerInvariant())
            return InviteValidationResult.Invalid("You cannot invite yourself");

        return InviteValidationResult.Valid(normalizedEmail, parsedRole);
    }

    public static Dictionary<string, string> ValidateAcceptNewAccountPayload(
        string? firstName, string? lastName, string? password)
    {
        var errors = new Dictionary<string, string>();

        var firstNameResult = PersonNameValidator.Validate(firstName, "First name");
        if (!firstNameResult.IsValid)
            errors["firstName"] = firstNameResult.ErrorMessage!;

        var lastNameResult = PersonNameValidator.Validate(lastName, "Last name");
        if (!lastNameResult.IsValid)
            errors["lastName"] = lastNameResult.ErrorMessage!;

        var passwordResult = PasswordValidator.Validate(password);
        if (!passwordResult.IsValid)
            errors["password"] = passwordResult.ErrorMessage!;

        return errors;
    }
}

public readonly struct InviteValidationResult
{
    public bool IsValid { get; }
    public string? ErrorMessage { get; }
    public string? NormalizedEmail { get; }
    public MemberRole? ParsedRole { get; }

    private InviteValidationResult(bool isValid, string? errorMessage, string? normalizedEmail, MemberRole? parsedRole)
    {
        IsValid = isValid;
        ErrorMessage = errorMessage;
        NormalizedEmail = normalizedEmail;
        ParsedRole = parsedRole;
    }

    public static InviteValidationResult Valid(string normalizedEmail, MemberRole parsedRole) =>
        new(true, null, normalizedEmail, parsedRole);

    public static InviteValidationResult Invalid(string errorMessage) =>
        new(false, errorMessage, null, null);
}
