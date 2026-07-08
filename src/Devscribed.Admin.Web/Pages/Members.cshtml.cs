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

    public async Task OnGetAsync()
    {
        var organizationId = OrganizationAuth.GetOrganizationId(User);
        OrganizationName = OrganizationAuth.GetOrganizationName(User) ?? string.Empty;
        var role = Enum.Parse<MembershipRole>(User.FindFirst(System.Security.Claims.ClaimTypes.Role)!.Value);
        CanInvite = Permissions.Can(role, Capability.InviteMembers);
        CanAssignRoles = role == MembershipRole.Admin;

        var memberships = await db.Memberships
            .Where(m => m.OrganizationId == organizationId && m.Status == MembershipStatus.Active)
            .Include(m => m.Account)
            .ToListAsync();

        Members = memberships
            .OrderBy(m => m.JoinedAt)
            .Select(m => new MemberRow(m.Id, m.Account!.FirstName + " " + m.Account.LastName, m.Role.ToString().ToLowerInvariant()))
            .ToList();
    }

    public record MemberRow(Guid Id, string FullName, string Role);
}
