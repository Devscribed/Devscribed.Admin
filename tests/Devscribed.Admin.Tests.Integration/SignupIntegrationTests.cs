using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Web.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class SignupIntegrationTests : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory;
    private readonly JsonSerializerOptions _jsonOpts = new() { PropertyNameCaseInsensitive = true };

    public SignupIntegrationTests(TestWebAppFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Signup_creates_account_org_and_admin_membership()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Acme Inc",
            firstName = "Pat",
            lastName = "Owner",
            email = "owner@acme.com",
            password = "Password1",
            timezone = "America/New_York",
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var account = await db.Accounts.SingleOrDefaultAsync(a => a.Email == "owner@acme.com");
        Assert.NotNull(account);
        Assert.Equal("Pat", account.FirstName);
        Assert.Equal("Owner", account.LastName);
        Assert.Equal("America/New_York", account.Timezone);

        var org = await db.Organizations.SingleOrDefaultAsync();
        Assert.NotNull(org);
        Assert.Equal("Acme Inc", org.Name);

        var membership = await db.Memberships.SingleOrDefaultAsync();
        Assert.NotNull(membership);
        Assert.Equal(account.Id, membership.AccountId);
        Assert.Equal(org.Id, membership.OrganizationId);
        Assert.Equal("admin", membership.Role);
        Assert.Equal("active", membership.Status);
    }

    [Fact]
    public async Task Duplicate_email_is_rejected()
    {
        var factory = new TestWebAppFactory();
        var client = factory.CreateClient();

        await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "First Org",
            firstName = "Pat",
            lastName = "Owner",
            email = "dup@acme.com",
            password = "Password1",
        });

        var response = await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Second Org",
            firstName = "Other",
            lastName = "Person",
            email = "dup@acme.com",
            password = "Password2",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This email is already registered",
            body!.RootElement.GetProperty("message").GetString());

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.Organizations.CountAsync());
    }

    [Fact]
    public async Task Duplicate_email_is_case_insensitive()
    {
        var factory = new TestWebAppFactory();
        var client = factory.CreateClient();

        await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Org",
            firstName = "Pat",
            lastName = "Owner",
            email = "case@acme.com",
            password = "Password1",
        });

        var r1 = await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Org2",
            firstName = "A",
            lastName = "B",
            email = "CASE@ACME.COM",
            password = "Password1",
        });

        var r2 = await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Org3",
            firstName = "C",
            lastName = "D",
            email = "Case@Acme.Com",
            password = "Password1",
        });

        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(1, await db.Accounts.CountAsync());
    }

    [Fact]
    public async Task Timezone_is_stored()
    {
        var factory = new TestWebAppFactory();
        var client = factory.CreateClient();

        await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "TZ Org",
            firstName = "Pat",
            lastName = "Owner",
            email = "tz@acme.com",
            password = "Password1",
            timezone = "America/New_York",
        });

        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db.Accounts.SingleAsync();
        Assert.Equal("America/New_York", account.Timezone);
    }
}
