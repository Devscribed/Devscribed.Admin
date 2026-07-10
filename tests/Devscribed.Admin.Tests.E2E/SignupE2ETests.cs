using Microsoft.Playwright.NUnit;

namespace Devscribed.Admin.Tests.E2E;

[TestFixture]
public class SignupE2ETests : PageTest
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
    public async Task TC01_SignupAndLandAsSoleAdmin()
    {
        await Page.GotoAsync($"{_server.BaseUrl}/signup");

        await Page.GetByTestId("signup-org-name-input").FillAsync("Acme Inc");
        await Page.GetByTestId("signup-first-name-input").FillAsync("Pat");
        await Page.GetByTestId("signup-last-name-input").FillAsync("Owner");
        await Page.GetByTestId("signup-email-input").FillAsync("owner@acme.com");
        await Page.GetByTestId("signup-password-input").FillAsync("Password1");

        await Page.GetByTestId("signup-submit-button").ClickAsync();

        await Page.WaitForURLAsync("**/members");
        var membersList = Page.GetByTestId("members-list");
        await Expect(membersList).ToBeVisibleAsync();

        var rows = Page.Locator("[data-testid^='member-row-']");
        await Expect(rows).ToHaveCountAsync(1);

        var firstRow = rows.First;
        await Expect(firstRow).ToContainTextAsync("Pat Owner");
        await Expect(firstRow).ToContainTextAsync("admin");
    }

    [Test]
    public async Task TC02_ValidationErrorsShowInline()
    {
        await Page.GotoAsync($"{_server.BaseUrl}/signup");

        var submitBtn = Page.GetByTestId("signup-submit-button");
        await Expect(submitBtn).ToBeDisabledAsync();

        await Page.GetByTestId("signup-org-name-input").FillAsync("Acme");
        await Page.GetByTestId("signup-first-name-input").FillAsync("Pat2");
        await Page.GetByTestId("signup-last-name-input").FillAsync("Owner");
        await Page.GetByTestId("signup-email-input").FillAsync("not-an-email");
        await Page.GetByTestId("signup-password-input").FillAsync("short");

        await Page.GetByTestId("signup-first-name-input").BlurAsync();
        await Page.GetByTestId("signup-email-input").BlurAsync();
        await Page.GetByTestId("signup-password-input").BlurAsync();

        await Expect(Page.GetByTestId("field-error-firstName"))
            .ToHaveTextAsync("First name may contain only letters, hyphens, apostrophes, and spaces");
        await Expect(Page.GetByTestId("field-error-email"))
            .ToHaveTextAsync("Enter a valid email address");
        await Expect(Page.GetByTestId("field-error-password"))
            .ToHaveTextAsync("Password must be at least 8 characters");
    }

    [Test]
    public async Task TC03_InlineValidationFiresOnBlurAndClearsOnCorrection()
    {
        await Page.GotoAsync($"{_server.BaseUrl}/signup");

        var emailInput = Page.GetByTestId("signup-email-input");
        var emailError = Page.GetByTestId("field-error-email");

        await emailInput.ClickAsync();
        await emailInput.BlurAsync();
        await Expect(emailError).ToHaveTextAsync("Email is required");

        await emailInput.FillAsync("bad");
        await emailInput.BlurAsync();
        await Expect(emailError).ToHaveTextAsync("Enter a valid email address");

        await emailInput.FillAsync("user@example.com");
        await emailInput.BlurAsync();
        await Expect(emailError).Not.ToBeVisibleAsync();
    }

    [Test]
    public async Task TC04_PasswordShowHideToggle()
    {
        await Page.GotoAsync($"{_server.BaseUrl}/signup");

        var passwordInput = Page.GetByTestId("signup-password-input");
        var toggle = Page.GetByTestId("signup-password-toggle");

        await passwordInput.FillAsync("Passw0rd");
        await Expect(passwordInput).ToHaveAttributeAsync("type", "password");

        await toggle.ClickAsync();
        await Expect(passwordInput).ToHaveAttributeAsync("type", "text");
        await Expect(passwordInput).ToHaveValueAsync("Passw0rd");

        await toggle.ClickAsync();
        await Expect(passwordInput).ToHaveAttributeAsync("type", "password");
    }

    [Test]
    public async Task TC05_DuplicateEmailShowsServerError()
    {
        _server.SeedDuplicateUser();

        await Page.GotoAsync($"{_server.BaseUrl}/signup");

        await Page.GetByTestId("signup-org-name-input").FillAsync("New Org");
        await Page.GetByTestId("signup-first-name-input").FillAsync("Pat");
        await Page.GetByTestId("signup-last-name-input").FillAsync("Owner");
        await Page.GetByTestId("signup-email-input").FillAsync("owner@acme.com");
        await Page.GetByTestId("signup-password-input").FillAsync("Password1");

        await Page.GetByTestId("signup-submit-button").ClickAsync();

        var banner = Page.GetByTestId("signup-error-banner");
        await Expect(banner).ToBeVisibleAsync();
        await Expect(banner).ToHaveTextAsync("This email is already registered");

        await Expect(Page.GetByTestId("signup-org-name-input")).ToHaveValueAsync("New Org");
        await Expect(Page.GetByTestId("signup-first-name-input")).ToHaveValueAsync("Pat");
        await Expect(Page.GetByTestId("signup-submit-button")).ToBeEnabledAsync();
    }

    [Test]
    public async Task TC06_SubmitButtonDisabledUntilAllFieldsValid()
    {
        await Page.GotoAsync($"{_server.BaseUrl}/signup");

        var submitBtn = Page.GetByTestId("signup-submit-button");
        await Expect(submitBtn).ToBeDisabledAsync();

        await Page.GetByTestId("signup-org-name-input").FillAsync("Acme Inc");
        await Page.GetByTestId("signup-org-name-input").BlurAsync();
        await Expect(submitBtn).ToBeDisabledAsync();

        await Page.GetByTestId("signup-first-name-input").FillAsync("Pat");
        await Page.GetByTestId("signup-last-name-input").FillAsync("Owner");
        await Page.GetByTestId("signup-email-input").FillAsync("pat@acme.com");
        await Page.GetByTestId("signup-password-input").FillAsync("Password1");
        await Page.GetByTestId("signup-password-input").BlurAsync();

        await Expect(submitBtn).ToBeEnabledAsync();

        await Page.GetByTestId("signup-email-input").FillAsync("");
        await Page.GetByTestId("signup-email-input").BlurAsync();
        await Expect(submitBtn).ToBeDisabledAsync();
    }

    [Test]
    public async Task TC07_NavigationFromLoginToSignup()
    {
        await Page.GotoAsync($"{_server.BaseUrl}/login");

        await Page.GetByTestId("login-signup-link").ClickAsync();

        await Page.WaitForURLAsync("**/signup");
        await Expect(Page.GetByTestId("signup-form")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("signup-org-name-input")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("signup-submit-button")).ToBeVisibleAsync();
    }
}
