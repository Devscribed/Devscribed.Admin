using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Devscribed.Admin.Web.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Pages;

[Authorize]
public class MembersModel(AdminDbContext db) : PageModel
{
    public string OrganizationName { get; private set; } = string.Empty;
    public List<MemberRow> Members { get; private set; } = [];
    public bool CanInvite { get; private set; }
    public bool CanAssignRoles { get; private set; }
    public bool CanManageMembers { get; private set; }

    public async Task OnGetAsync()
    {
        var organizationId = OrganizationAuth.GetOrganizationId(User);
        OrganizationName = OrganizationAuth.GetOrganizationName(User) ?? string.Empty;
        var role = Enum.Parse<MembershipRole>(User.FindFirst(System.Security.Claims.ClaimTypes.Role)!.Value);
        CanInvite = Permissions.Can(role, Capability.InviteMembers);
        CanAssignRoles = role == MembershipRole.Admin;
        CanManageMembers = Permissions.Can(role, Capability.DeleteRestoreMembers);

        var memberships = await db.Memberships
            .Where(m => m.OrganizationId == organizationId)
            .Include(m => m.Account)
            .ToListAsync();

        var activeAdminCount = memberships.Count(m => m.Role == MembershipRole.Admin && m.Status == MembershipStatus.Active);

        Members = memberships
            .Select(m =>
            {
                var fullName = $"{m.Account!.FirstName} {m.Account.LastName}".Trim();
                var deleteGuardMessage = m.Status == MembershipStatus.Active
                    && m.Role == MembershipRole.Admin
                    && activeAdminCount <= 1
                    ? "Organization must retain at least one admin."
                    : null;

                return new MemberRow(
                    m.Id,
                    fullName,
                    m.Account.Email,
                    m.Role.ToString().ToLowerInvariant(),
                    m.Status.ToString().ToLowerInvariant(),
                    deleteGuardMessage);
            })
            .OrderBy(m => m.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public record MemberRow(Guid Id, string FullName, string Email, string Role, string Status, string? DeleteGuardMessage);
}
