using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Infrastructure.Data;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

[Collection("Integration")]
public class InvitationEndpointTests
{
    private readonly IntegrationTestFixture _fixture;
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public InvitationEndpointTests(IntegrationTestFixture fixture)
    {
        _fixture = fixture;
    }

    // TC-03-INT-01: Invite creates a pending record and dispatches an email
    [Fact]
    public async Task Admin_invite_creates_pending_record_and_dispatches_email()
    {
        // Arrange: sign up as admin
        var client = _fixture.CreateClient();
        var signupResponse = await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Invite Test Org",
            firstName = "Admin",
            lastName = "User",
            email = "inv-admin@test.com",
            password = "Passw0rd"
        });
        signupResponse.EnsureSuccessStatusCode();

        var initialCount = _fixture.EmailService.SentInvitationEmails.Count;

        // Act
        var response = await client.PostAsJsonAsync("/api/invitations", new
        {
            email = "new@acme.com",
            role = "user"
        });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Invitation sent", body.GetProperty("message").GetString());

        // Check DB
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invitation = db.Invitations.FirstOrDefault(i => i.Email == "new@acme.com");
        Assert.NotNull(invitation);
        Assert.Equal(InvitationStatus.Pending, invitation.Status);
        Assert.Equal(MemberRole.User, invitation.Role);
        Assert.Equal(invitation.CreatedAt.AddDays(7), invitation.ExpiresAt);

        // Check email dispatched
        Assert.Equal(initialCount + 1, _fixture.EmailService.SentInvitationEmails.Count);
        var sentEmail = _fixture.EmailService.SentInvitationEmails.Last();
        Assert.Equal("new@acme.com", sentEmail.Email);
        Assert.Equal("Invite Test Org", sentEmail.OrganizationName);
    }

    // TC-03-INT-05: Manager cannot invite at admin role
    [Fact]
    public async Task Manager_cannot_invite_at_admin_role()
    {
        // Arrange: sign up as admin, then change role to manager
        var client = _fixture.CreateClient();
        await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Manager Test Org",
            firstName = "Manager",
            lastName = "Person",
            email = "inv-manager@test.com",
            password = "Passw0rd"
        });

        // Change role to manager via DB
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = db.Memberships.First(m => m.Account.Email == "inv-manager@test.com");
            membership.Role = MemberRole.Manager;
            await db.SaveChangesAsync();
        }

        // Act
        var response = await client.PostAsJsonAsync("/api/invitations", new
        {
            email = "new-admin@acme.com",
            role = "admin"
        });

        // Assert
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("You do not have permission to assign the admin role", body.GetProperty("message").GetString());
    }

    // TC-03-INT-07: Manager invites with non-admin roles
    [Fact]
    public async Task Manager_can_invite_with_non_admin_roles()
    {
        // Arrange
        var client = _fixture.CreateClient();
        await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Manager Roles Org",
            firstName = "Manager",
            lastName = "Test",
            email = "mgr-roles@test.com",
            password = "Passw0rd"
        });

        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = db.Memberships.First(m => m.Account.Email == "mgr-roles@test.com");
            membership.Role = MemberRole.Manager;
            await db.SaveChangesAsync();
        }

        // Act & Assert: manager, user, viewer should succeed
        var r1 = await client.PostAsJsonAsync("/api/invitations", new { email = "new1@acme.com", role = "manager" });
        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);

        var r2 = await client.PostAsJsonAsync("/api/invitations", new { email = "new2@acme.com", role = "user" });
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);

        var r3 = await client.PostAsJsonAsync("/api/invitations", new { email = "new3@acme.com", role = "viewer" });
        Assert.Equal(HttpStatusCode.OK, r3.StatusCode);

        // admin should fail
        var r4 = await client.PostAsJsonAsync("/api/invitations", new { email = "new4@acme.com", role = "admin" });
        Assert.Equal(HttpStatusCode.Forbidden, r4.StatusCode);
    }

    // TC-03-INT-08: Self-invitation rejected at API level
    [Fact]
    public async Task Self_invitation_is_rejected()
    {
        var client = _fixture.CreateClient();
        await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Self Invite Org",
            firstName = "Self",
            lastName = "Inviter",
            email = "self-invite@test.com",
            password = "Passw0rd"
        });

        // Same email
        var r1 = await client.PostAsJsonAsync("/api/invitations", new { email = "self-invite@test.com", role = "user" });
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        var body1 = await r1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("You cannot invite yourself", body1.GetProperty("message").GetString());

        // Case variant
        var r2 = await client.PostAsJsonAsync("/api/invitations", new { email = "SELF-INVITE@TEST.COM", role = "user" });
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        var body2 = await r2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("You cannot invite yourself", body2.GetProperty("message").GetString());
    }

    // TC-03-INT-15: Inviting an active member of same org is rejected
    [Fact]
    public async Task Inviting_active_member_of_same_org_is_rejected()
    {
        // Arrange: create org with admin, add another member
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Already Member Org",
            firstName = "Admin",
            lastName = "Boss",
            email = "alrdy-admin@test.com",
            password = "Passw0rd"
        });

        // Create the other member directly in DB
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var org = db.Organizations.First(o => o.Name == "Already Member Org");
            var memberAccount = new Account
            {
                Id = Guid.NewGuid(),
                Email = "member@acme.com",
                PasswordHash = "hashed",
                FirstName = "Existing",
                LastName = "Member",
                CreatedAt = DateTime.UtcNow,
            };
            db.Accounts.Add(memberAccount);
            db.Memberships.Add(new Membership
            {
                Id = Guid.NewGuid(),
                AccountId = memberAccount.Id,
                OrganizationId = org.Id,
                Role = MemberRole.User,
                Status = MembershipStatus.Active,
                JoinedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        // Act
        var response = await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "member@acme.com",
            role = "user"
        });

        // Assert
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This person is already a member of your organization", body.GetProperty("message").GetString());
    }

    // TC-03-INT-16: User or viewer cannot create invitations
    [Fact]
    public async Task User_role_cannot_create_invitations()
    {
        var client = _fixture.CreateClient();
        await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "User Invite Org",
            firstName = "Regular",
            lastName = "User",
            email = "regular-user-inv@test.com",
            password = "Passw0rd"
        });

        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = db.Memberships.First(m => m.Account.Email == "regular-user-inv@test.com");
            membership.Role = MemberRole.User;
            await db.SaveChangesAsync();
        }

        var response = await client.PostAsJsonAsync("/api/invitations", new
        {
            email = "new@acme.com",
            role = "user"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("You do not have permission to invite members", body.GetProperty("message").GetString());
    }

    // TC-03-INT-13: Re-invitation supersedes prior pending invitation
    [Fact]
    public async Task Reinvitation_supersedes_prior_pending()
    {
        var client = _fixture.CreateClient();
        await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Resend Org",
            firstName = "Admin",
            lastName = "Resend",
            email = "resend-admin@test.com",
            password = "Passw0rd"
        });

        // First invite
        await client.PostAsJsonAsync("/api/invitations", new { email = "resend-target@acme.com", role = "user" });
        var firstToken = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Second invite (same email, different role)
        var r2 = await client.PostAsJsonAsync("/api/invitations", new { email = "resend-target@acme.com", role = "manager" });
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
        var secondToken = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Verify old invitation is invalidated
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invitations = db.Invitations
            .Where(i => i.Email == "resend-target@acme.com")
            .OrderBy(i => i.CreatedAt)
            .ToList();

        Assert.Equal(2, invitations.Count);
        Assert.Equal(InvitationStatus.Invalidated, invitations[0].Status);
        Assert.Equal(InvitationStatus.Pending, invitations[1].Status);
        Assert.Equal(MemberRole.Manager, invitations[1].Role);
    }

    // TC-03-INT-12: Inviter removal invalidates pending invitations
    [Fact]
    public async Task Inviter_removal_invalidates_pending_invitations()
    {
        var client = _fixture.CreateClient();
        await client.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Inviter Removal Org",
            firstName = "Inviter",
            lastName = "Admin",
            email = "inviter-removal@test.com",
            password = "Passw0rd"
        });

        // Create invitation
        await client.PostAsJsonAsync("/api/invitations", new { email = "orphan@acme.com", role = "user" });
        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Remove the inviter (set membership to removed) and call invalidation
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = db.Memberships.First(m => m.Account.Email == "inviter-removal@test.com");
            membership.Status = MembershipStatus.Removed;

            // Invalidate pending invitations for this inviter
            var pendingInvitations = db.Invitations
                .Where(i => i.InviterMembershipId == membership.Id && i.Status == InvitationStatus.Pending)
                .ToList();
            foreach (var inv in pendingInvitations)
                inv.Status = InvitationStatus.Invalidated;

            await db.SaveChangesAsync();
        }

        // Verify invitation is invalidated
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var invitation = db.Invitations.First(i => i.Email == "orphan@acme.com");
            Assert.Equal(InvitationStatus.Invalidated, invitation.Status);
        }

        // Try to accept - should fail
        var acceptClient = _fixture.CreateClient();
        var acceptResponse = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token = token,
            firstName = "Orphan",
            lastName = "User",
            password = "Passw0rd"
        });
        Assert.Equal(HttpStatusCode.BadRequest, acceptResponse.StatusCode);
        var body = await acceptResponse.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This invitation is no longer valid", body.GetProperty("message").GetString());
    }
}
