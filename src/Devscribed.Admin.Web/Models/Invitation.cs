namespace Devscribed.Admin.Web.Models;

public class Invitation
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public Guid OrganizationId { get; set; }
    public Guid InviterMembershipId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public string Status { get; set; } = "pending";
    public DateTime? UsedAt { get; set; }

    public Organization Organization { get; set; } = null!;

    /// <summary>An invitation is acceptable only if pending and strictly before ExpiresAt.</summary>
    public bool IsAcceptableAt(DateTime now) => Status == "pending" && now < ExpiresAt;
}
