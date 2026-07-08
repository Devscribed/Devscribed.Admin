using Devscribed.Admin.Application.Auth;
using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Time.Testing;

namespace Devscribed.Admin.Tests;

/// <summary>TC-02-INT-05: Forgot-password issues a single-use token and is enumeration-safe.</summary>
public class ForgotResetPasswordTests : IAsyncLifetime
{
    private SqliteConnection _connection = null!;
    private AdminDbContext _db = null!;
    private ForgotPasswordService _forgotService = null!;
    private ResetPasswordService _resetService = null!;
    private IPasswordHasher _hasher = null!;
    private FakeTimeProvider _timeProvider = null!;

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
        _timeProvider = new FakeTimeProvider(DateTimeOffset.UtcNow);
        _forgotService = new ForgotPasswordService(_db);
        _resetService = new ResetPasswordService(_db, _hasher, _timeProvider);
    }

    public async Task DisposeAsync()
    {
        await _db.DisposeAsync();
        await _connection.DisposeAsync();
    }

    private async Task<Account> SeedAccount(string email, string password)
    {
        var account = new Account
        {
            Email = email,
            PasswordHash = _hasher.Hash(password),
            FirstName = "Pat",
            LastName = "Test"
        };
        var org = new Organization { Name = "Acme" };
        var membership = Membership.CreateAdmin(account.Id, org.Id);

        _db.Accounts.Add(account);
        _db.Organizations.Add(org);
        _db.Memberships.Add(membership);
        await _db.SaveChangesAsync();
        return account;
    }

    [Fact]
    public async Task Forgot_password_for_existing_email_returns_token()
    {
        await SeedAccount("pat@acme.com", "Passw0rd");

        var token = await _forgotService.RequestResetAsync("pat@acme.com");

        Assert.NotNull(token);
    }

    [Fact]
    public async Task Forgot_password_for_unknown_email_returns_null()
    {
        var token = await _forgotService.RequestResetAsync("ghost@acme.com");

        Assert.Null(token);
    }

    [Fact]
    public async Task Reset_with_valid_token_succeeds()
    {
        await SeedAccount("pat@acme.com", "Passw0rd");
        var token = await _forgotService.RequestResetAsync("pat@acme.com");

        var result = await _resetService.ResetAsync(token!, "NewPass1");

        Assert.True(result.Success);
    }

    [Fact]
    public async Task Token_is_single_use()
    {
        await SeedAccount("pat@acme.com", "Passw0rd");
        var token = await _forgotService.RequestResetAsync("pat@acme.com");

        await _resetService.ResetAsync(token!, "NewPass1");
        var secondUse = await _resetService.ResetAsync(token!, "Another1");

        Assert.False(secondUse.Success);
        Assert.Equal("invalid or expired reset link", secondUse.Error);
    }

    [Fact]
    public async Task Expired_token_is_rejected()
    {
        await SeedAccount("pat@acme.com", "Passw0rd");
        var token = await _forgotService.RequestResetAsync("pat@acme.com");

        _timeProvider.Advance(TimeSpan.FromMinutes(61));

        var result = await _resetService.ResetAsync(token!, "NewPass1");

        Assert.False(result.Success);
        Assert.Equal("invalid or expired reset link", result.Error);
    }

    [Fact]
    public async Task Reset_changes_password()
    {
        await SeedAccount("pat@acme.com", "Passw0rd");
        var token = await _forgotService.RequestResetAsync("pat@acme.com");

        await _resetService.ResetAsync(token!, "NewPass1");

        var account = await _db.Accounts.FirstAsync(a => a.Email == "pat@acme.com");
        Assert.True(_hasher.Verify(account.PasswordHash, "NewPass1"));
        Assert.False(_hasher.Verify(account.PasswordHash, "Passw0rd"));
    }

    [Fact]
    public async Task Reset_with_weak_password_is_rejected()
    {
        await SeedAccount("pat@acme.com", "Passw0rd");
        var token = await _forgotService.RequestResetAsync("pat@acme.com");

        var result = await _resetService.ResetAsync(token!, "weak");

        Assert.False(result.Success);
    }
}
