using Devscribed.Admin.Web.Models;

namespace Devscribed.Admin.Tests.Unit;

public class PendingEmailChangeExpiryTests
{
    private static PendingEmailChange CreateToken(DateTime createdAt) => new()
    {
        Id = Guid.NewGuid(),
        AccountId = Guid.NewGuid(),
        NewEmail = "new@acme.com",
        TokenHash = "hash",
        CreatedAt = createdAt,
        ExpiresAt = createdAt.AddHours(24),
    };

    // TC-06-UNIT-09: Email change token expiry calculation
    [Fact]
    public void Token_is_valid_at_23_hours()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);

        Assert.True(token.IsValidAt(createdAt.AddHours(23)));
    }

    [Fact]
    public void Token_is_expired_at_exactly_24_hours()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);

        Assert.False(token.IsValidAt(createdAt.AddHours(24)));
    }

    [Fact]
    public void Token_is_expired_at_25_hours()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);

        Assert.False(token.IsValidAt(createdAt.AddHours(25)));
    }

    [Fact]
    public void Used_token_is_invalid_even_before_expiry()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);
        token.UsedAt = createdAt.AddMinutes(1);

        Assert.False(token.IsValidAt(createdAt.AddHours(1)));
    }

    [Fact]
    public void Invalidated_token_is_invalid_even_before_expiry()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var token = CreateToken(createdAt);
        token.IsInvalidated = true;

        Assert.False(token.IsValidAt(createdAt.AddHours(1)));
    }
}
