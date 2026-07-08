using Microsoft.AspNetCore.Mvc.RazorPages;

namespace Devscribed.Admin.Web.Pages;

public class ResetPasswordModel : PageModel
{
    public string Token { get; private set; } = string.Empty;

    public void OnGet(string token)
    {
        Token = token ?? string.Empty;
    }
}
