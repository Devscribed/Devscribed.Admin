using System.Security.Claims;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.Members;

/// <summary>
/// Minimal members-list read endpoint. Full search/filter/action semantics belong to
/// spec 04 (member-list-management); this only provides what spec 01's post-signup
/// redirect needs to render the Members list.
/// </summary>
public static class MembersEndpoint
{
    public static IEndpointRouteBuilder MapMembersEndpoint(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/members", HandleAsync).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> HandleAsync(HttpContext http, AppDbContext db)
    {
        var organizationIdClaim = http.User.FindFirstValue("OrganizationId");
        if (organizationIdClaim is null || !Guid.TryParse(organizationIdClaim, out var organizationId))
            return Results.Unauthorized();

        var members = await db.Memberships
            .Where(m => m.OrganizationId == organizationId && m.Status == MembershipStatus.Active)
            .Include(m => m.Account)
            .OrderBy(m => m.Account.FirstName)
            .ThenBy(m => m.Account.LastName)
            .Select(m => new
            {
                id = m.Id,
                name = m.Account.FirstName + " " + m.Account.LastName,
                email = m.Account.Email,
                role = m.Role.ToString().ToLower(),
                status = m.Status.ToString().ToLower(),
            })
            .ToListAsync();

        return Results.Ok(members);
    }
}
