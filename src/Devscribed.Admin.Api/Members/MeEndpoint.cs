using System.Security.Claims;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.Members;

public static class MeEndpoint
{
    public static IEndpointRouteBuilder MapMeEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/me", HandleAsync).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> HandleAsync(HttpContext http, AppDbContext db)
    {
        var accountIdClaim = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var orgIdClaim = http.User.FindFirstValue("OrganizationId");

        if (accountIdClaim is null || orgIdClaim is null ||
            !Guid.TryParse(accountIdClaim, out var accountId) ||
            !Guid.TryParse(orgIdClaim, out var organizationId))
            return Results.Unauthorized();

        var membership = await db.Memberships
            .FirstOrDefaultAsync(m =>
                m.AccountId == accountId &&
                m.OrganizationId == organizationId &&
                m.Status == MembershipStatus.Active);

        if (membership is null)
            return Results.Unauthorized();

        return Results.Ok(new
        {
            role = membership.Role.ToString().ToLower(),
            organizationId = organizationId,
        });
    }
}
