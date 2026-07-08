namespace Devscribed.Admin.Domain;

public class EmailChangeToken
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required Guid AccountId { get; init; }
    public required string NewEmail { get; init; }
    public required string Token { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; init; }
    public bool Used { get; set; }

    public Account? Account { get; init; }

    public bool IsExpired(DateTimeOffset now) => now >= ExpiresAt;
    public bool IsValid(DateTimeOffset now) => !Used && !IsExpired(now);
}
