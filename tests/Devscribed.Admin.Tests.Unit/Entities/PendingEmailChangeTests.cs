using Devscribed.Admin.Domain.Entities;

namespace Devscribed.Admin.Tests.Unit.Entities;

public class PendingEmailChangeTests
{
    [Fact]
    public void Token_at_23_hours_is_still_valid()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PendingEmailChange
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            NewEmail = "new@acme.com",
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddHours(24),
            UsedAt = null,
            IsInvalidated = false,
        };

        Assert.True(token.IsValid(issuedAt.AddHours(23)));
    }

    [Fact]
    public void Token_at_exactly_24_hours_is_expired()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PendingEmailChange
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            NewEmail = "new@acme.com",
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddHours(24),
            UsedAt = null,
            IsInvalidated = false,
        };

        Assert.False(token.IsValid(issuedAt.AddHours(24)));
    }

    [Fact]
    public void Token_at_25_hours_is_expired()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PendingEmailChange
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            NewEmail = "new@acme.com",
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddHours(24),
            UsedAt = null,
            IsInvalidated = false,
        };

        Assert.False(token.IsValid(issuedAt.AddHours(25)));
    }

    [Fact]
    public void Used_token_is_not_valid()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PendingEmailChange
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            NewEmail = "new@acme.com",
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddHours(24),
            UsedAt = issuedAt.AddHours(1),
            IsInvalidated = false,
        };

        Assert.False(token.IsValid(issuedAt.AddHours(2)));
    }

    [Fact]
    public void Invalidated_token_is_not_valid()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PendingEmailChange
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            NewEmail = "new@acme.com",
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddHours(24),
            UsedAt = null,
            IsInvalidated = true,
        };

        Assert.False(token.IsValid(issuedAt.AddHours(2)));
    }
}
