using System.Security.Claims;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Domain.Validation;
using Devscribed.Admin.Infrastructure.Data;
using Devscribed.Admin.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.Login;

public static class LoginEndpoint
{
    public static IEndpointRouteBuilder MapLoginEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/login", HandleAsync);
        return app;
    }

    private static async Task<IResult> HandleAsync(LoginRequest request, AppDbContext db, HttpContext http)
    {
        var email = request.Email?.Trim() ?? string.Empty;
        var password = request.Password ?? string.Empty;

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
            return Results.BadRequest(new { message = "Email and password are required" });

        var normalizedEmail = EmailValidator.Normalize(email);

        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Email == normalizedEmail);
        if (account is null)
            return Results.BadRequest(new { message = "Invalid email or password" });

        // Check membership status BEFORE password verification
        var membership = await db.Memberships
            .FirstOrDefaultAsync(m => m.AccountId == account.Id && m.Status == MembershipStatus.Active);

        if (membership is null)
        {
            // Check if the member was removed (deactivated)
            var hasRemovedMembership = await db.Memberships
                .AnyAsync(m => m.AccountId == account.Id && m.Status == MembershipStatus.Removed);

            if (hasRemovedMembership)
                return Results.BadRequest(new { message = "Your account has been deactivated, contact your administrator" });

            return Results.BadRequest(new { message = "Invalid email or password" });
        }

        if (!PasswordHasher.Verify(password, account.PasswordHash))
            return Results.BadRequest(new { message = "Invalid email or password" });

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, account.Id.ToString()),
            new("SecurityStamp", account.SecurityStamp),
            new("OrganizationId", membership.OrganizationId.ToString()),
        };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));

        return Results.Ok(new { accountId = account.Id });
    }
}
