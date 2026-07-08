namespace Devscribed.Admin.Domain;

public class Invitation
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Email { get; init; }
    public required MembershipRole Role { get; set; }
    public required Guid OrganizationId { get; init; }
    public required Guid InvitedByAccountId { get; init; }
    public required string Token { get; set; }
    public DateTimeOffset IssuedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }
    public InvitationStatus Status { get; set; } = InvitationStatus.Pending;

    public Organization? Organization { get; init; }
    public Account? InvitedByAccount { get; init; }

    public static readonly TimeSpan Lifetime = TimeSpan.FromDays(7);

    public bool IsExpired(DateTimeOffset now) => now > ExpiresAt;

    public bool IsAcceptable(DateTimeOffset now) =>
        Status == InvitationStatus.Pending && !IsExpired(now);
}
