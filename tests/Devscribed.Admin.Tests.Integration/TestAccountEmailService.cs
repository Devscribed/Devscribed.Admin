using Devscribed.Admin.Domain.Services;

namespace Devscribed.Admin.Tests.Integration;

public class TestAccountEmailService : IAccountEmailService
{
    public List<SentConfirmationEmail> SentConfirmations { get; } = new();
    public List<SentNotificationEmail> SentNotifications { get; } = new();

    public Task SendEmailChangeConfirmationAsync(string newEmail, string token, string confirmUrl)
    {
        SentConfirmations.Add(new SentConfirmationEmail(newEmail, token, confirmUrl));
        return Task.CompletedTask;
    }

    public Task SendEmailChangeNotificationAsync(string oldEmail)
    {
        SentNotifications.Add(new SentNotificationEmail(oldEmail));
        return Task.CompletedTask;
    }

    public record SentConfirmationEmail(string NewEmail, string Token, string ConfirmUrl);
    public record SentNotificationEmail(string OldEmail);
}
