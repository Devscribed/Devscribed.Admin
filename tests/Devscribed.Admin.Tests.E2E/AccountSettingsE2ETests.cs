using System.Text.RegularExpressions;
using Microsoft.Playwright.NUnit;

namespace Devscribed.Admin.Tests.E2E;

[TestFixture]
public class AccountSettingsE2ETests : PageTest
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

    private async Task LoginAsync(string email, string password)
    {
        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync(email);
        await Page.GetByTestId("login-password-input").FillAsync(password);
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");
    }

    // TC-06-E2E-01: Edit information persists
    [Test]
    public async Task TC01_EditInformationPersists()
    {
        _server.SeedAccount("e2e01@acme.com", "Passw0rd");
        await LoginAsync("e2e01@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/account/settings");
        await Expect(Page.GetByTestId("account-settings")).ToBeVisibleAsync();

        await Page.GetByTestId("edit-first-name-input").FillAsync("Dima");
        await Page.GetByTestId("edit-last-name-input").FillAsync("Bezzubenkov");
        await Page.GetByTestId("edit-timezone-select").SelectOptionAsync("America/Los_Angeles");
        await Page.GetByTestId("edit-first-day-select").SelectOptionAsync("Monday");
        await Page.GetByTestId("account-save-button").ClickAsync();

        await Expect(Page.GetByTestId("toast-account-saved")).ToBeVisibleAsync();

        await Page.ReloadAsync();
        await Expect(Page.GetByTestId("edit-first-name-input")).ToHaveValueAsync("Dima");
        await Expect(Page.GetByTestId("edit-last-name-input")).ToHaveValueAsync("Bezzubenkov");
        await Expect(Page.GetByTestId("edit-timezone-select")).ToHaveValueAsync("America/Los_Angeles");
    }

    // TC-06-E2E-02: Change-email confirmation flow
    [Test]
    public async Task TC02_ChangeEmailConfirmationFlow()
    {
        _server.SeedAccount("pat02@acme.com", "Passw0rd");
        await LoginAsync("pat02@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/account/settings");
        await Page.GetByTestId("change-email-open-button").ClickAsync();
        await Page.GetByTestId("change-email-new-input").FillAsync("new02@acme.com");
        await Page.GetByTestId("change-email-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("change-email-confirmation-message"))
            .ToHaveTextAsync("A confirmation link has been sent to new02@acme.com. Please check your inbox.");

        var email = _server.SentEmails.First(e => e.ToEmail == "new02@acme.com");
        var token = Regex.Match(email.Body, "token=([^\\s&]+)").Groups[1].Value;

        await Page.GotoAsync($"{_server.BaseUrl}/account/confirm-email?token={token}");
        await Expect(Page.GetByTestId("confirm-email-success-message")).ToBeVisibleAsync();

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("new02@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");
    }

    // TC-06-E2E-03: Change-password with wrong current password shows an error
    [Test]
    public async Task TC03_ChangePasswordWrongCurrentPasswordShowsError()
    {
        _server.SeedAccount("pat03@acme.com", "Passw0rd");
        await LoginAsync("pat03@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/account/settings");
        await Page.GetByTestId("change-password-open-button").ClickAsync();
        await Page.GetByTestId("change-password-current-input").FillAsync("wrong");
        await Page.GetByTestId("change-password-new-input").FillAsync("NewPass1");
        await Page.GetByTestId("change-password-confirm-input").FillAsync("NewPass1");
        await Page.GetByTestId("change-password-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("change-password-error")).ToHaveTextAsync("Current password is incorrect");
    }

    // TC-06-E2E-09: Change password happy path
    [Test]
    public async Task TC09_ChangePasswordHappyPath()
    {
        _server.SeedAccount("pat09@acme.com", "Passw0rd");
        await LoginAsync("pat09@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/account/settings");
        await Page.GetByTestId("change-password-open-button").ClickAsync();
        await Page.GetByTestId("change-password-current-input").FillAsync("Passw0rd");
        await Page.GetByTestId("change-password-new-input").FillAsync("NewPass1");
        await Page.GetByTestId("change-password-confirm-input").FillAsync("NewPass1");
        await Page.GetByTestId("change-password-submit-button").ClickAsync();

        await Expect(Page.Locator("#change-password-success-message")).ToContainTextAsync("Your password has been changed.");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("pat09@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("NewPass1");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");
    }

    // TC-06-E2E-05: First name validation error shown inline
    [Test]
    public async Task TC05_FirstNameValidationErrorShownInline()
    {
        _server.SeedAccount("pat05@acme.com", "Passw0rd");
        await LoginAsync("pat05@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/account/settings");
        await Page.GetByTestId("edit-first-name-input").FillAsync("Pat2");
        await Page.GetByTestId("edit-last-name-input").FocusAsync();

        await Expect(Page.GetByTestId("field-error-firstName"))
            .ToHaveTextAsync("First name may contain only letters, hyphens, apostrophes, and spaces");
    }

    // TC-06-E2E-11: Change email — same as current email shows error
    [Test]
    public async Task TC11_ChangeEmailSameAsCurrentShowsError()
    {
        _server.SeedAccount("pat11@acme.com", "Passw0rd");
        await LoginAsync("pat11@acme.com", "Passw0rd");

        await Page.GotoAsync($"{_server.BaseUrl}/account/settings");
        await Page.GetByTestId("change-email-open-button").ClickAsync();
        await Page.GetByTestId("change-email-new-input").FillAsync("pat11@acme.com");
        await Page.GetByTestId("change-email-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("change-email-error")).ToHaveTextAsync("This is already your email address");
    }
}
