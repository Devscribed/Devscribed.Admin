using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright.NUnit;

namespace Devscribed.Admin.Tests.E2E;

[TestFixture]
public class InvitationE2ETests : PageTest
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

    private string ExtractToken(string toEmail)
    {
        var email = _server.SentEmails.First(e => e.ToEmail == toEmail);
        return Regex.Match(email.Body, "token=([^\\s&]+)").Groups[1].Value;
    }

    [Test]
    public async Task TC01_AdminInvitesInviteeAcceptsAndLandsInOrg()
    {
        _server.SeedAccount("admin@acme.com", "Passw0rd", "Pat", "Owner", orgName: "Acme Inc", role: "admin");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("admin@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");

        await Page.GetByTestId("invite-open-button").ClickAsync();
        await Page.GetByTestId("invite-email-input").FillAsync("new@acme.com");
        await Page.GetByTestId("invite-role-select").SelectOptionAsync("user");
        await Page.GetByTestId("invite-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("toast-invite-sent")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("toast-invite-sent")).ToHaveTextAsync("Invitation sent to new@acme.com");

        var token = ExtractToken("new@acme.com");

        await Page.GotoAsync($"{_server.BaseUrl}/accept-invite?token={token}");
        await Expect(Page.GetByTestId("accept-invite-org-name")).ToContainTextAsync("Acme Inc");

        await Page.GetByTestId("accept-first-name-input").FillAsync("New");
        await Page.GetByTestId("accept-last-name-input").FillAsync("Hire");
        await Page.GetByTestId("accept-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("accept-submit-button").ClickAsync();

        await Page.WaitForURLAsync("**/members");
        var rows = Page.Locator("[data-testid^='member-row-']");
        await Expect(rows).ToHaveCountAsync(2);
        await Expect(Page.GetByTestId("members-list")).ToContainTextAsync("New Hire");
    }

    [Test]
    public async Task TC02_ExpiredLinkShowsExplicitError()
    {
        var admin = _server.SeedAccount("admin2@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");

        // Seed an already-expired invitation directly.
        using (var scope = _server.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();
            var tokenGen = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Services.ITokenGenerator>();
            var membership = db.Memberships.Single(m => m.AccountId == admin.Id);
            var raw = tokenGen.GenerateToken();
            db.Invitations.Add(new Devscribed.Admin.Web.Models.Invitation
            {
                Id = Guid.NewGuid(),
                Email = "late@acme.com",
                Role = "user",
                OrganizationId = membership.OrganizationId,
                InviterMembershipId = membership.Id,
                TokenHash = tokenGen.Hash(raw),
                CreatedAt = DateTime.UtcNow.AddDays(-8),
                ExpiresAt = DateTime.UtcNow.AddDays(-1),
                Status = "pending",
            });
            db.SaveChanges();

            await Page.GotoAsync($"{_server.BaseUrl}/accept-invite?token={raw}");

            await Expect(Page.GetByTestId("accept-invite-error")).ToHaveTextAsync("This invitation has expired");
            await Expect(Page.GetByTestId("accept-invite-form")).Not.ToBeVisibleAsync();
        }
    }

    [Test]
    public async Task TC03_ManagerInvitesWithNonAdminRolePicker()
    {
        _server.SeedAccount("mgr@acme.com", "Passw0rd", orgName: "Acme Inc", role: "manager");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("mgr@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");

        await Page.GetByTestId("invite-open-button").ClickAsync();

        var options = await Page.GetByTestId("invite-role-select").Locator("option").AllTextContentsAsync();
        Assert.That(options, Does.Contain("Manager"));
        Assert.That(options, Does.Contain("User"));
        Assert.That(options, Does.Contain("Viewer"));
        Assert.That(options, Does.Not.Contain("Admin"));
    }

    [Test]
    public async Task TC04_ExistingUserAcceptsInvitationWithPasswordConfirmation()
    {
        _server.SeedAccount("admin4@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        _server.SeedAccount("pat@other.com", "Passw0rd", orgName: "Other Org", role: "user");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("admin4@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");

        await Page.GetByTestId("invite-open-button").ClickAsync();
        await Page.GetByTestId("invite-email-input").FillAsync("pat@other.com");
        await Page.GetByTestId("invite-role-select").SelectOptionAsync("user");
        await Page.GetByTestId("invite-submit-button").ClickAsync();
        await Expect(Page.GetByTestId("toast-invite-sent")).ToBeVisibleAsync();

        var token = ExtractToken("pat@other.com");

        await Page.GotoAsync($"{_server.BaseUrl}/accept-invite?token={token}");
        await Expect(Page.GetByTestId("accept-invite-org-name")).ToContainTextAsync("Acme Inc");
        await Expect(Page.GetByTestId("accept-password-input")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("accept-first-name-input")).Not.ToBeVisibleAsync();

        await Page.GetByTestId("accept-org-switch-confirm").CheckAsync();
        await Page.GetByTestId("accept-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("accept-submit-button").ClickAsync();

        await Page.WaitForURLAsync("**/members");
    }

    [Test]
    public async Task TC08_InviteModalShowsServerErrorForAlreadyAMember()
    {
        _server.SeedAccount("admin8@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");

        using (var scope = _server.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();
            var hasher = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Services.IPasswordHasher>();
            var adminMembership = db.Memberships.Include(m => m.Account).Single(m => m.Account.Email == "admin8@acme.com");

            var memberAccount = new Devscribed.Admin.Web.Models.Account
            {
                Id = Guid.NewGuid(),
                Email = "member@acme.com",
                PasswordHash = hasher.Hash("Passw0rd"),
                FirstName = "Existing",
                LastName = "Member",
                CreatedAt = DateTime.UtcNow,
            };
            db.Accounts.Add(memberAccount);
            db.Memberships.Add(new Devscribed.Admin.Web.Models.Membership
            {
                Id = Guid.NewGuid(),
                AccountId = memberAccount.Id,
                OrganizationId = adminMembership.OrganizationId,
                Role = "user",
                Status = "active",
                JoinedAt = DateTime.UtcNow,
            });
            db.SaveChanges();
        }

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("admin8@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");

        await Page.GetByTestId("invite-open-button").ClickAsync();
        await Page.GetByTestId("invite-email-input").FillAsync("member@acme.com");
        await Page.GetByTestId("invite-role-select").SelectOptionAsync("user");
        await Page.GetByTestId("invite-submit-button").ClickAsync();

        await Expect(Page.GetByTestId("invite-error-message"))
            .ToHaveTextAsync("This person is already a member of your organization");
        await Expect(Page.GetByTestId("invite-email-input")).ToHaveValueAsync("member@acme.com");
        await Expect(Page.GetByTestId("invite-submit-button")).ToBeEnabledAsync();
    }

    [Test]
    public async Task TC09_UsedInvitationLinkShowsExplicitError()
    {
        _server.SeedAccount("admin9@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("admin9@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");

        await Page.GetByTestId("invite-open-button").ClickAsync();
        await Page.GetByTestId("invite-email-input").FillAsync("used@acme.com");
        await Page.GetByTestId("invite-role-select").SelectOptionAsync("user");
        await Page.GetByTestId("invite-submit-button").ClickAsync();
        await Expect(Page.GetByTestId("toast-invite-sent")).ToBeVisibleAsync();

        var token = ExtractToken("used@acme.com");

        await Page.GotoAsync($"{_server.BaseUrl}/accept-invite?token={token}");
        await Page.GetByTestId("accept-first-name-input").FillAsync("Used");
        await Page.GetByTestId("accept-last-name-input").FillAsync("Invite");
        await Page.GetByTestId("accept-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("accept-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");

        await Page.GotoAsync($"{_server.BaseUrl}/accept-invite?token={token}");

        await Expect(Page.GetByTestId("accept-invite-error")).ToHaveTextAsync("This invitation is no longer valid");
        await Expect(Page.GetByTestId("accept-invite-form")).Not.ToBeVisibleAsync();
    }
}
