namespace Devscribed.Admin.Domain;

public static class Permissions
{
    private static readonly HashSet<(MembershipRole, Capability)> Allowed = new()
    {
        (MembershipRole.Admin, Capability.ViewMembers),
        (MembershipRole.Admin, Capability.ViewMemberDetail),
        (MembershipRole.Admin, Capability.EditOwnSettings),
        (MembershipRole.Admin, Capability.InviteMembers),
        (MembershipRole.Admin, Capability.DeleteRestoreMembers),
        (MembershipRole.Admin, Capability.ChangeRoles),

        (MembershipRole.Manager, Capability.ViewMembers),
        (MembershipRole.Manager, Capability.ViewMemberDetail),
        (MembershipRole.Manager, Capability.EditOwnSettings),
        (MembershipRole.Manager, Capability.InviteMembers),
        (MembershipRole.Manager, Capability.DeleteRestoreMembers),

        (MembershipRole.User, Capability.ViewMembers),
        (MembershipRole.User, Capability.ViewMemberDetail),
        (MembershipRole.User, Capability.EditOwnSettings),

        (MembershipRole.Viewer, Capability.ViewMembers),
        (MembershipRole.Viewer, Capability.ViewMemberDetail),
        (MembershipRole.Viewer, Capability.EditOwnSettings),
    };

    public static bool Can(MembershipRole role, Capability capability) =>
        Allowed.Contains((role, capability));
}
