namespace Devscribed.Admin.Web.Services;

public static class MemberPermissions
{
    public static bool CanViewList(string role) =>
        role is "admin" or "manager" or "user" or "viewer";

    public static bool CanInvite(string role) =>
        role is "admin" or "manager";

    public static bool CanDeleteOrRestore(string role) =>
        role is "admin" or "manager";
}
