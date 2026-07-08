namespace Devscribed.Admin.Domain;

public class Account
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Email { get; init; }
    public required string PasswordHash { get; set; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public string? Timezone { get; set; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public ICollection<Membership> Memberships { get; init; } = new List<Membership>();
}
