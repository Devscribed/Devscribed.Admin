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

/// <summary>TC-07-E2E-01, TC-07-E2E-02, TC-07-E2E-03: Account settings page rendering and flows.</summary>
public class AccountSettingsE2eTests : IAsyncLifetime
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
            LastName = "Owner"
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

    /// <summary>TC-07-E2E-01: Account settings page renders with all required data-testid attributes.</summary>
    [Fact]
    public async Task Account_settings_page_renders_with_testids()
    {
        using var client = CreateClient();
        var html = await client.GetStringAsync("/AccountSettings");

        Assert.Contains("data-testid=\"account-settings\"", html);
        Assert.Contains("data-testid=\"change-email-open-button\"", html);
        Assert.Contains("data-testid=\"change-password-open-button\"", html);
        Assert.Contains("data-testid=\"change-email-form\"", html);
        Assert.Contains("data-testid=\"change-email-new-input\"", html);
        Assert.Contains("data-testid=\"change-email-submit-button\"", html);
        Assert.Contains("data-testid=\"change-email-confirmation-message\"", html);
        Assert.Contains("data-testid=\"change-email-error\"", html);
        Assert.Contains("data-testid=\"change-password-form\"", html);
        Assert.Contains("data-testid=\"change-password-current-input\"", html);
        Assert.Contains("data-testid=\"change-password-new-input\"", html);
        Assert.Contains("data-testid=\"change-password-confirm-input\"", html);
        Assert.Contains("data-testid=\"change-password-submit-button\"", html);
        Assert.Contains("data-testid=\"change-password-error\"", html);
        Assert.Contains("data-testid=\"edit-first-name-input\"", html);
        Assert.Contains("data-testid=\"edit-last-name-input\"", html);
        Assert.Contains("data-testid=\"edit-phone-country-select\"", html);
        Assert.Contains("data-testid=\"edit-phone-number-input\"", html);
        Assert.Contains("data-testid=\"edit-timezone-select\"", html);
        Assert.Contains("data-testid=\"edit-first-day-select\"", html);
        Assert.Contains("data-testid=\"account-save-button\"", html);
        Assert.Contains("data-testid=\"toast-account-saved\"", html);
    }

    /// <summary>TC-07-E2E-01: Edit information persists after save + page reload.</summary>
    [Fact]
    public async Task Edit_information_persists_after_save()
    {
        using var client = CreateClient();

        var saveResponse = await client.PutAsJsonAsync(
            "/api/account/info",
            new
            {
                firstName = "Dima",
                lastName = "Bezzubenkov",
                timezone = "America/Los_Angeles",
                firstDayOfWeek = "Monday"
            });
        Assert.Equal(HttpStatusCode.OK, saveResponse.StatusCode);

        var html = await client.GetStringAsync("/AccountSettings");
        Assert.Contains("value=\"Dima\"", html);
        Assert.Contains("value=\"Bezzubenkov\"", html);
        Assert.Contains("data-initial=\"America/Los_Angeles\"", html);
        Assert.Contains("data-initial=\"Monday\"", html);
    }

    /// <summary>TC-07-E2E-02: Change email confirmation flow round-trip.</summary>
    [Fact]
    public async Task Change_email_confirmation_round_trip()
    {
        using var client = CreateClient();

        var requestResponse = await client.PostAsJsonAsync(
            "/api/account/change-email",
            new { newEmail = "new@acme.com" });
        Assert.Equal(HttpStatusCode.OK, requestResponse.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        var token = await db.EmailChangeTokens.FirstAsync(t => t.AccountId == _account.Id);

        var confirmResponse = await client.PostAsJsonAsync(
            "/api/account/confirm-email",
            new { token = token.Token });
        Assert.Equal(HttpStatusCode.OK, confirmResponse.StatusCode);

        var account = await db.Accounts.FindAsync(_account.Id);
        Assert.Equal("new@acme.com", account!.Email);
    }

    /// <summary>TC-07-E2E-03: Change password with wrong current shows error.</summary>
    [Fact]
    public async Task Change_password_wrong_current_returns_error()
    {
        using var client = CreateClient();

        var response = await client.PostAsJsonAsync(
            "/api/account/change-password",
            new { currentPassword = "wrong", newPassword = "NewPass1", confirmPassword = "NewPass1" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("current password is incorrect", body!.Error);
    }

    private record ErrorResponse(string? Error);
}
