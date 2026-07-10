using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class MembersIntegrationTests : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory;

    public MembersIntegrationTests(TestWebAppFactory factory)
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

    // TC-04-INT-01: List visibility per role
    [Theory]
    [InlineData("admin")]
    [InlineData("manager")]
    [InlineData("user")]
    [InlineData("viewer")]
    public async Task List_visible_to_every_role(string role)
    {
        var org = NewOrg("Acme " + role);
        await SeedMemberAsync(org, $"caller-{role}@acme.com", "Passw0rd", role: role);
        var client = await LoggedInClientAsync($"caller-{role}@acme.com", "Passw0rd");

        var response = await client.GetAsync($"/api/organizations/{org.Id}/members");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal(role, body!.RootElement.GetProperty("callerRole").GetString());
        var members = body.RootElement.GetProperty("members").EnumerateArray().ToList();
        Assert.Single(members);
        var member = members[0];
        Assert.True(member.TryGetProperty("fullName", out _));
        Assert.True(member.TryGetProperty("role", out _));
        Assert.True(member.TryGetProperty("email", out _));
    }

    // TC-04-INT-02 / TC-04-INT-08: Delete is a soft-delete that blocks login and revokes sessions
    [Fact]
    public async Task Delete_blocks_login_and_revokes_active_session()
    {
        var org = NewOrg("Acme Inc");
        var (_, adminMembership) = await SeedMemberAsync(org, "admin1@acme.com", "Passw0rd", role: "admin");
        await SeedMemberAsync(org, "admin1b@acme.com", "Passw0rd", role: "admin"); // second admin so guard doesn't block
        var (_, targetMembership) = await SeedMemberAsync(org, "target1@acme.com", "Passw0rd", role: "user");

        var adminClient = await LoggedInClientAsync("admin1@acme.com", "Passw0rd");
        var targetClient = await LoggedInClientAsync("target1@acme.com", "Passw0rd");

        var deleteResponse = await adminClient.DeleteAsync($"/api/organizations/{org.Id}/members/{targetMembership.Id}");
        Assert.True(deleteResponse.IsSuccessStatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == targetMembership.Id);
        Assert.Equal("removed", reloaded.Status);

        var loginAttempt = await _factory.CreateClient().PostAsJsonAsync("/api/login", new { email = "target1@acme.com", password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.BadRequest, loginAttempt.StatusCode);
        var loginBody = await loginAttempt.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Your account has been deactivated, contact your administrator", loginBody!.RootElement.GetProperty("message").GetString());

        var sessionCheck = await targetClient.GetAsync($"/api/organizations/{org.Id}/members");
        Assert.Equal(HttpStatusCode.Unauthorized, sessionCheck.StatusCode);
    }

    // TC-04-INT-03: Restore returns a removed member to active with reset joined date and cleared job title
    [Fact]
    public async Task Restore_resets_joined_date_and_clears_job_title()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin2@acme.com", "Passw0rd", role: "admin");
        var (_, targetMembership) = await SeedMemberAsync(org, "removed2@acme.com", "Passw0rd", role: "user", status: "removed");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var m = await db.Memberships.SingleAsync(x => x.Id == targetMembership.Id);
            m.JobTitle = "Engineer";
            m.JoinedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            await db.SaveChangesAsync();
        }

        var client = await LoggedInClientAsync("admin2@acme.com", "Passw0rd");
        var response = await client.PostAsync($"/api/organizations/{org.Id}/members/{targetMembership.Id}/restore", null);
        Assert.True(response.IsSuccessStatusCode);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reloaded = await verifyDb.Memberships.SingleAsync(m => m.Id == targetMembership.Id);
        Assert.Equal("active", reloaded.Status);
        Assert.Equal("user", reloaded.Role);
        Assert.Null(reloaded.JobTitle);
        Assert.True(reloaded.JoinedAt > new DateTime(2025, 1, 2));
    }

    // TC-04-INT-04: Delete blocked when it would remove the last admin
    [Fact]
    public async Task Delete_blocked_when_last_admin()
    {
        var org = NewOrg("Acme Inc");
        var (_, adminMembership) = await SeedMemberAsync(org, "admin3@acme.com", "Passw0rd", role: "admin");
        var (_, managerMembership) = await SeedMemberAsync(org, "mgr3@acme.com", "Passw0rd", role: "manager");

        var client = await LoggedInClientAsync("mgr3@acme.com", "Passw0rd");
        var response = await client.DeleteAsync($"/api/organizations/{org.Id}/members/{adminMembership.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("last_admin_guard", body!.RootElement.GetProperty("error").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == adminMembership.Id);
        Assert.Equal("active", reloaded.Status);
    }

    // TC-04-INT-05: user/viewer cannot delete or restore
    [Theory]
    [InlineData("user")]
    [InlineData("viewer")]
    public async Task User_or_viewer_cannot_delete_or_restore(string role)
    {
        var org = NewOrg("Acme " + role);
        await SeedMemberAsync(org, $"caller5-{role}@acme.com", "Passw0rd", role: role);
        var (_, targetMembership) = await SeedMemberAsync(org, $"target5-{role}@acme.com", "Passw0rd", role: "user");
        var (_, removedMembership) = await SeedMemberAsync(org, $"removed5-{role}@acme.com", "Passw0rd", role: "user", status: "removed");

        var client = await LoggedInClientAsync($"caller5-{role}@acme.com", "Passw0rd");

        var deleteResponse = await client.DeleteAsync($"/api/organizations/{org.Id}/members/{targetMembership.Id}");
        var restoreResponse = await client.PostAsync($"/api/organizations/{org.Id}/members/{removedMembership.Id}/restore", null);

        Assert.Equal(HttpStatusCode.Forbidden, deleteResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, restoreResponse.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("active", (await db.Memberships.SingleAsync(m => m.Id == targetMembership.Id)).Status);
        Assert.Equal("removed", (await db.Memberships.SingleAsync(m => m.Id == removedMembership.Id)).Status);
    }

    // TC-04-INT-06 / TC-04-INT-07: Self-delete blocked — admin and manager
    [Theory]
    [InlineData("admin")]
    [InlineData("manager")]
    public async Task Self_delete_blocked(string role)
    {
        var org = NewOrg("Acme " + role);
        var (_, selfMembership) = await SeedMemberAsync(org, $"self6-{role}@acme.com", "Passw0rd", role: role);
        if (role == "manager")
            await SeedMemberAsync(org, $"otheradmin6-{role}@acme.com", "Passw0rd", role: "admin");
        else
            await SeedMemberAsync(org, $"otheradmin6-{role}@acme.com", "Passw0rd", role: "admin");

        var client = await LoggedInClientAsync($"self6-{role}@acme.com", "Passw0rd");
        var response = await client.DeleteAsync($"/api/organizations/{org.Id}/members/{selfMembership.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("cannot_remove_self", body!.RootElement.GetProperty("error").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("active", (await db.Memberships.SingleAsync(m => m.Id == selfMembership.Id)).Status);
    }

    // TC-04-INT-09: Race condition — two admins simultaneously try to delete the other
    [Fact]
    public async Task Concurrent_mutual_delete_leaves_at_least_one_active_admin()
    {
        var org = NewOrg("Acme Inc");
        var (_, a1) = await SeedMemberAsync(org, "a1race@acme.com", "Passw0rd", role: "admin");
        var (_, a2) = await SeedMemberAsync(org, "a2race@acme.com", "Passw0rd", role: "admin");

        var client1 = await LoggedInClientAsync("a1race@acme.com", "Passw0rd");
        var client2 = await LoggedInClientAsync("a2race@acme.com", "Passw0rd");

        var task1 = client1.DeleteAsync($"/api/organizations/{org.Id}/members/{a2.Id}");
        var task2 = client2.DeleteAsync($"/api/organizations/{org.Id}/members/{a1.Id}");
        var responses = await Task.WhenAll(task1, task2);

        var successCount = responses.Count(r => r.IsSuccessStatusCode);
        Assert.True(successCount <= 1, "At most one concurrent delete should succeed");

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var activeAdmins = await db.Memberships.CountAsync(m => m.OrganizationId == org.Id && m.Role == "admin" && m.Status == "active");
        Assert.True(activeAdmins >= 1, "Organization must retain at least one active admin");
    }

    // TC-04-INT-10: Server-side search with query parameters
    [Fact]
    public async Task Search_query_param_filters_members()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin10@acme.com", "Passw0rd", role: "admin", firstName: "Alex", lastName: "Kaminski");
        await SeedMemberAsync(org, "pat10@acme.com", "Passw0rd", role: "user", firstName: "Pat", lastName: "Owner");
        var client = await LoggedInClientAsync("admin10@acme.com", "Passw0rd");

        var matchResponse = await client.GetAsync($"/api/organizations/{org.Id}/members?search=alex");
        var noMatchResponse = await client.GetAsync($"/api/organizations/{org.Id}/members?search=zzz");

        var matchBody = await matchResponse.Content.ReadFromJsonAsync<JsonDocument>();
        var matchMembers = matchBody!.RootElement.GetProperty("members").EnumerateArray().ToList();
        Assert.Single(matchMembers);
        Assert.Equal("Alex Kaminski", matchMembers[0].GetProperty("fullName").GetString());

        var noMatchBody = await noMatchResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Empty(noMatchBody!.RootElement.GetProperty("members").EnumerateArray().ToList());
    }

    // TC-04-INT-11: showRemoved query parameter includes removed members
    [Fact]
    public async Task ShowRemoved_query_param_includes_removed_members()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin11@acme.com", "Passw0rd", role: "admin");
        await SeedMemberAsync(org, "user11@acme.com", "Passw0rd", role: "user");
        await SeedMemberAsync(org, "removed11@acme.com", "Passw0rd", role: "user", status: "removed");
        var client = await LoggedInClientAsync("admin11@acme.com", "Passw0rd");

        var defaultResponse = await client.GetAsync($"/api/organizations/{org.Id}/members");
        var showRemovedResponse = await client.GetAsync($"/api/organizations/{org.Id}/members?showRemoved=true");

        var defaultBody = await defaultResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal(2, defaultBody!.RootElement.GetProperty("members").EnumerateArray().Count());

        var showRemovedBody = await showRemovedResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal(3, showRemovedBody!.RootElement.GetProperty("members").EnumerateArray().Count());
    }

    [Fact]
    public async Task Delete_already_removed_member_returns_conflict()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin12@acme.com", "Passw0rd", role: "admin");
        var (_, removedMembership) = await SeedMemberAsync(org, "removed12@acme.com", "Passw0rd", role: "user", status: "removed");
        var client = await LoggedInClientAsync("admin12@acme.com", "Passw0rd");

        var response = await client.DeleteAsync($"/api/organizations/{org.Id}/members/{removedMembership.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("already_removed", body!.RootElement.GetProperty("error").GetString());
    }

    [Fact]
    public async Task Restore_non_removed_member_returns_conflict()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin13@acme.com", "Passw0rd", role: "admin");
        var (_, activeMembership) = await SeedMemberAsync(org, "active13@acme.com", "Passw0rd", role: "user");
        var client = await LoggedInClientAsync("admin13@acme.com", "Passw0rd");

        var response = await client.PostAsync($"/api/organizations/{org.Id}/members/{activeMembership.Id}/restore", null);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("not_removed", body!.RootElement.GetProperty("error").GetString());
    }
}
