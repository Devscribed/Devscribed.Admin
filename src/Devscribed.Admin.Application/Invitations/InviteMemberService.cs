using System.Security.Cryptography;
using Devscribed.Admin.Application.Validation;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.Invitations;

public class InviteMemberService(AdminDbContext db, IInvitationEmailSender emailSender, TimeProvider timeProvider)
{
    public async Task<InviteMemberResult> InviteAsync(
        Guid inviterAccountId,
        Guid organizationId,
        InviteMemberRequest request,
        CancellationToken ct = default)
    {
        var normalizedEmail = (request.Email ?? string.Empty).Trim();
        if (!EmailValidator.IsSyntacticallyValid(normalizedEmail))
            return InviteMemberResult.Failed("invalid email format");

        if (!Enum.IsDefined(request.Role))
            return InviteMemberResult.Failed("invalid role");

        var inviterMembership = await db.Memberships.FirstOrDefaultAsync(
            m => m.AccountId == inviterAccountId
                && m.OrganizationId == organizationId
                && m.Status == MembershipStatus.Active, ct);

        if (inviterMembership is null || !Permissions.Can(inviterMembership.Role, Capability.InviteMembers))
            return InviteMemberResult.Failed("forbidden");

        var targetRole = request.Role;
        if (inviterMembership.Role == MembershipRole.Manager)
        {
            targetRole = MembershipRole.User;
        }
        else if (inviterMembership.Role != MembershipRole.Admin)
        {
            return InviteMemberResult.Failed("forbidden");
        }

        var existingAccount = await db.Accounts
            .Include(a => a.Memberships)
            .FirstOrDefaultAsync(a => a.Email == normalizedEmail, ct);

        if (existingAccount?.Memberships.Any(m =>
                m.OrganizationId == organizationId && m.Status == MembershipStatus.Active) == true)
            return InviteMemberResult.Failed("already a member");

        var previousPending = await db.Invitations
            .Where(i => i.Email == normalizedEmail
                && i.OrganizationId == organizationId
                && i.Status == InvitationStatus.Pending)
            .ToListAsync(ct);

        foreach (var invitation in previousPending)
            invitation.Status = InvitationStatus.Superseded;

        var now = timeProvider.GetUtcNow();
        var newInvitation = new Invitation
        {
            Email = normalizedEmail,
            Role = targetRole,
            OrganizationId = organizationId,
            InvitedByAccountId = inviterAccountId,
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)),
            IssuedAt = now,
            ExpiresAt = now + Invitation.Lifetime,
            Status = InvitationStatus.Pending
        };

        db.Invitations.Add(newInvitation);
        await db.SaveChangesAsync(ct);
        await emailSender.SendInvitationAsync(normalizedEmail, newInvitation.Token, ct);

        return InviteMemberResult.Ok(newInvitation);
    }
}
