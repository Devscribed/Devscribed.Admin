using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Devscribed.Admin.Web.Pages.Members;

[Authorize]
public class DetailModel : PageModel
{
    public Guid OrganizationId { get; set; }
    public Guid MemberId { get; set; }

    public IActionResult OnGet(Guid orgId, Guid memberId)
    {
        OrganizationId = orgId;
        MemberId = memberId;
        return Page();
    }
}
