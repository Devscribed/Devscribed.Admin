using System.Security.Cryptography;
using System.Text;
using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Domain.Services;
using Devscribed.Admin.Domain.Validation;
using Devscribed.Admin.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.ForgotPassword;

public static class ForgotPasswordEndpoint
{
    private const string NeutralMessage = "If an account exists, a reset link has been sent";
    private const int TokenExpiryMinutes = 60;

    public static IEndpointRouteBuilder MapForgotPasswordEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/forgot-password", HandleAsync);
        return app;
    }

    private static async Task<IResult> HandleAsync(
        ForgotPasswordRequest request, AppDbContext db, IEmailService emailService, HttpContext http)
    {
        var email = request.Email?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(email))
            return Results.BadRequest(new { message = "Email is required" });

        var normalizedEmail = EmailValidator.Normalize(email);

        // Always return neutral message regardless of what happens next
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Email == normalizedEmail);
        if (account is null)
            return Results.Ok(new { message = NeutralMessage });

        // Check if the member is active
        var hasActiveMembership = await db.Memberships
            .AnyAsync(m => m.AccountId == account.Id && m.Status == MembershipStatus.Active);

        if (!hasActiveMembership)
            return Results.Ok(new { message = NeutralMessage });

        // Invalidate any prior unused tokens for this account
        var priorTokens = await db.PasswordResetTokens
            .Where(t => t.AccountId == account.Id && !t.IsInvalidated && t.UsedAt == null)
            .ToListAsync();
        foreach (var priorToken in priorTokens)
            priorToken.IsInvalidated = true;

        // Generate new token
        var rawTokenBytes = RandomNumberGenerator.GetBytes(32);
        var rawToken = Convert.ToBase64String(rawTokenBytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

        var now = DateTime.UtcNow;
        var resetToken = new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            AccountId = account.Id,
            TokenHash = tokenHash,
            CreatedAt = now,
            ExpiresAt = now.AddMinutes(TokenExpiryMinutes),
            UsedAt = null,
            IsInvalidated = false,
        };
        db.PasswordResetTokens.Add(resetToken);
        await db.SaveChangesAsync();

        var resetUrl = $"/reset-password?token={rawToken}";
        await emailService.SendPasswordResetEmailAsync(normalizedEmail, rawToken, resetUrl);

        return Results.Ok(new { message = NeutralMessage });
    }
}
