using Devscribed.Admin.Domain;

namespace Devscribed.Admin.Tests;

/// <summary>TC-02-UNIT-02: Reset-token expiry calculation.</summary>
public class ResetTokenExpiryTests
{
    [Fact]
    public void Token_is_valid_at_59_minutes()
    {
        var createdAt = DateTimeOffset.UtcNow;
        var token = new PasswordResetToken
        {
            AccountId = Guid.NewGuid(),
            Token = "test-token",
            CreatedAt = createdAt
        };

        Assert.True(token.IsValid(createdAt + TimeSpan.FromMinutes(59)));
    }

    [Fact]
    public void Token_is_expired_at_61_minutes()
    {
        var createdAt = DateTimeOffset.UtcNow;
        var token = new PasswordResetToken
        {
            AccountId = Guid.NewGuid(),
            Token = "test-token",
            CreatedAt = createdAt
        };

        Assert.False(token.IsValid(createdAt + TimeSpan.FromMinutes(61)));
    }
}
