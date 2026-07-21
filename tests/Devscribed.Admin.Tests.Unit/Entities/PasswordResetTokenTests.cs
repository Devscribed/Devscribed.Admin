using Devscribed.Admin.Domain.Entities;

namespace Devscribed.Admin.Tests.Unit.Entities;

public class PasswordResetTokenTests
{
    [Fact]
    public void Token_at_59_minutes_is_still_valid()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddMinutes(60),
            UsedAt = null,
            IsInvalidated = false,
        };

        Assert.True(token.IsValid(issuedAt.AddMinutes(59)));
    }

    [Fact]
    public void Token_at_exactly_60_minutes_is_expired()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddMinutes(60),
            UsedAt = null,
            IsInvalidated = false,
        };

        Assert.False(token.IsValid(issuedAt.AddMinutes(60)));
    }

    [Fact]
    public void Token_at_61_minutes_is_expired()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddMinutes(60),
            UsedAt = null,
            IsInvalidated = false,
        };

        Assert.False(token.IsValid(issuedAt.AddMinutes(61)));
    }

    [Fact]
    public void Used_token_is_not_valid()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddMinutes(60),
            UsedAt = issuedAt.AddMinutes(5),
            IsInvalidated = false,
        };

        Assert.False(token.IsValid(issuedAt.AddMinutes(10)));
    }

    [Fact]
    public void Invalidated_token_is_not_valid()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var token = new PasswordResetToken
        {
            Id = Guid.NewGuid(),
            AccountId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddMinutes(60),
            UsedAt = null,
            IsInvalidated = true,
        };

        Assert.False(token.IsValid(issuedAt.AddMinutes(10)));
    }
}
