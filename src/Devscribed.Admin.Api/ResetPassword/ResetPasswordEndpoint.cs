using System.Security.Cryptography;
using System.Text;
using Devscribed.Admin.Domain.Validation;
using Devscribed.Admin.Infrastructure.Data;
using Devscribed.Admin.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.ResetPassword;

public static class ResetPasswordEndpoint
{
    private const string InvalidTokenMessage = "This reset link is invalid or has expired";

    public static IEndpointRouteBuilder MapResetPasswordEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/reset-password", HandleAsync);
        return app;
    }

    private static async Task<IResult> HandleAsync(ResetPasswordRequest request, AppDbContext db)
    {
        var rawToken = request.Token?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(rawToken))
            return Results.BadRequest(new { message = InvalidTokenMessage });

        // Hash the presented token
        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

        var resetToken = await db.PasswordResetTokens
            .FirstOrDefaultAsync(t => t.TokenHash == tokenHash);

        if (resetToken is null)
            return Results.BadRequest(new { message = InvalidTokenMessage });

        var now = DateTime.UtcNow;
        if (!resetToken.IsValid(now))
            return Results.BadRequest(new { message = InvalidTokenMessage });

        // Validate password confirmation first (before password policy, as per spec)
        if (!PasswordConfirmationValidator.Validate(request.Password, request.PasswordConfirmation))
            return Results.BadRequest(new { message = PasswordConfirmationValidator.MismatchMessage });

        // Validate password policy
        var passwordResult = PasswordValidator.Validate(request.Password);
        if (!passwordResult.IsValid)
            return Results.BadRequest(new { message = passwordResult.ErrorMessage });

        // Update the account's password and regenerate SecurityStamp
        var account = await db.Accounts.FindAsync(resetToken.AccountId);
        if (account is null)
            return Results.BadRequest(new { message = InvalidTokenMessage });

        account.PasswordHash = PasswordHasher.Hash(passwordResult.NormalizedValue!);
        account.SecurityStamp = Guid.NewGuid().ToString();

        // Mark the token as used
        resetToken.UsedAt = now;

        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Your password has been reset" });
    }
}
