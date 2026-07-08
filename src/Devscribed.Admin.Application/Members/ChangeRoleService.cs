using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.Members;

public class ChangeRoleService(AdminDbContext db)
{
    public async Task<ChangeRoleResult> ChangeRoleAsync(
        Guid callerAccountId,
        Guid organizationId,
        ChangeRoleRequest request,
        CancellationToken ct = default)
    {
        var callerMembership = await db.Memberships
            .FirstOrDefaultAsync(m => m.AccountId == callerAccountId
                && m.OrganizationId == organizationId
                && m.Status == MembershipStatus.Active, ct);

        if (callerMembership is null || !Permissions.Can(callerMembership.Role, Capability.ChangeRoles))
            return ChangeRoleResult.Failed("forbidden");

        var target = await db.Memberships
            .FirstOrDefaultAsync(m => m.Id == request.MembershipId
                && m.OrganizationId == organizationId
                && m.Status == MembershipStatus.Active, ct);

        if (target is null)
            return ChangeRoleResult.Failed("member not found");

        if (target.Role == request.NewRole)
            return ChangeRoleResult.Ok();

        if (target.Role == MembershipRole.Admin)
        {
            var adminCount = await db.Memberships.CountAsync(
                m => m.OrganizationId == organizationId
                    && m.Role == MembershipRole.Admin
                    && m.Status == MembershipStatus.Active, ct);

            if (adminCount <= 1)
                return ChangeRoleResult.Failed("organization must retain at least one admin");
        }

        target.Role = request.NewRole;
        await db.SaveChangesAsync(ct);

        return ChangeRoleResult.Ok();
    }
}
