namespace Devscribed.Admin.Domain.Services;

public interface IAccountEmailService
{
    Task SendEmailChangeConfirmationAsync(string newEmail, string token, string confirmUrl);
    Task SendEmailChangeNotificationAsync(string oldEmail);
}
