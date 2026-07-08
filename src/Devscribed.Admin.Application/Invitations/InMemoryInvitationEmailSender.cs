using System.Collections.Concurrent;

namespace Devscribed.Admin.Application.Invitations;

public class InMemoryInvitationEmailSender : IInvitationEmailSender
{
    private readonly ConcurrentQueue<InvitationMessage> _messages = new();

    public IReadOnlyCollection<InvitationMessage> Messages => _messages.ToArray();

    public Task SendInvitationAsync(string email, string token, CancellationToken ct = default)
    {
        _messages.Enqueue(new InvitationMessage(email, $"/AcceptInvitation?token={Uri.EscapeDataString(token)}", token));
        return Task.CompletedTask;
    }
}
