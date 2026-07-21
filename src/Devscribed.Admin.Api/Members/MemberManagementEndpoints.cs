using System.Security.Claims;
using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Domain.Services;
using Devscribed.Admin.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.Members;

public static class MemberManagementEndpoints
{
    public static IEndpointRouteBuilder MapMemberManagementEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/organizations/{orgId}/members", HandleListAsync).RequireAuthorization();
        app.MapDelete("/api/organizations/{orgId}/members/{memberId}", HandleDeleteAsync).RequireAuthorization();
        app.MapPost("/api/organizations/{orgId}/members/{memberId}/restore", HandleRestoreAsync).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> HandleListAsync(
        Guid orgId, HttpContext http, AppDbContext db,
        string? search = null, bool showRemoved = false)
    {
        var (callerMembership, error) = await GetCallerMembership(orgId, http, db);
        if (callerMembership is null)
            return error!;

        IQueryable<Membership> query = db.Memberships
            .Where(m => m.OrganizationId == orgId)
            .Include(m => m.Account);

        if (!showRemoved)
            query = query.Where(m => m.Status == MembershipStatus.Active);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(m =>
                (m.Account.FirstName + " " + m.Account.LastName).ToLower().Contains(term) ||
                m.Account.Email.ToLower().Contains(term));
        }

        var memberships = await query
            .OrderBy(m => m.Account.FirstName)
            .ThenBy(m => m.Account.LastName)
            .ToListAsync();

        var activeAdminCount = await db.Memberships
            .CountAsync(m => m.OrganizationId == orgId &&
                             m.Status == MembershipStatus.Active &&
                             m.Role == MemberRole.Admin);

        var members = memberships.Select(m => new
        {
            id = m.Id,
            fullName = m.Account.FirstName + " " + m.Account.LastName,
            email = m.Account.Email,
            role = m.Role.ToString().ToLower(),
            status = m.Status.ToString().ToLower(),
            joinedAt = m.JoinedAt,
            isLastAdmin = m.Role == MemberRole.Admin &&
                          m.Status == MembershipStatus.Active &&
                          activeAdminCount == 1,
            isSelf = m.AccountId == callerMembership.AccountId,
        }).ToList();

        return Results.Ok(new
        {
            members,
            callerRole = callerMembership.Role.ToString().ToLower(),
        });
    }

    private static async Task<IResult> HandleDeleteAsync(
        Guid orgId, Guid memberId, HttpContext http, AppDbContext db)
    {
        var (callerMembership, error) = await GetCallerMembership(orgId, http, db);
        if (callerMembership is null)
            return error!;

        if (!MemberPermissions.CanDeleteRestore(callerMembership.Role))
            return Results.Json(new { error = "forbidden", message = "You do not have permission to remove members" },
                statusCode: 403);

        var target = await db.Memberships
            .Include(m => m.Account)
            .FirstOrDefaultAsync(m => m.Id == memberId && m.OrganizationId == orgId);

        if (target is null)
            return Results.NotFound();

        if (target.AccountId == callerMembership.AccountId)
            return Results.Json(
                new { error = "cannot_remove_self", message = "You cannot remove yourself from the organization" },
                statusCode: 409);

        if (target.Status == MembershipStatus.Removed)
            return Results.Json(
                new { error = "already_removed", message = "Member is already removed" },
                statusCode: 409);

        // Zero-admin guard with transaction
        await using var transaction = await db.Database.BeginTransactionAsync();

        var activeAdminCount = await db.Memberships
            .CountAsync(m => m.OrganizationId == orgId &&
                             m.Status == MembershipStatus.Active &&
                             m.Role == MemberRole.Admin);

        if (target.Role == MemberRole.Admin && activeAdminCount <= 1)
        {
            await transaction.RollbackAsync();
            return Results.Json(
                new { error = "last_admin_guard", message = "Organization must retain at least one admin" },
                statusCode: 409);
        }

        // Soft-delete
        target.Status = MembershipStatus.Removed;

        // Revoke sessions by changing SecurityStamp
        target.Account.SecurityStamp = Guid.NewGuid().ToString();

        // Invalidate pending invitations sent by this member
        InvitationInvalidationService.InvalidatePendingInvitationsForMembership(
            db.Invitations, target.Id);

        await db.SaveChangesAsync();
        await transaction.CommitAsync();

        return Results.Ok(new { success = true });
    }

    private static async Task<IResult> HandleRestoreAsync(
        Guid orgId, Guid memberId, HttpContext http, AppDbContext db)
    {
        var (callerMembership, error) = await GetCallerMembership(orgId, http, db);
        if (callerMembership is null)
            return error!;

        if (!MemberPermissions.CanDeleteRestore(callerMembership.Role))
            return Results.Json(new { error = "forbidden", message = "You do not have permission to restore members" },
                statusCode: 403);

        var target = await db.Memberships
            .FirstOrDefaultAsync(m => m.Id == memberId && m.OrganizationId == orgId);

        if (target is null)
            return Results.NotFound();

        if (target.Status != MembershipStatus.Removed)
            return Results.Json(
                new { error = "not_removed", message = "Member is not in removed status" },
                statusCode: 409);

        target.Status = MembershipStatus.Active;
        target.JoinedAt = DateTime.UtcNow;
        target.JobTitle = null;

        await db.SaveChangesAsync();

        return Results.Ok(new { success = true });
    }

    private static async Task<(Membership? membership, IResult? error)> GetCallerMembership(
        Guid orgId, HttpContext http, AppDbContext db)
    {
        var accountIdClaim = http.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var orgIdClaim = http.User.FindFirstValue("OrganizationId");

        if (accountIdClaim is null || orgIdClaim is null ||
            !Guid.TryParse(accountIdClaim, out var accountId) ||
            !Guid.TryParse(orgIdClaim, out var claimedOrgId))
            return (null, Results.Unauthorized());

        // Verify caller's org matches the requested org
        if (claimedOrgId != orgId)
            return (null, Results.Unauthorized());

        var membership = await db.Memberships
            .FirstOrDefaultAsync(m =>
                m.AccountId == accountId &&
                m.OrganizationId == orgId &&
                m.Status == MembershipStatus.Active);

        if (membership is null)
            return (null, Results.Unauthorized());

        return (membership, null);
    }
}
