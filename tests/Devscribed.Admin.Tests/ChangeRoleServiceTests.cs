using Devscribed.Admin.Application.Members;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Tests;

public class ChangeRoleServiceTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private AdminDbContext _db = null!;
    private ChangeRoleService _service = null!;

    private Guid _orgId;
    private Membership _adminMembership = null!;
    private Membership _managerMembership = null!;
    private Membership _userMembership = null!;
    private Membership _targetMembership = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        var options = new DbContextOptionsBuilder<AdminDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new AdminDbContext(options);
        await _db.Database.EnsureCreatedAsync();

        _service = new ChangeRoleService(_db);

        _orgId = Guid.NewGuid();
        _db.Organizations.Add(new Organization { Id = _orgId, Name = "Test Org" });

        var adminAccount = new Account { Email = "admin@test.com", PasswordHash = "x", FirstName = "A", LastName = "Admin" };
        var managerAccount = new Account { Email = "manager@test.com", PasswordHash = "x", FirstName = "M", LastName = "Manager" };
        var userAccount = new Account { Email = "user@test.com", PasswordHash = "x", FirstName = "U", LastName = "User" };
        var targetAccount = new Account { Email = "target@test.com", PasswordHash = "x", FirstName = "T", LastName = "Target" };

        _db.Accounts.AddRange(adminAccount, managerAccount, userAccount, targetAccount);

        _adminMembership = new Membership
        {
            AccountId = adminAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.Admin, Status = MembershipStatus.Active
        };
        _managerMembership = new Membership
        {
            AccountId = managerAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.Manager, Status = MembershipStatus.Active
        };
        _userMembership = new Membership
        {
            AccountId = userAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };
        _targetMembership = new Membership
        {
            AccountId = targetAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };

        _db.Memberships.AddRange(_adminMembership, _managerMembership, _userMembership, _targetMembership);
        await _db.SaveChangesAsync();
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _connection.DisposeAsync();
    }

    /// <summary>TC-03-INT-01 step 1: Manager cannot change roles.</summary>
    [Fact]
    public async Task Manager_cannot_change_roles()
    {
        var result = await _service.ChangeRoleAsync(
            _managerMembership.AccountId, _orgId,
            new ChangeRoleRequest(_targetMembership.Id, MembershipRole.Manager));

        Assert.False(result.Success);
        Assert.Equal("forbidden", result.Error);

        var target = await _db.Memberships.FindAsync(_targetMembership.Id);
        Assert.Equal(MembershipRole.User, target!.Role);
    }

    /// <summary>TC-03-INT-01 step 2: User cannot change roles.</summary>
    [Fact]
    public async Task User_cannot_change_roles()
    {
        var result = await _service.ChangeRoleAsync(
            _userMembership.AccountId, _orgId,
            new ChangeRoleRequest(_targetMembership.Id, MembershipRole.Manager));

        Assert.False(result.Success);
        Assert.Equal("forbidden", result.Error);
    }

    /// <summary>TC-03-INT-01 step 3: Admin can change roles.</summary>
    [Fact]
    public async Task Admin_can_change_roles()
    {
        var result = await _service.ChangeRoleAsync(
            _adminMembership.AccountId, _orgId,
            new ChangeRoleRequest(_targetMembership.Id, MembershipRole.Manager));

        Assert.True(result.Success);

        var target = await _db.Memberships.FindAsync(_targetMembership.Id);
        Assert.Equal(MembershipRole.Manager, target!.Role);
    }

    /// <summary>TC-03-INT-02: Last admin cannot demote themselves.</summary>
    [Fact]
    public async Task Last_admin_cannot_demote_themselves()
    {
        var result = await _service.ChangeRoleAsync(
            _adminMembership.AccountId, _orgId,
            new ChangeRoleRequest(_adminMembership.Id, MembershipRole.Manager));

        Assert.False(result.Success);
        Assert.Equal("organization must retain at least one admin", result.Error);

        var admin = await _db.Memberships.FindAsync(_adminMembership.Id);
        Assert.Equal(MembershipRole.Admin, admin!.Role);
    }

    /// <summary>TC-03-INT-03: Demoting a non-last admin is allowed.</summary>
    [Fact]
    public async Task Demoting_non_last_admin_is_allowed()
    {
        var secondAdminAccount = new Account { Email = "admin2@test.com", PasswordHash = "x", FirstName = "A2", LastName = "Admin" };
        _db.Accounts.Add(secondAdminAccount);
        var secondAdmin = new Membership
        {
            AccountId = secondAdminAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.Admin, Status = MembershipStatus.Active
        };
        _db.Memberships.Add(secondAdmin);
        await _db.SaveChangesAsync();

        var result = await _service.ChangeRoleAsync(
            _adminMembership.AccountId, _orgId,
            new ChangeRoleRequest(secondAdmin.Id, MembershipRole.Manager));

        Assert.True(result.Success);

        var demoted = await _db.Memberships.FindAsync(secondAdmin.Id);
        Assert.Equal(MembershipRole.Manager, demoted!.Role);

        var remaining = await _db.Memberships.FindAsync(_adminMembership.Id);
        Assert.Equal(MembershipRole.Admin, remaining!.Role);
    }

    [Fact]
    public async Task Viewer_cannot_change_roles()
    {
        var viewerAccount = new Account { Email = "viewer@test.com", PasswordHash = "x", FirstName = "V", LastName = "Viewer" };
        _db.Accounts.Add(viewerAccount);
        var viewerMembership = new Membership
        {
            AccountId = viewerAccount.Id, OrganizationId = _orgId,
            Role = MembershipRole.Viewer, Status = MembershipStatus.Active
        };
        _db.Memberships.Add(viewerMembership);
        await _db.SaveChangesAsync();

        var result = await _service.ChangeRoleAsync(
            viewerAccount.Id, _orgId,
            new ChangeRoleRequest(_targetMembership.Id, MembershipRole.Manager));

        Assert.False(result.Success);
        Assert.Equal("forbidden", result.Error);
    }
}
