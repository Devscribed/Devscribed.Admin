using Devscribed.Admin.Domain;

namespace Devscribed.Admin.Application.Invitations;

public class AcceptInvitationResult
{
    private AcceptInvitationResult(bool success, Account? account, Organization? organization, Membership? membership, string? error)
    {
        Success = success;
        Account = account;
        Organization = organization;
        Membership = membership;
        Error = error;
    }

    public bool Success { get; }
    public Account? Account { get; }
    public Organization? Organization { get; }
    public Membership? Membership { get; }
    public string? Error { get; }

    public static AcceptInvitationResult Ok(Account account, Organization organization, Membership membership) =>
        new(true, account, organization, membership, null);

    public static AcceptInvitationResult Failed(string error) => new(false, null, null, null, error);
}
