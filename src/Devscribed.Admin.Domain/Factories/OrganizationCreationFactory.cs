using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;

namespace Devscribed.Admin.Domain.Factories;

/// <summary>
/// Builds the membership that links a newly signed-up account to the organization it
/// just created. Per spec 01, requirement 7, the creator is always the first admin —
/// there is no separate "owner" concept.
/// </summary>
public static class OrganizationCreationFactory
{
    public static Membership CreateAdminMembership(Guid accountId, Guid organizationId, DateTime? joinedAt = null) =>
        new()
        {
            Id = Guid.NewGuid(),
            AccountId = accountId,
            OrganizationId = organizationId,
            Role = MemberRole.Admin,
            Status = MembershipStatus.Active,
            JoinedAt = joinedAt ?? DateTime.UtcNow,
        };
}
