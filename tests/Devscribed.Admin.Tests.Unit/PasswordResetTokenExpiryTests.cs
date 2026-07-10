using Devscribed.Admin.Web.Models;

namespace Devscribed.Admin.Tests.Unit;

public class PasswordResetTokenExpiryTests
{
    private static PasswordResetToken CreateToken(DateTime createdAt) => new()
    {
        Id = Guid.NewGuid(),
        AccountId = Guid.NewGuid(),
        TokenHash = "hash",
        CreatedAt = createdAt,
        ExpiresAt = createdAt.AddMinutes(60),
    };

    [Fact]
    public void Token_is_valid_at_59_minutes()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);

        Assert.True(token.IsValidAt(createdAt.AddMinutes(59)));
    }

    [Fact]
    public void Token_is_expired_at_exactly_60_minutes()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);

        Assert.False(token.IsValidAt(createdAt.AddMinutes(60)));
    }

    [Fact]
    public void Token_is_expired_at_61_minutes()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);

        Assert.False(token.IsValidAt(createdAt.AddMinutes(61)));
    }

    [Fact]
    public void Used_token_is_invalid_even_before_expiry()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);
        token.UsedAt = createdAt.AddMinutes(1);

        Assert.False(token.IsValidAt(createdAt.AddMinutes(2)));
    }

    [Fact]
    public void Invalidated_token_is_invalid_even_before_expiry()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);
        token.IsInvalidated = true;

        Assert.False(token.IsValidAt(createdAt.AddMinutes(2)));
    }
}
