using System.Text.RegularExpressions;
using Microsoft.Playwright.NUnit;

namespace Devscribed.Admin.Tests.E2E;

[TestFixture]
public class LoginE2ETests : PageTest
{
    private E2EServerFixture _server = null!;

    [SetUp]
    public void SetUp()
    {
        _server = new E2EServerFixture();
    }

    [TearDown]
    public void TearDown()
    {
        _server.Dispose();
    }

    [Test]
    public async Task TC01_LoginHappyPath()
    {
        _server.SeedAccount("pat@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/login");

        await Page.GetByTestId("login-email-input").FillAsync("pat@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();

        await Page.WaitForURLAsync("**/members");
        await Expect(Page.GetByTestId("members-list")).ToBeVisibleAsync();
    }

    [Test]
    public async Task TC02_WrongPasswordShowsErrorMessage()
    {
        _server.SeedAccount("pat2@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/login");

        await Page.GetByTestId("login-email-input").FillAsync("pat2@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("wrong");
        await Page.GetByTestId("login-submit-button").ClickAsync();

        var error = Page.GetByTestId("login-error-message");
        await Expect(error).ToHaveTextAsync("Invalid email or password");
        await Expect(Page.GetByTestId("login-submit-button")).ToBeEnabledAsync();
    }

    [Test]
    public async Task TC03_ForgotPasswordResetAndLoginWithNewPassword()
    {
        _server.SeedAccount("pat3@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-forgot-link").ClickAsync();
        await Page.WaitForURLAsync("**/forgot-password");

        await Page.GetByTestId("forgot-email-input").FillAsync("pat3@acme.com");
        await Page.GetByTestId("forgot-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("forgot-confirmation-message"))
            .ToHaveTextAsync("If an account exists, a reset link has been sent.");

        var email = _server.SentEmails.First(e => e.ToEmail == "pat3@acme.com");
        var token = Regex.Match(email.Body, "token=([^\\s&]+)").Groups[1].Value;

        await Page.GotoAsync($"{_server.BaseUrl}/reset-password?token={token}");

        await Page.GetByTestId("reset-password-input").FillAsync("NewPass1");
        await Page.GetByTestId("reset-password-confirm-input").FillAsync("NewPass1");
        await Page.GetByTestId("reset-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("reset-success-message")).ToBeVisibleAsync();
        await Page.GetByTestId("reset-login-link").ClickAsync();
        await Page.WaitForURLAsync("**/login");

        await Page.GetByTestId("login-email-input").FillAsync("pat3@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("NewPass1");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");

        // Sign out (simulated by navigating directly to the login page) and try the old password.
        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("pat3@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("login-error-message")).ToHaveTextAsync("Invalid email or password");
    }

    [Test]
    public async Task TC04_RemovedMemberLoginShowsDeactivationMessage()
    {
        _server.SeedAccount("ex@acme.com", "Passw0rd", status: "removed");

        await Page.GotoAsync($"{_server.BaseUrl}/login");

        await Page.GetByTestId("login-email-input").FillAsync("ex@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("login-error-message"))
            .ToHaveTextAsync("Your account has been deactivated, contact your administrator");
    }

    [Test]
    public async Task TC05_ExpiredOrUsedResetLinkShowsError()
    {
        await Page.GotoAsync($"{_server.BaseUrl}/reset-password?token=not-a-real-token");

        await Expect(Page.GetByTestId("reset-error-message"))
            .ToHaveTextAsync("This reset link is invalid or has expired");
        await Expect(Page.GetByTestId("reset-form")).Not.ToBeVisibleAsync();
        await Expect(Page.GetByTestId("reset-login-link")).ToBeVisibleAsync();
    }

    [Test]
    public async Task TC06_ResetPasswordConfirmationMismatchShowsInlineError()
    {
        _server.SeedAccount("pat6@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-forgot-link").ClickAsync();
        await Page.GetByTestId("forgot-email-input").FillAsync("pat6@acme.com");
        await Page.GetByTestId("forgot-submit-button").ClickAsync();
        await Expect(Page.GetByTestId("forgot-confirmation-message")).ToBeVisibleAsync();

        var email = _server.SentEmails.First(e => e.ToEmail == "pat6@acme.com");
        var token = Regex.Match(email.Body, "token=([^\\s&]+)").Groups[1].Value;

        await Page.GotoAsync($"{_server.BaseUrl}/reset-password?token={token}");

        await Page.GetByTestId("reset-password-input").FillAsync("NewPass1");
        await Page.GetByTestId("reset-password-confirm-input").FillAsync("NewPass2");
        await Page.GetByTestId("reset-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("field-error-password-confirm")).ToHaveTextAsync("Passwords do not match");
        await Expect(Page.GetByTestId("reset-form")).ToBeVisibleAsync();
    }
}
