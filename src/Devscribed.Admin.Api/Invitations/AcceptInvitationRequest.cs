namespace Devscribed.Admin.Api.Invitations;

public record AcceptInvitationRequest(
    string? Token,
    string? FirstName,
    string? LastName,
    string? Password,
    string? Timezone,
    bool OrgSwitchConfirmed = false);
