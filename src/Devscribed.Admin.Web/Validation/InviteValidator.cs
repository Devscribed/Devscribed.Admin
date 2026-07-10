namespace Devscribed.Admin.Web.Validation;

public static class InviteValidator
{
    private static readonly string[] ValidRoles = ["admin", "manager", "user", "viewer"];

    public static string? ValidateEmail(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
            return "Email is required";
        return SignupValidator.ValidateEmail(value);
    }

    public static string? ValidateRole(string? value)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed))
            return "Role is required";
        if (!ValidRoles.Contains(trimmed))
            return "Invalid role";
        return null;
    }

    public static string? ValidateNotSelfInvite(string inviterEmail, string inviteeEmail)
    {
        var normalizedInviter = SignupValidator.NormalizeEmail(inviterEmail);
        var normalizedInvitee = SignupValidator.NormalizeEmail(inviteeEmail);
        return normalizedInviter == normalizedInvitee ? "You cannot invite yourself" : null;
    }
}
