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
public class ForgotPasswordEndpointTests
{
    private readonly IntegrationTestFixture _fixture;

    public ForgotPasswordEndpointTests(IntegrationTestFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task Empty_email_is_rejected()
    {
        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Email is required", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Whitespace_email_is_rejected()
    {
        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email = "  " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Email is required", body.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Existing_active_account_receives_neutral_message_and_email()
    {
        var email = "forgot-active@acme.com";
        await CreateActiveAccount(email, "Passw0rd");
        var initialEmailCount = _fixture.EmailService.SentEmails.Count;

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email });

        Assert.True(response.IsSuccessStatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("If an account exists, a reset link has been sent", body.GetProperty("message").GetString());

        Assert.Equal(initialEmailCount + 1, _fixture.EmailService.SentEmails.Count);
        var sentEmail = _fixture.EmailService.SentEmails.Last();
        Assert.Equal(email, sentEmail.Email);
    }

    [Fact]
    public async Task Nonexistent_email_receives_same_neutral_message_and_no_email()
    {
        var initialEmailCount = _fixture.EmailService.SentEmails.Count;

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password",
            new { email = "ghost-forgot@acme.com" });

        Assert.True(response.IsSuccessStatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("If an account exists, a reset link has been sent", body.GetProperty("message").GetString());

        Assert.Equal(initialEmailCount, _fixture.EmailService.SentEmails.Count);
    }

    [Fact]
    public async Task Removed_member_receives_neutral_message_but_no_email()
    {
        var email = "forgot-removed@acme.com";
        await CreateRemovedAccount(email, "Passw0rd");
        var initialEmailCount = _fixture.EmailService.SentEmails.Count;

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email });

        Assert.True(response.IsSuccessStatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("If an account exists, a reset link has been sent", body.GetProperty("message").GetString());

        Assert.Equal(initialEmailCount, _fixture.EmailService.SentEmails.Count);
    }

    [Fact]
    public async Task New_reset_request_invalidates_prior_token()
    {
        var email = "forgot-invalidate@acme.com";
        await CreateActiveAccount(email, "Passw0rd");

        // First request
        await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email });
        var token1 = _fixture.EmailService.SentEmails.Last().Token;

        // Second request
        await _fixture.HttpClient.PostAsJsonAsync("/api/forgot-password", new { email });
        var token2 = _fixture.EmailService.SentEmails.Last().Token;

        Assert.NotEqual(token1, token2);

        // Try to use token1 — should be invalidated
        var resetResponse = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token = token1, password = "NewPass1", passwordConfirmation = "NewPass1" });

        Assert.Equal(HttpStatusCode.BadRequest, resetResponse.StatusCode);
        var body = await resetResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This reset link is invalid or has expired", body.GetProperty("message").GetString());

        // Token2 should still work
        var resetResponse2 = await _fixture.HttpClient.PostAsJsonAsync("/api/reset-password",
            new { token = token2, password = "NewPass1", passwordConfirmation = "NewPass1" });
        Assert.True(resetResponse2.IsSuccessStatusCode, await resetResponse2.Content.ReadAsStringAsync());
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
