using Devscribed.Admin.Application.Security;
using Devscribed.Admin.Application.Validation;
using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Application.Invitations;

public class AcceptInvitationService(AdminDbContext db, IPasswordHasher passwordHasher, TimeProvider timeProvider)
{
    public async Task<AcceptInvitationResult> AcceptAsync(AcceptInvitationRequest request, CancellationToken ct = default)
    {
        var invitation = await db.Invitations
            .Include(i => i.Organization)
            .FirstOrDefaultAsync(i => i.Token == request.Token, ct);

        if (invitation is null)
            return AcceptInvitationResult.Failed("invalid invitation");

        var now = timeProvider.GetUtcNow();
        if (invitation.Status != InvitationStatus.Pending)
            return AcceptInvitationResult.Failed("invitation no longer valid");

        if (invitation.IsExpired(now))
            return AcceptInvitationResult.Failed("invitation expired");

        var account = await db.Accounts
            .Include(a => a.Memberships)
            .FirstOrDefaultAsync(a => a.Email == invitation.Email, ct);

        if (account is null)
        {
            var firstName = (request.FirstName ?? string.Empty).Trim();
            var lastName = (request.LastName ?? string.Empty).Trim();
            if (string.IsNullOrWhiteSpace(firstName))
                return AcceptInvitationResult.Failed("first name is required");
            if (string.IsNullOrWhiteSpace(lastName))
                return AcceptInvitationResult.Failed("last name is required");

            var (passwordValid, passwordError) = PasswordPolicy.Validate(request.Password);
            if (!passwordValid)
                return AcceptInvitationResult.Failed(passwordError!);

            account = new Account
            {
                Email = invitation.Email,
                FirstName = firstName,
                LastName = lastName,
                PasswordHash = passwordHasher.Hash(request.Password!)
            };
            db.Accounts.Add(account);
        }
        else
        {
            db.Memberships.RemoveRange(account.Memberships);
        }

        var membership = new Membership
        {
            AccountId = account.Id,
            OrganizationId = invitation.OrganizationId,
            Role = invitation.Role,
            Status = MembershipStatus.Active
        };

        db.Memberships.Add(membership);
        invitation.Status = InvitationStatus.Used;
        await db.SaveChangesAsync(ct);

        return AcceptInvitationResult.Ok(account, invitation.Organization!, membership);
    }
}
