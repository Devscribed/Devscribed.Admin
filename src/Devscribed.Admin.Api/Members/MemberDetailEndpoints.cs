using System.Security.Claims;
using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;
using Devscribed.Admin.Domain.Services;
using Devscribed.Admin.Domain.Validation;
using Devscribed.Admin.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Api.Members;

public static class MemberDetailEndpoints
{
    public static IEndpointRouteBuilder MapMemberDetailEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/organizations/{orgId}/members/{memberId}", HandleGetDetailAsync)
            .RequireAuthorization();
        app.MapPut("/api/organizations/{orgId}/members/{memberId}", HandleUpdateAsync)
            .RequireAuthorization();
        return app;
    }

    private static async Task<IResult> HandleGetDetailAsync(
        Guid orgId, Guid memberId, HttpContext http, AppDbContext db)
    {
        var (callerMembership, error) = await GetCallerMembership(orgId, http, db);
        if (callerMembership is null)
            return error!;

        var target = await db.Memberships
            .Include(m => m.Account)
            .FirstOrDefaultAsync(m => m.Id == memberId && m.OrganizationId == orgId);

        if (target is null)
            return Results.NotFound();

        var activeAdminCount = await db.Memberships
            .CountAsync(m => m.OrganizationId == orgId &&
                             m.Status == MembershipStatus.Active &&
                             m.Role == MemberRole.Admin);

        var isLastAdmin = target.Role == MemberRole.Admin &&
                          target.Status == MembershipStatus.Active &&
                          activeAdminCount == 1;

        var isTargetActive = target.Status == MembershipStatus.Active;

        var availableRoles = isTargetActive
            ? MemberPermissions.GetAvailableRoles(callerMembership.Role, target.Role)
            : Array.Empty<MemberRole>();

        var canEditRole = isTargetActive && availableRoles.Count > 0;

        var canEditJobTitle = isTargetActive &&
                              MemberPermissions.CanEditMembers(callerMembership.Role);

        return Results.Ok(new
        {
            id = target.Id,
            fullName = target.Account.FirstName + " " + target.Account.LastName,
            email = target.Account.Email,
            role = target.Role.ToString().ToLower(),
            status = target.Status.ToString().ToLower(),
            joinedAt = target.JoinedAt,
            jobTitle = target.JobTitle ?? "",
            timezone = target.Account.Timezone ?? "",
            avatarInitials = AvatarInitials.Generate(target.Account.FirstName, target.Account.LastName),
            isLastAdmin,
            canEditRole,
            canEditJobTitle,
            availableRoles = availableRoles.Select(r => r.ToString().ToLower()).ToList(),
            callerRole = callerMembership.Role.ToString().ToLower(),
        });
    }

    public record UpdateMemberRequest(string? Role, string? JobTitle);

    private static async Task<IResult> HandleUpdateAsync(
        Guid orgId, Guid memberId, UpdateMemberRequest request, HttpContext http, AppDbContext db)
    {
        var (callerMembership, error) = await GetCallerMembership(orgId, http, db);
        if (callerMembership is null)
            return error!;

        if (!MemberPermissions.CanEditMembers(callerMembership.Role))
            return Results.Json(new { error = "forbidden", message = "You do not have permission to edit members" },
                statusCode: 403);

        var target = await db.Memberships
            .Include(m => m.Account)
            .FirstOrDefaultAsync(m => m.Id == memberId && m.OrganizationId == orgId);

        if (target is null)
            return Results.NotFound();

        if (target.Status == MembershipStatus.Removed)
            return Results.Json(
                new { error = "member_removed", message = "Cannot edit a removed member" },
                statusCode: 400);

        // Validate job title
        var jobTitleResult = JobTitleValidator.Validate(request.JobTitle);
        if (!jobTitleResult.IsValid)
            return Results.Json(
                new { errors = new { jobTitle = jobTitleResult.ErrorMessage } },
                statusCode: 400);

        // Parse and validate role
        if (!Enum.TryParse<MemberRole>(request.Role, ignoreCase: true, out var newRole))
            return Results.Json(
                new { error = "invalid_role", message = "Invalid role" },
                statusCode: 400);

        var roleChanging = newRole != target.Role;

        if (roleChanging)
        {
            if (!MemberPermissions.CanChangeRole(callerMembership.Role, target.Role, newRole))
                return Results.Json(
                    new { error = "role_authority", message = "You do not have permission to assign this role" },
                    statusCode: 403);
        }

        // Atomic update with transaction (for zero-admin guard)
        await using var transaction = await db.Database.BeginTransactionAsync();

        if (roleChanging && target.Role == MemberRole.Admin)
        {
            var activeAdminCount = await db.Memberships
                .CountAsync(m => m.OrganizationId == orgId &&
                                 m.Status == MembershipStatus.Active &&
                                 m.Role == MemberRole.Admin);

            if (activeAdminCount <= 1)
            {
                await transaction.RollbackAsync();
                return Results.Json(
                    new { error = "last_admin_guard", message = "Organization must retain at least one admin" },
                    statusCode: 409);
            }
        }

        target.Role = newRole;
        target.JobTitle = string.IsNullOrEmpty(jobTitleResult.NormalizedValue)
            ? null
            : jobTitleResult.NormalizedValue;

        await db.SaveChangesAsync();
        await transaction.CommitAsync();

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
