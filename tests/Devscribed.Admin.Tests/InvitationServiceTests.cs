using Devscribed.Admin.Application.Invitations;
using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;

namespace Devscribed.Admin.Tests;

public class InvitationServiceTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private AdminDbContext _db = null!;
    private InviteMemberService _inviteService = null!;
    private AcceptInvitationService _acceptService = null!;
    private InMemoryInvitationEmailSender _emailSender = null!;
    private FakeTimeProvider _timeProvider = null!;
    private IPasswordHasher _hasher = null!;

    private Guid _orgAId;
    private Guid _orgBId;
    private Account _admin = null!;
    private Account _manager = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        var options = new DbContextOptionsBuilder<AdminDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new AdminDbContext(options);
        await _db.Database.EnsureCreatedAsync();

        _emailSender = new InMemoryInvitationEmailSender();
        _timeProvider = new FakeTimeProvider(DateTimeOffset.UtcNow);
        _hasher = new PasswordHasher();
        _inviteService = new InviteMemberService(_db, _emailSender, _timeProvider);
        _acceptService = new AcceptInvitationService(_db, _hasher, _timeProvider);

        _orgAId = Guid.NewGuid();
        _orgBId = Guid.NewGuid();
        var orgA = new Organization { Id = _orgAId, Name = "Org A" };
        var orgB = new Organization { Id = _orgBId, Name = "Org B" };

        _admin = new Account { Email = "admin@test.com", PasswordHash = "x", FirstName = "A", LastName = "Admin" };
        _manager = new Account { Email = "manager@test.com", PasswordHash = "x", FirstName = "M", LastName = "Manager" };

        _db.Organizations.AddRange(orgA, orgB);
        _db.Accounts.AddRange(_admin, _manager);
        _db.Memberships.AddRange(
            new Membership { AccountId = _admin.Id, OrganizationId = _orgAId, Role = MembershipRole.Admin, Status = MembershipStatus.Active },
            new Membership { AccountId = _manager.Id, OrganizationId = _orgAId, Role = MembershipRole.Manager, Status = MembershipStatus.Active });
        await _db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _connection.DisposeAsync();
    }

    /// <summary>TC-04-UNIT-01: Invite payload validation.</summary>
    [Fact]
    public async Task Invite_payload_validation_rejects_invalid_email()
    {
        var result = await _inviteService.InviteAsync(
            _admin.Id, _orgAId, new InviteMemberRequest("not-an-email", MembershipRole.User));

        Assert.False(result.Success);
        Assert.Equal("invalid email format", result.Error);
    }

    /// <summary>TC-04-INT-01: Invite creates pending record and dispatches email.</summary>
    [Fact]
    public async Task Invite_creates_pending_record_and_dispatches_email()
    {
        var result = await _inviteService.InviteAsync(
            _admin.Id, _orgAId, new InviteMemberRequest("new@acme.com", MembershipRole.User));

        Assert.True(result.Success);
        var invitation = await _db.Invitations.SingleAsync(i => i.Email == "new@acme.com");
        Assert.Equal(InvitationStatus.Pending, invitation.Status);
        Assert.Equal(MembershipRole.User, invitation.Role);
        Assert.True(invitation.ExpiresAt > _timeProvider.GetUtcNow());
        Assert.Contains(_emailSender.Messages, m => m.To == "new@acme.com" && m.Token == invitation.Token);
    }

    /// <summary>TC-04-INT-05: Manager cannot invite at admin role.</summary>
    [Fact]
    public async Task Manager_invite_is_coerced_to_user_role()
    {
        var result = await _inviteService.InviteAsync(
            _manager.Id, _orgAId, new InviteMemberRequest("new@acme.com", MembershipRole.Admin));

        Assert.True(result.Success);
        var invitation = await _db.Invitations.SingleAsync(i => i.Email == "new@acme.com");
        Assert.Equal(MembershipRole.User, invitation.Role);
    }

    /// <summary>Requirement 8: Pending re-invite supersedes old token.</summary>
    [Fact]
    public async Task Reinvite_supersedes_previous_pending_invitation()
    {
        var first = await _inviteService.InviteAsync(
            _admin.Id, _orgAId, new InviteMemberRequest("new@acme.com", MembershipRole.User));

        var second = await _inviteService.InviteAsync(
            _admin.Id, _orgAId, new InviteMemberRequest("new@acme.com", MembershipRole.Manager));

        Assert.True(second.Success);
        var oldInvitation = await _db.Invitations.SingleAsync(i => i.Token == first.Invitation!.Token);
        var liveInvitation = await _db.Invitations.SingleAsync(i => i.Token == second.Invitation!.Token);
        Assert.Equal(InvitationStatus.Superseded, oldInvitation.Status);
        Assert.Equal(InvitationStatus.Pending, liveInvitation.Status);
    }

    /// <summary>Requirement 9: Already active member of same organization is rejected.</summary>
    [Fact]
    public async Task Invite_existing_member_of_same_org_is_rejected()
    {
        var result = await _inviteService.InviteAsync(
            _admin.Id, _orgAId, new InviteMemberRequest("manager@test.com", MembershipRole.User));

        Assert.False(result.Success);
        Assert.Equal("already a member", result.Error);
    }

    /// <summary>TC-04-INT-02: Expired invite is rejected.</summary>
    [Fact]
    public async Task Accepting_expired_invitation_is_rejected()
    {
        var invitation = await SeedInvitation("late@acme.com", _orgAId, MembershipRole.User);
        _timeProvider.Advance(TimeSpan.FromDays(7) + TimeSpan.FromMinutes(1));

        var result = await _acceptService.AcceptAsync(new AcceptInvitationRequest(
            invitation.Token, "Late", "User", "Passw0rd"));

        Assert.False(result.Success);
        Assert.Equal("invitation expired", result.Error);
        Assert.False(await _db.Accounts.AnyAsync(a => a.Email == "late@acme.com"));
    }

    /// <summary>TC-04-INT-03: Used invite is rejected.</summary>
    [Fact]
    public async Task Accepting_used_invitation_is_rejected()
    {
        var invitation = await SeedInvitation("new@acme.com", _orgAId, MembershipRole.User);
        await _acceptService.AcceptAsync(new AcceptInvitationRequest(invitation.Token, "New", "Hire", "Passw0rd"));

        var secondUse = await _acceptService.AcceptAsync(new AcceptInvitationRequest(invitation.Token, "New", "Hire", "Passw0rd"));

        Assert.False(secondUse.Success);
        Assert.Equal("invitation no longer valid", secondUse.Error);
    }

    /// <summary>TC-04-INT-04: Accepting invite moves existing membership to inviting org.</summary>
    [Fact]
    public async Task Accepting_invite_moves_existing_member_to_new_org()
    {
        var existing = new Account { Email = "u@x.com", PasswordHash = "x", FirstName = "U", LastName = "Existing" };
        _db.Accounts.Add(existing);
        _db.Memberships.Add(new Membership
        {
            AccountId = existing.Id,
            OrganizationId = _orgAId,
            Role = MembershipRole.User,
            Status = MembershipStatus.Active
        });
        await _db.SaveChangesAsync();

        var invitation = await SeedInvitation("u@x.com", _orgBId, MembershipRole.Manager);

        var result = await _acceptService.AcceptAsync(new AcceptInvitationRequest(invitation.Token, null, null, null));

        Assert.True(result.Success);
        var memberships = await _db.Memberships.Where(m => m.AccountId == existing.Id).ToListAsync();
        Assert.Single(memberships);
        Assert.Equal(_orgBId, memberships[0].OrganizationId);
        Assert.Equal(MembershipRole.Manager, memberships[0].Role);
        Assert.Equal(InvitationStatus.Used, (await _db.Invitations.FindAsync(invitation.Id))!.Status);
    }

    private async Task<Invitation> SeedInvitation(string email, Guid organizationId, MembershipRole role)
    {
        var now = _timeProvider.GetUtcNow();
        var invitation = new Invitation
        {
            Email = email,
            Role = role,
            OrganizationId = organizationId,
            InvitedByAccountId = _admin.Id,
            Token = Guid.NewGuid().ToString("N"),
            IssuedAt = now,
            ExpiresAt = now + Invitation.Lifetime
        };

        _db.Invitations.Add(invitation);
        await _db.SaveChangesAsync();
        return invitation;
    }
}
