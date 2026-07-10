using Devscribed.Admin.Web.Models;

namespace Devscribed.Admin.Tests.Unit;

public class InvitationExpiryTests
{
    private static Invitation CreateInvitation(DateTime createdAt) => new()
    {
        Id = Guid.NewGuid(),
        Email = "new@acme.com",
        Role = "user",
        OrganizationId = Guid.NewGuid(),
        InviterMembershipId = Guid.NewGuid(),
        TokenHash = "hash",
        CreatedAt = createdAt,
        ExpiresAt = createdAt.AddDays(7),
        Status = "pending",
    };

    [Fact]
    public void Still_acceptable_at_6_days_23_hours()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var invitation = CreateInvitation(createdAt);

        Assert.True(invitation.IsAcceptableAt(createdAt.AddDays(6).AddHours(23)));
    }

    [Fact]
    public void Expired_at_7_days_1_minute()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var invitation = CreateInvitation(createdAt);

        Assert.False(invitation.IsAcceptableAt(createdAt.AddDays(7).AddMinutes(1)));
    }

    [Fact]
    public void Expired_at_exactly_7_days()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var invitation = CreateInvitation(createdAt);

        Assert.False(invitation.IsAcceptableAt(createdAt.AddDays(7)));
    }

    [Fact]
    public void Used_invitation_is_not_acceptable()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var invitation = CreateInvitation(createdAt);
        invitation.Status = "used";

        Assert.False(invitation.IsAcceptableAt(createdAt.AddMinutes(1)));
    }

    [Fact]
    public void Invalidated_invitation_is_not_acceptable()
    {
        var createdAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        var invitation = CreateInvitation(createdAt);
        invitation.Status = "invalidated";

        Assert.False(invitation.IsAcceptableAt(createdAt.AddMinutes(1)));
    }
}
