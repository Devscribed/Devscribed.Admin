using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class LoginService
{
    private readonly AppDbContext _db;
    private readonly IPasswordHasher _passwordHasher;

    public LoginService(AppDbContext db, IPasswordHasher passwordHasher)
    {
        _db = db;
        _passwordHasher = passwordHasher;
    }

    public async Task<LoginResult> LoginAsync(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password))
            return LoginResult.Failure("Email and password are required");

        var normalizedEmail = SignupValidator.NormalizeEmail(request.Email);

        var account = await _db.Accounts
            .Include(a => a.Membership)
            .SingleOrDefaultAsync(a => a.Email == normalizedEmail);

        if (account == null || account.Membership == null)
            return LoginResult.Failure("Invalid email or password");

        if (account.Membership.Status == "removed")
            return LoginResult.Failure("Your account has been deactivated, contact your administrator");

        if (!_passwordHasher.Verify(request.Password, account.PasswordHash))
            return LoginResult.Failure("Invalid email or password");

        return LoginResult.Success(account.Id, account.Membership.OrganizationId, account.Membership.Role, account.SecurityStamp);
    }
}

public class LoginResult
{
    public bool Succeeded { get; init; }
    public Guid AccountId { get; init; }
    public Guid OrganizationId { get; init; }
    public string Role { get; init; } = string.Empty;
    public Guid SecurityStamp { get; init; }
    public string? ErrorMessage { get; init; }

    public static LoginResult Success(Guid accountId, Guid organizationId, string role, Guid securityStamp) => new()
    {
        Succeeded = true,
        AccountId = accountId,
        OrganizationId = organizationId,
        Role = role,
        SecurityStamp = securityStamp,
    };

    public static LoginResult Failure(string message) => new()
    {
        Succeeded = false,
        ErrorMessage = message,
    };
}
