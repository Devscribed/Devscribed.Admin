using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class ForgotResetPasswordIntegrationTests : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory;

    public ForgotResetPasswordIntegrationTests(TestWebAppFactory factory)
    {
        _factory = factory;
    }

    private async Task<Account> SeedAccountAsync(string email, string password, string status = "active")
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
        var org = new Organization { Id = Guid.NewGuid(), Name = "Acme Inc", CreatedAt = DateTime.UtcNow };
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
        return account;
    }

    private static string ExtractToken(string emailBody)
    {
        var match = Regex.Match(emailBody, @"token=([^\s&]+)");
        Assert.True(match.Success, "No token found in email body: " + emailBody);
        return match.Groups[1].Value;
    }

    [Fact]
    public async Task Forgot_password_issues_single_use_token_and_is_enumeration_safe()
    {
        await SeedAccountAsync("pat@acme.com", "Passw0rd");
        var client = _factory.CreateClient();

        var r1 = await client.PostAsJsonAsync("/api/forgot-password", new { email = "pat@acme.com" });
        var r2 = await client.PostAsJsonAsync("/api/forgot-password", new { email = "ghost@acme.com" });

        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);

        var body1 = await r1.Content.ReadFromJsonAsync<JsonDocument>();
        var body2 = await r2.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("If an account exists, a reset link has been sent", body1!.RootElement.GetProperty("message").GetString());
        Assert.Equal(body1.RootElement.GetProperty("message").GetString(), body2!.RootElement.GetProperty("message").GetString());

        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        Assert.Single(sender.Sent, e => e.ToEmail == "pat@acme.com");
        Assert.DoesNotContain(sender.Sent, e => e.ToEmail == "ghost@acme.com");

        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "pat@acme.com").Body);

        var resetResponse = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token,
            password = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.OK, resetResponse.StatusCode);

        var reuseResponse = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token,
            password = "AnotherPass1",
            passwordConfirmation = "AnotherPass1",
        });
        Assert.Equal(HttpStatusCode.BadRequest, reuseResponse.StatusCode);
        var reuseBody = await reuseResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This reset link is invalid or has expired", reuseBody!.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Removed_member_forgot_password_sends_no_email()
    {
        await SeedAccountAsync("ex@acme.com", "Passw0rd", status: "removed");
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/forgot-password", new { email = "ex@acme.com" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("If an account exists, a reset link has been sent", body!.RootElement.GetProperty("message").GetString());

        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        Assert.DoesNotContain(sender.Sent, e => e.ToEmail == "ex@acme.com");
    }

    [Fact]
    public async Task New_reset_request_invalidates_prior_token()
    {
        await SeedAccountAsync("multi@acme.com", "Passw0rd");
        var client = _factory.CreateClient();
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        await client.PostAsJsonAsync("/api/forgot-password", new { email = "multi@acme.com" });
        var t1 = ExtractToken(sender.Sent.First(e => e.ToEmail == "multi@acme.com").Body);

        await client.PostAsJsonAsync("/api/forgot-password", new { email = "multi@acme.com" });
        var t2 = ExtractToken(sender.Sent.Last(e => e.ToEmail == "multi@acme.com").Body);

        var r1 = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token = t1,
            password = "FirstPass1",
            passwordConfirmation = "FirstPass1",
        });
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        var r1Body = await r1.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This reset link is invalid or has expired", r1Body!.RootElement.GetProperty("message").GetString());

        var r2 = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token = t2,
            password = "SecondPass1",
            passwordConfirmation = "SecondPass1",
        });
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    public async Task Forgot_password_with_empty_email_rejected(string email)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/forgot-password", new { email });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Email is required", body!.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Reset_with_valid_token_but_policy_violating_password_does_not_consume_token()
    {
        await SeedAccountAsync("policy@acme.com", "Passw0rd");
        var client = _factory.CreateClient();
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        await client.PostAsJsonAsync("/api/forgot-password", new { email = "policy@acme.com" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "policy@acme.com").Body);

        var r1 = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token,
            password = "short",
            passwordConfirmation = "short",
        });
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        var r1Body = await r1.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Password must be at least 8 characters", r1Body!.RootElement.GetProperty("message").GetString());

        var r2 = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token,
            password = "12345678",
            passwordConfirmation = "12345678",
        });
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        var r2Body = await r2.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Password must contain at least one letter", r2Body!.RootElement.GetProperty("message").GetString());

        // Token still valid for a subsequent correct reset.
        var r3 = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token,
            password = "GoodPass1",
            passwordConfirmation = "GoodPass1",
        });
        Assert.Equal(HttpStatusCode.OK, r3.StatusCode);
    }

    [Fact]
    public async Task Reset_with_password_confirmation_mismatch_does_not_consume_token()
    {
        await SeedAccountAsync("mismatch@acme.com", "Passw0rd");
        var client = _factory.CreateClient();
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        await client.PostAsJsonAsync("/api/forgot-password", new { email = "mismatch@acme.com" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "mismatch@acme.com").Body);

        var r1 = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token,
            password = "NewPass1",
            passwordConfirmation = "NewPass2",
        });
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        var r1Body = await r1.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Passwords do not match", r1Body!.RootElement.GetProperty("message").GetString());

        var r2 = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token,
            password = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
    }

    [Fact]
    public async Task Password_reset_revokes_all_existing_sessions()
    {
        await SeedAccountAsync("revoke@acme.com", "Passw0rd");
        var noRedirectOptions = new WebApplicationFactoryClientOptions { AllowAutoRedirect = false };

        var session1 = _factory.CreateClient(noRedirectOptions);
        var loginResponse1 = await session1.PostAsJsonAsync("/api/login", new { email = "revoke@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, loginResponse1.StatusCode);

        var session2 = _factory.CreateClient(noRedirectOptions);
        var loginResponse2 = await session2.PostAsJsonAsync("/api/login", new { email = "revoke@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, loginResponse2.StatusCode);

        // Both sessions can access the protected page before the reset.
        Assert.Equal(HttpStatusCode.OK, (await session1.GetAsync("/members")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await session2.GetAsync("/members")).StatusCode);

        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        var client = _factory.CreateClient();
        await client.PostAsJsonAsync("/api/forgot-password", new { email = "revoke@acme.com" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "revoke@acme.com").Body);

        var resetResponse = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token,
            password = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.OK, resetResponse.StatusCode);

        var afterReset1 = await session1.GetAsync("/members");
        var afterReset2 = await session2.GetAsync("/members");

        Assert.Equal(HttpStatusCode.Redirect, afterReset1.StatusCode);
        Assert.Contains("/login", afterReset1.Headers.Location!.ToString());
        Assert.Equal(HttpStatusCode.Redirect, afterReset2.StatusCode);
        Assert.Contains("/login", afterReset2.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Validate_endpoint_reports_valid_for_fresh_token_and_invalid_for_bogus_token()
    {
        await SeedAccountAsync("validate@acme.com", "Passw0rd");
        var client = _factory.CreateClient();
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        await client.PostAsJsonAsync("/api/forgot-password", new { email = "validate@acme.com" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "validate@acme.com").Body);

        var validResponse = await client.GetAsync($"/api/reset-password/validate?token={Uri.EscapeDataString(token)}");
        var validBody = await validResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.True(validBody!.RootElement.GetProperty("valid").GetBoolean());

        var invalidResponse = await client.GetAsync("/api/reset-password/validate?token=not-a-real-token");
        var invalidBody = await invalidResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.False(invalidBody!.RootElement.GetProperty("valid").GetBoolean());

        // Validation must not consume the token.
        var resetResponse = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token,
            password = "NewPass1",
            passwordConfirmation = "NewPass1",
        });
        Assert.Equal(HttpStatusCode.OK, resetResponse.StatusCode);
    }

    [Fact]
    public async Task Reset_with_missing_or_unrecognized_token_rejected()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/reset-password", new
        {
            token = "not-a-real-token",
            password = "NewPass1",
            passwordConfirmation = "NewPass1",
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This reset link is invalid or has expired", body!.RootElement.GetProperty("message").GetString());
    }
}
