namespace Devscribed.Admin.Application.Invitations;

public interface IInvitationEmailSender
{
    Task SendInvitationAsync(string email, string token, CancellationToken ct = default);
}
