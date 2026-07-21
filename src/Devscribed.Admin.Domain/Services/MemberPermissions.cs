using Devscribed.Admin.Domain.Enums;

namespace Devscribed.Admin.Domain.Services;

public static class MemberPermissions
{
    public static bool CanViewList(MemberRole role) => true;

    public static bool CanInvite(MemberRole role) =>
        role is MemberRole.Admin or MemberRole.Manager;

    public static bool CanDeleteRestore(MemberRole role) =>
        role is MemberRole.Admin or MemberRole.Manager;

    public static bool CanEditMembers(MemberRole callerRole) =>
        callerRole is MemberRole.Admin or MemberRole.Manager;

    /// <summary>
    /// Determines whether the caller can change the target member's role.
    /// Returns false when newRole equals targetCurrentRole (no-op).
    /// </summary>
    public static bool CanChangeRole(MemberRole callerRole, MemberRole targetCurrentRole, MemberRole newRole)
    {
        if (targetCurrentRole == newRole)
            return false;

        return callerRole switch
        {
            MemberRole.Admin => true,
            MemberRole.Manager =>
                // Manager can only change user/viewer targets, and cannot assign admin
                targetCurrentRole is MemberRole.User or MemberRole.Viewer &&
                newRole is not MemberRole.Admin,
            _ => false,
        };
    }

    /// <summary>
    /// Returns the list of roles the caller may assign to the target member.
    /// Empty if the caller has no authority over this target's role.
    /// </summary>
    public static IReadOnlyList<MemberRole> GetAvailableRoles(MemberRole callerRole, MemberRole targetRole)
    {
        return callerRole switch
        {
            MemberRole.Admin => [MemberRole.Admin, MemberRole.Manager, MemberRole.User, MemberRole.Viewer],
            MemberRole.Manager when targetRole is MemberRole.User or MemberRole.Viewer =>
                [MemberRole.Manager, MemberRole.User, MemberRole.Viewer],
            _ => [],
        };
    }
}
