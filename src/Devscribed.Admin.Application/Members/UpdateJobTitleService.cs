using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.Members;

public class UpdateJobTitleService(AdminDbContext db)
{
    public async Task<UpdateJobTitleResult> UpdateAsync(
        Guid callerAccountId,
        Guid organizationId,
        Guid targetMembershipId,
        string? jobTitle,
        CancellationToken ct = default)
    {
        if (jobTitle is not null && jobTitle.Length > 100)
            return UpdateJobTitleResult.Failed("must be at most 100 characters");

        var callerMembership = await db.Memberships
            .FirstOrDefaultAsync(m => m.AccountId == callerAccountId
                && m.OrganizationId == organizationId
                && m.Status == MembershipStatus.Active, ct);

        if (callerMembership is null || !Permissions.Can(callerMembership.Role, Capability.EditJobTitle))
            return UpdateJobTitleResult.Failed("forbidden");

        var target = await db.Memberships
            .FirstOrDefaultAsync(m => m.Id == targetMembershipId
                && m.OrganizationId == organizationId, ct);

        if (target is null)
            return UpdateJobTitleResult.Failed("member not found");

        target.JobTitle = jobTitle?.Trim();
        await db.SaveChangesAsync(ct);

        return UpdateJobTitleResult.Ok();
    }
}
