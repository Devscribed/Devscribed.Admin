using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

[Collection("Integration")]
public class SignupEndpointTests
{
    private readonly IntegrationTestFixture _fixture;

    public SignupEndpointTests(IntegrationTestFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task Signup_creates_account_org_and_admin_membership_atomically()
    {
        var payload = new
        {
            orgName = "Acme Inc",
            firstName = "Pat",
            lastName = "Owner",
            email = "owner@acme.com",
            password = "Passwor1",
            timezone = "America/New_York",
        };

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/signup", payload);

        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        Assert.True(response.Headers.TryGetValues("Set-Cookie", out _), "Expected an authenticated session cookie");

        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var account = await db.Accounts.SingleAsync(a => a.Email == "owner@acme.com");
        var organization = await db.Organizations.SingleAsync(o => o.Name == "Acme Inc");
        var membership = await db.Memberships.SingleAsync(m => m.AccountId == account.Id && m.OrganizationId == organization.Id);

        Assert.Equal(MemberRole.Admin, membership.Role);
        Assert.Equal(MembershipStatus.Active, membership.Status);
        Assert.NotEqual(default, membership.JoinedAt);
    }

    [Fact]
    public async Task Duplicate_email_is_rejected_without_partial_writes()
    {
        var firstPayload = new
        {
            orgName = "First Org",
            firstName = "Pat",
            lastName = "Owner",
            email = "dup@acme.com",
            password = "Passwor1",
            timezone = "America/New_York",
        };
        var first = await _fixture.HttpClient.PostAsJsonAsync("/api/signup", firstPayload);
        Assert.True(first.IsSuccessStatusCode, await first.Content.ReadAsStringAsync());

        var secondPayload = new
        {
            orgName = "Second Org",
            firstName = "Sam",
            lastName = "Other",
            email = "dup@acme.com",
            password = "Passwor1",
            timezone = "America/New_York",
        };
        var second = await _fixture.HttpClient.PostAsJsonAsync("/api/signup", secondPayload);

        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        var body = await second.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This email is already registered", body.GetProperty("message").GetString());

        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        Assert.False(await db.Organizations.AnyAsync(o => o.Name == "Second Org"));
        Assert.Equal(1, await db.Accounts.CountAsync(a => a.Email == "dup@acme.com"));
    }

    [Fact]
    public async Task Duplicate_email_is_rejected_case_insensitively()
    {
        var firstPayload = new
        {
            orgName = "Case Org",
            firstName = "Pat",
            lastName = "Owner",
            email = "casecheck@acme.com",
            password = "Passwor1",
            timezone = "America/New_York",
        };
        var first = await _fixture.HttpClient.PostAsJsonAsync("/api/signup", firstPayload);
        Assert.True(first.IsSuccessStatusCode, await first.Content.ReadAsStringAsync());

        foreach (var email in new[] { "CASECHECK@ACME.COM", "CaseCheck@Acme.Com" })
        {
            var payload = new
            {
                orgName = "Another Org",
                firstName = "Sam",
                lastName = "Other",
                email,
                password = "Passwor1",
                timezone = "America/New_York",
            };
            var response = await _fixture.HttpClient.PostAsJsonAsync("/api/signup", payload);

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("This email is already registered", body.GetProperty("message").GetString());
        }

        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        Assert.Equal(1, await db.Accounts.CountAsync(a => a.Email == "casecheck@acme.com"));
        Assert.False(await db.Organizations.AnyAsync(o => o.Name == "Another Org"));
    }

    [Fact]
    public async Task Timezone_is_auto_detected_and_stored_on_signup()
    {
        var payload = new
        {
            orgName = "TZ Org",
            firstName = "Pat",
            lastName = "Owner",
            email = "tz@acme.com",
            password = "Passwor1",
            timezone = "America/New_York",
        };

        var response = await _fixture.HttpClient.PostAsJsonAsync("/api/signup", payload);
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());

        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var account = await db.Accounts.SingleAsync(a => a.Email == "tz@acme.com");
        Assert.Equal("America/New_York", account.Timezone);
    }
}
