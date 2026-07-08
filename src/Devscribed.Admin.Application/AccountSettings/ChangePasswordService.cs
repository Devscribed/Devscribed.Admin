using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Application.Validation;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.AccountSettings;

public class ChangePasswordService(AdminDbContext db, IPasswordHasher passwordHasher)
{
    public async Task<ChangePasswordResult> ChangeAsync(
        Guid accountId,
        string currentPassword,
        string newPassword,
        string confirmPassword,
        CancellationToken ct = default)
    {
        if (newPassword != confirmPassword)
            return ChangePasswordResult.Failed("passwords do not match");

        var (policyValid, policyError) = PasswordPolicy.Validate(newPassword);
        if (!policyValid)
            return ChangePasswordResult.Failed(policyError!);

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == accountId, ct);
        if (account is null)
            return ChangePasswordResult.Failed("account not found");

        if (!passwordHasher.Verify(account.PasswordHash, currentPassword))
            return ChangePasswordResult.Failed("current password is incorrect");

        account.PasswordHash = passwordHasher.Hash(newPassword);
        await db.SaveChangesAsync(ct);

        return ChangePasswordResult.Ok();
    }
}
