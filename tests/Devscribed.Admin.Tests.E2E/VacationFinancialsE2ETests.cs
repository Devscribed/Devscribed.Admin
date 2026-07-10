using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright.NUnit;

namespace Devscribed.Admin.Tests.E2E;

[TestFixture]
public class VacationFinancialsE2ETests : PageTest
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

    private async Task LoginAsync(string email, string password)
    {
        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync(email);
        await Page.GetByTestId("login-password-input").FillAsync(password);
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");
    }

    // TC-07-E2E-01: Full financial settings setup (admin)
    [Test]
    public async Task Admin_sets_up_financial_settings_golden_path()
    {
        _server.SeedAccount("admin1@acme.com", "Passw0rd", "Pat", "Owner", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin1@acme.com");
        SeedAdditionalMember(orgId, "alex@acme.com", "Passw0rd", "user", "Alex", "Kaminski");
        var memberId = GetMembershipId("alex@acme.com");

        await LoginAsync("admin1@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{memberId}");

        await Page.GetByTestId("member-detail-tab-vacation").ClickAsync();
        await Expect(Page.GetByTestId("vacation-empty-state")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("vacation-empty-state")).ToContainTextAsync("has not been set up for this member yet");

        await Page.GetByTestId("vacation-setup-btn").ClickAsync();
        await Expect(Page.GetByTestId("vacation-financials-modal")).ToBeVisibleAsync();

        await Page.GetByTestId("vacation-salary-input").FillAsync("3000");
        await Page.GetByTestId("vacation-rate-input").FillAsync("40");
        await Page.GetByTestId("vacation-currency-select").SelectOptionAsync("USD");
        await Page.GetByTestId("vacation-days-input").FillAsync("20");

        await Expect(Page.GetByTestId("vacation-reserve-preview")).ToContainTextAsync("3.33%");

        await Page.GetByTestId("vacation-financials-save-btn").ClickAsync();

        await Expect(Page.GetByTestId("toast-financials-saved")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("vacation-financials-card")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("vacation-balance-card")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("vacation-reserve-amount")).ToContainTextAsync("0.00");
        await Expect(Page.GetByTestId("vacation-available-days")).ToHaveTextAsync("0");

        await Page.ReloadAsync();
        await Page.GetByTestId("member-detail-tab-vacation").ClickAsync();
        await Expect(Page.GetByTestId("vacation-financials-card")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("vacation-financials-card")).ToContainTextAsync("3.33% (auto)");
    }

    // TC-07-E2E-02: Viewer sees Vacation tab disabled
    [Test]
    public async Task Viewer_sees_vacation_tab_disabled()
    {
        _server.SeedAccount("admin2@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin2@acme.com");
        SeedAdditionalMember(orgId, "viewer2@acme.com", "Passw0rd", "viewer", "View", "Er");
        SeedAdditionalMember(orgId, "target2@acme.com", "Passw0rd", "user", "Target", "Two");
        var targetId = GetMembershipId("target2@acme.com");

        await LoginAsync("viewer2@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{targetId}");

        await Expect(Page.GetByTestId("member-detail-tab-vacation")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("member-detail-tab-vacation")).ToBeDisabledAsync();
    }

    // TC-07-E2E-03: User cannot see another member's vacation data
    [Test]
    public async Task User_cannot_access_another_members_vacation_tab()
    {
        _server.SeedAccount("admin3@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin3@acme.com");
        SeedAdditionalMember(orgId, "alex3@acme.com", "Passw0rd", "user", "Alex", "Three");
        SeedAdditionalMember(orgId, "jane3@acme.com", "Passw0rd", "user", "Jane", "Three");
        var janeId = GetMembershipId("jane3@acme.com");

        await LoginAsync("alex3@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{janeId}");

        await Expect(Page.GetByTestId("member-detail-tab-vacation")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("member-detail-tab-vacation")).ToBeDisabledAsync();
    }

    // TC-07-E2E-04: Financial settings validation errors in modal
    [Test]
    public async Task Financial_settings_validation_errors_shown_in_modal()
    {
        _server.SeedAccount("admin4@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin4@acme.com");
        SeedAdditionalMember(orgId, "target4@acme.com", "Passw0rd", "user", "Target", "Four");
        var targetId = GetMembershipId("target4@acme.com");

        await LoginAsync("admin4@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{targetId}");
        await Page.GetByTestId("member-detail-tab-vacation").ClickAsync();
        await Page.GetByTestId("vacation-setup-btn").ClickAsync();

        await Page.GetByTestId("vacation-salary-input").FillAsync("0");
        await Page.GetByTestId("vacation-rate-input").FillAsync("-1");
        await Page.GetByTestId("vacation-financials-save-btn").ClickAsync();

        await Expect(Page.GetByTestId("field-error-monthlySalary")).ToContainTextAsync("Monthly salary must be between");
        await Expect(Page.GetByTestId("field-error-clientHourlyRate")).ToContainTextAsync("Client hourly rate must be between");

        await Page.GetByTestId("vacation-salary-input").FillAsync("3000");
        await Page.GetByTestId("vacation-rate-input").FillAsync("40");
        await Page.GetByTestId("vacation-days-input").FillAsync("20");
        await Page.GetByTestId("vacation-financials-save-btn").ClickAsync();

        await Expect(Page.GetByTestId("toast-financials-saved")).ToBeVisibleAsync();
    }
}
