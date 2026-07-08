namespace Devscribed.Admin.Domain;

public class Organization
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public required string Name { get; init; }
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;

    public ICollection<Membership> Memberships { get; init; } = new List<Membership>();
}
