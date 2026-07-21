namespace Devscribed.Admin.Domain.Entities;

public class PasswordResetToken
{
    public Guid Id { get; set; }
    public Guid AccountId { get; set; }
    public string TokenHash { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? UsedAt { get; set; }
    public bool IsInvalidated { get; set; }

    public Account Account { get; set; } = null!;

    /// <summary>
    /// A token is valid only if it has not been invalidated, has not been used,
    /// and the current time is strictly before ExpiresAt.
    /// </summary>
    public bool IsValid(DateTime utcNow) =>
        !IsInvalidated && UsedAt is null && utcNow < ExpiresAt;
}
