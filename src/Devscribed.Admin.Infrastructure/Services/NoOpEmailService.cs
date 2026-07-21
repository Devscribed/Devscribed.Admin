using Devscribed.Admin.Domain.Services;

namespace Devscribed.Admin.Infrastructure.Services;

public class NoOpEmailService : IEmailService
{
    public Task SendPasswordResetEmailAsync(string email, string token, string resetUrl) =>
        Task.CompletedTask;

    public Task SendInvitationEmailAsync(string email, string organizationName, string token, string acceptUrl) =>
        Task.CompletedTask;
}
