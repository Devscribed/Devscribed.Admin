using Devscribed.Admin.Application.Validation;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.AccountSettings;

public class ChangeEmailService(AdminDbContext db, TimeProvider timeProvider)
{
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(24);

    public async Task<ChangeEmailResult> RequestChangeAsync(
        Guid accountId,
        string newEmail,
        CancellationToken ct = default)
    {
        if (!EmailValidator.IsSyntacticallyValid(newEmail))
            return ChangeEmailResult.Failed("invalid email format");

        var existing = await db.Accounts.AnyAsync(a => a.Email == newEmail, ct);
        if (existing)
            return ChangeEmailResult.Failed("email already in use");

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == accountId, ct);
        if (account is null)
            return ChangeEmailResult.Failed("account not found");

        var now = timeProvider.GetUtcNow();
        var token = new EmailChangeToken
        {
            AccountId = accountId,
            NewEmail = newEmail,
            Token = Guid.NewGuid().ToString("N"),
            CreatedAt = now,
            ExpiresAt = now.Add(TokenLifetime)
        };

        db.EmailChangeTokens.Add(token);
        await db.SaveChangesAsync(ct);

        return ChangeEmailResult.Ok();
    }

    public async Task<ChangeEmailResult> ConfirmChangeAsync(
        string token,
        CancellationToken ct = default)
    {
        var changeToken = await db.EmailChangeTokens
            .Include(t => t.Account)
            .FirstOrDefaultAsync(t => t.Token == token, ct);

        if (changeToken is null)
            return ChangeEmailResult.Failed("invalid token");

        var now = timeProvider.GetUtcNow();
        if (!changeToken.IsValid(now))
            return ChangeEmailResult.Failed("token expired or already used");

        var emailTaken = await db.Accounts.AnyAsync(a => a.Email == changeToken.NewEmail, ct);
        if (emailTaken)
            return ChangeEmailResult.Failed("email already in use");

        changeToken.Account!.Email = changeToken.NewEmail;
        changeToken.Used = true;
        await db.SaveChangesAsync(ct);

        return ChangeEmailResult.Ok();
    }
}
