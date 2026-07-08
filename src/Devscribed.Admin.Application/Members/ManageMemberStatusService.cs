using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.Members;

public class ManageMemberStatusService(AdminDbContext db)
{
    public Task<ManageMemberStatusResult> RemoveAsync(
        Guid callerAccountId,
        Guid organizationId,
        Guid membershipId,
        CancellationToken ct = default) =>
        SetStatusAsync(callerAccountId, organizationId, membershipId, MembershipStatus.Active, MembershipStatus.Removed, ct);

    public Task<ManageMemberStatusResult> RestoreAsync(
        Guid callerAccountId,
        Guid organizationId,
        Guid membershipId,
        CancellationToken ct = default) =>
        SetStatusAsync(callerAccountId, organizationId, membershipId, MembershipStatus.Removed, MembershipStatus.Active, ct);

    private async Task<ManageMemberStatusResult> SetStatusAsync(
        Guid callerAccountId,
        Guid organizationId,
        Guid membershipId,
        MembershipStatus expectedStatus,
        MembershipStatus nextStatus,
        CancellationToken ct)
    {
        var callerMembership = await db.Memberships
            .FirstOrDefaultAsync(m => m.AccountId == callerAccountId
                && m.OrganizationId == organizationId
                && m.Status == MembershipStatus.Active, ct);

        if (callerMembership is null || !Permissions.Can(callerMembership.Role, Capability.DeleteRestoreMembers))
            return ManageMemberStatusResult.Failed("forbidden");

        var target = await db.Memberships
            .FirstOrDefaultAsync(m => m.Id == membershipId
                && m.OrganizationId == organizationId
                && m.Status == expectedStatus, ct);

        if (target is null)
            return ManageMemberStatusResult.Failed("member not found");

        if (expectedStatus == MembershipStatus.Active && target.Role == MembershipRole.Admin)
        {
            var adminCount = await db.Memberships.CountAsync(
                m => m.OrganizationId == organizationId
                    && m.Role == MembershipRole.Admin
                    && m.Status == MembershipStatus.Active, ct);

            if (adminCount <= 1)
                return ManageMemberStatusResult.Failed("organization must retain at least one admin");
        }

        target.Status = nextStatus;
        await db.SaveChangesAsync(ct);

        return ManageMemberStatusResult.Ok();
    }
}
