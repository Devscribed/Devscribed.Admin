using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests.Integration;

public class InvitationIntegrationTests : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory;

    public InvitationIntegrationTests(TestWebAppFactory factory)
    {
        _factory = factory;
    }

    private async Task<(Account Account, Organization Org, Membership Membership)> SeedMemberAsync(
        string email, string password, Organization org, string role = "admin", string status = "active",
        string firstName = "Pat", string lastName = "Owner")
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher>();

        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = hasher.Hash(password),
            FirstName = firstName,
            LastName = lastName,
            CreatedAt = DateTime.UtcNow,
        };
        if (!db.Organizations.Any(o => o.Id == org.Id))
            db.Organizations.Add(org);

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
        return (account, org, membership);
    }

    private static Organization NewOrg(string name) => new() { Id = Guid.NewGuid(), Name = name, CreatedAt = DateTime.UtcNow };

    private async Task<HttpClient> LoggedInClientAsync(string email, string password)
    {
        var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/login", new { email, password });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return client;
    }

    private static string ExtractToken(string emailBody)
    {
        var match = Regex.Match(emailBody, @"token=([^\s&]+)");
        Assert.True(match.Success, "No token found in email body: " + emailBody);
        return match.Groups[1].Value;
    }

    [Fact]
    public async Task Invite_creates_pending_record_and_dispatches_email()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("admin1@acme.com", "Passw0rd", org, role: "admin");
        var client = await LoggedInClientAsync("admin1@acme.com", "Passw0rd");

        var response = await client.PostAsJsonAsync("/api/invitations", new { email = "new@acme.com", role = "user" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Invitation sent", body!.RootElement.GetProperty("message").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invitation = await db.Invitations.SingleAsync(i => i.Email == "new@acme.com" && i.OrganizationId == org.Id);
        Assert.Equal("pending", invitation.Status);
        Assert.Equal("user", invitation.Role);
        Assert.Equal(invitation.CreatedAt.AddDays(7), invitation.ExpiresAt);

        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        Assert.Single(sender.Sent, e => e.ToEmail == "new@acme.com");
    }

    [Fact]
    public async Task Accepting_expired_invitation_is_rejected()
    {
        var org = NewOrg("Acme Inc");
        var (_, _, membership) = await SeedMemberAsync("admin2@acme.com", "Passw0rd", org);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var tokenGen = scope.ServiceProvider.GetRequiredService<ITokenGenerator>();
            var raw = tokenGen.GenerateToken();
            db.Invitations.Add(new Invitation
            {
                Id = Guid.NewGuid(),
                Email = "expired@acme.com",
                Role = "user",
                OrganizationId = org.Id,
                InviterMembershipId = membership.Id,
                TokenHash = tokenGen.Hash(raw),
                CreatedAt = DateTime.UtcNow.AddDays(-8),
                ExpiresAt = DateTime.UtcNow.AddDays(-1),
                Status = "pending",
            });
            await db.SaveChangesAsync();

            var client = _factory.CreateClient();
            var response = await client.PostAsJsonAsync("/api/invitations/accept", new { token = raw, password = "Passw0rd" });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
            Assert.Equal("This invitation has expired", body!.RootElement.GetProperty("message").GetString());

            var count = await db.Accounts.CountAsync(a => a.Email == "expired@acme.com");
            Assert.Equal(0, count);
        }
    }

    [Fact]
    public async Task Accepting_already_used_invitation_is_rejected()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("admin3@acme.com", "Passw0rd", org);
        var client = await LoggedInClientAsync("admin3@acme.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        await client.PostAsJsonAsync("/api/invitations", new { email = "used@acme.com", role = "user" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "used@acme.com").Body);

        var acceptClient = _factory.CreateClient();
        var first = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd",
        });
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);

        var second = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd",
        });
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        var body = await second.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This invitation is no longer valid", body!.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Accepting_invite_while_member_of_another_org_hard_deletes_old_data()
    {
        var orgA = NewOrg("Org A");
        var orgB = NewOrg("Org B");
        await SeedMemberAsync("u@x.com", "Passw0rd", orgA, role: "user");
        await SeedMemberAsync("adminb@x.com", "Passw0rd", orgB, role: "admin");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = await db.Memberships.Include(m => m.Account).SingleAsync(m => m.Account.Email == "u@x.com");
            membership.JobTitle = "Engineer";
            await db.SaveChangesAsync();
        }

        var client = await LoggedInClientAsync("adminb@x.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        await client.PostAsJsonAsync("/api/invitations", new { email = "u@x.com", role = "manager" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "u@x.com").Body);

        var acceptClient = _factory.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "Passw0rd",
            orgSwitchConfirmed = true,
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await verifyDb.Accounts.Include(a => a.Membership).SingleAsync(a => a.Email == "u@x.com");
        Assert.NotNull(account.Membership);
        Assert.Equal(orgB.Id, account.Membership!.OrganizationId);
        Assert.Equal("manager", account.Membership.Role);
        Assert.Equal("active", account.Membership.Status);

        var oldMembershipCount = await verifyDb.Memberships.CountAsync(m => m.AccountId == account.Id && m.OrganizationId == orgA.Id);
        Assert.Equal(0, oldMembershipCount);

        var invitation = await verifyDb.Invitations.SingleAsync(i => i.Email == "u@x.com" && i.OrganizationId == orgB.Id);
        Assert.Equal("used", invitation.Status);
    }

    [Fact]
    public async Task Manager_cannot_invite_at_admin_role()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("mgr1@acme.com", "Passw0rd", org, role: "manager");
        var client = await LoggedInClientAsync("mgr1@acme.com", "Passw0rd");

        var response = await client.PostAsJsonAsync("/api/invitations", new { email = "new@acme.com", role = "admin" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("You do not have permission to assign the admin role", body!.RootElement.GetProperty("message").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(0, await db.Invitations.CountAsync(i => i.Email == "new@acme.com" && i.OrganizationId == org.Id));
    }

    [Fact]
    public async Task Invite_to_removed_member_restores_with_invitations_role_and_clears_job_title()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("admin4@acme.com", "Passw0rd", org, role: "admin");
        await SeedMemberAsync("ex@acme.com", "Passw0rd", org, role: "user", status: "removed");

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = await db.Memberships.Include(m => m.Account).SingleAsync(m => m.Account.Email == "ex@acme.com");
            membership.JobTitle = "Engineer";
            await db.SaveChangesAsync();
        }

        var client = await LoggedInClientAsync("admin4@acme.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        var inviteResponse = await client.PostAsJsonAsync("/api/invitations", new { email = "ex@acme.com", role = "manager" });
        Assert.Equal(HttpStatusCode.OK, inviteResponse.StatusCode);

        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "ex@acme.com").Body);
        var acceptClient = _factory.CreateClient();
        var acceptResponse = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new { token, password = "Passw0rd" });
        Assert.Equal(HttpStatusCode.OK, acceptResponse.StatusCode);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var membershipAfter = await verifyDb.Memberships.Include(m => m.Account).SingleAsync(m => m.Account.Email == "ex@acme.com");
        Assert.Equal("active", membershipAfter.Status);
        Assert.Equal("manager", membershipAfter.Role);
        Assert.Null(membershipAfter.JobTitle);
    }

    [Fact]
    public async Task Manager_invites_with_non_admin_roles()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("mgr2@acme.com", "Passw0rd", org, role: "manager");
        var client = await LoggedInClientAsync("mgr2@acme.com", "Passw0rd");

        var r1 = await client.PostAsJsonAsync("/api/invitations", new { email = "new1@acme.com", role = "manager" });
        var r2 = await client.PostAsJsonAsync("/api/invitations", new { email = "new2@acme.com", role = "user" });
        var r3 = await client.PostAsJsonAsync("/api/invitations", new { email = "new3@acme.com", role = "viewer" });
        var r4 = await client.PostAsJsonAsync("/api/invitations", new { email = "new4@acme.com", role = "admin" });

        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
        Assert.Equal(HttpStatusCode.OK, r3.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, r4.StatusCode);
        var body4 = await r4.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("You do not have permission to assign the admin role", body4!.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Self_invitation_rejected_at_api_level()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("admin5@acme.com", "Passw0rd", org, role: "admin");
        var client = await LoggedInClientAsync("admin5@acme.com", "Passw0rd");

        var r1 = await client.PostAsJsonAsync("/api/invitations", new { email = "admin5@acme.com", role = "user" });
        var r2 = await client.PostAsJsonAsync("/api/invitations", new { email = "ADMIN5@ACME.COM", role = "user" });

        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, r2.StatusCode);
        var body1 = await r1.Content.ReadFromJsonAsync<JsonDocument>();
        var body2 = await r2.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("You cannot invite yourself", body1!.RootElement.GetProperty("message").GetString());
        Assert.Equal("You cannot invite yourself", body2!.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Existing_account_accepts_invitation_with_correct_password()
    {
        var orgA = NewOrg("Org A");
        var orgB = NewOrg("Org B");
        await SeedMemberAsync("pat@other.com", "Passw0rd", orgA, role: "user");
        await SeedMemberAsync("adminc@x.com", "Passw0rd", orgB, role: "admin");

        var client = await LoggedInClientAsync("adminc@x.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        await client.PostAsJsonAsync("/api/invitations", new { email = "pat@other.com", role = "manager" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "pat@other.com").Body);

        var acceptClient = _factory.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "Passw0rd",
            orgSwitchConfirmed = true,
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db.Accounts.Include(a => a.Membership).SingleAsync(a => a.Email == "pat@other.com");
        Assert.Equal(orgB.Id, account.Membership!.OrganizationId);
        Assert.Equal("manager", account.Membership.Role);
    }

    [Fact]
    public async Task Existing_account_accepts_invitation_with_wrong_password_rejected()
    {
        var orgA = NewOrg("Org A");
        var orgB = NewOrg("Org B");
        await SeedMemberAsync("pat2@other.com", "Passw0rd", orgA, role: "user");
        await SeedMemberAsync("admind@x.com", "Passw0rd", orgB, role: "admin");

        var client = await LoggedInClientAsync("admind@x.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        await client.PostAsJsonAsync("/api/invitations", new { email = "pat2@other.com", role = "manager" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "pat2@other.com").Body);

        var acceptClient = _factory.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "WrongPass1",
            orgSwitchConfirmed = true,
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("Incorrect password", body!.RootElement.GetProperty("message").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invitation = await db.Invitations.SingleAsync(i => i.Email == "pat2@other.com" && i.OrganizationId == orgB.Id);
        Assert.Equal("pending", invitation.Status);
    }

    [Fact]
    public async Task Org_switch_as_last_admin_hard_deletes_old_org_data()
    {
        var orgA = NewOrg("Org A");
        var orgB = NewOrg("Org B");
        await SeedMemberAsync("admin@orga.com", "Passw0rd", orgA, role: "admin");
        await SeedMemberAsync("user@orga.com", "Passw0rd", orgA, role: "user");
        await SeedMemberAsync("admine@x.com", "Passw0rd", orgB, role: "admin");

        var client = await LoggedInClientAsync("admine@x.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        await client.PostAsJsonAsync("/api/invitations", new { email = "admin@orga.com", role = "manager" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "admin@orga.com").Body);

        var acceptClient = _factory.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "Passw0rd",
            orgSwitchConfirmed = true,
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var oldMembershipCount = await db.Memberships.Include(m => m.Account)
            .CountAsync(m => m.Account.Email == "admin@orga.com" && m.OrganizationId == orgA.Id);
        Assert.Equal(0, oldMembershipCount);

        var newMembership = await db.Memberships.Include(m => m.Account).SingleAsync(m => m.Account.Email == "admin@orga.com");
        Assert.Equal(orgB.Id, newMembership.OrganizationId);
        Assert.Equal("active", newMembership.Status);

        var remainingAdmins = await db.Memberships.CountAsync(m => m.OrganizationId == orgA.Id && m.Role == "admin" && m.Status == "active");
        Assert.Equal(0, remainingAdmins);
    }

    [Fact]
    public async Task Inviter_removal_invalidates_pending_invitations()
    {
        var org = NewOrg("Acme Inc");
        var (_, _, membershipA) = await SeedMemberAsync("adminf@acme.com", "Passw0rd", org, role: "admin");
        var client = await LoggedInClientAsync("adminf@acme.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        await client.PostAsJsonAsync("/api/invitations", new { email = "new5@acme.com", role = "user" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "new5@acme.com").Body);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var membership = await db.Memberships.SingleAsync(m => m.Id == membershipA.Id);
            membership.Status = "removed";
            await db.SaveChangesAsync();
        }

        using (var verifyScope = _factory.Services.CreateScope())
        {
            var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
            var invitation = await verifyDb.Invitations.SingleAsync(i => i.Email == "new5@acme.com" && i.OrganizationId == org.Id);
            Assert.Equal("invalidated", invitation.Status);
        }

        var acceptClient = _factory.CreateClient();
        var acceptResponse = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd",
        });
        Assert.Equal(HttpStatusCode.BadRequest, acceptResponse.StatusCode);
        var body = await acceptResponse.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This invitation is no longer valid", body!.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Reinvitation_supersedes_prior_pending_invitation()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("adming@acme.com", "Passw0rd", org, role: "admin");
        var client = await LoggedInClientAsync("adming@acme.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();

        await client.PostAsJsonAsync("/api/invitations", new { email = "new6@acme.com", role = "user" });
        var t1 = ExtractToken(sender.Sent.First(e => e.ToEmail == "new6@acme.com").Body);

        var r2 = await client.PostAsJsonAsync("/api/invitations", new { email = "new6@acme.com", role = "manager" });
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
        var t2 = ExtractToken(sender.Sent.Last(e => e.ToEmail == "new6@acme.com").Body);

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var t1Invitation = await db.Invitations.SingleAsync(i => i.Email == "new6@acme.com" && i.Role == "user");
            Assert.Equal("invalidated", t1Invitation.Status);
        }

        var acceptClient = _factory.CreateClient();
        var r1Accept = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token = t1,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd",
        });
        Assert.Equal(HttpStatusCode.BadRequest, r1Accept.StatusCode);
        var r1Body = await r1Accept.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This invitation is no longer valid", r1Body!.RootElement.GetProperty("message").GetString());

        var r2Accept = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token = t2,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd",
        });
        Assert.Equal(HttpStatusCode.OK, r2Accept.StatusCode);

        using var verifyScope = _factory.Services.CreateScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await verifyDb.Accounts.Include(a => a.Membership).SingleAsync(a => a.Email == "new6@acme.com");
        Assert.Equal("manager", account.Membership!.Role);
    }

    [Fact]
    public async Task Org_switch_without_confirmation_rejected_with_409()
    {
        var orgA = NewOrg("Org A");
        var orgB = NewOrg("Org B");
        await SeedMemberAsync("user@x.com", "Passw0rd", orgA, role: "user");
        await SeedMemberAsync("adminh@x.com", "Passw0rd", orgB, role: "admin");

        var client = await LoggedInClientAsync("adminh@x.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        await client.PostAsJsonAsync("/api/invitations", new { email = "user@x.com", role = "user" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "user@x.com").Body);

        var acceptClient = _factory.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            password = "Passw0rd",
            orgSwitchConfirmed = false,
        });

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("org_switch_confirmation_required", body!.RootElement.GetProperty("message").GetString());
        Assert.Equal("Org A", body.RootElement.GetProperty("oldOrganizationName").GetString());
        Assert.False(body.RootElement.GetProperty("lastAdmin").GetBoolean());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var invitation = await db.Invitations.SingleAsync(i => i.Email == "user@x.com" && i.OrganizationId == orgB.Id);
        Assert.Equal("pending", invitation.Status);
    }

    [Fact]
    public async Task Inviting_active_member_of_same_org_rejected()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("admini@acme.com", "Passw0rd", org, role: "admin");
        await SeedMemberAsync("member@acme.com", "Passw0rd", org, role: "user");
        var client = await LoggedInClientAsync("admini@acme.com", "Passw0rd");

        var response = await client.PostAsJsonAsync("/api/invitations", new { email = "member@acme.com", role = "user" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This person is already a member of your organization", body!.RootElement.GetProperty("message").GetString());

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(0, await db.Invitations.CountAsync(i => i.Email == "member@acme.com" && i.OrganizationId == org.Id));
    }

    [Fact]
    public async Task User_or_viewer_cannot_create_invitations()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("plainuser@acme.com", "Passw0rd", org, role: "user");
        var client = await LoggedInClientAsync("plainuser@acme.com", "Passw0rd");

        var response = await client.PostAsJsonAsync("/api/invitations", new { email = "new7@acme.com", role = "user" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("You do not have permission to invite members", body!.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task Accepting_with_unrecognized_token_is_rejected()
    {
        var client = _factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/invitations/accept", new { token = "fabricated-token-value", password = "Passw0rd" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("This invitation is no longer valid", body!.RootElement.GetProperty("message").GetString());
    }

    [Fact]
    public async Task New_account_accepts_invitation_with_valid_name_and_password()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("adminj@acme.com", "Passw0rd", org, role: "admin");
        var client = await LoggedInClientAsync("adminj@acme.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        await client.PostAsJsonAsync("/api/invitations", new { email = "new8@acme.com", role = "user" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "new8@acme.com").Body);

        var acceptClient = _factory.CreateClient();
        var response = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd",
            timezone = "America/New_York",
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var account = await db.Accounts.Include(a => a.Membership).SingleAsync(a => a.Email == "new8@acme.com");
        Assert.Equal("New", account.FirstName);
        Assert.Equal("Hire", account.LastName);
        Assert.Equal("America/New_York", account.Timezone);
        Assert.Equal(org.Id, account.Membership!.OrganizationId);
        Assert.Equal("user", account.Membership.Role);
        Assert.Equal("active", account.Membership.Status);

        var invitation = await db.Invitations.SingleAsync(i => i.Email == "new8@acme.com");
        Assert.Equal("used", invitation.Status);
    }

    [Fact]
    public async Task New_account_accept_with_invalid_name_rejected_without_consuming_token()
    {
        var org = NewOrg("Acme Inc");
        await SeedMemberAsync("admink@acme.com", "Passw0rd", org, role: "admin");
        var client = await LoggedInClientAsync("admink@acme.com", "Passw0rd");
        var sender = _factory.Services.GetRequiredService<InMemoryEmailSender>();
        await client.PostAsJsonAsync("/api/invitations", new { email = "new9@acme.com", role = "user" });
        var token = ExtractToken(sender.Sent.First(e => e.ToEmail == "new9@acme.com").Body);

        var acceptClient = _factory.CreateClient();
        var r1 = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "",
            lastName = "Hire",
            password = "Passw0rd",
        });
        Assert.Equal(HttpStatusCode.BadRequest, r1.StatusCode);
        var r1Body = await r1.Content.ReadFromJsonAsync<JsonDocument>();
        Assert.Equal("First name is required", r1Body!.RootElement.GetProperty("errors").GetProperty("firstName").GetString());

        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var invitation = await db.Invitations.SingleAsync(i => i.Email == "new9@acme.com");
            Assert.Equal("pending", invitation.Status);
        }

        var r2 = await acceptClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd",
        });
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
    }
}
