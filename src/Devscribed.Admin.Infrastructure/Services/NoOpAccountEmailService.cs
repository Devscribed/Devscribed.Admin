using Devscribed.Admin.Domain.Services;

namespace Devscribed.Admin.Infrastructure.Services;

public class NoOpAccountEmailService : IAccountEmailService
{
    public Task SendEmailChangeConfirmationAsync(string newEmail, string token, string confirmUrl) =>
        Task.CompletedTask;

    public Task SendEmailChangeNotificationAsync(string oldEmail) =>
        Task.CompletedTask;
}
