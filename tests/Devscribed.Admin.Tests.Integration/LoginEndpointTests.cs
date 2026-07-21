using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Infrastructure.Data;
using Devscribed.Admin.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

[Collection("Integration")]
public class LoginEndpointTests
{
    private readonly IntegrationTestFixture _fixture;

    public LoginEndpointTests(IntegrationTestFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task Empty_credentials_are_rejected()
    {
        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/login", new { email = "", password = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Email and password are required", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Whitespace_only_credentials_are_rejected()
    {
        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/login", new { email = "  ", password = "  " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Email and password are required", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Email_present_but_empty_password_is_rejected()
    {
        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/login", new { email = "pat@acme.com", password = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Email and password are required", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Unknown_email_is_rejected_with_generic_message()
    {
        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/login",
            new { email = "ghost@acme.com", password = "anything" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Invalid email or password", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Successful_login_returns_accountId_and_cookie()
    {
        await CreateActiveAccount("login-ok@acme.com", "Passw0rd");

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/login",
            new { email = "login-ok@acme.com", password = "Passw0rd" });

        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        Assert.True(response.Headers.TryGetValues("Set-Cookie", out _), "Expected session cookie");

        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.TryGetProperty("accountId", out _));
    }

    [Fact]
    public async Task Wrong_password_is_rejected()
    {
        await CreateActiveAccount("wrongpw@acme.com", "Passw0rd");

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/login",
            new { email = "wrongpw@acme.com", password = "nope1234" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Invalid email or password", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Removed_member_with_correct_password_shows_deactivation_message()
    {
        await CreateRemovedAccount("removed-ok@acme.com", "Passw0rd");

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/login",
            new { email = "removed-ok@acme.com", password = "Passw0rd" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Your account has been deactivated, contact your administrator",
            body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Removed_member_with_wrong_password_still_shows_deactivation_message()
    {
        await CreateRemovedAccount("removed-wrong@acme.com", "Passw0rd");

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/login",
            new { email = "removed-wrong@acme.com", password = "wrongpassword" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Your account has been deactivated, contact your administrator",
            body.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData("LOGIN-CASE@ACME.COM")]
    [InlineData("Login-Case@Acme.Com")]
    public async Task Login_is_case_insensitive_on_email(string loginEmail)
    {
        // Ensure account exists — only created once due to unique email
        await CreateActiveAccountIfNotExists("login-case@acme.com", "Passw0rd");

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/login",
            new { email = loginEmail, password = "Passw0rd" });

        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
    }

    private async Task CreateActiveAccount(string email, string password)
    {
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = PasswordHasher.Hash(password),
            FirstName = "Test",
            LastName = "User",
            CreatedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);

        var org = new Organization { Id = Guid.NewGuid(), Name = $"Org-{email}", CreatedAt = DateTime.UtcNow };
        db.Organizations.Add(org);

        db.Memberships.Add(new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = org.Id,
            Role = MemberRole.Admin,
            Status = MembershipStatus.Active,
            JoinedAt = DateTime.UtcNow,
        });

        await db.SaveChangesAsync();
    }

    private async Task CreateActiveAccountIfNotExists(string email, string password)
    {
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (!await db.Accounts.AnyAsync(a => a.Email == email))
        {
            var account = new Account
            {
                Id = Guid.NewGuid(),
                Email = email,
                PasswordHash = PasswordHasher.Hash(password),
                FirstName = "Test",
                LastName = "User",
                CreatedAt = DateTime.UtcNow,
            };
            db.Accounts.Add(account);

            var org = new Organization { Id = Guid.NewGuid(), Name = $"Org-{email}", CreatedAt = DateTime.UtcNow };
            db.Organizations.Add(org);

            db.Memberships.Add(new Membership
            {
                Id = Guid.NewGuid(),
                AccountId = account.Id,
                OrganizationId = org.Id,
                Role = MemberRole.Admin,
                Status = MembershipStatus.Active,
                JoinedAt = DateTime.UtcNow,
            });

            await db.SaveChangesAsync();
        }
    }

    private async Task CreateRemovedAccount(string email, string password)
    {
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = PasswordHasher.Hash(password),
            FirstName = "Ex",
            LastName = "Member",
            CreatedAt = DateTime.UtcNow,
        };
        db.Accounts.Add(account);

        var org = new Organization { Id = Guid.NewGuid(), Name = $"Org-{email}", CreatedAt = DateTime.UtcNow };
        db.Organizations.Add(org);

        db.Memberships.Add(new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = org.Id,
            Role = MemberRole.User,
            Status = MembershipStatus.Removed,
            JoinedAt = DateTime.UtcNow,
        });

        await db.SaveChangesAsync();
    }
}
