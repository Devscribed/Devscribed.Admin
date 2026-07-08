using Devscribed.Admin.Application.Auth;
using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Tests;

public class LoginServiceTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private AdminDbContext _db = null!;
    private LoginService _service = null!;
    private IPasswordHasher _hasher = null!;

    public async Task InitializeAsync()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        await _connection.OpenAsync();

        var options = new DbContextOptionsBuilder<AdminDbContext>()
            .UseSqlite(_connection)
            .Options;

        _db = new AdminDbContext(options);
        await _db.Database.EnsureCreatedAsync();

        _hasher = new PasswordHasher();
        _service = new LoginService(_db, _hasher);
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _connection.DisposeAsync();
    }

    private async Task SeedAccount(string email, string password, MembershipStatus status = MembershipStatus.Active)
    {
        var account = new Account
        {
            Email = email,
            PasswordHash = _hasher.Hash(password),
            FirstName = "Pat",
            LastName = "Test"
        };
        var org = new Organization { Name = "Acme" };
        var membership = new Membership
        {
            AccountId = account.Id,
            OrganizationId = org.Id,
            Role = MembershipRole.Admin,
            Status = status
        };

        _db.Accounts.Add(account);
        _db.Organizations.Add(org);
        _db.Memberships.Add(membership);
        await _db.SaveChangesAsync();
    }

    /// <summary>TC-02-INT-01: Successful login.</summary>
    [Fact]
    public async Task Successful_login_returns_session_data()
    {
        await SeedAccount("pat@acme.com", "Passw0rd");

        var result = await _service.LoginAsync(new LoginRequest("pat@acme.com", "Passw0rd"));

        Assert.True(result.Success);
        Assert.NotNull(result.Account);
        Assert.NotNull(result.Organization);
        Assert.NotNull(result.Membership);
        Assert.Equal("pat@acme.com", result.Account!.Email);
    }

    /// <summary>TC-02-INT-02: Wrong password rejected.</summary>
    [Fact]
    public async Task Wrong_password_is_rejected_with_generic_message()
    {
        await SeedAccount("pat@acme.com", "Passw0rd");

        var result = await _service.LoginAsync(new LoginRequest("pat@acme.com", "nope"));

        Assert.False(result.Success);
        Assert.Equal("invalid email or password", result.Error);
    }

    /// <summary>TC-02-INT-03: Unknown email rejected with identical message.</summary>
    [Fact]
    public async Task Unknown_email_is_rejected_with_same_generic_message()
    {
        var result = await _service.LoginAsync(new LoginRequest("ghost@acme.com", "anything"));

        Assert.False(result.Success);
        Assert.Equal("invalid email or password", result.Error);
    }

    /// <summary>TC-02-INT-04: Removed member cannot log in.</summary>
    [Fact]
    public async Task Removed_member_cannot_log_in()
    {
        await SeedAccount("ex@acme.com", "Passw0rd", MembershipStatus.Removed);

        var result = await _service.LoginAsync(new LoginRequest("ex@acme.com", "Passw0rd"));

        Assert.False(result.Success);
    }
}
