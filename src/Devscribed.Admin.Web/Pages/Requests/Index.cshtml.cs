using Devscribed.Admin.Web.Security;
using Devscribed.Admin.Web.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Security.Claims;

namespace Devscribed.Admin.Web.Pages.Requests;

[Authorize]
public class IndexModel : PageModel
{
    public string CurrentRole { get; set; } = string.Empty;
    public Guid OrganizationId { get; set; }

    public IActionResult OnGet(Guid orgId)
    {
        var orgIdClaim = User.FindFirstValue(AppClaimTypes.OrganizationId);
        if (orgIdClaim == null || !Guid.TryParse(orgIdClaim, out var callerOrgId) || callerOrgId != orgId)
            return RedirectToPage("/Login");

        var role = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;
        if (!MemberPermissions.CanViewRequests(role))
            return RedirectToPage("/Members/Index");

        OrganizationId = orgId;
        CurrentRole = role;

        return Page();
    }
}
