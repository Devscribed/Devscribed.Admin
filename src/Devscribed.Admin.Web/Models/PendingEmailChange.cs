namespace Devscribed.Admin.Web.Models;

public class PendingEmailChange
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public string NewEmail { get; set; } = string.Empty;
    public string TokenHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
    public bool IsInvalidated { get; set; }

    public Account Account { get; set; } = null!;

    /// <summary>A token is valid only if not invalidated, not used, and strictly before ExpiresAt.</summary>
    public bool IsValidAt(DateTime now) => !IsInvalidated && UsedAt == null && now < ExpiresAt;
}
