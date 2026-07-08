using Devscribed.Admin.Domain;

namespace Devscribed.Admin.Tests;

/// <summary>TC-04-UNIT-02: Invitation expiry calculation.</summary>
public class InvitationExpiryTests
{
    [Fact]
    public void Invitation_is_valid_before_seven_days()
    {
        var issuedAt = DateTimeOffset.UtcNow;
        var invitation = new Invitation
        {
            Email = "new@acme.com",
            Role = MembershipRole.User,
            OrganizationId = Guid.NewGuid(),
            InvitedByAccountId = Guid.NewGuid(),
            Token = "token",
            IssuedAt = issuedAt,
            ExpiresAt = issuedAt + Invitation.Lifetime
        };

        Assert.True(invitation.IsAcceptable(issuedAt + TimeSpan.FromDays(6) + TimeSpan.FromHours(23)));
    }

    [Fact]
    public void Invitation_is_expired_after_seven_days()
    {
        var issuedAt = DateTimeOffset.UtcNow;
        var invitation = new Invitation
        {
            Email = "new@acme.com",
            Role = MembershipRole.User,
            OrganizationId = Guid.NewGuid(),
            InvitedByAccountId = Guid.NewGuid(),
            Token = "token",
            IssuedAt = issuedAt,
            ExpiresAt = issuedAt + Invitation.Lifetime
        };

        Assert.False(invitation.IsAcceptable(issuedAt + TimeSpan.FromDays(7) + TimeSpan.FromMinutes(1)));
    }
}
