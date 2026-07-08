using System.Net;
using System.Net.Http.Json;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests;

/// <summary>TC-07-INT-01 and TC-07-INT-02: Change email and change password integration tests.</summary>
public class AccountSettingsEndpointTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private WebApplicationFactory<Program> _factory = null!;

    private Guid _organizationId;
    private Account _account = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _organizationId = Guid.NewGuid();

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<AdminDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                services.AddDbContext<AdminDbContext>(options => options.UseSqlite(_connection));

                services.AddAuthentication("Test")
                    .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>("Test", _ => { });
            });
        });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        await db.Database.EnsureCreatedAsync();

        var org = new Organization { Id = _organizationId, Name = "Acme Inc" };

        _account = new Account
        {
            Email = "pat@acme.com",
            PasswordHash = scope.ServiceProvider
                .GetRequiredService<Application.Security.IPasswordHasher>()
                .Hash("Passw0rd"),
            FirstName = "Pat",
            LastName = "Admin"
        };

        var membership = new Membership
        {
            AccountId = _account.Id,
            OrganizationId = _organizationId,
            Role = MembershipRole.Admin,
            Status = MembershipStatus.Active
        };

        db.Organizations.Add(org);
        db.Accounts.Add(_account);
        db.Memberships.Add(membership);
        await db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _connection.DisposeAsync();
    }

    private HttpClient CreateClient()
    {
        var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("X-Test-AccountId", _account.Id.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Email", _account.Email);
        client.DefaultRequestHeaders.Add("X-Test-Role", MembershipRole.Admin.ToString());
        client.DefaultRequestHeaders.Add("X-Test-OrgId", _organizationId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-OrgName", "Acme Inc");
        client.DefaultRequestHeaders.Add("X-Test-FirstName", _account.FirstName);
        client.DefaultRequestHeaders.Add("X-Test-LastName", _account.LastName);
        return client;
    }

    /// <summary>TC-07-INT-01: Change email requires confirmation before it takes effect.</summary>
    [Fact]
    public async Task Change_email_requires_confirmation()
    {
        using var client = CreateClient();

        var requestResponse = await client.PostAsJsonAsync(
            "/api/account/change-email",
            new { newEmail = "new@acme.com" });
        Assert.Equal(HttpStatusCode.OK, requestResponse.StatusCode);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
            var account = await db.Accounts.FindAsync(_account.Id);
            Assert.Equal("pat@acme.com", account!.Email);

            var token = await db.EmailChangeTokens.FirstAsync(t => t.AccountId == _account.Id);
            Assert.Equal("new@acme.com", token.NewEmail);

            var confirmResponse = await client.PostAsJsonAsync(
                "/api/account/confirm-email",
                new { token = token.Token });
            Assert.Equal(HttpStatusCode.OK, confirmResponse.StatusCode);
        }

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
            var account = await db.Accounts.FindAsync(_account.Id);
            Assert.Equal("new@acme.com", account!.Email);
        }
    }

    /// <summary>TC-07-INT-02: Change password requires the correct current password.</summary>
    [Fact]
    public async Task Change_password_rejects_wrong_current_password()
    {
        using var client = CreateClient();

        var wrongResponse = await client.PostAsJsonAsync(
            "/api/account/change-password",
            new { currentPassword = "wrong", newPassword = "NewPass1", confirmPassword = "NewPass1" });
        Assert.Equal(HttpStatusCode.BadRequest, wrongResponse.StatusCode);

        var wrongBody = await wrongResponse.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("current password is incorrect", wrongBody!.Error);
    }

    [Fact]
    public async Task Change_password_succeeds_with_correct_current()
    {
        using var client = CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/account/change-password",
            new { currentPassword = "Passw0rd", newPassword = "NewPass1", confirmPassword = "NewPass1" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        var account = await db.Accounts.FindAsync(_account.Id);
        var hasher = scope.ServiceProvider.GetRequiredService<Application.Security.IPasswordHasher>();
        Assert.True(hasher.Verify(account!.PasswordHash, "NewPass1"));
    }

    [Fact]
    public async Task Update_info_saves_fields()
    {
        using var client = CreateClient();

        var response = await client.PutAsJsonAsync(
            "/api/account/info",
            new
            {
                firstName = "Dima",
                lastName = "Bezzubenkov",
                phoneCountryCode = "US",
                phoneNumber = "+1 (555) 123-4567",
                timezone = "America/Los_Angeles",
                firstDayOfWeek = "Monday"
            });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        var account = await db.Accounts.FindAsync(_account.Id);
        Assert.Equal("Dima", account!.FirstName);
        Assert.Equal("Bezzubenkov", account.LastName);
        Assert.Equal("US", account.PhoneCountryCode);
        Assert.Equal("America/Los_Angeles", account.Timezone);
        Assert.Equal("Monday", account.FirstDayOfWeek);
    }

    [Fact]
    public async Task Update_info_rejects_empty_first_name()
    {
        using var client = CreateClient();

        var response = await client.PutAsJsonAsync(
            "/api/account/info",
            new { firstName = "", lastName = "Bezzubenkov" });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    private record ErrorResponse(string? Error);
}
