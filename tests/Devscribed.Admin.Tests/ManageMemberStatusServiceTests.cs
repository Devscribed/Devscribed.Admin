using Devscribed.Admin.Application.Members;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Tests;

public class ManageMemberStatusServiceTests : IDisposable
{
    private readonly AdminDbContext _db;
    private readonly SqliteConnection _connection;
    private readonly Guid _organizationId = Guid.NewGuid();
    private readonly Account _adminAccount;
    private readonly Account _managerAccount;
    private readonly Account _userAccount;
    private readonly Account _targetAccount;
    private readonly Membership _adminMembership;
    private readonly Membership _managerMembership;
    private readonly Membership _userMembership;
    private readonly Membership _targetMembership;

    public ManageMemberStatusServiceTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        var options = new DbContextOptionsBuilder<AdminDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new AdminDbContext(options);
        _db.Database.EnsureCreated();

        _adminAccount = new Account { Email = "admin@test.com", PasswordHash = "x", FirstName = "Admin", LastName = "One" };
        _managerAccount = new Account { Email = "manager@test.com", PasswordHash = "x", FirstName = "Manager", LastName = "One" };
        _userAccount = new Account { Email = "user@test.com", PasswordHash = "x", FirstName = "User", LastName = "One" };
        _targetAccount = new Account { Email = "alex@test.com", PasswordHash = "x", FirstName = "Alex", LastName = "Kaminski" };

        _adminMembership = new Membership
        {
            AccountId = _adminAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Admin, Status = MembershipStatus.Active
        };
        _managerMembership = new Membership
        {
            AccountId = _managerAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Manager, Status = MembershipStatus.Active
        };
        _userMembership = new Membership
        {
            AccountId = _userAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };
        _targetMembership = new Membership
        {
            AccountId = _targetAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };

        _db.Organizations.Add(new Organization { Id = _organizationId, Name = "Test Org" });
        _db.Accounts.AddRange(_adminAccount, _managerAccount, _userAccount, _targetAccount);
        _db.Memberships.AddRange(_adminMembership, _managerMembership, _userMembership, _targetMembership);
        _db.SaveChanges();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    /// <summary>TC-05-INT-02: Delete is a soft-delete.</summary>
    [Fact]
    public async Task Admin_can_soft_delete_member()
    {
        var service = new ManageMemberStatusService(_db);

        var result = await service.RemoveAsync(_adminAccount.Id, _organizationId, _targetMembership.Id);

        Assert.True(result.Success);
        var target = await _db.Memberships.FindAsync(_targetMembership.Id);
        Assert.Equal(MembershipStatus.Removed, target!.Status);
    }

    /// <summary>TC-05-INT-03: Restore returns a member to active without changing role.</summary>
    [Fact]
    public async Task Admin_can_restore_removed_member()
    {
        _targetMembership.Status = MembershipStatus.Removed;
        _targetMembership.Role = MembershipRole.User;
        await _db.SaveChangesAsync();
        var service = new ManageMemberStatusService(_db);

        var result = await service.RestoreAsync(_adminAccount.Id, _organizationId, _targetMembership.Id);

        Assert.True(result.Success);
        var target = await _db.Memberships.FindAsync(_targetMembership.Id);
        Assert.Equal(MembershipStatus.Active, target!.Status);
        Assert.Equal(MembershipRole.User, target.Role);
    }

    /// <summary>TC-05-INT-04: Delete blocked when it would remove the last admin.</summary>
    [Fact]
    public async Task Removing_last_admin_is_rejected()
    {
        var service = new ManageMemberStatusService(_db);

        var result = await service.RemoveAsync(_adminAccount.Id, _organizationId, _adminMembership.Id);

        Assert.False(result.Success);
        Assert.Equal("organization must retain at least one admin", result.Error);
        var admin = await _db.Memberships.FindAsync(_adminMembership.Id);
        Assert.Equal(MembershipStatus.Active, admin!.Status);
    }

    /// <summary>TC-05-INT-05: User cannot delete or restore.</summary>
    [Fact]
    public async Task User_cannot_delete_or_restore()
    {
        _targetMembership.Status = MembershipStatus.Removed;
        await _db.SaveChangesAsync();
        var service = new ManageMemberStatusService(_db);

        var deleteResult = await service.RemoveAsync(_userAccount.Id, _organizationId, _adminMembership.Id);
        var restoreResult = await service.RestoreAsync(_userAccount.Id, _organizationId, _targetMembership.Id);

        Assert.Equal("forbidden", deleteResult.Error);
        Assert.Equal("forbidden", restoreResult.Error);
    }
}
