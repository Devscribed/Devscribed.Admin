using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Devscribed.Admin.Web.Pages.Account;

[Authorize]
public class SettingsModel : PageModel
{
    public void OnGet() { }
}
