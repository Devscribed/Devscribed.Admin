using Devscribed.Admin.Domain.Entities;
using Devscribed.Admin.Domain.Enums;

namespace Devscribed.Admin.Domain.Services;

/// <summary>
/// When a membership status changes to 'removed', all pending invitations
/// sent by that member should be invalidated. This service encapsulates
/// that logic so it can be called from any endpoint that removes a member.
/// </summary>
public static class InvitationInvalidationService
{
    /// <summary>
    /// Invalidates all pending invitations created by the specified membership.
    /// Call this when a membership status is set to 'removed'.
    /// </summary>
    /// <param name="invitations">
    /// The queryable set of invitations (typically DbSet&lt;Invitation&gt;).
    /// </param>
    /// <param name="membershipId">
    /// The Id of the membership that was removed.
    /// </param>
    /// <returns>The list of invitations that were invalidated.</returns>
    public static List<Invitation> InvalidatePendingInvitationsForMembership(
        IQueryable<Invitation> invitations, Guid membershipId)
    {
        var pendingInvitations = invitations
            .Where(i => i.InviterMembershipId == membershipId && i.Status == InvitationStatus.Pending)
            .ToList();

        foreach (var invitation in pendingInvitations)
            invitation.Status = InvitationStatus.Invalidated;

        return pendingInvitations;
    }
}
