namespace Devscribed.Admin.Domain;

public class PasswordResetToken
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid AccountId { get; init; }
    public required string Token { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public bool Used { get; set; }

    public Account? Account { get; init; }

    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(60);

    public bool IsExpired(DateTimeOffset now) => now > CreatedAt + Lifetime;

    public bool IsValid(DateTimeOffset now) => !Used && !IsExpired(now);
}
