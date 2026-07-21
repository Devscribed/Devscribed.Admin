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
public class MemberManagementTests
{
    private readonly IntegrationTestFixture _fixture;

    public MemberManagementTests(IntegrationTestFixture fixture)
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

    // Helper: create an additional member directly in DB, return (account, membership)
    private async Task<(Account account, Membership membership)> CreateMemberInDbAsync(
        Guid orgId, string firstName, string lastName, string email, MemberRole role,
        MembershipStatus status = MembershipStatus.Active, string? jobTitle = null,
        DateTime? joinedAt = null)
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

    // Helper: log in as a specific user, return HttpClient with session cookie
    private async Task<HttpClient> LoginAsAsync(string email, string password = "Passw0rd")
    {
        var client = _fixture.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new { email, password });
        response.EnsureSuccessStatusCode();
        return client;
    }

    // Helper: get the membership ID for a given account from the member list response
    private static Guid GetMembershipIdByEmail(JsonElement membersArray, string email)
    {
        foreach (var m in membersArray.EnumerateArray())
        {
            if (m.GetProperty("email").GetString() == email)
                return Guid.Parse(m.GetProperty("id").GetString()!);
        }
        throw new Exception($"Member with email {email} not found in list");
    }

    // TC-04-INT-01: List visibility per role
    [Fact]
    public async Task List_visibility_per_role_all_four_roles_see_members_and_callerRole_matches()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "MgmtListOrg", "Admin", "One", "mgmt-list-admin@test.com");

        await CreateMemberInDbAsync(orgId, "Manager", "Two", "mgmt-list-manager@test.com", MemberRole.Manager);
        await CreateMemberInDbAsync(orgId, "User", "Three", "mgmt-list-user@test.com", MemberRole.User);
        await CreateMemberInDbAsync(orgId, "Viewer", "Four", "mgmt-list-viewer@test.com", MemberRole.Viewer);

        var roles = new[]
        {
            ("mgmt-list-admin@test.com", "admin"),
            ("mgmt-list-manager@test.com", "manager"),
            ("mgmt-list-user@test.com", "user"),
            ("mgmt-list-viewer@test.com", "viewer"),
        };

        foreach (var (email, expectedRole) in roles)
        {
            var client = email == "mgmt-list-admin@test.com" ? adminClient : await LoginAsAsync(email);
            var response = await client.GetAsync($"/api/organizations/{orgId}/members");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);

            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            var members = body.GetProperty("members");
            Assert.Equal(4, members.GetArrayLength());

            var callerRole = body.GetProperty("callerRole").GetString();
            Assert.Equal(expectedRole, callerRole);

            var first = members[0];
            Assert.True(first.TryGetProperty("id", out _));
            Assert.True(first.TryGetProperty("fullName", out _));
            Assert.True(first.TryGetProperty("email", out _));
            Assert.True(first.TryGetProperty("role", out _));
            Assert.True(first.TryGetProperty("status", out _));
            Assert.True(first.TryGetProperty("joinedAt", out _));
            Assert.True(first.TryGetProperty("isLastAdmin", out _));
            Assert.True(first.TryGetProperty("isSelf", out _));
        }
    }

    // TC-04-INT-02: Delete is soft-delete that blocks login and revokes sessions
    [Fact]
    public async Task Delete_is_soft_delete_that_blocks_login_and_revokes_sessions()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "SoftDelOrg", "Admin", "Boss", "softdel-admin@test.com");

        var (_, targetMembership) = await CreateMemberInDbAsync(
            orgId, "Target", "User", "softdel-target@test.com", MemberRole.User);

        // Target logs in (creates a session)
        var targetClient = await LoginAsAsync("softdel-target@test.com");

        // Verify target can access API before deletion
        var preDeleteResponse = await targetClient.GetAsync($"/api/organizations/{orgId}/members");
        Assert.Equal(HttpStatusCode.OK, preDeleteResponse.StatusCode);

        // Admin deletes target
        var deleteResponse = await adminClient.DeleteAsync(
            $"/api/organizations/{orgId}/members/{targetMembership.Id}");
        Assert.Equal(HttpStatusCode.OK, deleteResponse.StatusCode);

        // Verify membership status is removed
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
                .FirstAsync(db.Memberships, m => m.Id == targetMembership.Id);
            Assert.Equal(MembershipStatus.Removed, membership.Status);
        }

        // Attempt to log in as removed member fails
        var loginClient = _fixture.CreateClient();
        var loginResponse = await loginClient.PostAsJsonAsync("/api/login", new
        {
            email = "softdel-target@test.com",
            password = "Passw0rd"
        });
        Assert.Equal(HttpStatusCode.BadRequest, loginResponse.StatusCode);
        var loginBody = await loginResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Contains("deactivated", loginBody.GetProperty("message").GetString()!,
            StringComparison.OrdinalIgnoreCase);

        // Prior session is revoked (SecurityStamp changed)
        var postDeleteResponse = await targetClient.GetAsync($"/api/organizations/{orgId}/members");
        Assert.Equal(HttpStatusCode.Unauthorized, postDeleteResponse.StatusCode);
    }

    // TC-04-INT-03: Restore returns removed member to active with reset joinedAt and cleared jobTitle
    [Fact]
    public async Task Restore_returns_removed_member_to_active_with_reset_joinedAt_and_cleared_jobTitle()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "MmRestoreOrg", "Admin", "Chief", "mm-restore-admin@test.com");

        var originalJoinedAt = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var (_, targetMembership) = await CreateMemberInDbAsync(
            orgId, "Restore", "Target", "mm-restore-target@test.com", MemberRole.User,
            status: MembershipStatus.Removed, jobTitle: "Engineer", joinedAt: originalJoinedAt);

        var beforeRestore = DateTime.UtcNow;

        // Restore the member
        var restoreResponse = await adminClient.PostAsync(
            $"/api/organizations/{orgId}/members/{targetMembership.Id}/restore", null);
        Assert.Equal(HttpStatusCode.OK, restoreResponse.StatusCode);

        // Verify membership state
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var membership = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstAsync(db.Memberships, m => m.Id == targetMembership.Id);

        Assert.Equal(MembershipStatus.Active, membership.Status);
        Assert.Equal(MemberRole.User, membership.Role); // Role retained
        Assert.Null(membership.JobTitle); // Cleared
        Assert.True(membership.JoinedAt >= beforeRestore); // Reset to now
        Assert.NotEqual(originalJoinedAt, membership.JoinedAt);
    }

    // TC-04-INT-04: Delete blocked when it would remove the last admin
    [Fact]
    public async Task Delete_blocked_when_it_would_remove_the_last_admin()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "LastAdminOrg", "Solo", "Admin", "last-admin@test.com");

        // Get the admin's membership ID from the list
        var listResponse = await adminClient.GetAsync($"/api/organizations/{orgId}/members");
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        var adminMembershipId = GetMembershipIdByEmail(listBody.GetProperty("members"), "last-admin@test.com");

        // Create a manager who will try to delete the admin
        await CreateMemberInDbAsync(orgId, "Manager", "Helper", "last-admin-mgr@test.com", MemberRole.Manager);
        var managerClient = await LoginAsAsync("last-admin-mgr@test.com");

        // Manager tries to delete the sole admin
        var deleteResponse = await managerClient.DeleteAsync(
            $"/api/organizations/{orgId}/members/{adminMembershipId}");
        Assert.Equal(HttpStatusCode.Conflict, deleteResponse.StatusCode);

        var body = await deleteResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("last_admin_guard", body.GetProperty("error").GetString());
        Assert.Equal("Organization must retain at least one admin",
            body.GetProperty("message").GetString());

        // Verify admin still active
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var membership = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstAsync(db.Memberships, m => m.Id == adminMembershipId);
        Assert.Equal(MembershipStatus.Active, membership.Status);
    }

    // TC-04-INT-05: user/viewer cannot delete or restore (403)
    [Fact]
    public async Task User_and_viewer_cannot_delete_or_restore()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "ForbidOrg", "Admin", "Top", "forbid-admin@test.com");

        var (_, activeMembership) = await CreateMemberInDbAsync(
            orgId, "Active", "Member", "forbid-active@test.com", MemberRole.User);
        var (_, removedMembership) = await CreateMemberInDbAsync(
            orgId, "Removed", "Member", "forbid-removed@test.com", MemberRole.User,
            status: MembershipStatus.Removed);
        await CreateMemberInDbAsync(orgId, "Regular", "User", "forbid-user@test.com", MemberRole.User);
        await CreateMemberInDbAsync(orgId, "Regular", "Viewer", "forbid-viewer@test.com", MemberRole.Viewer);

        foreach (var email in new[] { "forbid-user@test.com", "forbid-viewer@test.com" })
        {
            var client = await LoginAsAsync(email);

            // Try to delete active member
            var deleteResponse = await client.DeleteAsync(
                $"/api/organizations/{orgId}/members/{activeMembership.Id}");
            Assert.Equal(HttpStatusCode.Forbidden, deleteResponse.StatusCode);

            // Try to restore removed member
            var restoreResponse = await client.PostAsync(
                $"/api/organizations/{orgId}/members/{removedMembership.Id}/restore", null);
            Assert.Equal(HttpStatusCode.Forbidden, restoreResponse.StatusCode);
        }

        // Verify members unchanged
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var active = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstAsync(db.Memberships, m => m.Id == activeMembership.Id);
        Assert.Equal(MembershipStatus.Active, active.Status);
        var removed = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .FirstAsync(db.Memberships, m => m.Id == removedMembership.Id);
        Assert.Equal(MembershipStatus.Removed, removed.Status);
    }

    // TC-04-INT-06: Self-delete blocked -- admin (409 cannot_remove_self)
    [Fact]
    public async Task Self_delete_blocked_admin()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "SelfDelAdminOrg", "Admin", "One", "selfdeladmin1@test.com");

        // Add a second admin so zero-admin guard doesn't interfere
        await CreateMemberInDbAsync(orgId, "Admin", "Two", "selfdeladmin2@test.com", MemberRole.Admin);

        // Get admin1's membership ID
        var listResponse = await adminClient.GetAsync($"/api/organizations/{orgId}/members");
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        var admin1MembershipId = GetMembershipIdByEmail(listBody.GetProperty("members"), "selfdeladmin1@test.com");

        // Admin1 tries to delete themselves
        var deleteResponse = await adminClient.DeleteAsync(
            $"/api/organizations/{orgId}/members/{admin1MembershipId}");
        Assert.Equal(HttpStatusCode.Conflict, deleteResponse.StatusCode);

        var body = await deleteResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("cannot_remove_self", body.GetProperty("error").GetString());
        Assert.Equal("You cannot remove yourself from the organization",
            body.GetProperty("message").GetString());
    }

    // TC-04-INT-07: Self-delete blocked -- manager (409 cannot_remove_self)
    [Fact]
    public async Task Self_delete_blocked_manager()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "SelfDelMgrOrg", "Admin", "Boss", "selfdelmgr-admin@test.com");

        var (_, mgrMembership) = await CreateMemberInDbAsync(
            orgId, "Manager", "Self", "selfdelmgr@test.com", MemberRole.Manager);

        var mgrClient = await LoginAsAsync("selfdelmgr@test.com");

        // Manager tries to delete themselves
        var deleteResponse = await mgrClient.DeleteAsync(
            $"/api/organizations/{orgId}/members/{mgrMembership.Id}");
        Assert.Equal(HttpStatusCode.Conflict, deleteResponse.StatusCode);

        var body = await deleteResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("cannot_remove_self", body.GetProperty("error").GetString());
    }

    // TC-04-INT-08: Removing member revokes their active sessions
    [Fact]
    public async Task Removing_member_revokes_their_active_sessions()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "RevokeOrg", "Admin", "Revoker", "revoke-admin@test.com");

        var (_, targetMembership) = await CreateMemberInDbAsync(
            orgId, "Target", "Revoked", "revoke-target@test.com", MemberRole.User);

        // Target logs in, creating an active session
        var targetClient = await LoginAsAsync("revoke-target@test.com");

        // Verify session works before removal
        var beforeResponse = await targetClient.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.OK, beforeResponse.StatusCode);

        // Admin removes target
        var deleteResponse = await adminClient.DeleteAsync(
            $"/api/organizations/{orgId}/members/{targetMembership.Id}");
        Assert.Equal(HttpStatusCode.OK, deleteResponse.StatusCode);

        // Target's session is revoked (SecurityStamp was changed)
        var afterResponse = await targetClient.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.Unauthorized, afterResponse.StatusCode);
    }

    // TC-04-INT-09: Race condition -- two admins simultaneously try to delete the other
    [Fact]
    public async Task Race_condition_two_admins_try_to_delete_each_other()
    {
        var (admin1Client, orgId, _) = await SignUpAsync(
            "RaceOrg", "Admin", "One", "race-admin1@test.com");

        var (_, admin2Membership) = await CreateMemberInDbAsync(
            orgId, "Admin", "Two", "race-admin2@test.com", MemberRole.Admin);

        var admin2Client = await LoginAsAsync("race-admin2@test.com");

        // Get admin1's membership ID
        var listResponse = await admin1Client.GetAsync($"/api/organizations/{orgId}/members");
        var listBody = await listResponse.Content.ReadFromJsonAsync<JsonElement>();
        var admin1MembershipId = GetMembershipIdByEmail(listBody.GetProperty("members"), "race-admin1@test.com");

        // Both try to delete the other simultaneously
        var task1 = admin1Client.DeleteAsync($"/api/organizations/{orgId}/members/{admin2Membership.Id}");
        var task2 = admin2Client.DeleteAsync($"/api/organizations/{orgId}/members/{admin1MembershipId}");

        var results = await Task.WhenAll(task1, task2);

        var successCount = results.Count(r => r.StatusCode == HttpStatusCode.OK);
        var conflictCount = results.Count(r => r.StatusCode == HttpStatusCode.Conflict);

        // At most one should succeed
        Assert.True(successCount <= 1, $"Expected at most 1 success, got {successCount}");

        // Verify at least one admin remains active
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var activeAdminCount = await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions
            .CountAsync(db.Memberships,
                m => m.OrganizationId == orgId &&
                     m.Status == MembershipStatus.Active &&
                     m.Role == MemberRole.Admin);
        Assert.True(activeAdminCount >= 1, "Organization must retain at least one active admin");
    }

    // TC-04-INT-10: Server-side search with query parameters
    [Fact]
    public async Task Server_side_search_with_query_parameters()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "SearchOrg", "Alex", "Kaminski", "search-alex@acme.com");

        await CreateMemberInDbAsync(orgId, "Pat", "Owner", "search-pat@acme.com", MemberRole.User);

        // Search for "alex"
        var response1 = await adminClient.GetAsync($"/api/organizations/{orgId}/members?search=alex");
        Assert.Equal(HttpStatusCode.OK, response1.StatusCode);
        var body1 = await response1.Content.ReadFromJsonAsync<JsonElement>();
        var members1 = body1.GetProperty("members");
        Assert.Equal(1, members1.GetArrayLength());
        Assert.Equal("Alex Kaminski", members1[0].GetProperty("fullName").GetString());

        // Search for "zzz" (no results)
        var response2 = await adminClient.GetAsync($"/api/organizations/{orgId}/members?search=zzz");
        Assert.Equal(HttpStatusCode.OK, response2.StatusCode);
        var body2 = await response2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(0, body2.GetProperty("members").GetArrayLength());
    }

    // TC-04-INT-11: showRemoved query parameter includes removed members
    [Fact]
    public async Task ShowRemoved_query_parameter_includes_removed_members()
    {
        var (adminClient, orgId, _) = await SignUpAsync(
            "ShowRemovedOrg", "Active", "One", "showrem-active1@test.com");

        await CreateMemberInDbAsync(orgId, "Active", "Two", "showrem-active2@test.com", MemberRole.User);
        await CreateMemberInDbAsync(orgId, "Removed", "Three", "showrem-removed@test.com", MemberRole.User,
            status: MembershipStatus.Removed);

        // Default: only active members
        var response1 = await adminClient.GetAsync($"/api/organizations/{orgId}/members");
        Assert.Equal(HttpStatusCode.OK, response1.StatusCode);
        var body1 = await response1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, body1.GetProperty("members").GetArrayLength());

        // showRemoved=true: all members
        var response2 = await adminClient.GetAsync($"/api/organizations/{orgId}/members?showRemoved=true");
        Assert.Equal(HttpStatusCode.OK, response2.StatusCode);
        var body2 = await response2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(3, body2.GetProperty("members").GetArrayLength());
    }
}
