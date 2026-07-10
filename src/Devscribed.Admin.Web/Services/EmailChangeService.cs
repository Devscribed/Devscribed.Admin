using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class EmailChangeService
{
    private readonly AppDbContext _db;
    private readonly ITokenGenerator _tokenGenerator;
    private readonly IEmailSender _emailSender;

    public EmailChangeService(AppDbContext db, ITokenGenerator tokenGenerator, IEmailSender emailSender)
    {
        _db = db;
        _tokenGenerator = tokenGenerator;
        _emailSender = emailSender;
    }

    public async Task<ChangeEmailResult> RequestChangeAsync(Guid accountId, string? newEmailRaw, string appBaseUrl)
    {
        var emailError = SignupValidator.ValidateEmail(newEmailRaw);
        if (emailError != null)
            return ChangeEmailResult.Failure(emailError);

        var normalized = SignupValidator.NormalizeEmail(newEmailRaw!);

        var account = await _db.Accounts.SingleOrDefaultAsync(a => a.Id == accountId);
        if (account == null)
            return ChangeEmailResult.Failure("Account not found");

        if (string.Equals(account.Email, normalized, StringComparison.OrdinalIgnoreCase))
            return ChangeEmailResult.Failure("This is already your email address");

        var inUse = await _db.Accounts.AnyAsync(a => a.Id != accountId && a.Email == normalized);
        if (inUse)
            return ChangeEmailResult.Failure("This email is already in use");

        var now = DateTime.UtcNow;

        var priorPending = await _db.PendingEmailChanges
            .Where(p => p.AccountId == accountId && !p.IsInvalidated && p.UsedAt == null)
            .ToListAsync();
        foreach (var prior in priorPending)
            prior.IsInvalidated = true;

        var rawToken = _tokenGenerator.GenerateToken();
        var pending = new PendingEmailChange
        {
            Id = Guid.NewGuid(),
            AccountId = accountId,
            NewEmail = normalized,
            TokenHash = _tokenGenerator.Hash(rawToken),
            CreatedAt = now,
            ExpiresAt = now.AddHours(24),
        };
        _db.PendingEmailChanges.Add(pending);
        await _db.SaveChangesAsync();

        var confirmLink = $"{appBaseUrl}/account/confirm-email?token={rawToken}";
        try
        {
            await _emailSender.SendAsync(
                normalized,
                "Confirm your new email address",
                $"Click the link below to confirm your new email address:\n{confirmLink}\nThis link expires in 24 hours.");

            await _emailSender.SendAsync(
                account.Email,
                "Email change requested",
                "An email change was requested for your account. If this wasn't you, please contact support.");
        }
        catch
        {
            // Email dispatch failures must not change the API response.
        }

        return ChangeEmailResult.Success();
    }

    public async Task<ConfirmEmailResult> ConfirmAsync(string? rawToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
            return ConfirmEmailResult.Failure("This confirmation link is no longer valid");

        var tokenHash = _tokenGenerator.Hash(rawToken);
        var pending = await _db.PendingEmailChanges
            .Include(p => p.Account)
            .SingleOrDefaultAsync(p => p.TokenHash == tokenHash);

        if (pending == null || pending.IsInvalidated || pending.UsedAt != null)
            return ConfirmEmailResult.Failure("This confirmation link is no longer valid");

        var now = DateTime.UtcNow;
        if (now >= pending.ExpiresAt)
            return ConfirmEmailResult.Failure("This confirmation link has expired");

        var inUse = await _db.Accounts.AnyAsync(a => a.Id != pending.AccountId && a.Email == pending.NewEmail);
        if (inUse)
            return ConfirmEmailResult.Failure("This email is already in use");

        pending.UsedAt = now;
        pending.Account.Email = pending.NewEmail;

        await _db.SaveChangesAsync();

        return ConfirmEmailResult.Success();
    }
}

public class ChangeEmailResult
{
    public bool Succeeded { get; init; }
    public string? ErrorMessage { get; init; }

    public static ChangeEmailResult Success() => new() { Succeeded = true };
    public static ChangeEmailResult Failure(string message) => new() { Succeeded = false, ErrorMessage = message };
}

public class ConfirmEmailResult
{
    public bool Succeeded { get; init; }
    public string? ErrorMessage { get; init; }

    public static ConfirmEmailResult Success() => new() { Succeeded = true };
    public static ConfirmEmailResult Failure(string message) => new() { Succeeded = false, ErrorMessage = message };
}
