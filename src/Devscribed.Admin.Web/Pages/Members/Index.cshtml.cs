using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;
using System.Security.Claims;

namespace Devscribed.Admin.Web.Pages.Members;

[Authorize]
public class IndexModel : PageModel
{
    public string CurrentRole { get; set; } = string.Empty;
    public Guid OrganizationId { get; set; }

    public IActionResult OnGet()
    {
        var orgIdClaim = User.FindFirstValue("OrganizationId");
        if (orgIdClaim == null || !Guid.TryParse(orgIdClaim, out var orgId))
            return RedirectToPage("/Login");

        OrganizationId = orgId;
        CurrentRole = User.FindFirstValue(ClaimTypes.Role) ?? string.Empty;

        return Page();
    }
}
