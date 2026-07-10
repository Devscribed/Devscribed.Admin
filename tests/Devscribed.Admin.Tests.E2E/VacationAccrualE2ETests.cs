using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Playwright.NUnit;

namespace Devscribed.Admin.Tests.E2E;

[TestFixture]
public class VacationAccrualE2ETests : PageTest
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

    private void ConfigureFinancialsDirectly(Guid membershipId, decimal monthlySalary, decimal clientHourlyRate, int vacationDaysPerYear = 20)
    {
        using var scope = _server.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Data.AppDbContext>();

        var percent = Devscribed.Admin.Web.Services.VacationReserveCalculator.CalculateReservePercent(monthlySalary, clientHourlyRate, vacationDaysPerYear);

        db.MemberFinancials.Add(new Devscribed.Admin.Web.Models.MemberFinancials
        {
            Id = Guid.NewGuid(),
            MembershipId = membershipId,
            MonthlySalary = monthlySalary,
            ClientHourlyRate = clientHourlyRate,
            VacationReservePercent = percent,
            IsReservePercentManual = false,
            VacationDaysPerYear = vacationDaysPerYear,
            Currency = "USD",
            UpdatedAt = DateTime.UtcNow,
        });
        db.MemberFinancialsSnapshots.Add(new Devscribed.Admin.Web.Models.MemberFinancialsSnapshot
        {
            Id = Guid.NewGuid(),
            MembershipId = membershipId,
            MonthlySalary = monthlySalary,
            ClientHourlyRate = clientHourlyRate,
            VacationReservePercent = percent,
            IsReservePercentManual = false,
            VacationDaysPerYear = vacationDaysPerYear,
            Currency = "USD",
            EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-1)),
            CreatedAt = DateTime.UtcNow,
        });
        db.SaveChanges();
    }

    private async Task LoginAsync(string email, string password)
    {
        await Page.GotoAsync($"{_server.BaseUrl}/login");
        await Page.GetByTestId("login-email-input").FillAsync(email);
        await Page.GetByTestId("login-password-input").FillAsync(password);
        await Page.GetByTestId("login-submit-button").ClickAsync();
        await Page.WaitForURLAsync("**/members");
    }

    private static (int Month, int Year) PastBillingPeriod(int monthsAgo)
    {
        var d = DateTime.UtcNow.AddMonths(-monthsAgo);
        return (d.Month, d.Year);
    }

    // TC-08-E2E-02 (golden path): Admin triggers accrual and sees credits
    [Test]
    public async Task Admin_triggers_accrual_and_sees_updated_balance_and_transactions()
    {
        _server.SeedAccount("admin-e2e-acc@acme.com", "Passw0rd", "Pat", "Owner", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin-e2e-acc@acme.com");
        SeedAdditionalMember(orgId, "alex-e2e-acc@acme.com", "Passw0rd", "user", "Alex", "Kaminski");
        var memberId = GetMembershipId("alex-e2e-acc@acme.com");
        ConfigureFinancialsDirectly(memberId, 3000, 40);

        await LoginAsync("admin-e2e-acc@acme.com", "Passw0rd");

        var (month1, year1) = PastBillingPeriod(2);
        var response1 = await Page.APIRequest.PostAsync($"{_server.BaseUrl}/api/admin/accrual/run",
            new() { DataObject = new { month = month1, year = year1 } });
        Assert.That(response1.Ok, Is.True);

        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{memberId}");
        await Page.GetByTestId("member-detail-tab-vacation").ClickAsync();

        await Expect(Page.GetByTestId("vacation-balance-card")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("vacation-available-days")).Not.ToHaveTextAsync("0");
        await Expect(Page.GetByTestId("vacation-reserve-amount")).ToContainTextAsync("230.88");

        await Expect(Page.GetByTestId("vacation-transactions-table")).ToBeVisibleAsync();
        var rows = Page.Locator("#vacation-transactions-body tr");
        await Expect(rows).ToHaveCountAsync(1);
        await Expect(rows.First).ToContainTextAsync("(auto)");
        await Expect(rows.First).ToContainTextAsync("System");
        await Expect(rows.First).ToContainTextAsync("accrual");

        var (month2, year2) = PastBillingPeriod(1);
        var response2 = await Page.APIRequest.PostAsync($"{_server.BaseUrl}/api/admin/accrual/run",
            new() { DataObject = new { month = month2, year = year2 } });
        Assert.That(response2.Ok, Is.True);

        await Page.ReloadAsync();
        await Page.GetByTestId("member-detail-tab-vacation").ClickAsync();

        await Expect(rows).ToHaveCountAsync(2);
        await Expect(Page.GetByTestId("vacation-reserve-amount")).ToContainTextAsync("461.76");
    }

    // TC-08-E2E-03: User sees updated balance after admin triggers accrual, without transactions/financials cards
    [Test]
    public async Task User_sees_updated_balance_but_not_transactions_or_financials()
    {
        _server.SeedAccount("admin-e2e-acc2@acme.com", "Passw0rd", orgName: "Acme Inc", role: "admin");
        var orgId = GetOrgId("admin-e2e-acc2@acme.com");
        SeedAdditionalMember(orgId, "alex-e2e-acc2@acme.com", "Passw0rd", "user", "Alex", "Two");
        var memberId = GetMembershipId("alex-e2e-acc2@acme.com");
        ConfigureFinancialsDirectly(memberId, 3000, 40);

        using (var scope = _server.Services.CreateScope())
        {
            var accrual = scope.ServiceProvider.GetRequiredService<Devscribed.Admin.Web.Services.VacationAccrualService>();
            var (month, year) = PastBillingPeriod(2);
            await accrual.RunAsync(orgId, month, year);
        }

        await LoginAsync("alex-e2e-acc2@acme.com", "Passw0rd");
        await Page.GotoAsync($"{_server.BaseUrl}/org/{orgId}/members/{memberId}");
        await Page.GetByTestId("member-detail-tab-vacation").ClickAsync();

        await Expect(Page.GetByTestId("vacation-balance-card")).ToBeVisibleAsync();
        await Expect(Page.GetByTestId("vacation-available-days")).Not.ToHaveTextAsync("0");
        await Expect(Page.GetByTestId("vacation-transactions-table")).Not.ToBeVisibleAsync();
        await Expect(Page.GetByTestId("vacation-financials-card")).Not.ToBeVisibleAsync();
    }
}
