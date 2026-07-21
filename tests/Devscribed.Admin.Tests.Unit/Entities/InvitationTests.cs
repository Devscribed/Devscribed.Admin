using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;

namespace Devscribed.Admin.Tests.Unit.Entities;

public class InvitationTests
{
    [Fact]
    public void Invitation_at_6_days_23_hours_is_still_valid()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Role = MemberRole.User,
            OrganizationId = Guid.NewGuid(),
            InviterMembershipId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddDays(7),
            Status = InvitationStatus.Pending,
        };

        Assert.True(invitation.IsValid(issuedAt.AddDays(6).AddHours(23)));
    }

    [Fact]
    public void Invitation_at_exactly_7_days_is_expired()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Role = MemberRole.User,
            OrganizationId = Guid.NewGuid(),
            InviterMembershipId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddDays(7),
            Status = InvitationStatus.Pending,
        };

        Assert.False(invitation.IsValid(issuedAt.AddDays(7)));
    }

    [Fact]
    public void Invitation_at_7_days_1_minute_is_expired()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Role = MemberRole.User,
            OrganizationId = Guid.NewGuid(),
            InviterMembershipId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddDays(7),
            Status = InvitationStatus.Pending,
        };

        Assert.False(invitation.IsValid(issuedAt.AddDays(7).AddMinutes(1)));
    }

    [Fact]
    public void Used_invitation_is_not_valid()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Role = MemberRole.User,
            OrganizationId = Guid.NewGuid(),
            InviterMembershipId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddDays(7),
            Status = InvitationStatus.Used,
            UsedAt = issuedAt.AddDays(1),
        };

        Assert.False(invitation.IsValid(issuedAt.AddDays(2)));
    }

    [Fact]
    public void Invalidated_invitation_is_not_valid()
    {
        var issuedAt = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
        var invitation = new Invitation
        {
            Id = Guid.NewGuid(),
            Email = "test@example.com",
            Role = MemberRole.User,
            OrganizationId = Guid.NewGuid(),
            InviterMembershipId = Guid.NewGuid(),
            TokenHash = "somehash",
            CreatedAt = issuedAt,
            ExpiresAt = issuedAt.AddDays(7),
            Status = InvitationStatus.Invalidated,
        };

        Assert.False(invitation.IsValid(issuedAt.AddDays(2)));
    }
}
