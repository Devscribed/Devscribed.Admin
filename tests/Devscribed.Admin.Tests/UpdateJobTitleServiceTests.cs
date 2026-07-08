using Devscribed.Admin.Application.Members;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Tests;

/// <summary>TC-06-UNIT-01: Job title validation (max length).</summary>
public class UpdateJobTitleServiceTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private AdminDbContext _db = null!;
    private UpdateJobTitleService _service = null!;

    private Guid _organizationId;
    private Account _adminAccount = null!;
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

        _organizationId = Guid.NewGuid();
        var org = new Organization { Id = _organizationId, Name = "Acme" };

        _adminAccount = new Account { Email = "admin@acme.com", PasswordHash = "x", FirstName = "Pat", LastName = "Admin" };
        var targetAccount = new Account { Email = "target@acme.com", PasswordHash = "x", FirstName = "Alex", LastName = "Target" };

        var adminMembership = new Membership
        {
            AccountId = _adminAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.Admin, Status = MembershipStatus.Active
        };
        _targetMembership = new Membership
        {
            AccountId = targetAccount.Id, OrganizationId = _organizationId,
            Role = MembershipRole.User, Status = MembershipStatus.Active
        };

        _db.Organizations.Add(org);
        _db.Accounts.AddRange(_adminAccount, targetAccount);
        _db.Memberships.AddRange(adminMembership, _targetMembership);
        await _db.SaveChangesAsync();

        _service = new UpdateJobTitleService(_db);
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task Accepts_100_character_job_title()
    {
        var title = new string('A', 100);
        var result = await _service.UpdateAsync(_adminAccount.Id, _organizationId, _targetMembership.Id, title);
        Assert.True(result.Success);
    }

    [Fact]
    public async Task Rejects_101_character_job_title()
    {
        var title = new string('A', 101);
        var result = await _service.UpdateAsync(_adminAccount.Id, _organizationId, _targetMembership.Id, title);
        Assert.False(result.Success);
        Assert.Equal("must be at most 100 characters", result.Error);
    }

    [Fact]
    public async Task Accepts_empty_job_title()
    {
        var result = await _service.UpdateAsync(_adminAccount.Id, _organizationId, _targetMembership.Id, null);
        Assert.True(result.Success);
    }
}
