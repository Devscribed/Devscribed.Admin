using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Application.Signup;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Devscribed.Admin.Tests;

public class SignupServiceTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private AdminDbContext _db = null!;
    private SignupService _service = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        var options = new DbContextOptionsBuilder<AdminDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new AdminDbContext(options);
        await _db.Database.EnsureCreatedAsync();

        _service = new SignupService(_db, new PasswordHasher());
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _connection.DisposeAsync();
    }

    private static SignupRequest ValidRequest(string email = "owner@acme.com", string orgName = "Acme Inc") =>
        new(orgName, "Pat", "Owner", email, "Passw0rd");

    /// <summary>TC-01-INT-01: Signup creates account + org + admin membership atomically.</summary>
    [Fact]
    public async Task Signup_creates_account_organization_and_admin_membership()
    {
        var result = await _service.SignUpAsync(ValidRequest());

        Assert.True(result.Success);

        var accounts = await _db.Accounts.ToListAsync();
        var organizations = await _db.Organizations.ToListAsync();
        var memberships = await _db.Memberships.ToListAsync();

        var account = Assert.Single(accounts);
        Assert.Equal("owner@acme.com", account.Email);

        var organization = Assert.Single(organizations);
        Assert.Equal("Acme Inc", organization.Name);

        var membership = Assert.Single(memberships);
        Assert.Equal(account.Id, membership.AccountId);
        Assert.Equal(organization.Id, membership.OrganizationId);
        Assert.Equal(MembershipRole.Admin, membership.Role);
        Assert.Equal(MembershipStatus.Active, membership.Status);
    }

    /// <summary>TC-01-INT-02: Duplicate email is rejected without partial writes.</summary>
    [Fact]
    public async Task Duplicate_email_is_rejected_without_partial_writes()
    {
        var first = await _service.SignUpAsync(ValidRequest());
        Assert.True(first.Success);

        var second = await _service.SignUpAsync(ValidRequest(orgName: "Other Org"));

        Assert.False(second.Success);
        Assert.True(second.FieldErrors.ContainsKey("email"));

        var organizations = await _db.Organizations.ToListAsync();
        var memberships = await _db.Memberships.ToListAsync();

        Assert.Single(organizations);
        Assert.Single(memberships);
    }

    [Fact]
    public async Task Weak_password_is_rejected()
    {
        var result = await _service.SignUpAsync(ValidRequest() with { Password = "short" });

        Assert.False(result.Success);
        Assert.True(result.FieldErrors.ContainsKey("password"));
    }

    [Fact]
    public async Task Invalid_org_name_is_rejected()
    {
        var result = await _service.SignUpAsync(ValidRequest() with { OrganizationName = "   " });

        Assert.False(result.Success);
        Assert.Equal("organization name is required", result.FieldErrors["orgName"]);
    }
}
