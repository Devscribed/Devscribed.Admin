using Devscribed.Admin.Web.Data;
using Devscribed.Admin.Web.Models;
using Devscribed.Admin.Web.Validation;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Services;

public class PasswordResetService
{
    private readonly AppDbContext _db;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ITokenGenerator _tokenGenerator;
    private readonly IEmailSender _emailSender;

    public PasswordResetService(
        AppDbContext db,
        IPasswordHasher passwordHasher,
        ITokenGenerator tokenGenerator,
        IEmailSender emailSender)
    {
        _db = db;
        _passwordHasher = passwordHasher;
        _tokenGenerator = tokenGenerator;
        _emailSender = emailSender;
    }

    public async Task<ForgotPasswordResult> RequestResetAsync(string? email, string resetUrlBase)
    {
        if (string.IsNullOrWhiteSpace(email))
            return ForgotPasswordResult.Failure("Email is required");

        var normalizedEmail = SignupValidator.NormalizeEmail(email);

        var account = await _db.Accounts
            .Include(a => a.Membership)
            .SingleOrDefaultAsync(a => a.Email == normalizedEmail);

        if (account != null && account.Membership?.Status == "active")
        {
            var now = DateTime.UtcNow;

            var priorTokens = await _db.PasswordResetTokens
                .Where(t => t.AccountId == account.Id && !t.IsInvalidated && t.UsedAt == null)
                .ToListAsync();
            foreach (var prior in priorTokens)
                prior.IsInvalidated = true;

            var rawToken = _tokenGenerator.GenerateToken();
            var resetToken = new PasswordResetToken
            {
                Id = Guid.NewGuid(),
                AccountId = account.Id,
                TokenHash = _tokenGenerator.Hash(rawToken),
                CreatedAt = now,
                ExpiresAt = now.AddMinutes(60),
            };
            _db.PasswordResetTokens.Add(resetToken);
            await _db.SaveChangesAsync();

            var resetLink = $"{resetUrlBase}/reset-password?token={rawToken}";
            try
            {
                await _emailSender.SendAsync(
                    account.Email,
                    "Reset your password",
                    $"Click the link below to reset your password:\n{resetLink}\nThis link expires in 60 minutes.");
            }
            catch
            {
                // Email dispatch failures must not change the API response.
            }
        }

        return ForgotPasswordResult.Success();
    }

    public async Task<bool> IsTokenValidAsync(string? rawToken)
    {
        if (string.IsNullOrWhiteSpace(rawToken))
            return false;

        var tokenHash = _tokenGenerator.Hash(rawToken);
        var token = await _db.PasswordResetTokens.SingleOrDefaultAsync(t => t.TokenHash == tokenHash);

        return token != null && token.IsValidAt(DateTime.UtcNow);
    }

    public async Task<ResetPasswordResult> ResetPasswordAsync(ResetPasswordRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Token))
            return ResetPasswordResult.Failure("This reset link is invalid or has expired");

        var tokenHash = _tokenGenerator.Hash(request.Token);
        var token = await _db.PasswordResetTokens
            .Include(t => t.Account)
            .SingleOrDefaultAsync(t => t.TokenHash == tokenHash);

        if (token == null || !token.IsValidAt(DateTime.UtcNow))
            return ResetPasswordResult.Failure("This reset link is invalid or has expired");

        var confirmationError = AuthValidator.ValidatePasswordConfirmation(request.Password, request.PasswordConfirmation);
        if (confirmationError != null)
            return ResetPasswordResult.Failure(confirmationError);

        var passwordError = SignupValidator.ValidatePassword(request.Password);
        if (passwordError != null)
            return ResetPasswordResult.Failure(passwordError);

        token.UsedAt = DateTime.UtcNow;
        token.Account.PasswordHash = _passwordHasher.Hash(request.Password);
        token.Account.SecurityStamp = Guid.NewGuid();

        await _db.SaveChangesAsync();

        return ResetPasswordResult.Success();
    }
}

public class ForgotPasswordResult
{
    public bool Succeeded { get; init; }
    public string? ErrorMessage { get; init; }

    public static ForgotPasswordResult Success() => new() { Succeeded = true };
    public static ForgotPasswordResult Failure(string message) => new() { Succeeded = false, ErrorMessage = message };
}

public class ResetPasswordResult
{
    public bool Succeeded { get; init; }
    public string? ErrorMessage { get; init; }

    public static ResetPasswordResult Success() => new() { Succeeded = true };
    public static ResetPasswordResult Failure(string message) => new() { Succeeded = false, ErrorMessage = message };
}
