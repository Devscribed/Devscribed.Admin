namespace Devscribed.Admin.Domain;

public class Membership
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid AccountId { get; init; }
    public required Guid OrganizationId { get; init; }
    public required MembershipRole Role { get; set; }
    public required MembershipStatus Status { get; set; }
    public DateTimeOffset JoinedAt { get; init; } = DateTimeOffset.UtcNow;
    public string? JobTitle { get; set; }

    public Account? Account { get; init; }
    public Organization? Organization { get; init; }

    /// <summary>
    /// The organization creator's membership per spec 01: role admin, status active.
    /// </summary>
    public static Membership CreateAdmin(Guid accountId, Guid organizationId) => new()
    {
        AccountId = accountId,
        OrganizationId = organizationId,
        Role = MembershipRole.Admin,
        Status = MembershipStatus.Active
    };
}
