using Devscribed.Admin.Web.Models;

namespace Devscribed.Admin.Web.Services;

public static class MemberPermissions
{
    public static bool CanViewList(string role) =>
        role is "admin" or "manager" or "user" or "viewer";

    public static bool CanInvite(string role) =>
        role is "admin" or "manager";

    public static bool CanDeleteOrRestore(string role) =>
        role is "admin" or "manager";

    public static readonly string[] AllRoles = { "admin", "manager", "user", "viewer" };
    public static readonly string[] ManagerAssignableRoles = { "manager", "user", "viewer" };

    /// <summary>
    /// Whether the caller has authority over the target member's role at all
    /// (independent of which new role is being assigned).
    /// </summary>
    public static bool CanEditRole(string callerRole, string targetRole, string targetStatus)
    {
        if (targetStatus != "active")
            return false;

        return callerRole switch
        {
            "admin" => true,
            "manager" => targetRole is "user" or "viewer",
            _ => false,
        };
    }

    /// <summary>
    /// Whether the caller is allowed to assign the given role value to anyone.
    /// </summary>
    public static bool CanAssignRole(string callerRole, string newRole)
    {
        return callerRole switch
        {
            "admin" => AllRoles.Contains(newRole),
            "manager" => ManagerAssignableRoles.Contains(newRole),
            _ => false,
        };
    }

    public static bool CanEditJobTitle(string callerRole, string targetStatus) =>
        targetStatus == "active" && callerRole is "admin" or "manager";

    public static bool CanEditMemberFinancials(string callerRole) =>
        callerRole is "admin" or "manager";

    public static bool CanViewVacation(string callerRole, bool isOwnMembership) =>
        callerRole switch
        {
            "admin" or "manager" => true,
            "user" => isOwnMembership,
            _ => false,
        };

    public static bool CanSubmitVacationRequest(string callerRole) =>
        callerRole is "admin" or "manager" or "user";

    public static bool CanReviewVacationRequests(string callerRole) =>
        callerRole is "admin" or "manager";

    public static bool CanViewRequests(string callerRole) =>
        callerRole is "admin" or "manager";

    public static bool CanCancelVacationRequest(string callerRole, bool isOwnMembership, string requestStatus)
    {
        if (callerRole is "admin" or "manager")
            return requestStatus is VacationRequestStatuses.Pending or VacationRequestStatuses.Approved;

        if (callerRole == "user" && isOwnMembership)
            return requestStatus == VacationRequestStatuses.Pending;

        return false;
    }

    public static string[] GetAvailableRoles(string callerRole, string targetRole, string targetStatus)
    {
        if (!CanEditRole(callerRole, targetRole, targetStatus))
            return Array.Empty<string>();

        return callerRole == "admin" ? AllRoles : ManagerAssignableRoles;
    }
}
