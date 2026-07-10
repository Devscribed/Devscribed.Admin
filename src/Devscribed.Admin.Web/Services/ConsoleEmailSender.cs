namespace Devscribed.Admin.Web.Services;

/// <summary>
/// Placeholder email transport. Real delivery (SMTP/provider integration) is out of
/// scope for this spec - the email sender is an injected dependency and this is the
/// default no-op-ish implementation used outside of tests.
/// </summary>
public class ConsoleEmailSender : IEmailSender
{
    private readonly ILogger<ConsoleEmailSender> _logger;

    public ConsoleEmailSender(ILogger<ConsoleEmailSender> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(string toEmail, string subject, string body)
    {
        _logger.LogInformation("Email to {ToEmail}: {Subject}\n{Body}", toEmail, subject, body);
        return Task.CompletedTask;
    }
}
