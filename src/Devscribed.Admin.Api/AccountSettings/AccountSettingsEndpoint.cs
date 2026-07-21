using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Devscribed.Admin.Domain.Services;
using Devscribed.Admin.Domain.Validation;
using Devscribed.Admin.Infrastructure.Data;
using Devscribed.Admin.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.AccountSettings;

public static class AccountSettingsEndpoint
{
    private const int EmailChangeTokenExpiryHours = 24;

    public static IEndpointRouteBuilder MapAccountSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/account/settings", GetSettingsAsync).RequireAuthorization();
        app.MapPut("/api/account/settings", UpdateSettingsAsync).RequireAuthorization();
        app.MapPost("/api/account/change-email", ChangeEmailAsync).RequireAuthorization();
        app.MapPost("/api/account/confirm-email", ConfirmEmailAsync);
        app.MapPost("/api/account/change-password", ChangePasswordAsync).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> GetSettingsAsync(AppDbContext db, HttpContext http)
    {
        var accountIdClaim = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (accountIdClaim is null || !Guid.TryParse(accountIdClaim, out var accountId))
            return Results.Unauthorized();

        var account = await db.Accounts.FindAsync(accountId);
        if (account is null)
            return Results.Unauthorized();

        return Results.Ok(new
        {
            email = account.Email,
            firstName = account.FirstName,
            lastName = account.LastName,
            phoneCountryCode = account.PhoneCountryCode,
            phoneNumber = account.PhoneNumber,
            timezone = account.Timezone,
            firstDayOfWeek = account.FirstDayOfWeek,
        });
    }

    private static async Task<IResult> UpdateSettingsAsync(
        UpdateSettingsRequest request, AppDbContext db, HttpContext http)
    {
        var accountIdClaim = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (accountIdClaim is null || !Guid.TryParse(accountIdClaim, out var accountId))
            return Results.Unauthorized();

        var account = await db.Accounts.FindAsync(accountId);
        if (account is null)
            return Results.Unauthorized();

        var errors = new Dictionary<string, string>();

        // Validate first name
        var firstNameResult = PersonNameValidator.Validate(request.FirstName, "First name");
        if (!firstNameResult.IsValid)
            errors["firstName"] = firstNameResult.ErrorMessage!;

        // Validate last name
        var lastNameResult = PersonNameValidator.Validate(request.LastName, "Last name");
        if (!lastNameResult.IsValid)
            errors["lastName"] = lastNameResult.ErrorMessage!;

        // Validate phone
        var phoneErrors = PhoneValidator.Validate(request.PhoneCountryCode, request.PhoneNumber);
        foreach (var phoneError in phoneErrors)
            errors[phoneError.Key] = phoneError.Value;

        // Validate timezone
        var timezoneResult = TimezoneValidator.Validate(request.Timezone);
        if (!timezoneResult.IsValid)
            errors["timezone"] = timezoneResult.ErrorMessage!;

        // Validate first day of week
        var firstDayResult = FirstDayOfWeekValidator.Validate(request.FirstDayOfWeek);
        if (!firstDayResult.IsValid)
            errors["firstDayOfWeek"] = firstDayResult.ErrorMessage!;

        if (errors.Count > 0)
            return Results.BadRequest(new { errors });

        account.FirstName = firstNameResult.NormalizedValue!;
        account.LastName = lastNameResult.NormalizedValue!;
        account.PhoneCountryCode = string.IsNullOrWhiteSpace(request.PhoneCountryCode) ? null : request.PhoneCountryCode.Trim();
        account.PhoneNumber = string.IsNullOrWhiteSpace(request.PhoneNumber) ? null : request.PhoneNumber.Trim();
        account.Timezone = timezoneResult.NormalizedValue!;
        account.FirstDayOfWeek = firstDayResult.NormalizedValue!;

        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Settings saved" });
    }

