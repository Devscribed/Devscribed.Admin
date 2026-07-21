namespace Devscribed.Admin.Domain.Services;

public interface IEmailService
{
    Task SendPasswordResetEmailAsync(string email, string token, string resetUrl);
    Task SendInvitationEmailAsync(string email, string organizationName, string token, string acceptUrl);
}
