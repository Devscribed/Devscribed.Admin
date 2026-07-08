using Devscribed.Admin.Domain;
using Devscribed.Admin.Infrastructure;
using Devscribed.Admin.Web.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using Microsoft.EntityFrameworkCore;

namespace Devscribed.Admin.Web.Pages;

[Authorize]
public class MemberDetailModel(AdminDbContext db) : PageModel
{
    public string MemberName { get; private set; } = string.Empty;
    public string JoinedDate { get; private set; } = string.Empty;
    public string Email { get; private set; } = string.Empty;
    public string? MemberTimezone { get; private set; }
    public string? JobTitle { get; private set; }
    public Guid MembershipId { get; private set; }
    public bool CanEditJobTitle { get; private set; }

    public async Task<IActionResult> OnGetAsync(Guid id)
    {
        var organizationId = OrganizationAuth.GetOrganizationId(User);
        var role = Enum.Parse<MembershipRole>(User.FindFirst(System.Security.Claims.ClaimTypes.Role)!.Value);

        var membership = await db.Memberships
            .Include(m => m.Account)
            .FirstOrDefaultAsync(m => m.Id == id && m.OrganizationId == organizationId);

        if (membership?.Account is null)
            return RedirectToPage("Members");

        MembershipId = membership.Id;
        MemberName = $"{membership.Account.FirstName} {membership.Account.LastName}".Trim();
        JoinedDate = membership.JoinedAt.ToString("MMM d, yyyy");
        Email = membership.Account.Email;
        MemberTimezone = membership.Account.Timezone;
        JobTitle = membership.JobTitle;
        CanEditJobTitle = Permissions.Can(role, Capability.EditJobTitle);

        return Page();
    }
}
