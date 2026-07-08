using Devscribed.Admin.Domain;

namespace Devscribed.Admin.Application.Invitations;

public class InviteMemberResult
{
    private InviteMemberResult(bool success, Invitation? invitation, string? error)
    {
        Success = success;
        Invitation = invitation;
        Error = error;
    }

    public bool Success { get; }
    public Invitation? Invitation { get; }
    public string? Error { get; }

    public static InviteMemberResult Ok(Invitation invitation) => new(true, invitation, null);
    public static InviteMemberResult Failed(string error) => new(false, null, error);
}
