using System.Security.Cryptography;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.Auth;

public class ForgotPasswordService(AdminDbContext db)
{
    public async Task<string?> RequestResetAsync(string email, CancellationToken ct = default)
    {
        var normalizedEmail = (email ?? string.Empty).Trim();

        var account = await db.Accounts
            .FirstOrDefaultAsync(a => a.Email == normalizedEmail, ct);

        if (account is null)
        {
            return null;
        }

        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));

        var resetToken = new PasswordResetToken
        {
            AccountId = account.Id,
            Token = token
        };

        db.PasswordResetTokens.Add(resetToken);
        await db.SaveChangesAsync(ct);

        return token;
    }
}
