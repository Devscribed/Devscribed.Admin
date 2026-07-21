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
public class InvitationAcceptTests
{
    private readonly IntegrationTestFixture _fixture;

    public InvitationAcceptTests(IntegrationTestFixture fixture)
    {
        _fixture = fixture;
    }

    // TC-03-INT-18: New account accepts invitation
    [Fact]
    public async Task New_account_accepts_invitation_with_valid_data()
    {
        // Arrange: create org with admin, then invite
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "New Accept Org",
            firstName = "Admin",
            lastName = "Accept",
            email = "new-accept-admin@test.com",
            password = "Passw0rd"
        });

        await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "new-accept@acme.com",
            role = "user"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Act
        var acceptClient = _fixture.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd",
            timezone = "America/New_York"
        });

        // Assert
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("/members", body.GetProperty("redirectTo").GetString());

        // Verify DB
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Email == "new-accept@acme.com");
        Assert.NotNull(account);
        Assert.Equal("New", account.FirstName);
        Assert.Equal("Hire", account.LastName);
        Assert.Equal("America/New_York", account.Timezone);

        var membership = await db.Memberships.FirstOrDefaultAsync(m => m.AccountId == account.Id);
        Assert.NotNull(membership);
        Assert.Equal(MemberRole.User, membership.Role);
        Assert.Equal(MembershipStatus.Active, membership.Status);

        var invitation = await db.Invitations.FirstOrDefaultAsync(i => i.Email == "new-accept@acme.com");
        Assert.NotNull(invitation);
        Assert.Equal(InvitationStatus.Used, invitation.Status);
        Assert.NotNull(invitation.UsedAt);
    }

    // TC-03-INT-19: New account accept with invalid name
    [Fact]
    public async Task New_account_accept_with_invalid_name_rejected_without_consuming_token()
    {
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Invalid Name Org",
            firstName = "Admin",
            lastName = "Invalid",
            email = "inv-name-admin@test.com",
            password = "Passw0rd"
        });

        await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "inv-name-target@acme.com",
            role = "user"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // First attempt with invalid name
        var client = _fixture.CreateClient();
        var r1 = await client.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "",
            lastName = "Hire",
            password = "Passw0rd"
        });

        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        var body1 = await r1.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("First name is required", body1.GetProperty("errors").GetProperty("firstName").GetString());

        // Verify token is NOT consumed
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var invitation = await db.Invitations.FirstAsync(i => i.Email == "inv-name-target@acme.com");
            Assert.Equal(InvitationStatus.Pending, invitation.Status);
        }

        // Second attempt with valid data should succeed
        var r2 = await client.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd"
        });

        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
    }

    // TC-03-INT-02: Accepting an expired invitation is rejected
    [Fact]
    public async Task Accepting_expired_invitation_is_rejected()
    {
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Expired Inv Org",
            firstName = "Admin",
            lastName = "Expired",
            email = "expired-admin@test.com",
            password = "Passw0rd"
        });

        await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "expired-target@acme.com",
            role = "user"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Manually set ExpiresAt to the past
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var invitation = await db.Invitations.FirstAsync(i => i.Email == "expired-target@acme.com");
            invitation.ExpiresAt = DateTime.UtcNow.AddDays(-1);
            await db.SaveChangesAsync();
        }

        var client = _fixture.CreateClient();
        var response = await client.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "New",
            lastName = "User",
            password = "Passw0rd"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This invitation has expired", body.GetProperty("message").GetString());
    }

    // TC-03-INT-03: Accepting an already-used invitation is rejected
    [Fact]
    public async Task Accepting_already_used_invitation_is_rejected()
    {
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Used Inv Org",
            firstName = "Admin",
            lastName = "Used",
            email = "used-admin@test.com",
            password = "Passw0rd"
        });

        await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "used-target@acme.com",
            role = "user"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Accept first time
        var client1 = _fixture.CreateClient();
        var r1 = await client1.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "First",
            lastName = "Accept",
            password = "Passw0rd"
        });
        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);

        // Try to accept again
        var client2 = _fixture.CreateClient();
        var r2 = await client2.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "Second",
            lastName = "Accept",
            password = "Passw0rd"
        });

        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        var body = await r2.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This invitation is no longer valid", body.GetProperty("message").GetString());
    }

    // TC-03-INT-09: Existing account accepts with correct password
    [Fact]
    public async Task Existing_account_accepts_with_correct_password()
    {
        // Create account via signup in another org
        var existingClient = _fixture.CreateClient();
        await existingClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Existing Account Org",
            firstName = "Pat",
            lastName = "User",
            email = "pat-accept@other.com",
            password = "Passw0rd"
        });

        // Create another org and admin
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Target Accept Org",
            firstName = "Admin",
            lastName = "Target",
            email = "target-accept-admin@test.com",
            password = "Passw0rd"
        });

        // Invite pat
        await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "pat-accept@other.com",
            role = "manager"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Accept with correct password and org switch confirmation
        var acceptClient = _fixture.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "Passw0rd",
            orgSwitchConfirmed = true
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Verify membership in new org
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db.Accounts.FirstAsync(a => a.Email == "pat-accept@other.com");
        var membership = await db.Memberships.FirstOrDefaultAsync(m => m.AccountId == account.Id);
        Assert.NotNull(membership);
        Assert.Equal(MemberRole.Manager, membership.Role);
        Assert.Equal(MembershipStatus.Active, membership.Status);
    }

    // TC-03-INT-10: Existing account with wrong password
    [Fact]
    public async Task Existing_account_with_wrong_password_is_rejected()
    {
        // Create account
        var existingClient = _fixture.CreateClient();
        await existingClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Wrong Pass Org",
            firstName = "Pat",
            lastName = "Wrong",
            email = "pat-wrong@other.com",
            password = "Passw0rd"
        });

        // Create inviting org
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Inviting Wrong Org",
            firstName = "Admin",
            lastName = "Wrong",
            email = "admin-wrong@test.com",
            password = "Passw0rd"
        });

        await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "pat-wrong@other.com",
            role = "user"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Accept with wrong password
        var acceptClient = _fixture.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "WrongPass1",
            orgSwitchConfirmed = true
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("Incorrect password", body.GetProperty("message").GetString());

        // Verify invitation is still pending
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invitation = await db.Invitations.FirstAsync(i => i.Email == "pat-wrong@other.com");
        Assert.Equal(InvitationStatus.Pending, invitation.Status);
    }

    // TC-03-INT-04: Org-switch hard-deletes old data
    [Fact]
    public async Task Org_switch_hard_deletes_old_membership()
    {
        // Create user in org A with job title
        var userClient = _fixture.CreateClient();
        await userClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Old Org Switch",
            firstName = "User",
            lastName = "Switch",
            email = "switch-user@x.com",
            password = "Passw0rd"
        });

        Guid oldOrgId;
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = await db.Memberships
                .Include(m => m.Account)
                .FirstAsync(m => m.Account.Email == "switch-user@x.com");
            membership.JobTitle = "Engineer";
            oldOrgId = membership.OrganizationId;
            await db.SaveChangesAsync();
        }

        // Create inviting org
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "New Org Switch",
            firstName = "Admin",
            lastName = "Switch",
            email = "switch-admin@test.com",
            password = "Passw0rd"
        });

        await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "switch-user@x.com",
            role = "user"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Accept with org switch
        var acceptClient = _fixture.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "Passw0rd",
            orgSwitchConfirmed = true
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Verify old membership is hard-deleted
        using var scope2 = _fixture.Services.CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db2.Accounts.FirstAsync(a => a.Email == "switch-user@x.com");
        var oldMembership = await db2.Memberships
            .FirstOrDefaultAsync(m => m.AccountId == account.Id && m.OrganizationId == oldOrgId);
        Assert.Null(oldMembership); // Hard-deleted

        // Verify new membership exists
        var newMembership = await db2.Memberships.FirstOrDefaultAsync(m => m.AccountId == account.Id);
        Assert.NotNull(newMembership);
        Assert.Equal(MemberRole.User, newMembership.Role);
        Assert.Equal(MembershipStatus.Active, newMembership.Status);
    }

    // TC-03-INT-11: Org-switch as last admin
    [Fact]
    public async Task Org_switch_as_last_admin_old_org_data_hard_deleted()
    {
        // Create org A with sole admin
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Admin Org A",
            firstName = "Solo",
            lastName = "Admin",
            email = "solo-admin@orga.com",
            password = "Passw0rd"
        });

        // Add another non-admin member to Org A
        Guid orgAId;
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var adminMembership = await db.Memberships
                .Include(m => m.Account)
                .FirstAsync(m => m.Account.Email == "solo-admin@orga.com");
            orgAId = adminMembership.OrganizationId;

            var otherAccount = new Account
            {
                Id = Guid.NewGuid(),
                Email = "other-member@orga.com",
                PasswordHash = PasswordHasher.Hash("Passw0rd"),
                FirstName = "Other",
                LastName = "Member",
                CreatedAt = DateTime.UtcNow,
            };
            db.Accounts.Add(otherAccount);
            db.Memberships.Add(new Membership
            {
                Id = Guid.NewGuid(),
                AccountId = otherAccount.Id,
                OrganizationId = orgAId,
                Role = MemberRole.User,
                Status = MembershipStatus.Active,
                JoinedAt = DateTime.UtcNow,
            });
            await db.SaveChangesAsync();
        }

        // Create Org B and invite the admin
        var orgBClient = _fixture.CreateClient();
        await orgBClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Org B Target",
            firstName = "Admin",
            lastName = "OrgB",
            email = "admin-orgb-la@test.com",
            password = "Passw0rd"
        });

        await orgBClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "solo-admin@orga.com",
            role = "user"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Accept with org switch
        var acceptClient = _fixture.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "Passw0rd",
            orgSwitchConfirmed = true
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Verify old membership is deleted
        using var scope2 = _fixture.Services.CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db2.Accounts.FirstAsync(a => a.Email == "solo-admin@orga.com");

        var oldMembership = await db2.Memberships
            .FirstOrDefaultAsync(m => m.AccountId == account.Id && m.OrganizationId == orgAId);
        Assert.Null(oldMembership);

        // Verify new membership in Org B
        var newMembership = await db2.Memberships.FirstOrDefaultAsync(m => m.AccountId == account.Id);
        Assert.NotNull(newMembership);
        Assert.Equal(MemberRole.User, newMembership.Role);

        // Verify Org A now has zero admins
        var orgAAdmins = await db2.Memberships
            .CountAsync(m => m.OrganizationId == orgAId && m.Role == MemberRole.Admin && m.Status == MembershipStatus.Active);
        Assert.Equal(0, orgAAdmins);
    }

    // TC-03-INT-14: Org-switch without confirmation is rejected with 409
    [Fact]
    public async Task Org_switch_without_confirmation_returns_409()
    {
        // Create user in org A (signup makes admin, change to user)
        var userClient = _fixture.CreateClient();
        await userClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "No Confirm Org A",
            firstName = "No",
            lastName = "Confirm",
            email = "no-confirm@x.com",
            password = "Passw0rd"
        });

        using (var setupScope = _fixture.Services.CreateScope())
        {
            var setupDb = setupScope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = setupDb.Memberships.First(m => m.Account.Email == "no-confirm@x.com");
            membership.Role = MemberRole.User;
            await setupDb.SaveChangesAsync();
        }

        // Create org B and invite
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "No Confirm Org B",
            firstName = "Admin",
            lastName = "Confirm",
            email = "confirm-admin@test.com",
            password = "Passw0rd"
        });

        await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "no-confirm@x.com",
            role = "user"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Accept without confirmation
        var acceptClient = _fixture.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "Passw0rd",
            orgSwitchConfirmed = false
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("org_switch_confirmation_required", body.GetProperty("message").GetString());
        Assert.Equal("No Confirm Org A", body.GetProperty("oldOrganizationName").GetString());
        Assert.False(body.GetProperty("lastAdmin").GetBoolean());

        // Verify invitation remains pending
        using var scope = _fixture.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invitation = await db.Invitations.FirstAsync(i => i.Email == "no-confirm@x.com");
        Assert.Equal(InvitationStatus.Pending, invitation.Status);
    }

    // TC-03-INT-06: Invite to removed member restores with invitation's role
    [Fact]
    public async Task Invite_to_removed_member_restores_with_invitation_role()
    {
        // Create org and admin
        var adminClient = _fixture.CreateClient();
        await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Restore Org",
            firstName = "Admin",
            lastName = "Restore",
            email = "restore-admin@test.com",
            password = "Passw0rd"
        });

        // Create a removed member
        Guid orgId;
        using (var scope = _fixture.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var org = await db.Organizations.FirstAsync(o => o.Name == "Restore Org");
            orgId = org.Id;

            var memberAccount = new Account
            {
                Id = Guid.NewGuid(),
                Email = "ex-member@acme.com",
                PasswordHash = PasswordHasher.Hash("Passw0rd"),
                FirstName = "Ex",
                LastName = "Member",
                CreatedAt = DateTime.UtcNow,
            };
            db.Accounts.Add(memberAccount);
            db.Memberships.Add(new Membership
            {
                Id = Guid.NewGuid(),
                AccountId = memberAccount.Id,
                OrganizationId = orgId,
                Role = MemberRole.User,
                Status = MembershipStatus.Removed,
                JobTitle = "Engineer",
                JoinedAt = DateTime.UtcNow.AddDays(-30),
            });
            await db.SaveChangesAsync();
        }

        // Invite the removed member with a different role
        await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "ex-member@acme.com",
            role = "manager"
        });

        var token = _fixture.EmailService.SentInvitationEmails.Last().Token;

        // Accept
        var acceptClient = _fixture.CreateClient();
        var beforeAccept = DateTime.UtcNow;
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "Passw0rd"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        // Verify membership restored
        using var scope2 = _fixture.Services.CreateScope();
        var db2 = scope2.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db2.Accounts.FirstAsync(a => a.Email == "ex-member@acme.com");
        var membership = await db2.Memberships.FirstAsync(m => m.AccountId == account.Id);

        Assert.Equal(MembershipStatus.Active, membership.Status);
        Assert.Equal(MemberRole.Manager, membership.Role); // From invitation, not original User
        Assert.Null(membership.JobTitle); // Cleared
        Assert.True(membership.JoinedAt >= beforeAccept); // Reset
    }

    // TC-03-INT-17: Accepting with unrecognized token
    [Fact]
    public async Task Accepting_with_unrecognized_token_is_rejected()
    {
        var client = _fixture.CreateClient();
        var response = await client.PostAsJsonAsync("/api/invitations/accept", new
        {
            token = "fabricated-token-value",
            password = "Passw0rd"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("This invitation is no longer valid", body.GetProperty("message").GetString());
    }
}
