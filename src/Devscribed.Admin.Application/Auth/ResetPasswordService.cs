using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Application.Validation;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.Auth;

public class ResetPasswordService(AdminDbContext db, IPasswordHasher passwordHasher, TimeProvider timeProvider)
{
    public async Task<ResetPasswordResult> ResetAsync(string token, string newPassword, CancellationToken ct = default)
    {
        var resetToken = await db.PasswordResetTokens
            .Include(t => t.Account)
            .FirstOrDefaultAsync(t => t.Token == token, ct);

        if (resetToken is null)
        {
            return ResetPasswordResult.Failed("invalid or expired reset link");
        }

        var now = timeProvider.GetUtcNow();

        if (!resetToken.IsValid(now))
        {
            return ResetPasswordResult.Failed("invalid or expired reset link");
        }

        var (passwordValid, passwordError) = PasswordPolicy.Validate(newPassword);
        if (!passwordValid)
        {
            return ResetPasswordResult.Failed(passwordError!);
        }

        resetToken.Used = true;
        resetToken.Account!.PasswordHash = passwordHasher.Hash(newPassword);

        await db.SaveChangesAsync(ct);

        return ResetPasswordResult.Ok();
    }
}
