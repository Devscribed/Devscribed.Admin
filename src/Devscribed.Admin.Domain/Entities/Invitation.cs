using Devscribed.Admin.Domain.Enums;

namespace Devscribed.Admin.Domain.Entities;

public class Invitation
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public MemberRole Role { get; set; }
    public Guid OrganizationId { get; set; }
    public Guid InviterMembershipId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public InvitationStatus Status { get; set; }
    public DateTime? UsedAt { get; set; }

    public Organization Organization { get; set; } = null!;
    public Membership InviterMembership { get; set; } = null!;

    /// <summary>
    /// An invitation is valid only if its status is Pending and
    /// the current time is strictly before ExpiresAt.
    /// The inviter's membership status is checked separately at query time.
    /// </summary>
    public bool IsValid(DateTime utcNow) =>
        Status == InvitationStatus.Pending && utcNow < ExpiresAt;
}
