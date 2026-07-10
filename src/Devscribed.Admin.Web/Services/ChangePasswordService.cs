using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class ChangePasswordService
{
    private readonly AppDbContext _db;
    private readonly IPasswordHasher _passwordHasher;

    public ChangePasswordService(AppDbContext db, IPasswordHasher passwordHasher)
    {
        _db = db;
        _passwordHasher = passwordHasher;
    }

    public async Task<ChangePasswordServiceResult> ChangeAsync(Guid accountId, ChangePasswordRequest request)
    {
        var fieldError = ChangePasswordValidator.ValidateFields(request);
        if (fieldError != null)
            return ChangePasswordServiceResult.Failure(fieldError);

        var account = await _db.Accounts.SingleOrDefaultAsync(a => a.Id == accountId);
        if (account == null)
            return ChangePasswordServiceResult.Failure("Account not found");

        if (!_passwordHasher.Verify(request.CurrentPassword!, account.PasswordHash))
            return ChangePasswordServiceResult.Failure("Current password is incorrect");

        account.PasswordHash = _passwordHasher.Hash(request.NewPassword!);
        account.SecurityStamp = Guid.NewGuid();

        await _db.SaveChangesAsync();

        return ChangePasswordServiceResult.Success(account.SecurityStamp);
    }
}

public class ChangePasswordServiceResult
{
    public bool Succeeded { get; init; }
    public string? ErrorMessage { get; init; }
    public Guid NewSecurityStamp { get; init; }

    public static ChangePasswordServiceResult Success(Guid newSecurityStamp) => new() { Succeeded = true, NewSecurityStamp = newSecurityStamp };
    public static ChangePasswordServiceResult Failure(string message) => new() { Succeeded = false, ErrorMessage = message };
}
