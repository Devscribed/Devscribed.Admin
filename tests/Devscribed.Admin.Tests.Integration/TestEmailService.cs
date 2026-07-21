using Devscribed.Admin.Domain.Services;

namespace Devscribed.Admin.Tests.Integration;

public class TestEmailService : IEmailService
{
    public List<SentEmail> SentEmails { get; } = new();
    public List<SentInvitationEmail> SentInvitationEmails { get; } = new();

    public Task SendPasswordResetEmailAsync(string email, string token, string resetUrl)
    {
        SentEmails.Add(new SentEmail(email, token, resetUrl));
        return Task.CompletedTask;
    }

    public Task SendInvitationEmailAsync(string email, string organizationName, string token, string acceptUrl)
    {
        SentInvitationEmails.Add(new SentInvitationEmail(email, organizationName, token, acceptUrl));
        return Task.CompletedTask;
    }

    public record SentEmail(string Email, string Token, string ResetUrl);
    public record SentInvitationEmail(string Email, string OrganizationName, string Token, string AcceptUrl);
}
