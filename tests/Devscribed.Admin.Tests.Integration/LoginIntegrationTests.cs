using System.Net;
using System.Net.Http.Json;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class LoginIntegrationTests : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory;

    public LoginIntegrationTests(TestWebAppFactory factory)
    {
        _factory = factory;
    }

    private async Task<(Account account, Organization org, Membership membership)> SeedAccountAsync(
        string email, string password, string status = "active")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = hasher.Hash(password),
            FirstName = "Pat",
            LastName = "Owner",
            CreatedAt = DateTime.UtcNow,
        };
        var org = new Organization
        {
            Id = Guid.NewGuid(),
            Name = "Acme Inc",
            CreatedAt = DateTime.UtcNow,
        };
        var membership = new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = org.Id,
            Role = "admin",
            Status = status,
            JoinedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);
        db.Organizations.Add(org);
        db.Memberships.Add(membership);
        await db.SaveChangesAsync();

        return (account, org, membership);
    }

    [Fact]
    public async Task Successful_login_returns_200_and_sets_session_cookie()
    {
        await SeedAccountAsync("pat@acme.com", "Passw0rd");

        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new
        {
            email = "pat@acme.com",
            password = "Passw0rd",
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Wrong_password_is_rejected_with_generic_message()
    {
        await SeedAccountAsync("wrongpw@acme.com", "Passw0rd");

        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new
        {
            email = "wrongpw@acme.com",
            password = "nope",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonDocument>();
        Assert.Equal("Invalid email or password", body!.RootElement.GetProperty("message").GetString());
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Unknown_email_is_rejected_with_same_generic_message()
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new
        {
            email = "ghost@acme.com",
            password = "anything",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonDocument>();
        Assert.Equal("Invalid email or password", body!.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Removed_member_login_with_correct_password_shows_deactivation_message()
    {
        await SeedAccountAsync("ex@acme.com", "Passw0rd", status: "removed");

        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new
        {
            email = "ex@acme.com",
            password = "Passw0rd",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonDocument>();
        Assert.Equal("Your account has been deactivated, contact your administrator",
            body!.RootElement.GetProperty("message").GetString());
        Assert.False(response.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Removed_member_login_with_wrong_password_still_shows_deactivation_message()
    {
        await SeedAccountAsync("ex2@acme.com", "Passw0rd", status: "removed");

        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new
        {
            email = "ex2@acme.com",
            password = "wrongpassword",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonDocument>();
        Assert.Equal("Your account has been deactivated, contact your administrator",
            body!.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("", "")]
    [InlineData("  ", "  ")]
    [InlineData("pat2@acme.com", "")]
    public async Task Empty_or_whitespace_credentials_rejected(string email, string password)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new { email, password });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<System.Text.Json.JsonDocument>();
        Assert.Equal("Email and password are required", body!.RootElement.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("pat3a@acme.com", "PAT3A@ACME.COM")]
    [InlineData("pat3b@acme.com", "Pat3b@Acme.Com")]
    public async Task Login_is_case_insensitive_on_email(string seedEmail, string loginEmail)
    {
        await SeedAccountAsync(seedEmail, "Passw0rd");

        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new
        {
            email = loginEmail,
            password = "Passw0rd",
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
