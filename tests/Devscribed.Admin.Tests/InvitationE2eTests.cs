using System.Net;
using System.Net.Http.Json;
using Devscribed.Admin.Application.Invitations;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Devscribed.Admin.Tests;

public class InvitationE2eTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private WebApplicationFactory<Program> _factory = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<AdminDbContext>));
                if (descriptor != null) services.Remove(descriptor);

                services.AddDbContext<AdminDbContext>(options => options.UseSqlite(_connection));
            });
        });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();
        await db.Database.EnsureCreatedAsync();
    }

    public async Task DisposeAsync()
    {
        await _factory.DisposeAsync();
        await _connection.DisposeAsync();
    }

    /// <summary>TC-04-E2E-01: Admin invites, invitee accepts and lands in the org.</summary>
    [Fact]
    public async Task Admin_invites_new_member_and_invitee_accepts()
    {
        using var adminClient = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var signup = await adminClient.PostAsJsonAsync("/api/signup", new
        {
            orgName = "Acme Inc",
            firstName = "Ada",
            lastName = "Admin",
            email = "ada@acme.com",
            password = "Passw0rd"
        });
        Assert.Equal(HttpStatusCode.OK, signup.StatusCode);

        var membersPage = await adminClient.GetStringAsync("/Members");
        Assert.Contains("data-testid=\"members-list\"", membersPage);
        Assert.Contains("data-testid=\"invite-open-button\"", membersPage);
        Assert.Contains("data-testid=\"invite-email-input\"", membersPage);
        Assert.Contains("data-testid=\"invite-role-select\"", membersPage);

        var invite = await adminClient.PostAsJsonAsync("/api/invitations", new
        {
            email = "new@acme.com",
            role = "User"
        });
        Assert.Equal(HttpStatusCode.OK, invite.StatusCode);

        using var scope = _factory.Services.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<InMemoryInvitationEmailSender>();
        var link = Assert.Single(sender.Messages, m => m.To == "new@acme.com").Link;

        using var inviteeClient = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var acceptPage = await inviteeClient.GetStringAsync(link);
        Assert.Contains("data-testid=\"accept-invite-screen\"", acceptPage);
        Assert.Contains("data-testid=\"accept-invite-org-name\">Acme Inc", acceptPage);
        Assert.Contains("data-testid=\"accept-first-name-input\"", acceptPage);
        Assert.Contains("data-testid=\"accept-last-name-input\"", acceptPage);
        Assert.Contains("data-testid=\"accept-password-input\"", acceptPage);
        Assert.Contains("data-testid=\"accept-submit-button\"", acceptPage);

        var token = sender.Messages.Single(m => m.To == "new@acme.com").Token;
        var accept = await inviteeClient.PostAsJsonAsync("/api/invitations/accept", new
        {
            token,
            firstName = "New",
            lastName = "Hire",
            password = "Passw0rd"
        });
        Assert.Equal(HttpStatusCode.OK, accept.StatusCode);

        var inviteeMembersPage = await inviteeClient.GetStringAsync("/Members");
        Assert.Contains("data-testid=\"members-list\"", inviteeMembersPage);
        Assert.Contains("New Hire", inviteeMembersPage);
        Assert.Contains(">user</span>", inviteeMembersPage);
    }

    /// <summary>TC-04-E2E-02: Expired link shows explicit error.</summary>
    [Fact]
    public async Task Expired_invitation_link_shows_error_without_accept_form()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AdminDbContext>();

        var inviter = new Account
        {
            Email = "admin@expired.test",
            FirstName = "A",
            LastName = "Admin",
            PasswordHash = "x"
        };
        var org = new Organization { Name = "Expired Org" };
        db.Accounts.Add(inviter);
        db.Organizations.Add(org);
        db.Memberships.Add(Membership.CreateAdmin(inviter.Id, org.Id));

        var issuedAt = DateTimeOffset.UtcNow.AddDays(-8);
        db.Invitations.Add(new Invitation
        {
            Email = "late@acme.com",
            Role = MembershipRole.User,
            OrganizationId = org.Id,
            InvitedByAccountId = inviter.Id,
            Token = "expired-token",
            IssuedAt = issuedAt,
            ExpiresAt = issuedAt + Invitation.Lifetime
        });
        await db.SaveChangesAsync();

        using var client = _factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var page = await client.GetStringAsync("/AcceptInvitation?token=expired-token");

        Assert.Contains("data-testid=\"accept-invite-screen\"", page);
        Assert.Contains("data-testid=\"accept-invite-error\"", page);
        Assert.Contains("this invitation has expired", page);
        Assert.DoesNotContain("data-testid=\"accept-submit-button\"", page);
        Assert.DoesNotContain("data-testid=\"accept-password-input\"", page);
    }
}
