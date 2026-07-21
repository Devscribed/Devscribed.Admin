using Devscribed.Admin.Domain.Enums;

namespace Devscribed.Admin.Domain.Entities;

public class Membership
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public Guid OrganizationId { get; set; }
    public MemberRole Role { get; set; }
    public MembershipStatus Status { get; set; }
    public string? JobTitle { get; set; }
    public DateTime JoinedAt { get; set; }

    public Account Account { get; set; } = null!;
    public Organization Organization { get; set; } = null!;
}
