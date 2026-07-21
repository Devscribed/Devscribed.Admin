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
public class ResetPasswordEndpointTests
{
    private readonly IntegrationTestFixture _fixture;

    public ResetPasswordEndpointTests(IntegrationTestFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task Forgot_password_issues_single_use_token_and_is_enumeration_safe()
    {
        var email = "reset-single@acme.com";
        await CreateActiveAccount(email, "Passw0rd");
        var initialEmailCount = _fixture.EmailService.SentEmails.Count;

        // Step 1: Request reset for existing account
        var resp1 = await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email });
        Assert.True(resp1.IsSuccessStatusCode);
        var body1 = await resp1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("If an account exists, a reset link has been sent", body1.GetProperty("message").GetString());

        // Step 2: Request reset for nonexistent account — same response
        var resp2 = await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password",
            new { email = "ghost-reset@acme.com" });
        Assert.True(resp2.IsSuccessStatusCode);
        var body2 = await resp2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("If an account exists, a reset link has been sent", body2.GetProperty("message").GetString());

        // Only one email should have been sent (for the existing account)
        Assert.Equal(initialEmailCount + 1, _fixture.EmailService.SentEmails.Count);

        // Step 3: Use the token to reset password
        var token = _fixture.EmailService.SentEmails.Last().Token;
        var resetResp = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token, password = "NewPass1", passwordConfirmation = "NewPass1" });
        Assert.True(resetResp.IsSuccessStatusCode, await resetResp.Content.ReadAsStringAsync());

        // Step 4: Try to reuse the same token
        var reuseResp = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token, password = "NewPass2", passwordConfirmation = "NewPass2" });
        Assert.Equal(HttpStatusCode.BadRequest, reuseResp.StatusCode);
        var reuseBody = await reuseResp.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This reset link is invalid or has expired", reuseBody.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Password_reset_revokes_all_existing_sessions()
    {
        var email = "reset-revoke@acme.com";
        await CreateActiveAccount(email, "Passw0rd");

        // Login to get a session
        var loginResp = await _fixture.HttpClient.PostAsJsonAsync("/api/login",
            new { email, password = "Passw0rd" });
        Assert.True(loginResp.IsSuccessStatusCode);

        // Record the security stamp before reset
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var account = await db.Accounts.FirstAsync(a => a.Email == email);
            var stampBefore = account.SecurityStamp;

            // Request password reset
            await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email });
            var token = _fixture.EmailService.SentEmails.Last().Token;

            // Perform the reset
            var resetResp = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
                new { token, password = "Changed1", passwordConfirmation = "Changed1" });
            Assert.True(resetResp.IsSuccessStatusCode);

            // Re-fetch the account to check SecurityStamp was regenerated
            await db.Entry(account).ReloadAsync();
            Assert.NotEqual(stampBefore, account.SecurityStamp);
        }

        // The old session cookie should no longer work — /api/members requires auth
        var membersResp = await _fixture.HttpClient.GetAsync("/api/members");
        Assert.Equal(HttpStatusCode.Unauthorized, membersResp.StatusCode);
    }

    [Fact]
    public async Task Reset_with_policy_violating_password_does_not_consume_token()
    {
        var email = "reset-policy@acme.com";
        await CreateActiveAccount(email, "Passw0rd");

        await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email });
        var token = _fixture.EmailService.SentEmails.Last().Token;

        // Too short
        var resp1 = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token, password = "short", passwordConfirmation = "short" });
        Assert.Equal(HttpStatusCode.BadRequest, resp1.StatusCode);
        var body1 = await resp1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Password must be at least 8 characters", body1.GetProperty("message").GetString());

        // No letter
        var resp2 = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token, password = "12345678", passwordConfirmation = "12345678" });
        Assert.Equal(HttpStatusCode.BadRequest, resp2.StatusCode);
        var body2 = await resp2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Password must contain at least one letter", body2.GetProperty("message").GetString());

        // Token should still be valid for a correct password
        var resp3 = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token, password = "ValidPw1", passwordConfirmation = "ValidPw1" });
        Assert.True(resp3.IsSuccessStatusCode, await resp3.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Reset_with_password_confirmation_mismatch()
    {
        var email = "reset-mismatch@acme.com";
        await CreateActiveAccount(email, "Passw0rd");

        await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email });
        var token = _fixture.EmailService.SentEmails.Last().Token;

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token, password = "NewPass1", passwordConfirmation = "NewPass2" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Passwords do not match", body.GetProperty("message").GetString());

        // Token should NOT be consumed — can still use it
        var successResp = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token, password = "NewPass1", passwordConfirmation = "NewPass1" });
        Assert.True(successResp.IsSuccessStatusCode);
    }

    [Fact]
    public async Task Invalid_token_is_rejected()
    {
        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token = "totally-invalid-token", password = "NewPass1", passwordConfirmation = "NewPass1" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This reset link is invalid or has expired", body.GetProperty("message").GetString());
    }

    private async Task CreateActiveAccount(string email, string password)
    {
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        if (await db.Accounts.AnyAsync(a => a.Email == email))
            return;

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
