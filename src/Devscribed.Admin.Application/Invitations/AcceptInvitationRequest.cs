namespace Devscribed.Admin.Application.Invitations;

public record AcceptInvitationRequest(string Token, string? FirstName, string? LastName, string? Password);
