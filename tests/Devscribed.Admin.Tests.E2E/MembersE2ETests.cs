using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright.NUnit;

namespace Devscribed.Admin.Tests.E2E;

[TestFixture]
public class MembersE2ETests : PageTest
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

    private Devscribed.Admin.Web.Models.Account SeedAdditionalMember(
        Guid organizationId, string email, string password, string role, string firstName, string lastName)
    {
        using var scope = _server.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Services.IPasswordHasher>();

        var account = new Devscribed.Admin.Web.Models.Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = hasher.Hash(password),
            FirstName = firstName,
            LastName = lastName,
            CreatedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);
        db.Memberships.Add(new Devscribed.Admin.Web.Models.Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = organizationId,
            Role = role,
            Status = "active",
            JoinedAt = DateTime.UtcNow,
        });
        db.SaveChanges();
        return account;
    }

    private Guid GetOrgId(string email)
    {
        using var scope = _server.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();
        return db.Memberships.Include(m => m.Account).Single(m => m.Account.Email == email).OrganizationId;
    }

    private Guid GetMembershipId(string email)
    {
        using var scope = _server.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();
        return db.Memberships.Include(m => m.Account).Single(m => m.Account.Email == email).Id;
    }

    // Golden path: admin lists members, searches, deletes a member, then restores them (TC-04-E2E-01/02/03).
    [Test]
    public async Task Admin_searches_deletes_and_restores_a_member()
    {
        var admin1 = _server.SeedAccount("admin1@acme.com", "Passw0rd", "Pat", "Owner", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin1@acme.com");
        SeedAdditionalMember(orgId, "admin2@acme.com", "Passw0rd", "admin", "Sam", "Second");
        var alex = SeedAdditionalMember(orgId, "alex@acme.com", "Passw0rd", "user", "Alex", "Kaminski");
        var alexMembershipId = GetMembershipId("alex@acme.com");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("admin1@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");
        await Expect(Page.GetByTestId("members-list")).ToBeVisibleAsync();

        // Search narrows the list (debounced).
        await Page.GetByTestId("members-search-input").FillAsync("Alex");
        await Expect(Page.GetByTestId($"member-row-{alexMembershipId}")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("members-list")).Not.ToContainTextAsync("Pat Owner");

        // Delete via row actions menu + confirmation dialog.
        await Page.GetByTestId($"member-row-actions-{alexMembershipId}").ClickAsync();
        await Page.GetByTestId("member-action-delete").ClickAsync();
        await Expect(Page.GetByTestId("confirm-delete-dialog")).ToBeVisibleAsync();
        await Expect(Page.Locator("#confirm-delete-body")).ToContainTextAsync("Alex Kaminski");
        await Page.GetByTestId("confirm-delete-button").ClickAsync();

        await Expect(Page.GetByTestId("toast-member-removed")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId($"member-row-{alexMembershipId}")).Not.ToBeVisibleAsync();

        // Show removed members: Alex reappears with a Removed badge and a Restore action.
        await Page.GetByTestId("members-search-input").FillAsync("");
        await Page.GetByTestId("show-removed-checkbox").CheckAsync();
        await Expect(Page.GetByTestId($"member-row-{alexMembershipId}")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId($"member-status-badge-{alexMembershipId}")).ToHaveTextAsync("Removed");

        await Page.GetByTestId($"member-row-actions-{alexMembershipId}").ClickAsync();
        await Page.GetByTestId("member-action-restore").ClickAsync();

        await Expect(Page.GetByTestId("toast-member-restored")).ToBeVisibleAsync();
        await Page.GetByTestId("show-removed-checkbox").UncheckAsync();
        await Expect(Page.GetByTestId($"member-row-{alexMembershipId}")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId($"member-status-badge-{alexMembershipId}")).Not.ToBeVisibleAsync();
    }

    // TC-04-E2E-04: user/viewer see the list but no actions menu
    [Test]
    public async Task User_role_sees_list_without_actions_menu()
    {
        _server.SeedAccount("adminuser@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("adminuser@acme.com");
        SeedAdditionalMember(orgId, "plain@acme.com", "Passw0rd", "user", "Plain", "User");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("plain@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");

        await Expect(Page.GetByTestId("members-list")).ToBeVisibleAsync();
        await Expect(Page.Locator("[data-testid^='member-row-actions-']")).ToHaveCountAsync(0);
    }

    // TC-04-E2E-05: self-delete not available in the UI
    [Test]
    public async Task Own_row_has_no_delete_option()
    {
        var admin1 = _server.SeedAccount("selfadmin@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("selfadmin@acme.com");
        SeedAdditionalMember(orgId, "otheradmin@acme.com", "Passw0rd", "admin", "Other", "Admin");
        var selfMembershipId = GetMembershipId("selfadmin@acme.com");

        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync("selfadmin@acme.com");
        await Page.GetByTestId("login-password-input").FillAsync("Passw0rd");
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");

        var ownRow = Page.GetByTestId($"member-row-{selfMembershipId}");
        await Expect(ownRow).ToBeVisibleAsync();
        await Expect(ownRow.Locator("[data-testid^='member-row-actions-']")).ToHaveCountAsync(0);
    }
}
