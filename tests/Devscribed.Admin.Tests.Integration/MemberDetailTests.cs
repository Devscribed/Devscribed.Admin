using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Infrastructure.Data;
using Devscribed.Admin.Infrastructure.Security;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

[Collection("Integration")]
public class MemberDetailTests
{
    private readonly IntegrationTestFixture _fixture;

    public MemberDetailTests(IntegrationTestFixture fixture)
    {
        _fixture = fixture;
    }

    // Helper: sign up and return (client, orgId, accountId)
    private async Task<(HttpClient client, Guid orgId, Guid accountId)> SignUpAsync(
        string orgName, string firstName, string lastName, string email, string password = "Passw0rd")
    {
        var client = _fixture.CreateClient();
        var response = await client.PostAsJsonAsync("/api/signup", new
        {
            orgName,
            firstName,
            lastName,
            email,
            password
        });
        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        var orgId = Guid.Parse(body.GetProperty("organizationId").GetString()!);
        var accountId = Guid.Parse(body.GetProperty("accountId").GetString()!);
        return (client, orgId, accountId);
    }

    // Helper: create an additional member directly in DB
    private async Task<(Account account, Membership membership)> CreateMemberInDbAsync(
        Guid orgId, string firstName, string lastName, string email, MemberRole role,
        MembershipStatus status = MembershipStatus.Active, string? jobTitle = null,
        DateTime? joinedAt = null, string? timezone = null)
    {
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = email.ToLower(),
            PasswordHash = PasswordHasher.Hash("Passw0rd"),
            FirstName = firstName,
            LastName = lastName,
            Timezone = timezone,
            CreatedAt = DateTime.UtcNow,
        };
        var membership = new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = orgId,
            Role = role,
            Status = status,
            JobTitle = jobTitle,
            JoinedAt = joinedAt ?? DateTime.UtcNow,
        };
        db.Accounts.Add(account);
        db.Memberships.Add(membership);
        await db.SaveChangesAsync();
        return (account, membership);
    }

    // Helper: log in as a specific user
    private async Task<HttpClient> LoginAsAsync(string email, string password = "Passw0rd")
    {
        var client = _fixture.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new { email, password });
        response.EnsureSuccessStatusCode();
        return client;
    }

    // TC-05-INT-01: Admin saves role + job title on active user member -> success
    [Fact]
    public async Task Admin_saves_role_and_job_title_on_active_user_member()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg01", "Admin", "Boss", "detail01-admin@test.com");

        var (_, targetMembership) = await CreateMemberInDbAsync(
            orgId, "Target", "User", "detail01-target@test.com", MemberRole.User,
            jobTitle: "Junior Dev");

        var response = await adminClient.PutAsJsonAsync(
            $"/api/organizations/{orgId}/members/{targetMembership.Id}",
            new { role = "manager", jobTitle = "Senior Engineer" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Verify in DB
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var updated = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstAsync(db.Memberships, m => m.Id == targetMembership.Id);
        Assert.Equal(MemberRole.Manager, updated.Role);
        Assert.Equal("Senior Engineer", updated.JobTitle);
    }

    // TC-05-INT-02: user/viewer PUT rejected (403 forbidden)
    [Fact]
    public async Task User_and_viewer_put_rejected_with_403()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg02", "Admin", "Boss", "detail02-admin@test.com");

        var (_, targetMembership) = await CreateMemberInDbAsync(
            orgId, "Target", "User", "detail02-target@test.com", MemberRole.User);

        await CreateMemberInDbAsync(orgId, "Regular", "User", "detail02-user@test.com", MemberRole.User);
        await CreateMemberInDbAsync(orgId, "Regular", "Viewer", "detail02-viewer@test.com", MemberRole.Viewer);

        foreach (var email in new[] { "detail02-user@test.com", "detail02-viewer@test.com" })
        {
            var client = await LoginAsAsync(email);
            var response = await client.PutAsJsonAsync(
                $"/api/organizations/{orgId}/members/{targetMembership.Id}",
                new { role = "manager", jobTitle = "Engineer" });

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("forbidden", body.GetProperty("error").GetString());
        }
    }

    // TC-05-INT-03: PUT on removed member rejected (400 member_removed)
    [Fact]
    public async Task Put_on_removed_member_rejected_with_400()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg03", "Admin", "Boss", "detail03-admin@test.com");

        var (_, removedMembership) = await CreateMemberInDbAsync(
            orgId, "Removed", "User", "detail03-removed@test.com", MemberRole.User,
            status: MembershipStatus.Removed);

        var response = await adminClient.PutAsJsonAsync(
            $"/api/organizations/{orgId}/members/{removedMembership.Id}",
            new { role = "user", jobTitle = "Engineer" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("member_removed", body.GetProperty("error").GetString());
        Assert.Equal("Cannot edit a removed member", body.GetProperty("message").GetString());
    }

    // TC-05-INT-04: Job title > 100 chars rejected (400)
    [Fact]
    public async Task Job_title_over_100_chars_rejected_with_400()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg04", "Admin", "Boss", "detail04-admin@test.com");

        var (_, targetMembership) = await CreateMemberInDbAsync(
            orgId, "Target", "User", "detail04-target@test.com", MemberRole.User);

        var response = await adminClient.PutAsJsonAsync(
            $"/api/organizations/{orgId}/members/{targetMembership.Id}",
            new { role = "user", jobTitle = new string('x', 101) });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Job title must be at most 100 characters",
            body.GetProperty("errors").GetProperty("jobTitle").GetString());
    }

    // TC-05-INT-05: Atomic save - last admin demote fails, job title also not saved
    [Fact]
    public async Task Atomic_save_last_admin_demote_fails_job_title_not_saved()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg05", "Admin", "Boss", "detail05-admin@test.com");

        // Get admin's membership ID
        var listResponse = await adminClient.GetAsync($"/api/organizations/{orgId}/members");
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        Guid adminMembershipId = default;
        foreach (var m in listBody.GetProperty("members").EnumerateArray())
        {
            if (m.GetProperty("email").GetString() == "detail05-admin@test.com")
            {
                adminMembershipId = Guid.Parse(m.GetProperty("id").GetString()!);
                break;
            }
        }

        // Try to demote sole admin to manager and change job title
        var response = await adminClient.PutAsJsonAsync(
            $"/api/organizations/{orgId}/members/{adminMembershipId}",
            new { role = "manager", jobTitle = "New Title" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("last_admin_guard", body.GetProperty("error").GetString());

        // Verify job title was NOT saved
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var membership = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstAsync(db.Memberships, m => m.Id == adminMembershipId);
        Assert.Equal(MemberRole.Admin, membership.Role);
        Assert.Null(membership.JobTitle);
    }

    // TC-05-INT-06: Last admin cannot be demoted (409 last_admin_guard)
    [Fact]
    public async Task Last_admin_cannot_be_demoted()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg06", "Admin", "Boss", "detail06-admin@test.com");

        // Get admin's membership ID
        var listResponse = await adminClient.GetAsync($"/api/organizations/{orgId}/members");
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        Guid adminMembershipId = default;
        foreach (var m in listBody.GetProperty("members").EnumerateArray())
        {
            if (m.GetProperty("email").GetString() == "detail06-admin@test.com")
            {
                adminMembershipId = Guid.Parse(m.GetProperty("id").GetString()!);
                break;
            }
        }

        var response = await adminClient.PutAsJsonAsync(
            $"/api/organizations/{orgId}/members/{adminMembershipId}",
            new { role = "user", jobTitle = "" });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("last_admin_guard", body.GetProperty("error").GetString());
        Assert.Equal("Organization must retain at least one admin",
            body.GetProperty("message").GetString());
    }

    // TC-05-INT-07: Manager cannot change admin's role (403 role_authority)
    [Fact]
    public async Task Manager_cannot_change_admins_role()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg07", "Admin", "Boss", "detail07-admin@test.com");

        // Get admin's membership ID
        var listResponse = await adminClient.GetAsync($"/api/organizations/{orgId}/members");
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        Guid adminMembershipId = default;
        foreach (var m in listBody.GetProperty("members").EnumerateArray())
        {
            if (m.GetProperty("email").GetString() == "detail07-admin@test.com")
            {
                adminMembershipId = Guid.Parse(m.GetProperty("id").GetString()!);
                break;
            }
        }

        await CreateMemberInDbAsync(orgId, "Manager", "Two", "detail07-manager@test.com", MemberRole.Manager);
        var managerClient = await LoginAsAsync("detail07-manager@test.com");

        var response = await managerClient.PutAsJsonAsync(
            $"/api/organizations/{orgId}/members/{adminMembershipId}",
            new { role = "manager", jobTitle = "Boss" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("role_authority", body.GetProperty("error").GetString());
    }

    // TC-05-INT-08: Cannot change removed member's role (400 member_removed)
    [Fact]
    public async Task Cannot_change_removed_members_role()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg08", "Admin", "Boss", "detail08-admin@test.com");

        var (_, removedMembership) = await CreateMemberInDbAsync(
            orgId, "Removed", "Member", "detail08-removed@test.com", MemberRole.User,
            status: MembershipStatus.Removed);

        var response = await adminClient.PutAsJsonAsync(
            $"/api/organizations/{orgId}/members/{removedMembership.Id}",
            new { role = "manager", jobTitle = "" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("member_removed", body.GetProperty("error").GetString());
    }

    // TC-05-INT-09: GET detail returns correct flags for admin viewing user
    [Fact]
    public async Task Get_detail_returns_correct_flags_for_admin_viewing_user()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg09", "Admin", "Boss", "detail09-admin@test.com");

        var (_, targetMembership) = await CreateMemberInDbAsync(
            orgId, "Alex", "Kaminski", "detail09-target@test.com", MemberRole.User,
            jobTitle: "Backend Engineer", timezone: "America/New_York");

        var response = await adminClient.GetAsync(
            $"/api/organizations/{orgId}/members/{targetMembership.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("Alex Kaminski", body.GetProperty("fullName").GetString());
        Assert.Equal("detail09-target@test.com", body.GetProperty("email").GetString());
        Assert.Equal("user", body.GetProperty("role").GetString());
        Assert.Equal("active", body.GetProperty("status").GetString());
        Assert.Equal("Backend Engineer", body.GetProperty("jobTitle").GetString());
        Assert.Equal("America/New_York", body.GetProperty("timezone").GetString());
        Assert.Equal("AK", body.GetProperty("avatarInitials").GetString());
        Assert.False(body.GetProperty("isLastAdmin").GetBoolean());
        Assert.True(body.GetProperty("canEditRole").GetBoolean());
        Assert.True(body.GetProperty("canEditJobTitle").GetBoolean());
        Assert.Equal("admin", body.GetProperty("callerRole").GetString());

        var availableRoles = body.GetProperty("availableRoles").EnumerateArray()
            .Select(e => e.GetString()).ToList();
        Assert.Equal(new[] { "admin", "manager", "user", "viewer" }, availableRoles);
    }

    // TC-05-INT-10: GET detail returns correct flags for manager viewing user
    [Fact]
    public async Task Get_detail_returns_correct_flags_for_manager_viewing_user()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg10", "Admin", "Boss", "detail10-admin@test.com");

        var (_, targetMembership) = await CreateMemberInDbAsync(
            orgId, "Target", "User", "detail10-target@test.com", MemberRole.User);
        await CreateMemberInDbAsync(orgId, "Manager", "One", "detail10-manager@test.com", MemberRole.Manager);

        var managerClient = await LoginAsAsync("detail10-manager@test.com");
        var response = await managerClient.GetAsync(
            $"/api/organizations/{orgId}/members/{targetMembership.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.True(body.GetProperty("canEditRole").GetBoolean());
        Assert.True(body.GetProperty("canEditJobTitle").GetBoolean());
        Assert.Equal("manager", body.GetProperty("callerRole").GetString());

        var availableRoles = body.GetProperty("availableRoles").EnumerateArray()
            .Select(e => e.GetString()).ToList();
        Assert.Equal(new[] { "manager", "user", "viewer" }, availableRoles);
    }

    // TC-05-INT-11: GET detail returns correct flags for manager viewing admin
    [Fact]
    public async Task Get_detail_returns_correct_flags_for_manager_viewing_admin()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg11", "Admin", "Boss", "detail11-admin@test.com");

        // Get admin's membership ID
        var listResponse = await adminClient.GetAsync($"/api/organizations/{orgId}/members");
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        Guid adminMembershipId = default;
        foreach (var m in listBody.GetProperty("members").EnumerateArray())
        {
            if (m.GetProperty("email").GetString() == "detail11-admin@test.com")
            {
                adminMembershipId = Guid.Parse(m.GetProperty("id").GetString()!);
                break;
            }
        }

        await CreateMemberInDbAsync(orgId, "Manager", "One", "detail11-manager@test.com", MemberRole.Manager);
        var managerClient = await LoginAsAsync("detail11-manager@test.com");

        var response = await managerClient.GetAsync(
            $"/api/organizations/{orgId}/members/{adminMembershipId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.False(body.GetProperty("canEditRole").GetBoolean());
        Assert.True(body.GetProperty("canEditJobTitle").GetBoolean());
        Assert.Equal("manager", body.GetProperty("callerRole").GetString());

        var availableRoles = body.GetProperty("availableRoles").EnumerateArray()
            .Select(e => e.GetString()).ToList();
        Assert.Empty(availableRoles);
    }

    // TC-05-INT-12: GET detail returns correct flags for user/viewer
    [Fact]
    public async Task Get_detail_returns_correct_flags_for_user_and_viewer()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg12", "Admin", "Boss", "detail12-admin@test.com");

        var (_, targetMembership) = await CreateMemberInDbAsync(
            orgId, "Target", "User", "detail12-target@test.com", MemberRole.User);
        await CreateMemberInDbAsync(orgId, "Regular", "User", "detail12-user@test.com", MemberRole.User);
        await CreateMemberInDbAsync(orgId, "Regular", "Viewer", "detail12-viewer@test.com", MemberRole.Viewer);

        foreach (var (email, expectedRole) in new[]
        {
            ("detail12-user@test.com", "user"),
            ("detail12-viewer@test.com", "viewer"),
        })
        {
            var client = await LoginAsAsync(email);
            var response = await client.GetAsync(
                $"/api/organizations/{orgId}/members/{targetMembership.Id}");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();

            Assert.False(body.GetProperty("canEditRole").GetBoolean());
            Assert.False(body.GetProperty("canEditJobTitle").GetBoolean());
            Assert.Equal(expectedRole, body.GetProperty("callerRole").GetString());
            Assert.Empty(body.GetProperty("availableRoles").EnumerateArray().ToList());
        }
    }

    // TC-05-INT-13: GET detail for removed member shows canEditRole=false, canEditJobTitle=false
    [Fact]
    public async Task Get_detail_for_removed_member_shows_no_edit_flags()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg13", "Admin", "Boss", "detail13-admin@test.com");

        var (_, removedMembership) = await CreateMemberInDbAsync(
            orgId, "Removed", "Member", "detail13-removed@test.com", MemberRole.User,
            status: MembershipStatus.Removed);

        var response = await adminClient.GetAsync(
            $"/api/organizations/{orgId}/members/{removedMembership.Id}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();

        Assert.Equal("removed", body.GetProperty("status").GetString());
        Assert.False(body.GetProperty("canEditRole").GetBoolean());
        Assert.False(body.GetProperty("canEditJobTitle").GetBoolean());
        Assert.Empty(body.GetProperty("availableRoles").EnumerateArray().ToList());
    }

    // TC-05-INT-14: GET detail 404 for non-existent member
    [Fact]
    public async Task Get_detail_404_for_non_existent_member()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg14", "Admin", "Boss", "detail14-admin@test.com");

        var response = await adminClient.GetAsync(
            $"/api/organizations/{orgId}/members/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    // TC-05-INT-15: Manager edits job title of admin member (role unchanged) -> success
    [Fact]
    public async Task Manager_edits_job_title_of_admin_member_role_unchanged()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "DetailOrg15", "Admin", "Boss", "detail15-admin@test.com");

        // Get admin's membership ID
        var listResponse = await adminClient.GetAsync($"/api/organizations/{orgId}/members");
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        Guid adminMembershipId = default;
        foreach (var m in listBody.GetProperty("members").EnumerateArray())
        {
            if (m.GetProperty("email").GetString() == "detail15-admin@test.com")
            {
                adminMembershipId = Guid.Parse(m.GetProperty("id").GetString()!);
                break;
            }
        }

        await CreateMemberInDbAsync(orgId, "Manager", "One", "detail15-manager@test.com", MemberRole.Manager);
        var managerClient = await LoginAsAsync("detail15-manager@test.com");

        // Manager sends unchanged role (admin) + new job title
        var response = await managerClient.PutAsJsonAsync(
            $"/api/organizations/{orgId}/members/{adminMembershipId}",
            new { role = "admin", jobTitle = "CTO" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Verify job title was saved
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var membership = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstAsync(db.Memberships, m => m.Id == adminMembershipId);
        Assert.Equal(MemberRole.Admin, membership.Role); // role unchanged
        Assert.Equal("CTO", membership.JobTitle);
    }
}
