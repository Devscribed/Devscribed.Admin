using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class VacationFinancialsIntegrationTests : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory;

    public VacationFinancialsIntegrationTests(TestWebAppFactory factory)
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

    // TC-07-INT-01: Create financial settings — happy path
    [Fact]
    public async Task Admin_creates_financial_settings_auto_calculates_percent_and_creates_snapshot()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin01@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target01@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin01@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation/financials",
            new { monthlySalary = 3000, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = false, vacationReservePercent = (decimal?)null });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.True(body.GetProperty("success").GetBoolean());
        Assert.Equal(3.33m, body.GetProperty("vacationReservePercent").GetDecimal());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var snapshot = await db.MemberFinancialsSnapshots.SingleAsync(s => s.MembershipId == target.Id);
        Assert.Equal(DateOnly.FromDateTime(DateTime.UtcNow), snapshot.EffectiveFrom);
        Assert.Equal(3.33m, snapshot.VacationReservePercent);
        Assert.Equal(3000m, snapshot.MonthlySalary);
    }

    // TC-07-INT-02: Create financial settings — manual reserve %
    [Fact]
    public async Task Admin_sets_manual_reserve_percent()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin02@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target02@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin02@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation/financials",
            new { monthlySalary = 3000, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = true, vacationReservePercent = 5.00m });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal(5.00m, body.GetProperty("vacationReservePercent").GetDecimal());
    }

    // TC-07-INT-03: Create financial settings — validation errors
    [Theory]
    [InlineData("monthlySalary")]
    [InlineData("clientHourlyRate")]
    [InlineData("vacationDaysPerYear")]
    [InlineData("currency")]
    [InlineData("vacationReservePercent")]
    public async Task Invalid_field_values_are_rejected(string invalidField)
    {
        var slug = invalidField.ToLowerInvariant();
        var org = NewOrg("Acme " + slug);
        await SeedMemberAsync(org, $"admin03-{slug}@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, $"target03-{slug}@acme.com", "Passw0rd", role: "user");

        object payload = invalidField switch
        {
            "monthlySalary" => new { monthlySalary = 0, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = false, vacationReservePercent = (decimal?)null },
            "clientHourlyRate" => new { monthlySalary = 3000, clientHourlyRate = -5, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = false, vacationReservePercent = (decimal?)null },
            "vacationDaysPerYear" => new { monthlySalary = 3000, clientHourlyRate = 40, vacationDaysPerYear = 0, currency = "USD", isReservePercentManual = false, vacationReservePercent = (decimal?)null },
            "currency" => new { monthlySalary = 3000, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "XXXX", isReservePercentManual = false, vacationReservePercent = (decimal?)null },
            "vacationReservePercent" => new { monthlySalary = 3000, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = true, vacationReservePercent = (decimal?)100 },
            _ => throw new InvalidOperationException(),
        };

        var client = await LoggedInClientAsync($"admin03-{slug}@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation/financials", payload);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.True(body.GetProperty("errors").TryGetProperty(invalidField, out _));
    }

    // TC-07-INT-04: Create financial settings — forbidden for user/viewer
    [Theory]
    [InlineData("user")]
    [InlineData("viewer")]
    public async Task Update_financials_forbidden_for_user_or_viewer(string role)
    {
        var org = NewOrg("Acme " + role);
        await SeedMemberAsync(org, $"caller04-{role}@acme.com", "Passw0rd", role: role);
        var (_, target) = await SeedMemberAsync(org, $"target04-{role}@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync($"caller04-{role}@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation/financials",
            new { monthlySalary = 3000, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = false, vacationReservePercent = (decimal?)null });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal("forbidden", body.GetProperty("error").GetString());
    }

    // TC-07-INT-05: Update financials recalculates auto-percent and creates a new snapshot
    [Fact]
    public async Task Updating_salary_recalculates_auto_percent_and_creates_new_snapshot()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin05@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target05@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin05@acme.com", "Passw0rd");
        await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation/financials",
            new { monthlySalary = 3000, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = false, vacationReservePercent = (decimal?)null });

        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation/financials",
            new { monthlySalary = 4000, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = false, vacationReservePercent = (decimal?)null });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal(4.44m, body.GetProperty("vacationReservePercent").GetDecimal());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var snapshots = await db.MemberFinancialsSnapshots.Where(s => s.MembershipId == target.Id).ToListAsync();
        Assert.Equal(2, snapshots.Count);
        Assert.Contains(snapshots, s => s.MonthlySalary == 4000m && s.VacationReservePercent == 4.44m);

        var financials = await db.MemberFinancials.SingleAsync(f => f.MembershipId == target.Id);
        Assert.Equal(4000m, financials.MonthlySalary);
    }

    // TC-07-INT-06: Financials for removed member rejected
    [Fact]
    public async Task Update_financials_rejected_for_removed_member()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin06@acme.com", "Passw0rd", role: "admin");
        var (_, removed) = await SeedMemberAsync(org, "removed06@acme.com", "Passw0rd", role: "user", status: "removed");

        var client = await LoggedInClientAsync("admin06@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{removed.Id}/vacation/financials",
            new { monthlySalary = 3000, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = false, vacationReservePercent = (decimal?)null });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal("member_removed", body.GetProperty("error").GetString());
    }

    // TC-07-INT-07: View vacation — user sees own data only
    [Fact]
    public async Task User_can_view_own_vacation_but_not_others()
    {
        var org = NewOrg("Acme Inc");
        var (_, user) = await SeedMemberAsync(org, "user07@acme.com", "Passw0rd", role: "user");
        var (_, other) = await SeedMemberAsync(org, "other07@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("user07@acme.com", "Passw0rd");

        var ownResponse = await client.GetAsync($"/api/organizations/{org.Id}/members/{user.Id}/vacation");
        Assert.Equal(HttpStatusCode.OK, ownResponse.StatusCode);
        var ownBody = (await ownResponse.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal(JsonValueKind.Null, ownBody.GetProperty("financials").ValueKind);
        Assert.False(ownBody.GetProperty("canEdit").GetBoolean());

        var otherResponse = await client.GetAsync($"/api/organizations/{org.Id}/members/{other.Id}/vacation");
        Assert.Equal(HttpStatusCode.Forbidden, otherResponse.StatusCode);
        var otherBody = (await otherResponse.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal("forbidden", otherBody.GetProperty("error").GetString());
    }

    // TC-07-INT-08: View vacation — viewer gets 403
    [Fact]
    public async Task Viewer_cannot_view_any_vacation_data()
    {
        var org = NewOrg("Acme Inc");
        var (_, viewer) = await SeedMemberAsync(org, "viewer08@acme.com", "Passw0rd", role: "viewer");
        var (_, other) = await SeedMemberAsync(org, "other08@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("viewer08@acme.com", "Passw0rd");

        var otherResponse = await client.GetAsync($"/api/organizations/{org.Id}/members/{other.Id}/vacation");
        Assert.Equal(HttpStatusCode.Forbidden, otherResponse.StatusCode);

        var ownResponse = await client.GetAsync($"/api/organizations/{org.Id}/members/{viewer.Id}/vacation");
        Assert.Equal(HttpStatusCode.Forbidden, ownResponse.StatusCode);
    }

    // TC-07-INT-01 (GET part): admin sees full financials and zeroed balance after setup
    [Fact]
    public async Task Admin_views_full_vacation_data_after_financials_configured()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin09@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target09@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin09@acme.com", "Passw0rd");
        await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation/financials",
            new { monthlySalary = 3000, clientHourlyRate = 40, vacationDaysPerYear = 20, currency = "USD", isReservePercentManual = false, vacationReservePercent = (decimal?)null });

        var response = await client.GetAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        var financials = body.GetProperty("financials");
        Assert.Equal(3000.00m, financials.GetProperty("monthlySalary").GetDecimal());
        Assert.Equal(40.00m, financials.GetProperty("clientHourlyRate").GetDecimal());
        Assert.Equal(3.33m, financials.GetProperty("vacationReservePercent").GetDecimal());
        Assert.False(financials.GetProperty("isReservePercentManual").GetBoolean());
        Assert.Equal(20, financials.GetProperty("vacationDaysPerYear").GetInt32());
        Assert.Equal("USD", financials.GetProperty("currency").GetString());

        var balance = body.GetProperty("balance");
        Assert.Equal(0, balance.GetProperty("reserveBalance").GetDecimal());
        Assert.Equal(0, balance.GetProperty("availableDays").GetInt32());
        Assert.Equal(0, balance.GetProperty("usedDays").GetInt32());
        Assert.Equal(0, balance.GetProperty("pendingDays").GetInt32());
        Assert.Equal(20, balance.GetProperty("totalDaysPerYear").GetInt32());

        Assert.True(body.GetProperty("canEdit").GetBoolean());
    }

    // GET vacation for member with no financials configured returns nulls but canEdit true for admin
    [Fact]
    public async Task Admin_views_vacation_before_financials_configured()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin10@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target10@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin10@acme.com", "Passw0rd");
        var response = await client.GetAsync($"/api/organizations/{org.Id}/members/{target.Id}/vacation");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal(JsonValueKind.Null, body.GetProperty("financials").ValueKind);
        Assert.Equal(JsonValueKind.Null, body.GetProperty("balance").ValueKind);
        Assert.True(body.GetProperty("canEdit").GetBoolean());
    }
}
