using Devscribed.Admin.Web.Services;

namespace Devscribed.Admin.Tests.Integration;

public record SentEmail(string ToEmail, string Subject, string Body);

/// <summary>Test mail sink - records sent emails in memory (in send order) instead of dispatching them.</summary>
public class InMemoryEmailSender : IEmailSender
{
    private readonly List<SentEmail> _sent = new();
    private readonly object _lock = new();

    public IReadOnlyCollection<SentEmail> Sent
    {
        get { lock (_lock) { return _sent.ToList(); } }
    }

    public Task SendAsync(string toEmail, string subject, string body)
    {
        lock (_lock) { _sent.Add(new SentEmail(toEmail, subject, body)); }
        return Task.CompletedTask;
    }
}
