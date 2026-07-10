using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class SignupService
{
    private readonly AppDbContext _db;
    private readonly IPasswordHasher _passwordHasher;

    public SignupService(AppDbContext db, IPasswordHasher passwordHasher)
    {
        _db = db;
        _passwordHasher = passwordHasher;
    }

    public async Task<SignupResult> SignupAsync(SignupRequest request)
    {
        var errors = SignupValidator.ValidateAll(request);
        if (errors.Count > 0)
            return SignupResult.ValidationFailure(errors);

        var normalizedEmail = SignupValidator.NormalizeEmail(request.Email);

        var exists = await _db.Accounts.AnyAsync(a => a.Email == normalizedEmail);
        if (exists)
            return SignupResult.DuplicateEmail();

        var now = DateTime.UtcNow;
        var account = new Account
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            PasswordHash = _passwordHasher.Hash(request.Password),
            FirstName = request.FirstName.Trim(),
            LastName = request.LastName.Trim(),
            Timezone = request.Timezone,
            CreatedAt = now,
        };

        var organization = new Organization
        {
            Id = Guid.NewGuid(),
            Name = request.OrgName.Trim(),
            CreatedAt = now,
        };

        var membership = new Membership
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            OrganizationId = organization.Id,
            Role = "admin",
            Status = "active",
            JoinedAt = now,
        };

        _db.Accounts.Add(account);
        _db.Organizations.Add(organization);
        _db.Memberships.Add(membership);
        await _db.SaveChangesAsync();

        return SignupResult.Success(account.Id, membership.Id, organization.Id, account.SecurityStamp, account.Email);
    }
}

public class SignupResult
{
    public bool Succeeded { get; init; }
    public Guid? AccountId { get; init; }
    public Guid? MembershipId { get; init; }
    public Guid? OrganizationId { get; init; }
    public Guid SecurityStamp { get; init; }
    public string Email { get; init; } = string.Empty;
    public Dictionary<string, string>? Errors { get; init; }
    public string? ErrorMessage { get; init; }

    public static SignupResult Success(Guid accountId, Guid membershipId, Guid orgId, Guid securityStamp, string email) => new()
    {
        Succeeded = true,
        AccountId = accountId,
        MembershipId = membershipId,
        OrganizationId = orgId,
        SecurityStamp = securityStamp,
        Email = email,
    };

    public static SignupResult ValidationFailure(Dictionary<string, string> errors) => new()
    {
        Succeeded = false,
        Errors = errors,
    };

    public static SignupResult DuplicateEmail() => new()
    {
        Succeeded = false,
        ErrorMessage = "This email is already registered",
    };
}
