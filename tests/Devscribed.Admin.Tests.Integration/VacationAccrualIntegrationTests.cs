using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class VacationAccrualIntegrationTests : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory;

    public VacationAccrualIntegrationTests(TestWebAppFactory factory)
    {
        _factory = factory;
    }

    private async Task<(Account Account, Membership Membership)> SeedMemberAsync(
        Organization org, string email, string password, string role = "user", string status = "active",
        string firstName = "Pat", string lastName = "Owner")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        if (!db.Organizations.Any(o => o.Id == org.Id))
            db.Organizations.Add(org);

        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = hasher.Hash(password),
            FirstName = firstName,
            LastName = lastName,
            CreatedAt = DateTime.UtcNow,
        };
        var membership = new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = org.Id,
            Role = role,
            Status = status,
            JoinedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);
        db.Memberships.Add(membership);
        await db.SaveChangesAsync();
        return (account, membership);
    }

    private static Organization NewOrg(string name) => new() { Id = Guid.NewGuid(), Name = name, CreatedAt = DateTime.UtcNow };

    private async Task<HttpClient> LoggedInClientAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return client;
    }

    private async Task ConfigureFinancialsAsync(
        HttpClient client, Guid orgId, Guid memberId,
        decimal monthlySalary, decimal clientHourlyRate, int vacationDaysPerYear = 20, string currency = "USD")
    {
        var response = await client.PutAsJsonAsync($"/api/organizations/{orgId}/members/{memberId}/vacation/financials",
            new { monthlySalary, clientHourlyRate, vacationDaysPerYear, currency, isReservePercentManual = false, vacationReservePercent = (decimal?)null });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    // safely-past billing period regardless of when the test suite actually runs
    private static (int Month, int Year) PastBillingPeriod(int monthsAgo = 2)
    {
        var d = DateTime.UtcNow.AddMonths(-monthsAgo);
        return (d.Month, d.Year);
    }

    // financials configured "today" via the API always stamp EffectiveFrom = today; backdate it here
    // so the snapshot is effective for billing periods safely in the past (no proration).
    private async Task BackdateOnlySnapshotAsync(Guid membershipId, DateOnly effectiveFrom)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var snapshot = await db.MemberFinancialsSnapshots.SingleAsync(s => s.MembershipId == membershipId);
        snapshot.EffectiveFrom = effectiveFrom;
        await db.SaveChangesAsync();
    }

    // TC-08-INT-01: Auto-accrual — full month credit
    [Fact]
    public async Task Manual_accrual_creates_full_month_credit()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin-acc01@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target-acc01@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin-acc01@acme.com", "Passw0rd");
        await ConfigureFinancialsAsync(client, org.Id, target.Id, 3000, 40);
        await BackdateOnlySnapshotAsync(target.Id, DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-1)));

        var (month, year) = PastBillingPeriod();
        var response = await client.PostAsJsonAsync("/api/admin/accrual/run", new { month, year });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.True(body.GetProperty("success").GetBoolean());
        Assert.Equal(1, body.GetProperty("processed").GetInt32());
        Assert.Equal(1, body.GetProperty("creditsCreated").GetInt32());
        Assert.Equal(0, body.GetProperty("skipped").GetInt32());

        var vacationResponse = await client.GetAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation");
        var vacationBody = (await vacationResponse.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal(230.88m, vacationBody.GetProperty("balance").GetProperty("reserveBalance").GetDecimal());
        var transactions = vacationBody.GetProperty("transactions");
        Assert.Equal(1, transactions.GetArrayLength());
        var txn = transactions[0];
        Assert.Equal("credit", txn.GetProperty("type").GetString());
        Assert.Equal(230.88m, txn.GetProperty("amount").GetDecimal());
        Assert.Equal(month, txn.GetProperty("billingPeriodMonth").GetInt32());
        Assert.Equal(year, txn.GetProperty("billingPeriodYear").GetInt32());
        Assert.True(txn.GetProperty("isAutoGenerated").GetBoolean());
        Assert.Equal(JsonValueKind.Null, txn.GetProperty("createdBy").ValueKind);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var dbTxn = await db.VacationReserveTransactions.SingleAsync(t => t.MembershipId == target.Id);
        Assert.Null(dbTxn.CreatedByAccountId);
        Assert.True(dbTxn.IsAutoGenerated);
    }

    // TC-08-INT-04: Auto-accrual — idempotency (no duplicate credits)
    [Fact]
    public async Task Manual_accrual_is_idempotent()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin-acc04@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target-acc04@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin-acc04@acme.com", "Passw0rd");
        await ConfigureFinancialsAsync(client, org.Id, target.Id, 3000, 40);
        await BackdateOnlySnapshotAsync(target.Id, DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-1)));

        var (month, year) = PastBillingPeriod();
        await client.PostAsJsonAsync("/api/admin/accrual/run", new { month, year });
        var response = await client.PostAsJsonAsync("/api/admin/accrual/run", new { month, year });

        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal(1, body.GetProperty("processed").GetInt32());
        Assert.Equal(0, body.GetProperty("creditsCreated").GetInt32());
        Assert.Equal(1, body.GetProperty("skipped").GetInt32());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var count = await db.VacationReserveTransactions.CountAsync(t => t.MembershipId == target.Id);
        Assert.Equal(1, count);
    }

    // TC-08-INT-05: Auto-accrual — skips removed members and members without financials
    [Fact]
    public async Task Manual_accrual_skips_removed_and_unconfigured_members()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin-acc05@acme.com", "Passw0rd", role: "admin");
        var (_, m1) = await SeedMemberAsync(org, "m1-acc05@acme.com", "Passw0rd", role: "user");
        var (_, m2) = await SeedMemberAsync(org, "m2-acc05@acme.com", "Passw0rd", role: "user");
        var (_, m3) = await SeedMemberAsync(org, "m3-acc05@acme.com", "Passw0rd", role: "user", status: "removed");

        var client = await LoggedInClientAsync("admin-acc05@acme.com", "Passw0rd");
        await ConfigureFinancialsAsync(client, org.Id, m1.Id, 3000, 40);
        await BackdateOnlySnapshotAsync(m1.Id, DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-1)));

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.MemberFinancials.Add(new MemberFinancials
            {
                Id = Guid.NewGuid(),
                MembershipId = m3.Id,
                MonthlySalary = 3000,
                ClientHourlyRate = 40,
                VacationReservePercent = 3.33m,
                VacationDaysPerYear = 20,
                Currency = "USD",
                UpdatedAt = DateTime.UtcNow,
            });
            db.MemberFinancialsSnapshots.Add(new MemberFinancialsSnapshot
            {
                Id = Guid.NewGuid(),
                MembershipId = m3.Id,
                MonthlySalary = 3000,
                ClientHourlyRate = 40,
                VacationReservePercent = 3.33m,
                VacationDaysPerYear = 20,
                Currency = "USD",
                EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddMonths(-3)),
                CreatedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        var (month, year) = PastBillingPeriod();
        var response = await client.PostAsJsonAsync("/api/admin/accrual/run", new { month, year });

        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal(1, body.GetProperty("processed").GetInt32());
        Assert.Equal(1, body.GetProperty("creditsCreated").GetInt32());
        Assert.Equal(0, body.GetProperty("skipped").GetInt32());

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await verifyDb.VacationReserveTransactions.CountAsync(t => t.MembershipId == m1.Id));
        Assert.Equal(0, await verifyDb.VacationReserveTransactions.CountAsync(t => t.MembershipId == m2.Id));
        Assert.Equal(0, await verifyDb.VacationReserveTransactions.CountAsync(t => t.MembershipId == m3.Id));
    }

    // TC-08-INT-06 / 07: Manual accrual trigger happy path + idempotent (via API contract shape)
    [Fact]
    public async Task Manual_accrual_returns_billing_period_label()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin-acc06@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target-acc06@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin-acc06@acme.com", "Passw0rd");
        await ConfigureFinancialsAsync(client, org.Id, target.Id, 3000, 40);

        var response = await client.PostAsJsonAsync("/api/admin/accrual/run", new { month = 6, year = 2020 });

        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal("June 2020", body.GetProperty("billingPeriod").GetString());
    }

    // TC-08-INT-08: Manual accrual trigger — forbidden for non-admin
    [Theory]
    [InlineData("manager")]
    [InlineData("user")]
    public async Task Manual_accrual_forbidden_for_non_admin(string role)
    {
        var org = NewOrg("Acme " + role);
        await SeedMemberAsync(org, $"caller-acc08-{role}@acme.com", "Passw0rd", role: role);

        var client = await LoggedInClientAsync($"caller-acc08-{role}@acme.com", "Passw0rd");
        var (month, year) = PastBillingPeriod();
        var response = await client.PostAsJsonAsync("/api/admin/accrual/run", new { month, year });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal("forbidden", body.GetProperty("error").GetString());
    }

    // TC-08-INT-09: Manual accrual trigger — future month rejected
    [Fact]
    public async Task Manual_accrual_rejects_future_period()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin-acc09@acme.com", "Passw0rd", role: "admin");

        var client = await LoggedInClientAsync("admin-acc09@acme.com", "Passw0rd");
        var future = DateTime.UtcNow.AddMonths(2);
        var response = await client.PostAsJsonAsync("/api/admin/accrual/run", new { month = future.Month, year = future.Year });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal("future_period", body.GetProperty("error").GetString());
    }

    // Invalid month rejected
    [Fact]
    public async Task Manual_accrual_rejects_invalid_month()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin-acc10@acme.com", "Passw0rd", role: "admin");

        var client = await LoggedInClientAsync("admin-acc10@acme.com", "Passw0rd");
        var response = await client.PostAsJsonAsync("/api/admin/accrual/run", new { month = 13, year = 2024 });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal("invalid_month", body.GetProperty("error").GetString());
    }

    // TC-08-INT-02: Auto-accrual — pro-rated first month
    [Fact]
    public async Task Manual_accrual_prorates_first_partial_month()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin-acc02@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target-acc02@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin-acc02@acme.com", "Passw0rd");

        var (month, year) = PastBillingPeriod();
        var midMonthDate = new DateOnly(year, month, 15);

        // configure financials, then override the snapshot's EffectiveFrom to mid-month
        await ConfigureFinancialsAsync(client, org.Id, target.Id, 3000, 40);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var snapshot = await db.MemberFinancialsSnapshots.SingleAsync(s => s.MembershipId == target.Id);
            snapshot.EffectiveFrom = midMonthDate;
            await db.SaveChangesAsync();
        }

        var response = await client.PostAsJsonAsync("/api/admin/accrual/run", new { month, year });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal(1, body.GetProperty("creditsCreated").GetInt32());

        var monthStart = new DateOnly(year, month, 1);
        var monthEnd = new DateOnly(year, month, DateTime.DaysInMonth(year, month));
        var workingDaysInMonth = VacationAccrualCalculator.CountWeekdays(monthStart, monthEnd);
        var workingDaysFromConfig = VacationAccrualCalculator.CountWeekdays(midMonthDate, monthEnd);
        var fullCredit = VacationAccrualCalculator.CalculateFullMonthCredit(40, 3.33m);
        var expected = VacationAccrualCalculator.CalculateProratedCredit(fullCredit, workingDaysFromConfig, workingDaysInMonth);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var txn = await verifyDb.VacationReserveTransactions.SingleAsync(t => t.MembershipId == target.Id);
        Assert.Equal(expected, txn.Amount);
    }

    // TC-08-INT-03: Auto-accrual — salary change mid-month uses snapshot effective during billing month
    [Fact]
    public async Task Accrual_uses_snapshot_effective_during_billing_month()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin-acc03@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target-acc03@acme.com", "Passw0rd", role: "user");
        var client = await LoggedInClientAsync("admin-acc03@acme.com", "Passw0rd");

        // first snapshot far in the past so no proration kicks in
        await ConfigureFinancialsAsync(client, org.Id, target.Id, 1000, 40);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var snapshot = await db.MemberFinancialsSnapshots.SingleAsync(s => s.MembershipId == target.Id);
            snapshot.EffectiveFrom = DateOnly.FromDateTime(DateTime.UtcNow.AddYears(-1));
            await db.SaveChangesAsync();
        }

        var (month, year) = PastBillingPeriod(3);
        var salaryChangeDate = new DateOnly(year, month, 20);

        // second snapshot, effective mid billing-month, with a different salary
        await ConfigureFinancialsAsync(client, org.Id, target.Id, 2000, 40);
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var snapshot = await db.MemberFinancialsSnapshots
                .Where(s => s.MembershipId == target.Id && s.MonthlySalary == 2000)
                .SingleAsync();
            snapshot.EffectiveFrom = salaryChangeDate;
            await db.SaveChangesAsync();
        }

        var response = await client.PostAsJsonAsync("/api/admin/accrual/run", new { month, year });
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal(1, body.GetProperty("creditsCreated").GetInt32());

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var txn = await verifyDb.VacationReserveTransactions.SingleAsync(t => t.MembershipId == target.Id);
        // uses the snapshot effective during the billing month (salary=2000, rate=40, auto reserve% for salary 2000/rate40/days20)
        var expectedPercent = VacationReserveCalculator.CalculateReservePercent(2000m, 40m, 20);
        var expectedCredit = VacationAccrualCalculator.CalculateFullMonthCredit(40m, expectedPercent);
        Assert.Equal(expectedCredit, txn.Amount);
    }
}
