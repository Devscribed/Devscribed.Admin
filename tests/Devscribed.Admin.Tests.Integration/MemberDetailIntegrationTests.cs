using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class MemberDetailIntegrationTests : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory;

    public MemberDetailIntegrationTests(TestWebAppFactory factory)
    {
        _factory = factory;
    }

    private async Task<(Account Account, Membership Membership)> SeedMemberAsync(
        Organization org, string email, string password, string role = "user", string status = "active",
        string firstName = "Pat", string lastName = "Owner", string? jobTitle = null)
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
            JobTitle = jobTitle,
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

    // TC-05-INT-09: GET member detail returns correct permission flags for admin
    [Fact]
    public async Task Get_detail_returns_full_permissions_for_admin_caller()
    {
        var org = NewOrg("Acme Inc");
        var (_, admin) = await SeedMemberAsync(org, "admin09@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target09@acme.com", "Passw0rd", role: "user", jobTitle: "Engineer",
            firstName: "Alex", lastName: "Kaminski");

        var client = await LoggedInClientAsync("admin09@acme.com", "Passw0rd");

        var response = await client.GetAsync($"/api/organizations/{org.Id}/members/{target.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        var root = body!.RootElement;
        Assert.True(root.GetProperty("canEditRole").GetBoolean());
        Assert.True(root.GetProperty("canEditJobTitle").GetBoolean());
        Assert.Equal(new[] { "admin", "manager", "user", "viewer" },
            root.GetProperty("availableRoles").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal("admin", root.GetProperty("callerRole").GetString());
        Assert.Equal("Alex Kaminski", root.GetProperty("fullName").GetString());
        Assert.Equal("user", root.GetProperty("role").GetString());
        Assert.Equal("active", root.GetProperty("status").GetString());
        Assert.Equal("Engineer", root.GetProperty("jobTitle").GetString());
        Assert.Equal("AK", root.GetProperty("avatarInitials").GetString());
        Assert.True(root.TryGetProperty("joinedAt", out _));
        Assert.True(root.TryGetProperty("timezone", out _));
        Assert.True(root.TryGetProperty("email", out _));
    }

    // TC-05-INT-10: GET member detail returns correct permission flags for manager viewing user
    [Fact]
    public async Task Get_detail_manager_viewing_user_can_edit_role_with_restricted_options()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "mgr10@acme.com", "Passw0rd", role: "manager");
        var (_, target) = await SeedMemberAsync(org, "target10@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("mgr10@acme.com", "Passw0rd");
        var response = await client.GetAsync($"/api/organizations/{org.Id}/members/{target.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var root = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.True(root.GetProperty("canEditRole").GetBoolean());
        Assert.True(root.GetProperty("canEditJobTitle").GetBoolean());
        Assert.Equal(new[] { "manager", "user", "viewer" },
            root.GetProperty("availableRoles").EnumerateArray().Select(e => e.GetString()));
        Assert.Equal("manager", root.GetProperty("callerRole").GetString());
    }

    // TC-05-INT-11: GET member detail returns correct permission flags for manager viewing admin
    [Fact]
    public async Task Get_detail_manager_viewing_admin_cannot_edit_role_but_can_edit_job_title()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "mgr11@acme.com", "Passw0rd", role: "manager");
        var (_, target) = await SeedMemberAsync(org, "target11@acme.com", "Passw0rd", role: "admin");

        var client = await LoggedInClientAsync("mgr11@acme.com", "Passw0rd");
        var response = await client.GetAsync($"/api/organizations/{org.Id}/members/{target.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var root = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.False(root.GetProperty("canEditRole").GetBoolean());
        Assert.True(root.GetProperty("canEditJobTitle").GetBoolean());
        Assert.Empty(root.GetProperty("availableRoles").EnumerateArray());
    }

    // TC-05-INT-12: GET member detail returns correct permission flags for user/viewer
    [Theory]
    [InlineData("user")]
    [InlineData("viewer")]
    public async Task Get_detail_user_or_viewer_caller_is_fully_read_only(string role)
    {
        var org = NewOrg("Acme " + role);
        await SeedMemberAsync(org, $"caller12-{role}@acme.com", "Passw0rd", role: role);
        var (_, target) = await SeedMemberAsync(org, $"target12-{role}@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync($"caller12-{role}@acme.com", "Passw0rd");
        var response = await client.GetAsync($"/api/organizations/{org.Id}/members/{target.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var root = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.False(root.GetProperty("canEditRole").GetBoolean());
        Assert.False(root.GetProperty("canEditJobTitle").GetBoolean());
        Assert.Empty(root.GetProperty("availableRoles").EnumerateArray());
    }

    // TC-05-INT-13: GET member detail for removed member
    [Fact]
    public async Task Get_detail_for_removed_member_is_fully_read_only()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin13@acme.com", "Passw0rd", role: "admin");
        var (_, removed) = await SeedMemberAsync(org, "removed13@acme.com", "Passw0rd", role: "user", status: "removed");

        var client = await LoggedInClientAsync("admin13@acme.com", "Passw0rd");
        var response = await client.GetAsync($"/api/organizations/{org.Id}/members/{removed.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var root = (await response.Content.ReadFromJsonAsync<JsonDocument>())!.RootElement;
        Assert.Equal("removed", root.GetProperty("status").GetString());
        Assert.False(root.GetProperty("canEditRole").GetBoolean());
        Assert.False(root.GetProperty("canEditJobTitle").GetBoolean());
        Assert.Empty(root.GetProperty("availableRoles").EnumerateArray());
    }

    // TC-05-INT-14: GET member detail returns 404 for non-existent member
    [Fact]
    public async Task Get_detail_returns_404_for_nonexistent_member()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin14@acme.com", "Passw0rd", role: "admin");

        var client = await LoggedInClientAsync("admin14@acme.com", "Passw0rd");
        var response = await client.GetAsync($"/api/organizations/{org.Id}/members/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("not_found", body!.RootElement.GetProperty("error").GetString());
        Assert.Equal("Member not found", body.RootElement.GetProperty("message").GetString());
    }

    // TC-05-INT-01: Save allowed for admin/manager on active members (role + job title)
    [Fact]
    public async Task Admin_can_save_role_and_job_title_for_active_member()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin01@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target01@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin01@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}",
            new { role = "manager", jobTitle = "Engineer" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == target.Id);
        Assert.Equal("manager", reloaded.Role);
        Assert.Equal("Engineer", reloaded.JobTitle);
    }

    // TC-05-INT-01 (continued): manager cannot change a manager member's role
    [Fact]
    public async Task Manager_cannot_change_a_managers_role()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin01b@acme.com", "Passw0rd", role: "admin");
        var (_, mgr) = await SeedMemberAsync(org, "mgr01b@acme.com", "Passw0rd", role: "manager");
        var (_, target) = await SeedMemberAsync(org, "target01b@acme.com", "Passw0rd", role: "manager");

        var client = await LoggedInClientAsync("mgr01b@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}",
            new { role = "user", jobTitle = "Senior Engineer" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("role_authority", body!.RootElement.GetProperty("error").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == target.Id);
        Assert.Equal("manager", reloaded.Role);
    }

    // TC-05-INT-02: Save rejected at the API for user/viewer
    [Theory]
    [InlineData("user")]
    [InlineData("viewer")]
    public async Task Save_rejected_for_user_or_viewer_caller(string role)
    {
        var org = NewOrg("Acme " + role);
        await SeedMemberAsync(org, $"caller02-{role}@acme.com", "Passw0rd", role: role);
        var (_, target) = await SeedMemberAsync(org, $"target02-{role}@acme.com", "Passw0rd", role: "user", jobTitle: "Engineer");

        var client = await LoggedInClientAsync($"caller02-{role}@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}",
            new { role = "user", jobTitle = "Hacker" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("forbidden", body!.RootElement.GetProperty("error").GetString());
        Assert.Equal("You do not have permission to edit members", body.RootElement.GetProperty("message").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == target.Id);
        Assert.Equal("Engineer", reloaded.JobTitle);
    }

    // TC-05-INT-03: Save rejected for removed member
    [Fact]
    public async Task Save_rejected_for_removed_member()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin03@acme.com", "Passw0rd", role: "admin");
        var (_, removed) = await SeedMemberAsync(org, "removed03@acme.com", "Passw0rd", role: "user", status: "removed", jobTitle: "Engineer");

        var client = await LoggedInClientAsync("admin03@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{removed.Id}",
            new { role = "manager", jobTitle = "Senior Engineer" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("member_removed", body!.RootElement.GetProperty("error").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == removed.Id);
        Assert.Equal("user", reloaded.Role);
        Assert.Equal("Engineer", reloaded.JobTitle);
    }

    // TC-05-INT-04: Job title over 100 characters rejected at API
    [Fact]
    public async Task Save_rejected_when_job_title_too_long()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin04@acme.com", "Passw0rd", role: "admin");
        var (_, target) = await SeedMemberAsync(org, "target04@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin04@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{target.Id}",
            new { role = "user", jobTitle = new string('a', 101) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Job title must be at most 100 characters",
            body!.RootElement.GetProperty("errors").GetProperty("jobTitle").GetString());
    }

    // TC-05-INT-05: Atomic save — role change fails, job title also not saved
    [Fact]
    public async Task Save_atomic_failure_on_last_admin_guard_leaves_job_title_unchanged()
    {
        var org = NewOrg("Acme Inc");
        var (_, admin) = await SeedMemberAsync(org, "admin05@acme.com", "Passw0rd", role: "admin", jobTitle: "CEO");
        await SeedMemberAsync(org, "user05@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin05@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{admin.Id}",
            new { role = "manager", jobTitle = "New Title" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("last_admin_guard", body!.RootElement.GetProperty("error").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == admin.Id);
        Assert.Equal("admin", reloaded.Role);
        Assert.Equal("CEO", reloaded.JobTitle);
    }

    // TC-05-INT-06: Last admin cannot be demoted via detail save
    [Fact]
    public async Task Last_admin_cannot_demote_self_via_detail_save()
    {
        var org = NewOrg("Acme Inc");
        var (_, admin) = await SeedMemberAsync(org, "admin06@acme.com", "Passw0rd", role: "admin");
        await SeedMemberAsync(org, "user06@acme.com", "Passw0rd", role: "user");

        var client = await LoggedInClientAsync("admin06@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{admin.Id}",
            new { role = "manager", jobTitle = (string?)null });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("last_admin_guard", body!.RootElement.GetProperty("error").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("admin", (await db.Memberships.SingleAsync(m => m.Id == admin.Id)).Role);
    }

    // TC-05-INT-07: Manager cannot change admin's role via detail save
    [Fact]
    public async Task Manager_cannot_change_admins_role_via_detail_save()
    {
        var org = NewOrg("Acme Inc");
        var (_, adminTarget) = await SeedMemberAsync(org, "admin07@acme.com", "Passw0rd", role: "admin");
        await SeedMemberAsync(org, "mgr07@acme.com", "Passw0rd", role: "manager");

        var client = await LoggedInClientAsync("mgr07@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{adminTarget.Id}",
            new { role = "manager", jobTitle = "..." });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("role_authority", body!.RootElement.GetProperty("error").GetString());
        Assert.Equal("You do not have permission to assign this role", body.RootElement.GetProperty("message").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal("admin", (await db.Memberships.SingleAsync(m => m.Id == adminTarget.Id)).Role);
    }

    // TC-05-INT-08: Cannot change a removed member's role via detail save
    [Fact]
    public async Task Cannot_change_removed_members_role_via_detail_save()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync(org, "admin08@acme.com", "Passw0rd", role: "admin");
        var (_, removed) = await SeedMemberAsync(org, "removed08@acme.com", "Passw0rd", role: "user", status: "removed");

        var client = await LoggedInClientAsync("admin08@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{removed.Id}",
            new { role = "manager", jobTitle = "..." });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("member_removed", body!.RootElement.GetProperty("error").GetString());
    }

    // TC-05-INT-15: Manager edits job title of admin member (role unchanged)
    [Fact]
    public async Task Manager_can_edit_job_title_of_admin_member_with_role_unchanged()
    {
        var org = NewOrg("Acme Inc");
        var (_, adminTarget) = await SeedMemberAsync(org, "admin15@acme.com", "Passw0rd", role: "admin", jobTitle: "CTO");
        await SeedMemberAsync(org, "mgr15@acme.com", "Passw0rd", role: "manager");

        var client = await LoggedInClientAsync("mgr15@acme.com", "Passw0rd");
        var response = await client.PutAsJsonAsync($"/api/organizations/{org.Id}/members/{adminTarget.Id}",
            new { role = "admin", jobTitle = "CEO" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var reloaded = await db.Memberships.SingleAsync(m => m.Id == adminTarget.Id);
        Assert.Equal("admin", reloaded.Role);
        Assert.Equal("CEO", reloaded.JobTitle);
    }
}