    private static async Task<IResult> ChangeEmailAsync(
        ChangeEmailRequest request, AppDbContext db, IAccountEmailService accountEmailService, HttpContext http)
    {
        var accountIdClaim = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (accountIdClaim is null || !Guid.TryParse(accountIdClaim, out var accountId))
            return Results.Unauthorized();

        var account = await db.Accounts.FindAsync(accountId);
        if (account is null)
            return Results.Unauthorized();

        // Validate email
        var emailResult = EmailValidator.Validate(request.NewEmail);
        if (!emailResult.IsValid)
            return Results.BadRequest(new { message = emailResult.ErrorMessage });

        var normalizedNewEmail = emailResult.NormalizedValue!;

        // Check if same as current
        if (normalizedNewEmail == account.Email)
            return Results.BadRequest(new { message = "This is already your email address" });

        // Check if already in use
        var emailInUse = await db.Accounts.AnyAsync(a => a.Email == normalizedNewEmail);
        if (emailInUse)
            return Results.BadRequest(new { message = "This email is already in use" });

        // Invalidate any prior pending changes for this account
        var priorChanges = await db.PendingEmailChanges
            .Where(p => p.AccountId == accountId && !p.IsInvalidated && p.UsedAt == null)
            .ToListAsync();
        foreach (var prior in priorChanges)
            prior.IsInvalidated = true;

        // Generate token
        var rawTokenBytes = RandomNumberGenerator.GetBytes(32);
        var rawToken = Convert.ToBase64String(rawTokenBytes)
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

        var now = DateTime.UtcNow;
        var pendingChange = new Domain.Entities.PendingEmailChange
        {
            Id = Guid.NewGuid(),
            AccountId = accountId,
            NewEmail = normalizedNewEmail,
            TokenHash = tokenHash,
            CreatedAt = now,
            ExpiresAt = now.AddHours(EmailChangeTokenExpiryHours),
            UsedAt = null,
            IsInvalidated = false,
        };
        db.PendingEmailChanges.Add(pendingChange);
        await db.SaveChangesAsync();

        var confirmUrl = $"/account/confirm-email?token={rawToken}";
        await accountEmailService.SendEmailChangeConfirmationAsync(normalizedNewEmail, rawToken, confirmUrl);
        await accountEmailService.SendEmailChangeNotificationAsync(account.Email);

        return Results.Ok(new { message = "A confirmation link has been sent to your new email address" });
    }

    private static async Task<IResult> ConfirmEmailAsync(ConfirmEmailRequest request, AppDbContext db)
    {
        var rawToken = request.Token?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(rawToken))
            return Results.BadRequest(new { message = "This confirmation link is no longer valid" });

        var tokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken))).ToLowerInvariant();

        var pendingChange = await db.PendingEmailChanges
            .FirstOrDefaultAsync(p => p.TokenHash == tokenHash);

        if (pendingChange is null)
            return Results.BadRequest(new { message = "This confirmation link is no longer valid" });

        var now = DateTime.UtcNow;

        // Check if invalidated or used
        if (pendingChange.IsInvalidated || pendingChange.UsedAt is not null)
            return Results.BadRequest(new { message = "This confirmation link is no longer valid" });

        // Check if expired
        if (now >= pendingChange.ExpiresAt)
            return Results.BadRequest(new { message = "This confirmation link has expired" });

        // Check if email is still available
        var emailTaken = await db.Accounts.AnyAsync(a => a.Email == pendingChange.NewEmail);
        if (emailTaken)
            return Results.BadRequest(new { message = "This email is already in use" });

        // Update the account email
        var account = await db.Accounts.FindAsync(pendingChange.AccountId);
        if (account is null)
            return Results.BadRequest(new { message = "This confirmation link is no longer valid" });

        account.Email = pendingChange.NewEmail;
        pendingChange.UsedAt = now;

        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Your email has been updated" });
    }

    private static async Task<IResult> ChangePasswordAsync(
        ChangePasswordRequest request, AppDbContext db, HttpContext http)
    {
        var accountIdClaim = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (accountIdClaim is null || !Guid.TryParse(accountIdClaim, out var accountId))
            return Results.Unauthorized();

        var account = await db.Accounts.FindAsync(accountId);
        if (account is null)
            return Results.Unauthorized();

        // Validate current password is provided
        var currentPassword = request.CurrentPassword ?? string.Empty;
        if (string.IsNullOrWhiteSpace(currentPassword))
            return Results.BadRequest(new { message = "Current password is required" });

        // Validate new password
        var newPasswordResult = PasswordValidator.Validate(request.NewPassword);
        if (!newPasswordResult.IsValid)
            return Results.BadRequest(new { message = newPasswordResult.ErrorMessage });

        // Validate confirmation
        var confirmation = request.PasswordConfirmation ?? string.Empty;
        if (string.IsNullOrWhiteSpace(confirmation))
            return Results.BadRequest(new { message = "Please confirm your new password" });

        if (!PasswordConfirmationValidator.Validate(request.NewPassword, request.PasswordConfirmation))
            return Results.BadRequest(new { message = PasswordConfirmationValidator.MismatchMessage });

        // Verify current password
        if (!PasswordHasher.Verify(currentPassword, account.PasswordHash))
            return Results.BadRequest(new { message = "Current password is incorrect" });

        // Update password and regenerate SecurityStamp
        account.PasswordHash = PasswordHasher.Hash(newPasswordResult.NormalizedValue!);
        account.SecurityStamp = Guid.NewGuid().ToString();

        await db.SaveChangesAsync();

        // Re-issue cookie with new stamp to preserve current session
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, account.Id.ToString()),
            new("SecurityStamp", account.SecurityStamp),
        };

        // Preserve OrganizationId claim if present
        var orgIdClaim = http.User.FindFirstValue("OrganizationId");
        if (orgIdClaim is not null)
            claims.Add(new Claim("OrganizationId", orgIdClaim));

        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));

        return Results.Ok(new { message = "Your password has been changed" });
    }
}
